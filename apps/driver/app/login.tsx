import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { type Href, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { isDriverRole } from "@evcharge/shared";
import { isCookieBff, login, logout } from "../lib/api-client";
import { colors, radius } from "../lib/theme";

type Step = "chooser" | "email";

export default function LoginScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("chooser");
  const [email, setEmail] = useState("driver1@evcharge.demo");
  const [password, setPassword] = useState("Demo@12345");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isCookieBff() && typeof window !== "undefined") {
      window.location.replace("/login");
    }
  }, []);

  function socialSoon(provider: "Google" | "Apple") {
    setError("");
    setInfo(
      `${provider} estará disponível com as chaves OAuth. Por enquanto use e-mail e senha.`,
    );
  }

  async function handleLogin() {
    setLoading(true);
    setError("");
    setInfo("");
    try {
      const data = await login(email, password);
      if (!isDriverRole(data.user.role)) {
        await logout();
        setError("Esta conta não é de motorista.");
        return;
      }
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
        <Text style={styles.title}>Entre ou cadastre-se</Text>
        <Text style={styles.subtitle}>
          Ao continuar, você está de acordo com nossos termos de uso e privacidade.
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {info ? <Text style={styles.info}>{info}</Text> : null}

        {step === "chooser" ? (
          <>
            <Pressable onPress={() => socialSoon("Google")} style={styles.social}>
              <Ionicons color={colors.text} name="logo-google" size={18} />
              <Text style={styles.socialText}>Continuar com Google</Text>
            </Pressable>
            <Pressable onPress={() => socialSoon("Apple")} style={styles.social}>
              <Ionicons color={colors.text} name="logo-apple" size={18} />
              <Text style={styles.socialText}>Continuar com Apple</Text>
            </Pressable>
            <Pressable onPress={() => setStep("email")} style={styles.social}>
              <Ionicons color={colors.text} name="mail-outline" size={18} />
              <Text style={styles.socialText}>Continuar com e-mail</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/forgot-password" as Href)}>
              <Text style={styles.register}>Não consegue acessar? Recuperar senha</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/register")}>
              <Text style={styles.register}>Criar conta de motorista</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable onPress={() => setStep("chooser")}>
              <Text style={styles.back}>← Voltar</Text>
            </Pressable>
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
            <Pressable onPress={() => router.push("/forgot-password" as Href)}>
              <Text style={styles.register}>Recuperar senha</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/register")}>
              <Text style={styles.register}>Criar conta com e-mail</Text>
            </Pressable>
          </>
        )}
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
  title: { color: colors.text, fontSize: 24, fontWeight: "700" },
  subtitle: { color: colors.muted, fontSize: 14, marginBottom: 18, marginTop: 8 },
  back: { color: colors.muted, fontSize: 14, marginBottom: 12 },
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
  social: {
    alignItems: "center",
    backgroundColor: colors.cardAlt,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    marginBottom: 10,
    paddingVertical: 14,
  },
  socialText: { color: colors.text, fontSize: 15, fontWeight: "600" },
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
  info: { color: colors.muted, fontSize: 13, marginBottom: 12 },
  hint: { color: colors.muted, fontSize: 12, marginTop: 14, textAlign: "center" },
  register: { color: colors.primary, fontSize: 14, fontWeight: "600", marginTop: 14, textAlign: "center" },
});
