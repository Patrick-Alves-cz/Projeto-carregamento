import { startTransactionSchema } from "@evcharge/ocpp";
import type { OcppInboundService } from "../ocpp-inbound.service";

export async function handleStartTransaction(
  inbound: OcppInboundService,
  chargerId: string,
  companyId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const body = startTransactionSchema.parse(payload);
  return inbound.startTransaction({
    chargerId,
    companyId,
    connectorNumber: body.connectorId,
    idTag: body.idTag,
    meterStartWh: body.meterStart,
    timestamp: new Date(body.timestamp),
  });
}
