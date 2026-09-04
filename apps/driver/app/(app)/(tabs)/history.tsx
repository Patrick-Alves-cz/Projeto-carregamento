import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { ScreenState } from "../../../components/screen-state";
import { listSessions, type ChargingSession } from "../../../lib/api-client";
import {
  formatCurrency,
  formatDuration,
  formatEnergy,
  sessionStatusLabel,
} from "../../../lib/labels";
import { colors, radius } from "../../../lib/theme";

export default function HistoryScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<ChargingSession[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listSessions({ limit: 50 })
      .then((res) => setSessions(res.items))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Erro ao carregar"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ScreenState message="Carregando histórico…" />;
  if (error) return <ScreenState error={error} />;

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.list}
        data={sessions}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>Nenhuma recarga registrada ainda.</Text>}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/charging/${item.id}` as Href)} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.station}>{item.station.name}</Text>
              <Text style={styles.status}>{sessionStatusLabel(item.status)}</Text>
            </View>
            <Text style={styles.meta}>
              {item.vehicle.brand} {item.vehicle.model} · {item.connector.type}
            </Text>
            <Text style={styles.meta}>
              {formatDuration(item.durationSeconds)} · {formatEnergy(item.energyKwh)} · {formatCurrency(item.costCents)}
            </Text>
            {item.tariffSnapshot ? (
              <Text style={styles.meta}>{formatCurrency(item.tariffSnapshot.pricePerKwhCents)} / kWh</Text>
            ) : null}
            {item.startedAt ? (
              <Text style={styles.date}>{new Date(item.startedAt).toLocaleString("pt-BR")}</Text>
            ) : null}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg, flex: 1 },
  list: { gap: 10, padding: 16 },
  empty: { color: colors.muted, padding: 24, textAlign: "center" },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  row: { flexDirection: "row", justifyContent: "space-between" },
  station: { color: colors.text, fontSize: 15, fontWeight: "600" },
  status: { color: colors.primary, fontSize: 12, fontWeight: "600" },
  meta: { color: colors.muted, fontSize: 13 },
  date: { color: colors.muted, fontSize: 12, marginTop: 2 },
});
