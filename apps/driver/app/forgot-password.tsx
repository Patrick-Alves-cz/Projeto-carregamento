import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { type Href, useRouter } from "expo-router";
import { forgotPassword } from "../lib/api-client";
import { colors, radius } from "../lib/theme";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      const result = await forgotPassword(email);
      setMessage(result.message);
      setToken(result.resetToken ?? "");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Não foi possível solicitar o reset");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Recuperar acesso</Text>
        <Text style={styles.subtitle}>Informe o e-mail da conta. A resposta é sempre genérica.</Text>
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="E-mail"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={email}
        />
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {token ? (
          <Pressable
            onPress={() =>
              router.push(`/reset-password?token=${encodeURIComponent(token)}` as unknown as Href)
            }
          >
            <Text style={styles.link}>Abrir reset DEMO</Text>
          </Pressable>
        ) : null}
        <Pressable disabled={loading} onPress={() => void submit()} style={styles.button}>
          <Text style={styles.buttonText}>{loading ? "Enviando…" : "Enviar instruções"}</Text>
        </Pressable>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>Voltar ao login</Text>
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
  subtitle: { color: colors.muted, fontSize: 14 },
  input: {
    backgroundColor: colors.cardAlt,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  message: { color: colors.text, fontSize: 14 },
  link: { color: colors.primary, fontWeight: "700" },
  button: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14 },
  buttonText: { color: colors.primaryText, fontWeight: "700" },
  back: { color: colors.muted, textAlign: "center" },
});
