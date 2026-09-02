const STATION_STATUS: Record<string, string> = {
  ACTIVE: "Operando",
  MAINTENANCE: "Manutenção",
  INACTIVE: "Inativa",
};

const CHARGER_STATUS: Record<string, string> = {
  AVAILABLE: "Disponível",
  PREPARING: "Preparando",
  CHARGING: "Carregando",
  SUSPENDED: "Suspenso",
  FINISHING: "Finalizando",
  UNAVAILABLE: "Indisponível",
  FAULTED: "Falha",
  OFFLINE: "Offline",
  ONLINE: "Online",
};

const CONNECTOR_STATUS: Record<string, string> = {
  AVAILABLE: "Livre",
  PREPARING: "Preparando",
  CHARGING: "Carregando",
  SUSPENDED: "Suspenso",
  FINISHING: "Finalizando",
  UNAVAILABLE: "Indisponível",
  FAULTED: "Falha",
  OCCUPIED: "Ocupado",
};

const SESSION_STATUS: Record<string, string> = {
  PENDING: "Pendente",
  ACTIVE: "Em carregamento",
  PAUSED: "Pausada",
  COMPLETED: "Concluída",
  FAILED: "Falhou",
  CANCELLED: "Cancelada",
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

export function sessionStatusLabel(status: string) {
  return SESSION_STATUS[status] ?? status;
}

export function amenityLabel(value: string) {
  return AMENITIES[value] ?? value;
}

export function stationStatusColor(status: string) {
  if (status === "ACTIVE") return "#34D399";
  if (status === "MAINTENANCE") return "#FBBF24";
  return "#8B9A95";
}

export function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

export function formatEnergy(kwh: number) {
  return `${kwh.toFixed(2).replace(".", ",")} kWh`;
}

export function formatPower(kw: number) {
  return `${Math.round(kw)} kW`;
}

export function isChargerOnline(status: string) {
  return !["OFFLINE", "FAULTED", "UNAVAILABLE"].includes(status);
}

export function isConnectorOccupied(status: string) {
  return ["PREPARING", "CHARGING", "SUSPENDED", "FINISHING", "OCCUPIED"].includes(status);
}
