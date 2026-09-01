import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { ScreenState } from "../../../components/screen-state";
import { listVehicles, type Vehicle } from "../../../lib/api-client";
import { colors, radius } from "../../../lib/theme";

export default function VehiclesScreen() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listVehicles()
      .then(setVehicles)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Erro ao carregar"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ScreenState message="Carregando veículos…" />;
  if (error) return <ScreenState error={error} />;

  return (
    <ScrollView contentContainerStyle={styles.list} style={styles.screen}>
      {vehicles.length === 0 ? (
        <Text style={styles.empty}>Você ainda não cadastrou veículos.</Text>
      ) : (
        vehicles.map((vehicle) => (
          <View key={vehicle.id} style={styles.card}>
            <Text style={styles.title}>
              {vehicle.brand} {vehicle.model}
            </Text>
            <Text style={styles.meta}>
              {[vehicle.year, vehicle.batteryKwh ? `${Number(vehicle.batteryKwh)} kWh` : null]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            <Text style={styles.connectors}>{vehicle.connectorTypes.join(" · ")}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg, flex: 1 },
  list: { gap: 12, padding: 16 },
  empty: { color: colors.muted, marginTop: 24, textAlign: "center" },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 6,
    padding: 16,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: "600" },
  meta: { color: colors.muted, fontSize: 13 },
  connectors: { color: colors.primary, fontSize: 13, fontWeight: "600" },
});
