const STATION_STATUS: Record<string, string> = {
  ACTIVE: "Operando",
  MAINTENANCE: "Manutenção",
  INACTIVE: "Inativa",
};

const CHARGER_STATUS: Record<string, string> = {
  ONLINE: "Online",
  OFFLINE: "Offline",
  FAULTED: "Falha",
};

const CONNECTOR_STATUS: Record<string, string> = {
  AVAILABLE: "Livre",
  OCCUPIED: "Ocupado",
  UNAVAILABLE: "Indisponível",
  FAULTED: "Falha",
};

const AMENITIES: Record<string, string> = {
  wifi: "Wi-Fi",
  cobertura: "Cobertura",
  banheiro: "Banheiro",
  lanchonete: "Lanchonete",
  estacionamento: "Estacionamento",
};

export function stationStatusLabel(status: string) {
  return STATION_STATUS[status] ?? status;
}

export function chargerStatusLabel(status: string) {
  return CHARGER_STATUS[status] ?? status;
}

export function connectorStatusLabel(status: string) {
  return CONNECTOR_STATUS[status] ?? status;
}

export function amenityLabel(value: string) {
  return AMENITIES[value] ?? value;
}

export function stationStatusColor(status: string) {
  if (status === "ACTIVE") return "#34D399";
  if (status === "MAINTENANCE") return "#FBBF24";
  return "#8B9A95";
}
