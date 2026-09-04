import { mapOcppConnectorStatus, statusNotificationSchema } from "@evcharge/ocpp";
import type { ConnectorOperationalStatus } from "@evcharge/charger-provider";
import type { OcppInboundService } from "../ocpp-inbound.service";

export async function handleStatusNotification(
  inbound: OcppInboundService,
  chargerId: string,
  companyId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const body = statusNotificationSchema.parse(payload);
  const mapped = mapOcppConnectorStatus(body.status, body.errorCode) as ConnectorOperationalStatus;
  await inbound.applyConnectorStatus(
    chargerId,
    companyId,
    body.connectorId,
    mapped,
    body.errorCode,
  );
  return {};
}
