import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { ScreenState } from "../../../components/screen-state";
import {
  getMe,
  listNotifications,
  listVehicles,
  logout,
  markNotificationRead,
  updateMe,
  updateVehicle,
  type AuthUser,
  type InAppNotification,
  type Vehicle,
} from "../../../lib/api-client";
import { driverErrorMessage } from "../../../lib/errors";
import { connectorTypeLabel } from "../../../lib/labels";
import { colors, radius } from "../../../lib/theme";

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([getMe(), listVehicles(), listNotifications().catch(() => [])])
      .then(([me, list, inbox]) => {
        setUser(me);
        setFullName(me.profile?.fullName ?? "");
        setPhone(me.profile?.phone ?? "");
        setVehicles(list);
        setNotifications(inbox);
      })
      .catch((err: unknown) => setError(driverErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const me = await updateMe({ fullName, phone: phone || undefined });
      setUser(me);
      setError("");
    } catch (err: unknown) {
      setError(driverErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  if (loading) return <ScreenState />;
  if (!user) return <ScreenState error={error || "Sessão inválida"} />;

  const defaultVehicle = vehicles.find((item) => item.isDefault) ?? vehicles[0];

  return (
    <ScrollView contentContainerStyle={styles.list} style={styles.screen}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.card}>
        <Text style={styles.kicker}>Perfil</Text>
        <Text style={styles.label}>Nome completo</Text>
        <TextInput onChangeText={setFullName} style={styles.input} value={fullName} />
        <Text style={styles.label}>Telefone</Text>
        <TextInput keyboardType="phone-pad" onChangeText={setPhone} style={styles.input} value={phone} />
        <Text style={styles.meta}>{user.email}</Text>
        <Text style={styles.role}>Conta de motorista</Text>
        <Pressable disabled={saving} onPress={() => void save()} style={styles.save}>
          <Text style={styles.saveText}>{saving ? "Salvando…" : "Salvar perfil"}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.kicker}>Veículos</Text>
        {vehicles.length === 0 ? (
          <Text style={styles.meta}>Nenhum veículo cadastrado.</Text>
        ) : (
          vehicles.map((vehicle) => (
            <Pressable
              key={vehicle.id}
              onPress={() => void updateVehicle(vehicle.id, { isDefault: true }).then(() => listVehicles().then(setVehicles))}
              style={styles.vehicle}
            >
              <Text style={styles.vehicleName}>
                {vehicle.brand} {vehicle.model}
                {vehicle.id === defaultVehicle?.id ? " · padrão" : ""}
              </Text>
              <Text style={styles.meta}>{vehicle.connectorTypes.map(connectorTypeLabel).join(" · ")}</Text>
            </Pressable>
          ))
        )}
        <Pressable onPress={() => router.push("/(app)/(tabs)/vehicles")}>
          <Text style={styles.link}>Gerenciar veículos</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.kicker}>Avisos</Text>
        {notifications.length === 0 ? (
          <Text style={styles.meta}>Nenhum aviso interno.</Text>
        ) : (
          notifications.slice(0, 8).map((item) => (
            <Pressable
              key={item.id}
              onPress={() =>
                void markNotificationRead(item.id).then(() =>
                  listNotifications().then(setNotifications),
                )
              }
              style={styles.vehicle}
            >
              <Text style={styles.vehicleName}>{item.title}</Text>
              <Text style={styles.meta}>{item.body}</Text>
              <Text style={styles.meta}>
                {new Date(item.createdAt).toLocaleString("pt-BR")}
                {item.readAt ? "" : " · novo"}
              </Text>
            </Pressable>
          ))
        )}
      </View>

      <Pressable onPress={() => void handleLogout()} style={styles.logout}>
        <Text style={styles.logoutText}>Sair</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg, flex: 1 },
  list: { gap: 16, padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 8,
    padding: 20,
  },
  kicker: { color: colors.primary, fontSize: 12, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  label: { color: colors.muted, fontSize: 13, fontWeight: "600", marginTop: 6 },
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
  meta: { color: colors.muted, fontSize: 13 },
  role: { color: colors.primary, fontSize: 13, fontWeight: "600" },
  save: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    marginTop: 8,
    paddingVertical: 12,
  },
  saveText: { color: colors.primaryText, fontWeight: "700" },
  vehicle: { borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, padding: 12 },
  vehicleName: { color: colors.text, fontWeight: "600" },
  link: { color: colors.primary, fontWeight: "700", marginTop: 8 },
  logout: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: 14,
  },
  logoutText: { color: colors.danger, fontSize: 15, fontWeight: "600" },
  error: { color: colors.danger },
});
