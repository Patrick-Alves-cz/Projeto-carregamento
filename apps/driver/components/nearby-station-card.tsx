import { Pressable, StyleSheet, Text, View } from "react-native";
import type { NearbyStation } from "../lib/api-client";
import {
  availabilityCopy,
  currentTypeLabel,
  formatCurrency,
  formatDistance,
  formatPower,
  formatRelativeTime,
  stationStatusColor,
} from "../lib/labels";
import { colors, radius } from "../lib/theme";

export function NearbyStationCard({
  station,
  selected,
  onPress,
}: {
  station: NearbyStation;
  selected?: boolean;
  onPress: () => void;
}) {
  const current = currentTypeLabel(station.currentType);
  const crowded = station.crowded || station.availableConnectors === 0;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, selected && styles.selected, pressed && styles.pressed]}
    >
      <View style={styles.row}>
        <Text style={styles.name} numberOfLines={1}>
          {station.name}
        </Text>
        <Text style={styles.distance}>{formatDistance(station.distanceKm)}</Text>
      </View>
      <Text style={styles.address} numberOfLines={1}>
        {station.address}
        {station.city ? ` · ${station.city}` : ""}
      </Text>
      <Text style={[styles.availability, crowded && styles.full]}>
        {availabilityCopy(station.availableConnectors, station.totalConnectors, station.availabilityState)}
      </Text>
      {station.reliability?.label ? (
        <Text style={styles.metaText}>
          {station.reliability.label}
          {station.reliability.score != null ? ` · ${station.reliability.score}%` : ""}
        </Text>
      ) : null}
      <View style={styles.meta}>
        {current ? <Text style={styles.metaText}>{current}</Text> : null}
        {station.maxPowerKw > 0 ? (
          <Text style={styles.metaText}>até {formatPower(station.maxPowerKw)}</Text>
        ) : null}
        {station.pricePerKwhCents != null ? (
          <Text style={styles.metaText}>{formatCurrency(station.pricePerKwhCents)}/kWh</Text>
        ) : null}
        {station.accessType ? (
          <Text style={styles.metaText}>{station.accessType === "PUBLIC" ? "Público" : "Privado"}</Text>
        ) : null}
      </View>
      <View style={styles.footer}>
        <View style={[styles.dot, { backgroundColor: stationStatusColor(station.status) }]} />
        <Text style={styles.updated}>
          Atualizado {formatRelativeTime(station.lastSeenAt ?? station.updatedAt)}
        </Text>
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
    gap: 6,
    padding: 16,
  },
  selected: { borderColor: colors.primary },
  pressed: { opacity: 0.88 },
  row: { flexDirection: "row", gap: 12, justifyContent: "space-between" },
  name: { color: colors.text, flex: 1, fontSize: 16, fontWeight: "700" },
  distance: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  address: { color: colors.muted, fontSize: 13 },
  availability: { color: colors.available, fontSize: 14, fontWeight: "700", marginTop: 2 },
  full: { color: colors.amber },
  meta: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 2 },
  metaText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  footer: { alignItems: "center", flexDirection: "row", gap: 6, marginTop: 4 },
  dot: { borderRadius: 4, height: 8, width: 8 },
  updated: { color: colors.muted, fontSize: 12 },
});
