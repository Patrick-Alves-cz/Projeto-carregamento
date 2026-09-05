import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { ScreenState } from "../../../components/screen-state";
import { listSessions, listVehicles, type ChargingSession, type Vehicle } from "../../../lib/api-client";
import {
  formatCurrency,
  formatDuration,
  formatEnergy,
  sessionStatusLabel,
} from "../../../lib/labels";
import { colors, radius } from "../../../lib/theme";

const STATUSES = ["", "COMPLETED", "ACTIVE", "FAILED", "CANCELLED"];

export default function HistoryScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<ChargingSession[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [status, setStatus] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [res, vehicleData] = await Promise.all([
      listSessions({
        limit: 50,
        status: status || undefined,
        vehicleId: vehicleId || undefined,
      }),
      listVehicles().catch(() => []),
    ]);
    setSessions(res.items);
    setVehicles(vehicleData);
  }, [status, vehicleId]);

  useFocusEffect(
    useCallback(() => {
      load()
        .catch((err: unknown) => setError(err instanceof Error ? err.message : "Erro ao carregar"))
        .finally(() => setLoading(false));
    }, [load]),
  );

  if (loading) return <ScreenState message="Carregando histórico…" />;
  if (error) return <ScreenState error={error} />;

  return (
    <View style={styles.screen}>
      <View style={styles.filters}>
        {STATUSES.map((item) => (
          <Pressable
            key={item || "all"}
            onPress={() => setStatus(item)}
            style={[styles.chip, status === item && styles.chipOn]}
          >
            <Text style={[styles.chipText, status === item && styles.chipTextOn]}>
              {item ? sessionStatusLabel(item) : "Todas"}
            </Text>
          </Pressable>
        ))}
      </View>
      {vehicles.length > 1 ? (
        <View style={styles.filters}>
          <Pressable onPress={() => setVehicleId("")} style={[styles.chip, !vehicleId && styles.chipOn]}>
            <Text style={[styles.chipText, !vehicleId && styles.chipTextOn]}>Todos os veículos</Text>
          </Pressable>
          {vehicles.map((vehicle) => (
            <Pressable
              key={vehicle.id}
              onPress={() => setVehicleId(vehicle.id)}
              style={[styles.chip, vehicleId === vehicle.id && styles.chipOn]}
            >
              <Text style={[styles.chipText, vehicleId === vehicle.id && styles.chipTextOn]}>{vehicle.model}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
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
            {item.receipt ? <Text style={styles.receipt}>Recibo {item.receipt.number}</Text> : null}
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
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  chip: {
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  chipTextOn: { color: colors.primaryText },
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
  receipt: { color: colors.available, fontSize: 12, fontWeight: "700" },
  date: { color: colors.muted, fontSize: 12, marginTop: 2 },
});
