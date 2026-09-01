import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ScreenState } from "../../../components/screen-state";
import { getMe, logout, type AuthUser } from "../../../lib/api-client";
import { colors, radius } from "../../../lib/theme";

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Erro ao carregar"))
      .finally(() => setLoading(false));
  }, []);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  if (loading) return <ScreenState />;
  if (error || !user) return <ScreenState error={error || "Sessão inválida"} />;

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.name}>{user.profile?.fullName ?? "Motorista"}</Text>
        <Text style={styles.email}>{user.email}</Text>
        <Text style={styles.role}>Conta de motorista · beta</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={handleLogout}
        style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
      >
        <Text style={styles.logoutText}>Sair</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg, flex: 1, gap: 16, padding: 16 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 6,
    padding: 20,
  },
  name: { color: colors.text, fontSize: 20, fontWeight: "700" },
  email: { color: colors.muted, fontSize: 14 },
  role: { color: colors.primary, fontSize: 13, fontWeight: "600", marginTop: 4 },
  logout: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: 14,
  },
  logoutText: { color: colors.danger, fontSize: 15, fontWeight: "600" },
  pressed: { opacity: 0.8 },
});
