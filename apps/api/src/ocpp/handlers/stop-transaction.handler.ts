import { stopTransactionSchema } from "@evcharge/ocpp";
import type { OcppInboundService } from "../ocpp-inbound.service";

export async function handleStopTransaction(
  inbound: OcppInboundService,
  chargerId: string,
  companyId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const body = stopTransactionSchema.parse(payload);
  return inbound.stopTransaction({
    chargerId,
    companyId,
    transactionId: body.transactionId,
    meterStopWh: body.meterStop,
    timestamp: new Date(body.timestamp),
    reason: body.reason,
    idTag: body.idTag,
  });
}
