import { useCallback, useEffect, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ScreenState } from "../../../components/screen-state";
import {
  VehicleForm,
  emptyVehicleForm,
  toVehiclePayload,
  type VehicleFormValue,
} from "../../../components/vehicle-form";
import {
  createVehicle,
  deleteVehicle,
  listVehicles,
  updateVehicle,
  type Vehicle,
} from "../../../lib/api-client";
import { driverErrorMessage } from "../../../lib/errors";
import { connectorTypeLabel } from "../../../lib/labels";
import { colors, radius } from "../../../lib/theme";

export default function VehiclesScreen() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<VehicleFormValue>(emptyVehicleForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const data = await listVehicles();
    setVehicles(data);
  }, []);

  useEffect(() => {
    load()
      .catch((err: unknown) => setError(driverErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyVehicleForm, isDefault: vehicles.length === 0 });
    setOpen(true);
  }

  function openEdit(vehicle: Vehicle) {
    setEditingId(vehicle.id);
    setForm({
      brand: vehicle.brand,
      model: vehicle.model,
      year: vehicle.year ? String(vehicle.year) : "",
      batteryKwh: vehicle.batteryKwh ? String(vehicle.batteryKwh) : "",
      connectorTypes: vehicle.connectorTypes as VehicleFormValue["connectorTypes"],
      isDefault: vehicle.isDefault,
    });
    setOpen(true);
  }

  async function save() {
    const payload = toVehiclePayload(form);
    if (!payload.brand || !payload.model || payload.connectorTypes.length === 0) {
      setError("Informe marca, modelo e pelo menos um conector.");
      return;
    }
    setSaving(true);
    try {
      if (editingId) await updateVehicle(editingId, payload);
      else await createVehicle(payload);
      setOpen(false);
      setError("");
      await load();
    } catch (err: unknown) {
      setError(driverErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(vehicle: Vehicle) {
    Alert.alert("Remover veículo", `${vehicle.brand} ${vehicle.model} será removido.`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Remover",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteVehicle(vehicle.id);
              await load();
            } catch (err: unknown) {
              setError(driverErrorMessage(err));
            }
          })();
        },
      },
    ]);
  }

  if (loading) return <ScreenState message="Carregando veículos…" />;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.list}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {vehicles.length === 0 ? (
          <Text style={styles.empty}>Cadastre o primeiro veículo para filtrar estações compatíveis.</Text>
        ) : (
          vehicles.map((vehicle) => (
            <View key={vehicle.id} style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.title}>
                  {vehicle.brand} {vehicle.model}
                </Text>
                {vehicle.isDefault ? <Text style={styles.default}>Padrão</Text> : null}
              </View>
              <Text style={styles.meta}>
                {[vehicle.year, vehicle.batteryKwh ? `${vehicle.batteryKwh} kWh` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              <Text style={styles.connectors}>
                {vehicle.connectorTypes.map(connectorTypeLabel).join(" · ")}
              </Text>
              <View style={styles.actions}>
                {!vehicle.isDefault ? (
                  <Pressable onPress={() => void updateVehicle(vehicle.id, { isDefault: true }).then(load)}>
                    <Text style={styles.link}>Tornar padrão</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => openEdit(vehicle)}>
                  <Text style={styles.link}>Editar</Text>
                </Pressable>
                <Pressable onPress={() => remove(vehicle)}>
                  <Text style={styles.danger}>Remover</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
        <Pressable onPress={openCreate} style={styles.add}>
          <Text style={styles.addText}>Adicionar veículo</Text>
        </Pressable>
      </ScrollView>

      <Modal animationType="slide" transparent visible={open} onRequestClose={() => setOpen(false)}>
        <View style={styles.modalBackdrop}>
          <ScrollView contentContainerStyle={styles.modalCard}>
            <Text style={styles.modalTitle}>{editingId ? "Editar veículo" : "Novo veículo"}</Text>
            <VehicleForm value={form} onChange={setForm} />
            <Pressable disabled={saving} onPress={() => void save()} style={styles.add}>
              <Text style={styles.addText}>{saving ? "Salvando…" : "Salvar"}</Text>
            </Pressable>
            <Pressable onPress={() => setOpen(false)}>
              <Text style={styles.cancel}>Cancelar</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg, flex: 1 },
  list: { gap: 12, padding: 16, paddingBottom: 40 },
  empty: { color: colors.muted, marginTop: 24, textAlign: "center" },
  error: { color: colors.danger, fontSize: 14 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 6,
    padding: 16,
  },
  row: { flexDirection: "row", justifyContent: "space-between" },
  title: { color: colors.text, fontSize: 16, fontWeight: "700" },
  default: { color: colors.primary, fontSize: 12, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: 13 },
  connectors: { color: colors.primary, fontSize: 13, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 16, marginTop: 8 },
  link: { color: colors.primary, fontSize: 13, fontWeight: "700" },
  danger: { color: colors.danger, fontSize: 13, fontWeight: "700" },
  add: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    marginTop: 8,
    paddingVertical: 14,
  },
  addText: { color: colors.primaryText, fontSize: 16, fontWeight: "700" },
  modalBackdrop: { backgroundColor: "rgba(0,0,0,0.55)", flex: 1, justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: "700", marginBottom: 8 },
  cancel: { color: colors.muted, marginTop: 12, textAlign: "center" },
});
