import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Link, useRouter } from "expo-router";
import {
  isPasswordStrong,
  PASSWORD_POLICY_MESSAGE,
  PASSWORD_REQUIREMENTS,
  passwordRequirementChecks,
} from "@evcharge/shared";
import { register, isCookieBff } from "../lib/api-client";
import { driverErrorMessage } from "../lib/errors";
import { colors, radius } from "../lib/theme";

export default function RegisterScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const checks = useMemo(() => passwordRequirementChecks(password), [password]);

  async function handleRegister() {
    if (!isPasswordStrong(password)) {
      setError(PASSWORD_POLICY_MESSAGE);
      return;
    }
    setLoading(true);
    setError("");
    try {
      await register({
        fullName,
        email,
        phone: phone || undefined,
        password,
      });
      if (isCookieBff() && typeof window !== "undefined") {
        window.location.assign("/app");
        return;
      }
      router.replace("/onboarding");
    } catch (err: unknown) {
      setError(driverErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <ScrollView contentContainerStyle={styles.wrap}>
        <View style={styles.card}>
          <Text style={styles.title}>Entre ou cadastre-se</Text>
          <Text style={styles.subtitle}>
            Cadastro de motorista com e-mail e senha. A senha precisa ter letra e número.
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.label}>Nome completo</Text>
          <TextInput onChangeText={setFullName} style={styles.input} value={fullName} />
          <Text style={styles.label}>E-mail</Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setEmail}
            style={styles.input}
            value={email}
          />
          <Text style={styles.label}>Telefone</Text>
          <TextInput keyboardType="phone-pad" onChangeText={setPhone} style={styles.input} value={phone} />
          <Text style={styles.label}>Senha</Text>
          <TextInput onChangeText={setPassword} secureTextEntry style={styles.input} value={password} />
          <View style={styles.requirements}>
            {PASSWORD_REQUIREMENTS.map((item) => (
              <Text
                key={item.id}
                style={[styles.requirement, checks[item.id] ? styles.requirementOk : null]}
              >
                {checks[item.id] ? "✓" : "○"} {item.label}
              </Text>
            ))}
          </View>
          <Pressable
            disabled={loading || !isPasswordStrong(password)}
            onPress={() => void handleRegister()}
            style={[styles.button, (!isPasswordStrong(password) || loading) && styles.disabled]}
          >
            <Text style={styles.buttonText}>{loading ? "Criando…" : "Criar conta"}</Text>
          </Pressable>
          <Link href="/login" style={styles.link}>
            Já tenho conta
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg, flex: 1 },
  wrap: { flexGrow: 1, justifyContent: "center", padding: 24 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 24,
  },
  title: { color: colors.text, fontSize: 24, fontWeight: "700" },
  subtitle: { color: colors.muted, fontSize: 14, marginBottom: 16, marginTop: 6 },
  error: { color: colors.danger, marginBottom: 12 },
  label: { color: colors.muted, fontSize: 13, fontWeight: "600", marginBottom: 6 },
  input: {
    backgroundColor: colors.cardAlt,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  requirements: {
    backgroundColor: colors.cardAlt,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 6,
    marginBottom: 12,
    padding: 12,
  },
  requirement: { color: colors.muted, fontSize: 12 },
  requirementOk: { color: colors.primary },
  button: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    marginTop: 4,
    paddingVertical: 14,
  },
  buttonText: { color: colors.primaryText, fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.55 },
  link: { color: colors.primary, marginTop: 16, textAlign: "center" },
});
