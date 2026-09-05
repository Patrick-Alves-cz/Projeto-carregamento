import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { ScreenState } from "../../../components/screen-state";
import {
  getMe,
  getWallet,
  listFavorites,
  listMyReservations,
  listMyWaitlist,
  listNearbyStations,
  listSessions,
  stopSession,
  type AuthUser,
  type ChargingSession,
  type Favorite,
  type NearbyStation,
  type Reservation,
  type WaitlistEntry,
  type Wallet,
} from "../../../lib/api-client";
import {
  formatCurrency,
  formatDuration,
  formatEnergy,
  formatPower,
  sessionStatusLabel,
} from "../../../lib/labels";
import { DEFAULT_MAP_CENTER } from "../../../lib/map-style";
import { driverErrorMessage } from "../../../lib/errors";
import { useRealtime } from "../../../lib/use-realtime";
import { colors, radius } from "../../../lib/theme";

export default function HomeScreen() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [active, setActive] = useState<ChargingSession | null>(null);
  const [recent, setRecent] = useState<ChargingSession[]>([]);
  const [nearby, setNearby] = useState<NearbyStation[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [stopping, setStopping] = useState(false);

  const load = useCallback(async () => {
    const [me, walletData, sessions, nearbyData, favs, mineReservations, mineWaitlist] =
      await Promise.all([
        getMe(),
        getWallet(),
        listSessions({ limit: 8 }),
        listNearbyStations({ lat: DEFAULT_MAP_CENTER.lat, lng: DEFAULT_MAP_CENTER.lng, radiusKm: 25 }),
        listFavorites().catch(() => []),
        listMyReservations().catch(() => []),
        listMyWaitlist().catch(() => []),
      ]);
    setUser(me);
    setWallet(walletData);
    const live = sessions.items.find((item) => ["ACTIVE", "PREPARING", "PENDING", "PAUSED"].includes(item.status));
    setActive(live ?? null);
    setRecent(sessions.items.filter((item) => item.id !== live?.id).slice(0, 4));
    setNearby(nearbyData.slice(0, 3));
    setFavorites(favs);
    setReservations(mineReservations.filter((item) => ["CONFIRMED", "PENDING", "ACTIVE"].includes(item.status)));
    setWaitlist(mineWaitlist.filter((item) => ["WAITING", "NOTIFIED"].includes(item.status)));
    setError("");
  }, []);

  useFocusEffect(
    useCallback(() => {
      load()
        .catch((err: unknown) => setError(driverErrorMessage(err)))
        .finally(() => setLoading(false));
    }, [load]),
  );

  useRealtime(() => {
    void load();
  });

  async function handleStop() {
    if (!active) return;
    setStopping(true);
    try {
      await stopSession(active.id);
      await load();
    } catch (err: unknown) {
      setError(driverErrorMessage(err));
    } finally {
      setStopping(false);
    }
  }

  if (loading) return <ScreenState message="Carregando sua home…" />;

  const firstName = user?.profile?.fullName?.split(" ")[0] ?? "Motorista";
  const nextStation = nearby[0];

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <View>
        <Text style={styles.kicker}>Olá, {firstName}</Text>
        <Text style={styles.title}>Pronto para recarregar</Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable onPress={() => router.push("/(app)/(tabs)/wallet")} style={styles.balance}>
        <Text style={styles.balanceLabel}>Saldo da carteira</Text>
        <Text style={styles.balanceValue}>{formatCurrency(wallet?.balanceCents ?? 0)}</Text>
        <Text style={styles.demo}>Ambiente DEMO · pagamentos simulados</Text>
      </Pressable>

      {active ? (
        <Pressable onPress={() => router.push(`/charging/${active.id}` as Href)} style={styles.live}>
          <Text style={styles.liveKicker}>CARREGANDO AGORA</Text>
          <Text style={styles.liveTitle}>{active.station.name}</Text>
          <Text style={styles.meta}>
            Conector {active.connector.number} · {active.currentPowerKw ? formatPower(active.currentPowerKw) : "—"}
          </Text>
          <View style={styles.liveGrid}>
            <LiveStat label="Energia" value={formatEnergy(active.energyKwh)} />
            <LiveStat label="Tempo" value={formatDuration(active.durationSeconds)} />
            <LiveStat label="Custo" value={formatCurrency(active.costCents)} />
            {active.socPercent != null ? <LiveStat label="SOC" value={`${Math.round(active.socPercent)}%`} /> : null}
          </View>
          <Pressable disabled={stopping} onPress={handleStop} style={styles.stop}>
            <Text style={styles.stopText}>{stopping ? "Parando…" : "Parar"}</Text>
          </Pressable>
        </Pressable>
      ) : nextStation ? (
        <Pressable onPress={() => router.push(`/station/${nextStation.id}` as Href)} style={styles.card}>
          <Text style={styles.sectionLabel}>Estação mais próxima</Text>
          <Text style={styles.cardTitle}>{nextStation.name}</Text>
          <Text style={styles.meta}>
            {nextStation.availableConnectors} livres · {nextStation.totalConnectors} conectores
            {nextStation.pricePerKwhCents != null ? ` · ${formatCurrency(nextStation.pricePerKwhCents)}/kWh` : ""}
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.shortcuts}>
        <Shortcut label="Mapa" onPress={() => router.push("/(app)/(tabs)/map")} />
        <Shortcut label="Carteira" onPress={() => router.push("/(app)/(tabs)/wallet")} />
        <Shortcut label="Veículos" onPress={() => router.push("/(app)/(tabs)/vehicles")} />
        <Shortcut label="Histórico" onPress={() => router.push("/(app)/(tabs)/history")} />
      </View>

      {waitlist.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Fila</Text>
          {waitlist.map((item) => (
            <Text key={item.id} style={styles.meta}>
              {item.station?.name ?? "Estação"} · posição {item.position} · {item.status === "NOTIFIED" ? "Sua vez" : "Aguardando"}
            </Text>
          ))}
        </View>
      ) : null}

      {reservations.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Reservas</Text>
          {reservations.slice(0, 3).map((item) => (
            <Text key={item.id} style={styles.meta}>
              {item.station?.name ?? "Estação"} · {new Date(item.startAt).toLocaleString("pt-BR")}
            </Text>
          ))}
        </View>
      ) : null}

      {favorites.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Favoritos</Text>
          {favorites.map((item) => (
            <Pressable key={item.id} onPress={() => router.push(`/station/${item.stationId}` as Href)}>
              <Text style={styles.cardTitle}>{item.station.name}</Text>
              <Text style={styles.meta}>{item.station.address}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Últimas sessões</Text>
        {recent.length === 0 ? (
          <Text style={styles.meta}>Nenhuma recarga ainda. Abra o mapa para começar.</Text>
        ) : (
          recent.map((item) => (
            <Pressable key={item.id} onPress={() => router.push(`/charging/${item.id}` as Href)} style={styles.sessionRow}>
              <Text style={styles.cardTitle}>{item.station.name}</Text>
              <Text style={styles.meta}>
                {sessionStatusLabel(item.status)} · {formatEnergy(item.energyKwh)} · {formatCurrency(item.costCents)}
              </Text>
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function LiveStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.liveStat}>
      <Text style={styles.liveStatLabel}>{label}</Text>
      <Text style={styles.liveStatValue}>{value}</Text>
    </View>
  );
}

function Shortcut({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.shortcut}>
      <Text style={styles.shortcutText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg, flex: 1 },
  content: { gap: 14, padding: 16, paddingBottom: 40 },
  kicker: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  title: { color: colors.text, fontSize: 26, fontWeight: "800", marginTop: 2 },
  error: { color: colors.danger },
  balance: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 16,
  },
  balanceLabel: { color: colors.muted, fontSize: 12 },
  balanceValue: { color: colors.text, fontSize: 28, fontWeight: "800", marginTop: 4 },
  demo: { color: colors.amber, fontSize: 12, marginTop: 6 },
  live: {
    backgroundColor: "#0F2A24",
    borderColor: colors.primary,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  liveKicker: { color: colors.primary, fontSize: 12, fontWeight: "800", letterSpacing: 0.6 },
  liveTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  liveGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  liveStat: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    flexGrow: 1,
    minWidth: "30%",
    padding: 10,
  },
  liveStatLabel: { color: colors.muted, fontSize: 11 },
  liveStatValue: { color: colors.text, fontSize: 15, fontWeight: "700", marginTop: 2 },
  stop: { alignItems: "center", backgroundColor: colors.danger, borderRadius: radius.md, marginTop: 4, padding: 14 },
  stopText: { color: "#fff", fontWeight: "800" },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  sectionLabel: { color: colors.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.4 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: 13 },
  shortcuts: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  shortcut: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    flexGrow: 1,
    minWidth: "22%",
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  shortcutText: { color: colors.text, fontWeight: "700", textAlign: "center" },
  sessionRow: { gap: 2, paddingVertical: 4 },
});
