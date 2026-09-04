import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { ScreenState } from "../../../components/screen-state";
import { StatusChip } from "../../../components/status-chip";
import {
  getStation,
  listVehicles,
  startSession,
  type Station,
  type Vehicle,
} from "../../../lib/api-client";
import { driverErrorMessage } from "../../../lib/errors";
import {
  accessTypeLabel,
  amenityLabel,
  availabilityCopy,
  chargerStatusLabel,
  connectorStatusLabel,
  connectorTypeLabel,
  ctaLabel,
  currentTypeLabel,
  formatCurrency,
  formatPower,
  formatRelativeTime,
  isChargerOnline,
  isConnectorOccupied,
  stationStatusColor,
  stationStatusLabel,
} from "../../../lib/labels";
import { useRealtime } from "../../../lib/use-realtime";
import { colors, radius } from "../../../lib/theme";

function connectorColor(status: string) {
  if (status === "AVAILABLE") return colors.available;
  if (isConnectorOccupied(status)) return colors.amber;
  if (status === "FAULTED") return colors.danger;
  return colors.muted;
}

export default function StationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [station, setStation] = useState<Station | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState<string | undefined>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [confirm, setConfirm] = useState<{ chargerId: string; connectorId: string } | null>(null);

  const selectedVehicle = vehicles.find((item) => item.id === vehicleId) ?? vehicles.find((item) => item.isDefault) ?? vehicles[0];

  const load = useCallback(async () => {
    if (!id) return;
    const [stationData, vehicleData] = await Promise.all([
      getStation(id, selectedVehicle?.id ?? vehicleId),
      listVehicles(),
    ]);
    setStation(stationData);
    setVehicles(vehicleData);
    if (!vehicleId) {
      const fallback = vehicleData.find((item) => item.isDefault) ?? vehicleData[0];
      if (fallback) setVehicleId(fallback.id);
    }
  }, [id, selectedVehicle?.id, vehicleId]);

  useEffect(() => {
    let cancelled = false;
    load()
      .catch((err: unknown) => {
        if (!cancelled) setError(driverErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useRealtime(() => {
    void load();
  });

  const confirmCharger = station?.chargers.find((item) => item.id === confirm?.chargerId);
  const confirmConnector = confirmCharger?.connectors.find((item) => item.id === confirm?.connectorId);

  async function handleStart() {
    if (!confirmConnector || !selectedVehicle) return;
    setStarting(true);
    try {
      const session = await startSession(confirmConnector.id, selectedVehicle.id);
      setConfirm(null);
      router.push(`/charging/${session.id}` as Href);
    } catch (err: unknown) {
      setError(driverErrorMessage(err));
      setConfirm(null);
    } finally {
      setStarting(false);
    }
  }

  if (loading) return <ScreenState message="Carregando estação…" />;
  if (!station) return <ScreenState error={error || "Estação não encontrada"} />;

  const free = station.availability.availableConnectors;
  const total = station.availability.totalConnectors;
  const current = currentTypeLabel(station.currentType);

  return (
    <>
      <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
        <View style={styles.header}>
          <StatusChip label={stationStatusLabel(station.status)} color={stationStatusColor(station.status)} />
          <Text style={styles.name}>{station.name}</Text>
          <Text style={styles.address}>
            {station.address}
            {station.city ? ` · ${station.city}` : ""}
            {station.postalCode ? ` · ${station.postalCode}` : ""}
          </Text>
          <Text style={styles.metaLine}>
            {accessTypeLabel(station.accessType)}
            {station.openingHoursLabel ? ` · ${station.openingHoursLabel}` : ""}
          </Text>
          {station.amenities.length > 0 ? (
            <Text style={styles.amenities}>{station.amenities.map(amenityLabel).join(" · ")}</Text>
          ) : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={[styles.statValue, station.crowded && styles.full]}>
              {availabilityCopy(free, total)}
            </Text>
            <Text style={styles.statLabel}>Disponibilidade</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{current ?? "—"}</Text>
            <Text style={styles.statLabel}>Tipo</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>
              {station.pricePerKwhCents != null ? formatCurrency(station.pricePerKwhCents) : "—"}
            </Text>
            <Text style={styles.statLabel}>por kWh</Text>
          </View>
        </View>

        <Text style={styles.updated}>
          Última comunicação {formatRelativeTime(station.reliability.lastCommunicationAt)}
        </Text>

        {selectedVehicle ? (
          <Text style={styles.vehicleHint}>
            Veículo: {selectedVehicle.brand} {selectedVehicle.model} ·{" "}
            {selectedVehicle.connectorTypes.map(connectorTypeLabel).join(", ")}
          </Text>
        ) : (
          <Pressable onPress={() => router.push("/(app)/(tabs)/vehicles")}>
            <Text style={styles.error}>Cadastre um veículo para ver a compatibilidade.</Text>
          </Pressable>
        )}

        {station.chargers.map((charger) => (
          <View key={charger.id} style={styles.card}>
            <View style={styles.chargerHead}>
              <View>
                <Text style={styles.serial}>{charger.model ?? charger.serialNumber}</Text>
                <Text style={styles.meta}>
                  {charger.serialNumber} · {formatPower(charger.maxPowerKw)}
                </Text>
              </View>
              <StatusChip
                color={isChargerOnline(charger.status) ? colors.available : colors.muted}
                label={chargerStatusLabel(charger.status)}
              />
            </View>
            {charger.connectors.map((connector) => {
              const canStart = connector.action === "CHARGE";
              return (
                <View
                  key={connector.id}
                  style={[
                    styles.connector,
                    canStart && styles.connectorReady,
                    connector.compatible && styles.connectorCompatible,
                  ]}
                >
                  <View style={styles.connectorInfo}>
                    <Text style={styles.connectorName}>
                      Conector {String(connector.number).padStart(2, "0")} · {connectorTypeLabel(connector.type)}
                    </Text>
                    <Text style={styles.meta}>
                      {formatPower(connector.maxPowerKw)}
                      {connector.pricePerKwhCents != null
                        ? ` · ${formatCurrency(connector.pricePerKwhCents)}/kWh`
                        : ""}
                    </Text>
                    {connector.compatible === true ? (
                      <Text style={styles.ok}>✓ Compatível</Text>
                    ) : connector.compatible === false ? (
                      <Text style={styles.bad}>✕ Incompatível</Text>
                    ) : null}
                  </View>
                  <View style={styles.connectorActions}>
                    <StatusChip color={connectorColor(connector.status)} label={connectorStatusLabel(connector.status)} />
                    <Pressable
                      disabled={!canStart || starting}
                      onPress={() => setConfirm({ chargerId: charger.id, connectorId: connector.id })}
                      style={[styles.cta, !canStart && styles.ctaDisabled]}
                    >
                      <Text style={[styles.ctaText, !canStart && styles.ctaTextDisabled]}>
                        {ctaLabel(connector.action)}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>

      <Modal animationType="slide" transparent visible={Boolean(confirm)} onRequestClose={() => setConfirm(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirmar recarga</Text>
            <Text style={styles.modalName}>{station.name}</Text>
            <Text style={styles.meta}>Carregador {confirmCharger?.serialNumber}</Text>
            <Text style={styles.modalLine}>
              {confirmConnector ? connectorTypeLabel(confirmConnector.type) : ""} ·{" "}
              {confirmConnector ? formatPower(confirmConnector.maxPowerKw) : ""}
            </Text>
            <Text style={styles.modalLine}>
              {confirmConnector?.pricePerKwhCents != null
                ? `${formatCurrency(confirmConnector.pricePerKwhCents)} / kWh`
                : "Tarifa da estação"}
            </Text>
            {(confirmConnector?.connectionFeeCents ?? station.connectionFeeCents ?? 0) > 0 ? (
              <Text style={styles.modalLine}>
                Taxa de conexão: {formatCurrency(confirmConnector?.connectionFeeCents ?? station.connectionFeeCents ?? 0)}
              </Text>
            ) : null}
            {(confirmConnector?.idleFeeCents ?? station.idleFeeCents ?? 0) > 0 ? (
              <Text style={styles.modalLine}>
                Ociosidade: {formatCurrency(confirmConnector?.idleFeeCents ?? station.idleFeeCents ?? 0)}/min
              </Text>
            ) : null}
            <Text style={styles.modalLine}>
              Veículo: {selectedVehicle ? `${selectedVehicle.brand} ${selectedVehicle.model}` : "Não selecionado"}
            </Text>
            <Pressable disabled={starting || !selectedVehicle} onPress={() => void handleStart()} style={styles.confirm}>
              {starting ? (
                <ActivityIndicator color={colors.primaryText} />
              ) : (
                <Text style={styles.confirmText}>Confirmar recarga</Text>
              )}
            </Pressable>
            <Pressable onPress={() => setConfirm(null)} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg, flex: 1 },
  content: { gap: 16, padding: 16, paddingBottom: 40 },
  header: { gap: 8 },
  name: { color: colors.text, fontSize: 24, fontWeight: "700" },
  address: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  metaLine: { color: colors.muted, fontSize: 13 },
  amenities: { color: colors.primary, fontSize: 13, fontWeight: "600" },
  error: { color: colors.danger, fontSize: 14 },
  stats: { flexDirection: "row", gap: 8 },
  stat: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    padding: 12,
  },
  statValue: { color: colors.text, fontSize: 15, fontWeight: "700" },
  full: { color: colors.amber },
  statLabel: { color: colors.muted, fontSize: 12, marginTop: 4 },
  updated: { color: colors.muted, fontSize: 12 },
  vehicleHint: { color: colors.text, fontSize: 14, fontWeight: "600" },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  chargerHead: { flexDirection: "row", gap: 8, justifyContent: "space-between" },
  serial: { color: colors.text, fontSize: 15, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: 13, marginTop: 2 },
  connector: {
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  connectorReady: { borderColor: colors.primary },
  connectorCompatible: { backgroundColor: "rgba(94,234,212,0.04)" },
  connectorInfo: { gap: 2 },
  connectorName: { color: colors.text, fontSize: 14, fontWeight: "600" },
  ok: { color: colors.available, fontSize: 12, fontWeight: "600", marginTop: 4 },
  bad: { color: colors.muted, fontSize: 12, marginTop: 4 },
  connectorActions: { gap: 8 },
  cta: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
  },
  ctaDisabled: { backgroundColor: colors.cardAlt },
  ctaText: { color: colors.primaryText, fontSize: 14, fontWeight: "700" },
  ctaTextDisabled: { color: colors.muted },
  modalBackdrop: { backgroundColor: "rgba(0,0,0,0.6)", flex: 1, justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    gap: 8,
    padding: 20,
  },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  modalName: { color: colors.text, fontSize: 16, fontWeight: "600" },
  modalLine: { color: colors.text, fontSize: 15 },
  confirm: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    marginTop: 8,
    paddingVertical: 14,
  },
  confirmText: { color: colors.primaryText, fontSize: 16, fontWeight: "700" },
  cancelBtn: { alignItems: "center", padding: 12 },
  cancelText: { color: colors.muted, fontSize: 15 },
});
