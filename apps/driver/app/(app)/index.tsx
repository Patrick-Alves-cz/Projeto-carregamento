import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { clearTokens, getMe, type AuthUser } from "../../lib/api-client";

export default function HomeScreen() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch((err) => setError(err instanceof Error ? err.message : "Erro"));
  }, []);

  async function handleLogout() {
    await clearTokens();
    router.replace("/login");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>EV Charge</Text>
      <Text style={styles.subtitle}>App Motorista — Fase 1</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {user ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Autenticado</Text>
          <Text style={styles.cardText}>{user.profile?.fullName}</Text>
          <Text style={styles.cardText}>{user.email}</Text>
          <Text style={styles.cardText}>Role: {user.role}</Text>
        </View>
      ) : (
        !error && <Text style={styles.cardText}>Carregando...</Text>
      )}

      <Pressable style={styles.logout} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sair</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: "#fff" },
  title: { fontSize: 24, fontWeight: "600", marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#666", marginBottom: 24 },
  card: { borderWidth: 1, borderColor: "#e5e5e5", borderRadius: 8, padding: 16, marginBottom: 16 },
  cardTitle: { fontWeight: "600", marginBottom: 8 },
  cardText: { fontSize: 14, color: "#444", marginBottom: 4 },
  error: { color: "#dc2626", marginBottom: 12 },
  logout: { marginTop: 8 },
  logoutText: { color: "#666", fontSize: 14, textDecorationLine: "underline" },
});
