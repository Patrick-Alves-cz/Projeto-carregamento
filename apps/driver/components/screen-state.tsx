import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/theme";

export function ScreenState({ message, error }: { message?: string; error?: string }) {
  return (
    <View style={styles.wrap}>
      {!error ? <ActivityIndicator color={colors.primary} /> : null}
      <Text style={[styles.text, error ? styles.error : undefined]}>{error ?? message ?? "Carregando…"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
    padding: 24,
  },
  text: {
    color: colors.muted,
    fontSize: 14,
    textAlign: "center",
  },
  error: { color: colors.danger },
});
