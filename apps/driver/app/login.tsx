import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { login } from "../lib/api-client";
import { colors, radius } from "../lib/theme";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("driver1@evcharge.demo");
  const [password, setPassword] = useState("Demo@12345");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    setError("");
    try {
      await login(email, password);
      router.replace("/(app)/(tabs)");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <View style={styles.card}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Ionicons name="flash" size={22} color={colors.primaryText} />
          </View>
          <Text style={styles.title}>EV Charge</Text>
          <Text style={styles.subtitle}>App do motorista — versão beta</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.label}>E-mail</Text>
        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="E-mail"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={email}
        />
        <Text style={styles.label}>Senha</Text>
        <TextInput
          autoComplete="password"
          onChangeText={setPassword}
          placeholder="Senha"
          placeholderTextColor={colors.muted}
          secureTextEntry
          style={styles.input}
          value={password}
        />
        <Pressable
          accessibilityRole="button"
          disabled={loading}
          onPress={handleLogin}
          style={({ pressed }) => [styles.button, pressed && styles.pressed, loading && styles.disabled]}
        >
          <Text style={styles.buttonText}>{loading ? "Entrando…" : "Entrar"}</Text>
        </Pressable>
        <Text style={styles.hint}>Demo: driver1@evcharge.demo / Demo@12345</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: "center",
    backgroundColor: colors.bg,
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    maxWidth: 420,
    padding: 24,
    width: "100%",
  },
  brand: { alignItems: "flex-start", gap: 8, marginBottom: 20 },
  logo: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  title: { color: colors.text, fontSize: 22, fontWeight: "700" },
  subtitle: { color: colors.muted, fontSize: 14 },
  label: { color: colors.muted, fontSize: 13, fontWeight: "600", marginBottom: 6 },
  input: {
    backgroundColor: colors.cardAlt,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  button: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    marginTop: 4,
    paddingVertical: 14,
  },
  buttonText: { color: colors.primaryText, fontSize: 16, fontWeight: "700" },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.6 },
  error: { color: colors.danger, fontSize: 14, marginBottom: 12 },
  hint: { color: colors.muted, fontSize: 12, marginTop: 14, textAlign: "center" },
});
