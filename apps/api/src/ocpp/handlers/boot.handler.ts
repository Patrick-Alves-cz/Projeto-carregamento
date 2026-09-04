import { bootNotificationSchema } from "@evcharge/ocpp";
import type { OcppInboundService } from "../ocpp-inbound.service";

const HEARTBEAT_INTERVAL = Number(process.env.OCPP_HEARTBEAT_INTERVAL_SEC ?? 60);

export async function handleBootNotification(
  inbound: OcppInboundService,
  chargerId: string,
  companyId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const boot = bootNotificationSchema.parse(payload);
  await inbound.applyBoot(chargerId, companyId, boot);
  return {
    status: "Accepted",
    currentTime: new Date().toISOString(),
    interval: HEARTBEAT_INTERVAL,
  };
}
