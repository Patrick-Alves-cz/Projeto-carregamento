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
  ONLINE: "Online",
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
  OCCUPIED: "Ocupado",
  OFFLINE: "Offline",
};

const SESSION_STATUS: Record<string, string> = {
  PENDING: "Pendente",
  PREPARING: "Preparando",
  ACTIVE: "Em andamento",
  PAUSED: "Pausada",
  CHARGING_COMPLETE: "Carga concluída",
  IDLE: "Permanência",
  COMPLETED: "Concluída",
  FAILED: "Falhou",
  CANCELLED: "Cancelada",
};

const ROLES: Record<string, string> = {
  DRIVER: "Motorista",
  OPERATOR: "Operador",
  ADMIN: "Administrador",
  SUPER_ADMIN: "Super admin",
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

export function roleLabel(role: string) {
  return ROLES[role] ?? role;
}

const AMENITIES: Record<string, string> = {
  wifi: "Wi-Fi",
  cobertura: "Cobertura",
  banheiro: "Banheiro",
  restaurante: "Restaurante",
  lanchonete: "Restaurante",
  estacionamento: "Estacionamento",
};

const ACCESS_TYPE: Record<string, string> = {
  PUBLIC: "Público",
  PRIVATE: "Privado",
  RESTRICTED: "Restrito",
};

export function accessTypeLabel(value: string) {
  return ACCESS_TYPE[value] ?? value;
}

export function amenityLabel(value: string) {
  return AMENITIES[value] ?? value;
}

export function initials(name: string | null | undefined, email: string) {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "U").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
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
