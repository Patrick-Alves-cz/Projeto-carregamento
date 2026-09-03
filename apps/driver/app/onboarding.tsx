import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import {
  VehicleForm,
  emptyVehicleForm,
  toVehiclePayload,
  type VehicleFormValue,
} from "../components/vehicle-form";
import { createVehicle, getMe, updateMe, type AuthUser } from "../lib/api-client";
import { driverErrorMessage } from "../lib/errors";
import { colors, radius } from "../lib/theme";

const STEPS = ["Perfil", "Veículo", "Pronto"] as const;

export default function OnboardingScreen() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicle, setVehicle] = useState<VehicleFormValue>({ ...emptyVehicleForm, isDefault: true });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getMe().then((me) => {
      setUser(me);
      setFullName(me.profile?.fullName ?? "");
      setPhone(me.profile?.phone ?? "");
    });
  }, []);

  async function next() {
    setError("");
    setBusy(true);
    try {
      if (step === 0) {
        if (fullName.trim().length < 2) {
          setError("Informe seu nome completo.");
          return;
        }
        await updateMe({ fullName: fullName.trim(), phone: phone.trim() || undefined });
        setStep(1);
        return;
      }
      if (step === 1) {
        const payload = toVehiclePayload(vehicle);
        if (!payload.brand || !payload.model || payload.connectorTypes.length === 0) {
          setError("Informe marca, modelo e ao menos um conector.");
          return;
        }
        await createVehicle({ ...payload, isDefault: true });
        setStep(2);
        return;
      }
      router.replace("/(app)/(tabs)");
    } catch (err: unknown) {
      setError(driverErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <Text style={styles.kicker}>Passo {step + 1} de 3</Text>
      <Text style={styles.title}>{STEPS[step]}</Text>
      <Text style={styles.subtitle}>
        {step === 0
          ? "Confirme seus dados para começar."
          : step === 1
            ? "O primeiro veículo ajuda a mostrar só o que é compatível."
            : `Tudo pronto${user?.profile?.fullName ? `, ${user.profile.fullName.split(" ")[0]}` : ""}.`}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {step === 0 ? (
        <View style={styles.card}>
          <Text style={styles.label}>Nome completo</Text>
          <TextInput onChangeText={setFullName} style={styles.input} value={fullName} />
          <Text style={styles.label}>Telefone</Text>
          <TextInput keyboardType="phone-pad" onChangeText={setPhone} style={styles.input} value={phone} />
          <Text style={styles.meta}>{user?.email}</Text>
        </View>
      ) : null}

      {step === 1 ? (
        <View style={styles.card}>
          <VehicleForm value={vehicle} onChange={setVehicle} />
        </View>
      ) : null}

      {step === 2 ? (
        <View style={styles.card}>
          <Text style={styles.done}>Abra o mapa, escolha uma estação e toque em Carregar aqui.</Text>
        </View>
      ) : null}

      <Pressable disabled={busy} onPress={() => void next()} style={styles.button}>
        <Text style={styles.buttonText}>
          {busy ? "Salvando…" : step === 2 ? "Ir para o mapa" : "Continuar"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg, flex: 1 },
  content: { gap: 12, padding: 24, paddingTop: 64 },
  kicker: { color: colors.primary, fontSize: 12, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
  title: { color: colors.text, fontSize: 28, fontWeight: "700" },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  error: { color: colors.danger },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 16,
  },
  label: { color: colors.muted, fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: colors.cardAlt,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  meta: { color: colors.muted, fontSize: 13, marginTop: 12 },
  done: { color: colors.text, fontSize: 16, lineHeight: 24 },
  button: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    marginTop: 8,
    paddingVertical: 16,
  },
  buttonText: { color: colors.primaryText, fontSize: 16, fontWeight: "700" },
});
