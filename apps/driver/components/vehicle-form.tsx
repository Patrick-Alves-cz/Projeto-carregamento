import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { CONNECTOR_TYPES, type ConnectorType } from "@evcharge/shared";
import { connectorTypeLabel } from "../lib/labels";
import { colors, radius } from "../lib/theme";

export type VehicleFormValue = {
  brand: string;
  model: string;
  year: string;
  batteryKwh: string;
  connectorTypes: ConnectorType[];
  isDefault: boolean;
};

export const emptyVehicleForm: VehicleFormValue = {
  brand: "",
  model: "",
  year: "",
  batteryKwh: "",
  connectorTypes: [],
  isDefault: false,
};

export function VehicleForm({
  value,
  onChange,
}: {
  value: VehicleFormValue;
  onChange: (value: VehicleFormValue) => void;
}) {
  const [yearText, setYearText] = useState(value.year);

  function toggleConnector(type: ConnectorType) {
    const next = value.connectorTypes.includes(type)
      ? value.connectorTypes.filter((item) => item !== type)
      : [...value.connectorTypes, type];
    onChange({ ...value, connectorTypes: next });
  }

  return (
    <View style={styles.form}>
      <Text style={styles.label}>Marca</Text>
      <TextInput
        onChangeText={(brand) => onChange({ ...value, brand })}
        placeholder="BYD"
        placeholderTextColor={colors.muted}
        style={styles.input}
        value={value.brand}
      />
      <Text style={styles.label}>Modelo</Text>
      <TextInput
        onChangeText={(model) => onChange({ ...value, model })}
        placeholder="Dolphin"
        placeholderTextColor={colors.muted}
        style={styles.input}
        value={value.model}
      />
      <Text style={styles.label}>Ano</Text>
      <TextInput
        keyboardType="number-pad"
        onChangeText={(year) => {
          setYearText(year);
          onChange({ ...value, year });
        }}
        placeholder="2024"
        placeholderTextColor={colors.muted}
        style={styles.input}
        value={yearText}
      />
      <Text style={styles.label}>Bateria (kWh)</Text>
      <TextInput
        keyboardType="decimal-pad"
        onChangeText={(batteryKwh) => onChange({ ...value, batteryKwh })}
        placeholder="60"
        placeholderTextColor={colors.muted}
        style={styles.input}
        value={value.batteryKwh}
      />
      <Text style={styles.label}>Conectores compatíveis</Text>
      <View style={styles.chips}>
        {CONNECTOR_TYPES.map((type) => {
          const active = value.connectorTypes.includes(type);
          return (
            <Pressable
              key={type}
              onPress={() => toggleConnector(type)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {connectorTypeLabel(type)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function toVehiclePayload(value: VehicleFormValue) {
  const year = value.year ? Number(value.year) : undefined;
  const batteryKwh = value.batteryKwh ? Number(value.batteryKwh.replace(",", ".")) : undefined;
  return {
    brand: value.brand.trim(),
    model: value.model.trim(),
    year: year && Number.isFinite(year) ? year : undefined,
    batteryKwh: batteryKwh && Number.isFinite(batteryKwh) ? batteryKwh : undefined,
    connectorTypes: value.connectorTypes,
    isDefault: value.isDefault,
  };
}

const styles = StyleSheet.create({
  form: { gap: 8 },
  label: { color: colors.muted, fontSize: 13, fontWeight: "600", marginTop: 8 },
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
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  chip: {
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: colors.primaryText },
});
