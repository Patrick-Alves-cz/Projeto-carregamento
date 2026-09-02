export type DomainEventType =
  | "session.started"
  | "session.updated"
  | "session.paused"
  | "session.resumed"
  | "session.completed"
  | "session.failed"
  | "meter.value"
  | "charger.status.changed"
  | "connector.status.changed";

export interface DomainEvent<TPayload = Record<string, unknown>> {
  type: DomainEventType;
  entityType: "session" | "charger" | "connector";
  entityId: string;
  payload: TPayload;
  timestamp: Date;
}

export interface MeterValueEventPayload {
  sessionId: string;
  energyKwh: number;
  powerKw: number;
  voltage?: number;
  current?: number;
  temperature?: number;
  costCents: number;
}

export interface SessionEventPayload {
  sessionId: string;
  status: string;
  userId: string;
  connectorId: string;
  energyKwh?: number;
  powerKw?: number;
  costCents?: number;
}

export interface StatusChangedEventPayload {
  status: string;
  previousStatus?: string;
  chargerId?: string;
  connectorId?: string;
  sessionId?: string;
}
