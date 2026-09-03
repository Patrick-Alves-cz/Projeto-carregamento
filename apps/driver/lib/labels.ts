import { CONNECTOR_TYPE_LABELS, type ConnectorType } from "@evcharge/shared";

const STATION_STATUS: Record<string, string> = {
  ACTIVE: "Operando",
  MAINTENANCE: "Manutenção",
  INACTIVE: "Inativa",
};

const CHARGER_STATUS: Record<string, string> = {
  AVAILABLE: "Disponível",
  PREPARING: "Preparando",
  CHARGING: "Carregando",
  SUSPENDED: "Pausado",
  PAUSED: "Pausado",
  FINISHING: "Finalizando",
  UNAVAILABLE: "Indisponível",
  FAULTED: "Falha",
  OFFLINE: "Offline",
};

const CONNECTOR_STATUS: Record<string, string> = {
  AVAILABLE: "Disponível",
  PREPARING: "Preparando",
  CHARGING: "Carregando",
  SUSPENDED: "Pausado",
  PAUSED: "Pausado",
  FINISHING: "Finalizando",
  UNAVAILABLE: "Indisponível",
  FAULTED: "Falha",
  OFFLINE: "Offline",
};

const SESSION_STATUS: Record<string, string> = {
  PENDING: "Pendente",
  PREPARING: "Preparando",
  ACTIVE: "Em carregamento",
  PAUSED: "Pausada",
  COMPLETED: "Concluída",
  FAILED: "Falhou",
  CANCELLED: "Cancelada",
};

const ACCESS_TYPE: Record<string, string> = {
  PUBLIC: "Público",
  PRIVATE: "Privado",
  RESTRICTED: "Restrito",
};

const AMENITIES: Record<string, string> = {
  wifi: "Wi-Fi",
  cobertura: "Cobertura",
  banheiro: "Banheiro",
  restaurante: "Restaurante",
  lanchonete: "Restaurante",
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

export function accessTypeLabel(value: string) {
  return ACCESS_TYPE[value] ?? value;
}

export function amenityLabel(value: string) {
  return AMENITIES[value] ?? value;
}

export function connectorTypeLabel(type: string) {
  return CONNECTOR_TYPE_LABELS[type as ConnectorType] ?? type;
}

export function currentTypeLabel(value: string | null | undefined) {
  if (value === "AC") return "AC";
  if (value === "DC") return "DC Fast";
  if (value === "MIXED") return "AC/DC";
  return null;
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

export function formatDistance(km: number) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1).replace(".", ",")} km`;
}

export function formatRelativeTime(iso: string | null | undefined) {
  if (!iso) return "sem comunicação recente";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "sem comunicação recente";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 10) return "agora";
  if (seconds < 60) return `há ${seconds} segundos`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return `há ${days} d`;
}

export function isChargerOnline(status: string) {
  return !["OFFLINE", "FAULTED", "UNAVAILABLE"].includes(status);
}

export function isConnectorOccupied(status: string) {
  return ["PREPARING", "CHARGING", "SUSPENDED", "FINISHING", "OCCUPIED", "PAUSED"].includes(status);
}

export function availabilityCopy(available: number, total: number) {
  if (total === 0) return "Sem conectores";
  if (available === 0) return "ESTAÇÃO LOTADA";
  return `${available} de ${total} disponíveis`;
}

export function ctaLabel(action: string) {
  if (action === "CHARGE") return "Carregar aqui";
  if (action === "INCOMPATIBLE") return "Conexão incompatível";
  if (action === "OCCUPIED") return "Carregador ocupado";
  return "Indisponível";
}
