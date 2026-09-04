import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { resetPassword } from "../lib/api-client";
import { colors, radius } from "../lib/theme";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const [token, setToken] = useState(params.token ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError("");
    try {
      await resetPassword(token, password);
      router.replace("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível redefinir a senha");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Nova senha</Text>
        <TextInput
          onChangeText={setToken}
          placeholder="Token"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={token}
        />
        <TextInput
          onChangeText={setPassword}
          placeholder="Nova senha"
          placeholderTextColor={colors.muted}
          secureTextEntry
          style={styles.input}
          value={password}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable disabled={loading} onPress={() => void submit()} style={styles.button}>
          <Text style={styles.buttonText}>{loading ? "Salvando…" : "Redefinir senha"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { alignItems: "center", backgroundColor: colors.bg, flex: 1, justifyContent: "center", padding: 24 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 12,
    maxWidth: 420,
    padding: 24,
    width: "100%",
  },
  title: { color: colors.text, fontSize: 22, fontWeight: "700" },
  input: {
    backgroundColor: colors.cardAlt,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  error: { color: colors.danger },
  button: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14 },
  buttonText: { color: colors.primaryText, fontWeight: "700" },
});
