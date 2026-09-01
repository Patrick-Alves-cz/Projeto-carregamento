import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ScreenState } from "../../../components/screen-state";
import { StatusChip } from "../../../components/status-chip";
import { getStation, type Station } from "../../../lib/api-client";
import {
  amenityLabel,
  chargerStatusLabel,
  connectorStatusLabel,
  stationStatusColor,
  stationStatusLabel,
} from "../../../lib/labels";
import { colors, radius } from "../../../lib/theme";

function connectorColor(status: string) {
  if (status === "AVAILABLE") return colors.available;
  if (status === "OCCUPIED") return colors.amber;
  if (status === "FAULTED") return colors.danger;
  return colors.muted;
}

export default function StationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [station, setStation] = useState<Station | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getStation(id)
      .then(setStation)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Erro ao carregar"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <ScreenState message="Carregando estação…" />;
  if (error || !station) return <ScreenState error={error || "Estação não encontrada"} />;

  const free = station.availability.availableConnectors;
  const total = station.availability.totalConnectors;
  const maxPower = station.chargers.reduce((acc, charger) => Math.max(acc, charger.maxPowerKw), 0);

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <View style={styles.header}>
        <StatusChip label={stationStatusLabel(station.status)} color={stationStatusColor(station.status)} />
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
              color={charger.status === "ONLINE" ? colors.available : colors.muted}
              label={chargerStatusLabel(charger.status)}
            />
          </View>
          {charger.connectors.map((connector) => (
            <View key={connector.id} style={styles.connector}>
              <View>
                <Text style={styles.connectorName}>
                  Conector {connector.number} · {connector.type}
                </Text>
                <Text style={styles.meta}>{connector.maxPowerKw} kW</Text>
              </View>
              <StatusChip
                color={connectorColor(connector.status)}
                label={connectorStatusLabel(connector.status)}
              />
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
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
  connectorName: { color: colors.text, fontSize: 14, fontWeight: "600" },
});
