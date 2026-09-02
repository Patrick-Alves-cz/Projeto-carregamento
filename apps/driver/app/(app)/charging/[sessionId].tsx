import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenState } from "../../../components/screen-state";
import { StatusChip } from "../../../components/status-chip";
import { getSession, stopSession, type ChargingSession } from "../../../lib/api-client";
import {
  formatCurrency,
  formatDuration,
  formatEnergy,
  formatPower,
  sessionStatusLabel,
} from "../../../lib/labels";
import { useRealtime } from "../../../lib/use-realtime";
import { colors, radius } from "../../../lib/theme";

export default function ChargingScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const [session, setSession] = useState<ChargingSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    if (!sessionId) return;
    try {
      const data = await getSession(sessionId);
      setSession(data);
      setError("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar sessão");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (session?.status !== "ACTIVE") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [session?.status]);

  useRealtime((event) => {
    const payload = event.payload as { sessionId?: string };
    if (payload.sessionId === sessionId) {
      void load();
    }
  });

  async function handleStop() {
    if (!sessionId) return;
    setStopping(true);
    try {
      const result = await stopSession(sessionId);
      setSession(result);
    } catch (err: unknown) {
      Alert.alert("Erro", err instanceof Error ? err.message : "Não foi possível encerrar");
    } finally {
      setStopping(false);
    }
  }

  if (loading) return <ScreenState message="Carregando recarga…" />;
  if (error || !session) return <ScreenState error={error || "Sessão não encontrada"} />;

  const isActive = session.status === "ACTIVE" || session.status === "PAUSED";
  const isCompleted = session.status === "COMPLETED";
  const liveDuration =
    session.startedAt && isActive
      ? Math.floor((now - new Date(session.startedAt).getTime()) / 1000)
      : session.durationSeconds;

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <View style={styles.hero}>
        <StatusChip
          color={isActive ? colors.primary : isCompleted ? colors.available : colors.amber}
          label={sessionStatusLabel(session.status)}
        />
        <Text style={styles.heroTitle}>
          {isActive
            ? "Em carregamento"
            : isCompleted
              ? "Recarga finalizada"
              : sessionStatusLabel(session.status)}
        </Text>
      </View>

      <View style={styles.metrics}>
        <Metric label="Tempo" value={formatDuration(liveDuration)} large />
        <Metric label="Energia" value={formatEnergy(session.energyKwh)} large />
        <Metric label="Potência" value={formatPower(session.currentPowerKw ?? 0)} large />
        <Metric label="Custo" value={formatCurrency(session.costCents)} large highlight />
      </View>

      <View style={styles.card}>
        <InfoRow label="Estação" value={session.station.name} />
        <InfoRow label="Carregador" value={session.charger.serialNumber} />
        <InfoRow
          label="Conector"
          value={`${session.connector.number} · ${session.connector.type}`}
        />
        <InfoRow label="Veículo" value={`${session.vehicle.brand} ${session.vehicle.model}`} />
        {session.startedAt ? (
          <InfoRow label="Início" value={new Date(session.startedAt).toLocaleString("pt-BR")} />
        ) : null}
        {session.endedAt ? (
          <InfoRow label="Fim" value={new Date(session.endedAt).toLocaleString("pt-BR")} />
        ) : null}
      </View>

      {isActive ? (
        <Pressable
          disabled={stopping}
          onPress={handleStop}
          style={[styles.stopBtn, stopping && styles.stopBtnDisabled]}
        >
          {stopping ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.stopBtnText}>Encerrar recarga</Text>
          )}
        </Pressable>
      ) : (
        <Pressable onPress={() => router.replace("/(app)/(tabs)")} style={styles.doneBtn}>
          <Text style={styles.doneBtnText}>Voltar ao início</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function Metric({
  label,
  value,
  large,
  highlight,
}: {
  label: string;
  value: string;
  large?: boolean;
  highlight?: boolean;
}) {
  return (
    <View style={[styles.metric, highlight && styles.metricHighlight]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, large && styles.metricValueLarge]}>{value}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg, flex: 1 },
  content: { gap: 16, padding: 16, paddingBottom: 40 },
  hero: { alignItems: "center", gap: 8, paddingVertical: 8 },
  heroTitle: { color: colors.text, fontSize: 22, fontWeight: "700" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    minWidth: "47%",
    flexGrow: 1,
    padding: 14,
  },
  metricHighlight: { borderColor: colors.primary, backgroundColor: "#0F2A24" },
  metricLabel: { color: colors.muted, fontSize: 12 },
  metricValue: { color: colors.text, fontSize: 16, fontWeight: "700", marginTop: 4 },
  metricValueLarge: { fontSize: 22 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  infoRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  infoLabel: { color: colors.muted, fontSize: 13 },
  infoValue: { color: colors.text, flex: 1, fontSize: 13, fontWeight: "600", textAlign: "right" },
  stopBtn: {
    alignItems: "center",
    backgroundColor: colors.danger,
    borderRadius: radius.md,
    padding: 16,
  },
  stopBtnDisabled: { opacity: 0.7 },
  stopBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  doneBtn: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: 16,
  },
  doneBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
