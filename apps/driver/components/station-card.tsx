import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Station } from "../lib/api-client";
import { stationStatusColor, stationStatusLabel } from "../lib/labels";
import { colors, radius } from "../lib/theme";
import { StatusChip } from "./status-chip";

export function StationCard({ station, onPress }: { station: Station; onPress: () => void }) {
  const free = station.availability.availableConnectors;
  const total = station.availability.totalConnectors;
  const maxPower = station.chargers.reduce((acc, charger) => Math.max(acc, charger.maxPowerKw), 0);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.header}>
        <Text style={styles.name}>{station.name}</Text>
        <StatusChip label={stationStatusLabel(station.status)} color={stationStatusColor(station.status)} />
      </View>
      <Text style={styles.address}>{station.address}</Text>
      <View style={styles.meta}>
        <Text style={styles.metaText}>
          {free}/{total} livres
        </Text>
        {maxPower > 0 ? <Text style={styles.metaText}>até {maxPower} kW</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  pressed: { opacity: 0.85 },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  name: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
  },
  address: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  meta: {
    flexDirection: "row",
    gap: 16,
    marginTop: 4,
  },
  metaText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "600",
  },
});
