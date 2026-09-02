import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import {
  amenityLabel,
  chargerStatusLabel,
  connectorStatusLabel,
  isChargerOnline,
  isConnectorOccupied,
  stationStatusColor,
  stationStatusLabel,
} from "../../../lib/labels";
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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([getStation(id), listVehicles()])
      .then(([stationData, vehicleData]) => {
        setStation(stationData);
        setVehicles(vehicleData);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Erro ao carregar"))
      .finally(() => setLoading(false));
  }, [id]);

  function openStart(connectorId: string) {
    if (vehicles.length === 0) {
      Alert.alert("Veículo necessário", "Cadastre um veículo antes de iniciar a recarga.");
      return;
    }
    setSelectedConnectorId(connectorId);
    setPickerOpen(true);
  }

  async function confirmStart(vehicleId: string) {
    if (!selectedConnectorId) return;
    setStarting(true);
    setPickerOpen(false);
    try {
      const session = await startSession(selectedConnectorId, vehicleId);
      router.push(`/charging/${session.id}` as Href);
    } catch (err: unknown) {
      Alert.alert("Erro", err instanceof Error ? err.message : "Não foi possível iniciar");
    } finally {
      setStarting(false);
      setSelectedConnectorId(null);
    }
  }

  if (loading) return <ScreenState message="Carregando estação…" />;
  if (error || !station) return <ScreenState error={error || "Estação não encontrada"} />;

  const free = station.availability.availableConnectors;
  const total = station.availability.totalConnectors;
  const maxPower = station.chargers.reduce((acc, charger) => Math.max(acc, charger.maxPowerKw), 0);

  return (
    <>
      <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
        <View style={styles.header}>
          <StatusChip
            label={stationStatusLabel(station.status)}
            color={stationStatusColor(station.status)}
          />
          <Text style={styles.name}>{station.name}</Text>
          <Text style={styles.address}>{station.address}</Text>
          {station.amenities.length > 0 ? (
            <Text style={styles.amenities}>{station.amenities.map(amenityLabel).join(" · ")}</Text>
          ) : null}
        </View>

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{station.chargers.length}</Text>
            <Text style={styles.statLabel}>Carregadores</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>
              {free}/{total}
            </Text>
            <Text style={styles.statLabel}>Livres</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{maxPower} kW</Text>
            <Text style={styles.statLabel}>Máximo</Text>
          </View>
        </View>

        {starting ? (
          <View style={styles.starting}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.startingText}>Iniciando recarga…</Text>
          </View>
        ) : null}

        {station.chargers.map((charger) => (
          <View key={charger.id} style={styles.card}>
            <View style={styles.chargerHead}>
              <View>
                <Text style={styles.serial}>{charger.serialNumber}</Text>
                <Text style={styles.meta}>
                  {charger.model ?? "Carregador"} · {charger.maxPowerKw} kW
                </Text>
              </View>
              <StatusChip
                color={isChargerOnline(charger.status) ? colors.available : colors.muted}
                label={chargerStatusLabel(charger.status)}
              />
            </View>
            {charger.connectors.map((connector) => {
              const canStart = connector.status === "AVAILABLE" && isChargerOnline(charger.status);
              return (
                <Pressable
                  key={connector.id}
                  disabled={!canStart || starting}
                  onPress={() => openStart(connector.id)}
                  style={[styles.connector, canStart && styles.connectorTappable]}
                >
                  <View>
                    <Text style={styles.connectorName}>
                      Conector {connector.number} · {connector.type}
                    </Text>
                    <Text style={styles.meta}>{connector.maxPowerKw} kW</Text>
                    {canStart ? <Text style={styles.tapHint}>Toque para iniciar recarga</Text> : null}
                  </View>
                  <StatusChip
                    color={connectorColor(connector.status)}
                    label={connectorStatusLabel(connector.status)}
                  />
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>

      <Modal
        animationType="slide"
        transparent
        visible={pickerOpen}
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Escolha o veículo</Text>
            {vehicles.map((vehicle) => (
              <Pressable
                key={vehicle.id}
                onPress={() => confirmStart(vehicle.id)}
                style={styles.vehicleRow}
              >
                <Text style={styles.vehicleName}>
                  {vehicle.brand} {vehicle.model}
                </Text>
                <Text style={styles.meta}>{vehicle.connectorTypes.join(", ")}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setPickerOpen(false)} style={styles.cancelBtn}>
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
  content: { gap: 16, padding: 16, paddingBottom: 32 },
  header: { gap: 8 },
  name: { color: colors.text, fontSize: 24, fontWeight: "700" },
  address: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  amenities: { color: colors.primary, fontSize: 13, fontWeight: "600" },
  stats: { flexDirection: "row", gap: 8 },
  stat: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    padding: 12,
  },
  statValue: { color: colors.text, fontSize: 18, fontWeight: "700" },
  statLabel: { color: colors.muted, fontSize: 12, marginTop: 4 },
  starting: { alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "center" },
  startingText: { color: colors.primary, fontSize: 14 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  chargerHead: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  serial: { color: colors.text, fontSize: 15, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: 13, marginTop: 2 },
  connector: {
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 12,
  },
  connectorTappable: { borderColor: colors.primary },
  connectorName: { color: colors.text, fontSize: 14, fontWeight: "600" },
  tapHint: { color: colors.primary, fontSize: 12, marginTop: 4 },
  modalBackdrop: {
    backgroundColor: "rgba(0,0,0,0.6)",
    flex: 1,
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    gap: 8,
    padding: 20,
  },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: 8 },
  vehicleRow: {
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 14,
  },
  vehicleName: { color: colors.text, fontSize: 15, fontWeight: "600" },
  cancelBtn: { alignItems: "center", marginTop: 8, padding: 12 },
  cancelText: { color: colors.muted, fontSize: 15 },
});
