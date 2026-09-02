import { Text, View, StyleSheet } from "react-native";
import { radius } from "../lib/theme";

export function StatusChip({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: `${color}22` }]}>
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: "flex-start",
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
  },
});
