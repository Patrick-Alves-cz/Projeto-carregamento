import { heartbeatSchema } from "@evcharge/ocpp";
import type { OcppInboundService } from "../ocpp-inbound.service";

export async function handleHeartbeat(
  inbound: OcppInboundService,
  chargerId: string,
  companyId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  heartbeatSchema.parse(payload);
  await inbound.heartbeat(chargerId, companyId);
  return { currentTime: new Date().toISOString() };
}
