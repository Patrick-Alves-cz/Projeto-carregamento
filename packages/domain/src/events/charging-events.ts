export type DomainEventType =
  | "session.started"
  | "session.updated"
  | "session.paused"
  | "session.resumed"
  | "session.completed"
  | "session.failed"
  | "session.remote_start_requested"
  | "session.remote_start_accepted"
  | "session.remote_start_rejected"
  | "session.remote_stop_requested"
  | "session.meter_updated"
  | "session.stopped"
  | "session.telemetry"
  | "meter.value"
  | "charger.status.changed"
  | "charger.connected"
  | "charger.disconnected"
  | "charger.booted"
  | "charger.heartbeat"
  | "charger.faulted"
  | "connector.status.changed"
  | "payment.created"
  | "payment.authorized"
  | "payment.confirmed"
  | "payment.paid"
  | "payment.failed"
  | "payment.cancelled"
  | "payment.refund_requested"
  | "payment.refunded"
  | "wallet.hold_created"
  | "wallet.hold_released"
  | "wallet.debited"
  | "billing.finalized"
  | "billing.failed"
  | "webhook.received"
  | "webhook.processed"
  | "webhook.failed"
  | "reservation.created"
  | "reservation.cancelled"
  | "waitlist.joined"
  | "waitlist.notified"
  | "incident.opened"
  | "incident.updated"
  | "maintenance.started"
  | "maintenance.ended"
  | "charger.health.changed";

export interface DomainEvent<TPayload = Record<string, unknown>> {
  type: DomainEventType;
  entityType: "session" | "charger" | "connector" | "payment" | "reservation" | "waitlist" | "incident" | "maintenance";
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
