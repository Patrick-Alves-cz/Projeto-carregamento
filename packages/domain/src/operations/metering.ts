export type MeteringAnomaly =
  | "ENERGY_REGRESSION"
  | "ENERGY_SPIKE"
  | "NEGATIVE_POWER"
  | "POWER_SPIKE"
  | "IMPOSSIBLE_VALUE";

export function detectMeteringAnomaly(input: {
  previousEnergyKwh?: number | null;
  energyKwh: number;
  powerKw: number;
  maxPowerKw?: number | null;
}): MeteringAnomaly | null {
  if (!Number.isFinite(input.energyKwh) || input.energyKwh < 0) return "IMPOSSIBLE_VALUE";
  if (!Number.isFinite(input.powerKw)) return "IMPOSSIBLE_VALUE";
  if (input.previousEnergyKwh != null && input.energyKwh + 0.05 < input.previousEnergyKwh) {
    return "ENERGY_REGRESSION";
  }
  if (input.previousEnergyKwh != null && input.energyKwh - input.previousEnergyKwh > 50) {
    return "ENERGY_SPIKE";
  }
  if (input.powerKw < -0.5) return "NEGATIVE_POWER";
  if (input.maxPowerKw && input.maxPowerKw > 0 && input.powerKw > input.maxPowerKw * 1.5) {
    return "POWER_SPIKE";
  }
  return null;
}
