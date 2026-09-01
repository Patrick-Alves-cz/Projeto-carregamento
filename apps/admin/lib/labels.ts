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

export function roleLabel(role: string) {
  return ROLES[role] ?? role;
}

const AMENITIES: Record<string, string> = {
  wifi: "Wi-Fi",
  cobertura: "Cobertura",
  banheiro: "Banheiro",
  lanchonete: "Lanchonete",
  estacionamento: "Estacionamento",
};

export function amenityLabel(value: string) {
  return AMENITIES[value] ?? value;
}

export function initials(name: string | null | undefined, email: string) {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "U").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
}
