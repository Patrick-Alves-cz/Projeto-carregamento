const AC_TYPES = new Set(["TYPE2", "J1772"]);
const DC_TYPES = new Set(["CCS2", "CHADEMO", "NACS", "GB_T"]);

export type ConnectorCurrentType = "AC" | "DC" | "OTHER";
export type StationCurrentType = "AC" | "DC" | "MIXED";

export function connectorCurrentType(type: string): ConnectorCurrentType {
  if (AC_TYPES.has(type)) return "AC";
  if (DC_TYPES.has(type)) return "DC";
  return "OTHER";
}

export function stationCurrentType(types: readonly string[]): StationCurrentType | null {
  const currents = new Set(
    types.map(connectorCurrentType).filter((value) => value !== "OTHER"),
  );
  if (currents.size === 0) return null;
  if (currents.size > 1) return "MIXED";
  return [...currents][0] as StationCurrentType;
}

export function connectorMatchesCurrentType(type: string, currentType: "AC" | "DC"): boolean {
  return connectorCurrentType(type) === currentType;
}
