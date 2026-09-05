import { useCallback, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ScreenState } from "../../../components/screen-state";
import {
  createPayment,
  getWallet,
  listWalletTransactions,
  simulatePayment,
  topUpWallet,
  type PaymentView,
  type Wallet,
  type WalletTransaction,
} from "../../../lib/api-client";
import { formatCurrency, walletKindLabel } from "../../../lib/labels";
import { driverErrorMessage } from "../../../lib/errors";
import { colors, radius } from "../../../lib/theme";
import { useFocusEffect } from "expo-router";

const PRESETS = [2000, 5000, 10000, 20000];

export default function WalletScreen() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [items, setItems] = useState<WalletTransaction[]>([]);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingPix, setPendingPix] = useState<PaymentView | null>(null);

  const load = useCallback(async () => {
    const [mine, txs] = await Promise.all([getWallet(), listWalletTransactions()]);
    setWallet(mine);
    setItems(txs.items);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load()
        .catch((err: unknown) => setError(driverErrorMessage(err)))
        .finally(() => setLoading(false));
    }, [load]),
  );

  async function startPix(amountCents: number) {
    setBusy(true);
    setError("");
    try {
      const payment = await createPayment({ amountCents, kind: "PIX" });
      setPendingPix(payment);
    } catch (err: unknown) {
      setError(driverErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmPix() {
    if (!pendingPix) return;
    setBusy(true);
    try {
      await simulatePayment(pendingPix.id, "CONFIRMED");
      setPendingPix(null);
      const [mine, txs] = await Promise.all([getWallet(), listWalletTransactions()]);
      setWallet(mine);
      setItems(txs.items);
    } catch (err: unknown) {
      setError(driverErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function topUp(amountCents: number) {
    setBusy(true);
    setError("");
    try {
      const result = await topUpWallet(amountCents);
      setWallet(result.wallet);
      const txs = await listWalletTransactions();
      setItems(txs.items);
    } catch (err: unknown) {
      setError(driverErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function submitCustom() {
    const reais = Number(custom.replace(",", "."));
    if (!Number.isFinite(reais) || reais <= 0) {
      Alert.alert("Valor inválido", "Informe um valor em reais.");
      return;
    }
    void topUp(Math.round(reais * 100));
  }

  if (loading) return <ScreenState message="Carregando carteira…" />;

  return (
    <View style={styles.screen}>
      <View style={styles.balanceCard}>
        <Text style={styles.kicker}>Saldo atual</Text>
        <Text style={styles.balance}>{formatCurrency(wallet?.balanceCents ?? 0)}</Text>
        <Text style={styles.hint}>Ambiente DEMO · PIX e cartão simulados, sem gateway real</Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {pendingPix ? (
        <View style={styles.pixBox}>
          <Text style={styles.pixTitle}>PIX DEMO pendente</Text>
          <Text style={styles.pixCopy}>{pendingPix.pixCopyPaste ?? "Código PIX gerado no ambiente DEMO"}</Text>
          <Pressable disabled={busy} onPress={() => void confirmPix()} style={styles.preset}>
            <Text style={styles.presetText}>Simular pagamento confirmado</Text>
          </Pressable>
        </View>
      ) : null}
      <Text style={styles.section}>Adicionar via PIX DEMO</Text>
      <View style={styles.presets}>
        {PRESETS.map((amount) => (
          <Pressable disabled={busy} key={amount} onPress={() => void startPix(amount)} style={styles.preset}>
            <Text style={styles.presetText}>PIX {formatCurrency(amount)}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.section}>Crédito instantâneo DEMO</Text>
      <View style={styles.presets}>
        {PRESETS.map((amount) => (
          <Pressable disabled={busy} key={`fast-${amount}`} onPress={() => void topUp(amount)} style={styles.preset}>
            <Text style={styles.presetText}>+ {formatCurrency(amount)}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.customRow}>
        <TextInput
          keyboardType="decimal-pad"
          onChangeText={setCustom}
          placeholder="Outro valor"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={custom}
        />
        <Pressable disabled={busy} onPress={submitCustom} style={styles.customBtn}>
          <Text style={styles.customBtnText}>Adicionar</Text>
        </Pressable>
      </View>
      <FlatList
        contentContainerStyle={styles.list}
        data={items}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>Nenhuma transação ainda.</Text>}
        renderItem={({ item }) => {
          const credit = item.amountCents >= 0;
          return (
            <View style={styles.tx}>
              <View style={styles.txRow}>
                <Text style={styles.txKind}>{walletKindLabel(item.kind)}</Text>
                <Text style={[styles.txAmount, credit ? styles.credit : styles.debit]}>
                  {credit ? "+" : ""}
                  {formatCurrency(item.amountCents)}
                </Text>
              </View>
              <Text style={styles.meta}>{item.description}</Text>
              <Text style={styles.meta}>
                {new Date(item.createdAt).toLocaleString("pt-BR")} · saldo {formatCurrency(item.balanceAfterCents)}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg, flex: 1, padding: 16 },
  balanceCard: {
    backgroundColor: colors.card,
    borderColor: colors.primary,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: 16,
    padding: 20,
  },
  kicker: { color: colors.primary, fontSize: 12, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  balance: { color: colors.text, fontSize: 32, fontWeight: "700", marginTop: 8 },
  hint: { color: colors.muted, fontSize: 12, marginTop: 6 },
  error: { color: colors.danger, marginBottom: 8 },
  section: { color: colors.muted, fontSize: 12, fontWeight: "700", marginBottom: 8 },
  pixBox: {
    backgroundColor: colors.card,
    borderColor: colors.amber,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 8,
    marginBottom: 12,
    padding: 12,
  },
  pixTitle: { color: colors.amber, fontWeight: "700" },
  pixCopy: { color: colors.text, fontSize: 12 },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  preset: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  presetText: { color: colors.primary, fontWeight: "700" },
  customRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  customBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  customBtnText: { color: colors.primaryText, fontWeight: "700" },
  list: { gap: 8, paddingBottom: 24 },
  empty: { color: colors.muted, textAlign: "center" },
  tx: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 12,
  },
  txRow: { flexDirection: "row", justifyContent: "space-between" },
  txKind: { color: colors.text, fontWeight: "700" },
  txAmount: { fontWeight: "700" },
  credit: { color: colors.available },
  debit: { color: colors.danger },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
});
