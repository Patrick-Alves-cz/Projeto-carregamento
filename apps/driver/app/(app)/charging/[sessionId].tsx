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
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { ScreenState } from "../../../components/screen-state";
import { StatusChip } from "../../../components/status-chip";
import {
  getSession,
  pauseSession,
  resumeSession,
  stopSession,
  type ChargingSession,
} from "../../../lib/api-client";
import {
  formatCurrency,
  formatDuration,
  formatEnergy,
  formatPower,
  sessionStatusLabel,
} from "../../../lib/labels";
import { driverErrorMessage } from "../../../lib/errors";
import { useRealtime } from "../../../lib/use-realtime";
import { colors, radius } from "../../../lib/theme";

export default function ChargingScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const [session, setSession] = useState<ChargingSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [showReceipt, setShowReceipt] = useState(false);

  const load = useCallback(async () => {
    if (!sessionId) return;
    try {
      const data = await getSession(sessionId);
      setSession(data);
      setError("");
    } catch (err: unknown) {
      setError(driverErrorMessage(err));
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
    if (payload.sessionId === sessionId) void load();
  });

  async function run(action: () => Promise<ChargingSession>) {
    setBusy(true);
    try {
      setSession(await action());
    } catch (err: unknown) {
      Alert.alert("Erro", driverErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <ScreenState message="Carregando recarga…" />;
  if (error || !session) return <ScreenState error={error || "Sessão não encontrada"} />;

  const isActive = session.status === "ACTIVE";
  const isPaused = session.status === "PAUSED";
  const live = isActive || isPaused;
  const isCompleted = session.status === "COMPLETED";
  const liveDuration =
    session.startedAt && live
      ? Math.floor((now - new Date(session.startedAt).getTime()) / 1000)
      : session.durationSeconds;
  const remaining = session.remainingCents ?? session.walletBalanceCents ?? 0;
  const receipt = session.receipt?.payload;

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <View style={styles.hero}>
        <StatusChip
          color={isActive ? colors.primary : isPaused ? colors.amber : isCompleted ? colors.available : colors.amber}
          label={isActive ? "CARREGANDO" : isPaused ? "PAUSADO" : sessionStatusLabel(session.status)}
        />
        <Text style={styles.heroTitle}>
          {isActive ? "Em carregamento" : isPaused ? "Recarga pausada" : sessionStatusLabel(session.status)}
        </Text>
      </View>

      {live ? (
        <View style={styles.balanceRow}>
          <Metric label="Saldo" value={formatCurrency(session.walletBalanceCents ?? 0)} />
          <Metric label="Custo atual" value={formatCurrency(session.costCents)} highlight />
          <Metric label="Estimativa disponível" value={`~${formatCurrency(remaining)}`} />
        </View>
      ) : null}

      {session.lowBalance && live ? (
        <View style={styles.alert}>
          <Text style={styles.alertTitle}>Seu saldo está baixo</Text>
          <View style={styles.alertActions}>
            <Pressable onPress={() => router.push("/(app)/(tabs)/wallet" as Href)} style={styles.secondary}>
              <Text style={styles.secondaryText}>Adicionar saldo</Text>
            </Pressable>
            <Pressable disabled={busy} onPress={() => void run(() => stopSession(session.id))} style={styles.stopBtn}>
              <Text style={styles.stopBtnText}>Encerrar recarga</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.metrics}>
        <Metric label="Tempo" value={formatDuration(liveDuration)} large />
        <Metric label="Energia" value={formatEnergy(session.energyKwh)} large />
        <Metric label="Potência" value={formatPower(isPaused ? 0 : session.currentPowerKw ?? 0)} large />
        <Metric label="Custo" value={formatCurrency(session.costCents)} large highlight />
      </View>

      <View style={styles.card}>
        <InfoRow label="Estação" value={session.station.name} />
        <InfoRow label="Carregador" value={session.charger.serialNumber} />
        <InfoRow
          label="Conector"
          value={`${session.connector.number} · ${session.connector.type} · ${formatPower(session.connector.maxPowerKw)}`}
        />
        <InfoRow label="Veículo" value={`${session.vehicle.brand} ${session.vehicle.model}`} />
        {session.tariffSnapshot ? (
          <InfoRow label="Tarifa" value={`${formatCurrency(session.tariffSnapshot.pricePerKwhCents)} / kWh`} />
        ) : null}
        {session.startedAt ? (
          <InfoRow label="Início" value={new Date(session.startedAt).toLocaleString("pt-BR")} />
        ) : null}
        {session.endedAt ? (
          <InfoRow label="Fim" value={new Date(session.endedAt).toLocaleString("pt-BR")} />
        ) : null}
      </View>

      {live ? (
        <View style={styles.actions}>
          {isActive ? (
            <Pressable disabled={busy} onPress={() => void run(() => pauseSession(session.id))} style={styles.secondary}>
              <Text style={styles.secondaryText}>{busy ? "…" : "Pausar"}</Text>
            </Pressable>
          ) : (
            <Pressable disabled={busy} onPress={() => void run(() => resumeSession(session.id))} style={styles.primary}>
              <Text style={styles.primaryText}>{busy ? "…" : "Retomar"}</Text>
            </Pressable>
          )}
          <Pressable
            disabled={busy}
            onPress={() =>
              Alert.alert("Encerrar recarga", "Deseja finalizar esta sessão?", [
                { text: "Cancelar", style: "cancel" },
                { text: "Encerrar", style: "destructive", onPress: () => void run(() => stopSession(session.id)) },
              ])
            }
            style={styles.stopBtn}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.stopBtnText}>Encerrar recarga</Text>}
          </Pressable>
          <Pressable onPress={() => router.push("/(app)/(tabs)/wallet" as Href)} style={styles.ghost}>
            <Text style={styles.ghostText}>Adicionar saldo</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.actions}>
          {session.receipt ? (
            <Pressable onPress={() => setShowReceipt((value) => !value)} style={styles.primary}>
              <Text style={styles.primaryText}>{showReceipt ? "Ocultar recibo" : "Ver recibo"}</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => router.replace("/(app)/(tabs)/history")} style={styles.doneBtn}>
            <Text style={styles.doneBtnText}>Voltar ao histórico</Text>
          </Pressable>
        </View>
      )}

      {showReceipt && receipt ? (
        <View style={styles.card}>
          <Text style={styles.receiptBrand}>{receipt.brand}</Text>
          <Text style={styles.meta}>Recibo {session.receipt?.number}</Text>
          <InfoRow label="Estação" value={receipt.station.name} />
          <InfoRow label="Carregador" value={receipt.charger.serialNumber} />
          <InfoRow label="Veículo" value={`${receipt.vehicle.brand} ${receipt.vehicle.model}`} />
          <InfoRow label="Duração" value={formatDuration(receipt.durationSeconds)} />
          <InfoRow label="Energia" value={formatEnergy(receipt.energyKwh)} />
          <InfoRow
            label="Tarifa"
            value={receipt.tariff ? `${formatCurrency(receipt.tariff.pricePerKwhCents)} / kWh` : "—"}
          />
          {receipt.connectionFeeCents > 0 ? (
            <InfoRow label="Taxa de sessão" value={formatCurrency(receipt.connectionFeeCents)} />
          ) : null}
          {(receipt.timeCents ?? 0) > 0 ? (
            <InfoRow label="Tempo" value={formatCurrency(receipt.timeCents ?? 0)} />
          ) : null}
          {(receipt.parkingCents ?? 0) > 0 ? (
            <InfoRow label="Estacionamento" value={formatCurrency(receipt.parkingCents ?? 0)} />
          ) : null}
          <InfoRow label="Total" value={formatCurrency(receipt.totalCents)} />
          <InfoRow label="Pagamento" value={receipt.paymentMethod} />
        </View>
      ) : null}
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
  balanceRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: "30%",
    padding: 14,
  },
  metricHighlight: { backgroundColor: "#0F2A24", borderColor: colors.primary },
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
  actions: { gap: 8 },
  primary: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.md, padding: 16 },
  primaryText: { color: colors.primaryText, fontWeight: "700" },
  secondary: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 16,
  },
  secondaryText: { color: colors.text, fontWeight: "700" },
  stopBtn: { alignItems: "center", backgroundColor: colors.danger, borderRadius: radius.md, padding: 16 },
  stopBtnText: { color: "#fff", fontWeight: "700" },
  ghost: { alignItems: "center", padding: 12 },
  ghostText: { color: colors.primary, fontWeight: "700" },
  doneBtn: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.md, padding: 16 },
  doneBtnText: { color: colors.primaryText, fontWeight: "700" },
  alert: {
    backgroundColor: "#2A1C14",
    borderColor: colors.amber,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  alertTitle: { color: colors.amber, fontWeight: "700" },
  alertActions: { gap: 8 },
  receiptBrand: { color: colors.text, fontSize: 18, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: 12 },
});
