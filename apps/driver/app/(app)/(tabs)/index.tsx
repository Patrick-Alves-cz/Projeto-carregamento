import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ScreenState } from "../../../components/screen-state";
import { StationCard } from "../../../components/station-card";
import { listStations, type Station } from "../../../lib/api-client";
import { colors, radius } from "../../../lib/theme";

const FILTERS = [
  { value: "ALL", label: "Todas" },
  { value: "ACTIVE", label: "Operando" },
  { value: "MAINTENANCE", label: "Manutenção" },
] as const;

export default function StationsScreen() {
  const router = useRouter();
  const [stations, setStations] = useState<Station[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("ALL");

  useEffect(() => {
    listStations()
      .then(setStations)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Erro ao carregar"))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    if (filter === "ALL") return stations;
    return stations.filter((station) => station.status === filter);
  }, [filter, stations]);

  if (loading) return <ScreenState message="Buscando estações…" />;
  if (error) return <ScreenState error={error} />;

  return (
    <View style={styles.screen}>
      <View style={styles.filters}>
        {FILTERS.map((item) => {
          const active = filter === item.value;
          return (
            <Pressable
              accessibilityRole="button"
              key={item.value}
              onPress={() => setFilter(item.value)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <FlatList
        contentContainerStyle={styles.list}
        data={visible}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>Nenhuma estação nesta visão.</Text>}
        renderItem={({ item }) => (
          <StationCard onPress={() => router.push(`/station/${item.id}`)} station={item} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg, flex: 1 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingTop: 8 },
  chip: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: colors.primaryText },
  list: { gap: 12, padding: 16 },
  empty: { color: colors.muted, marginTop: 24, textAlign: "center" },
});
