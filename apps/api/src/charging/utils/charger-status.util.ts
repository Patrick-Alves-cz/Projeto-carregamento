import type { ChargerStatus, ConnectorStatus } from "@prisma/client";
import type {
  ChargerOperationalStatus,
  ConnectorOperationalStatus,
} from "@evcharge/charger-provider";

const CHARGER_TO_PROVIDER: Record<ChargerStatus, ChargerOperationalStatus> = {
  AVAILABLE: "available",
  PREPARING: "preparing",
  CHARGING: "charging",
  SUSPENDED: "suspended",
  FINISHING: "finishing",
  UNAVAILABLE: "unavailable",
  FAULTED: "faulted",
  OFFLINE: "offline",
};

const CONNECTOR_TO_PROVIDER: Record<ConnectorStatus, ConnectorOperationalStatus> = {
  AVAILABLE: "available",
  PREPARING: "preparing",
  CHARGING: "charging",
  SUSPENDED: "suspended",
  FINISHING: "finishing",
  UNAVAILABLE: "unavailable",
  FAULTED: "faulted",
  RESERVED: "unavailable",
};

const PROVIDER_TO_CHARGER: Record<ChargerOperationalStatus, ChargerStatus> = {
  available: "AVAILABLE",
  preparing: "PREPARING",
  charging: "CHARGING",
  suspended: "SUSPENDED",
  finishing: "FINISHING",
  unavailable: "UNAVAILABLE",
  faulted: "FAULTED",
  offline: "OFFLINE",
};

const PROVIDER_TO_CONNECTOR: Record<ConnectorOperationalStatus, ConnectorStatus> = {
  available: "AVAILABLE",
  preparing: "PREPARING",
  charging: "CHARGING",
  suspended: "SUSPENDED",
  finishing: "FINISHING",
  unavailable: "UNAVAILABLE",
  faulted: "FAULTED",
};

export function toProviderChargerStatus(status: ChargerStatus): ChargerOperationalStatus {
  return CHARGER_TO_PROVIDER[status];
}

export function toProviderConnectorStatus(status: ConnectorStatus): ConnectorOperationalStatus {
  return CONNECTOR_TO_PROVIDER[status];
}

export function fromProviderChargerStatus(status: ChargerOperationalStatus): ChargerStatus {
  return PROVIDER_TO_CHARGER[status];
}

export function fromProviderConnectorStatus(status: ConnectorOperationalStatus): ConnectorStatus {
  return PROVIDER_TO_CONNECTOR[status];
}
