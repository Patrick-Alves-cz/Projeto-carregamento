import { authorizeSchema } from "@evcharge/ocpp";
import type { OcppInboundService } from "../ocpp-inbound.service";

export async function handleAuthorize(
  inbound: OcppInboundService,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const body = authorizeSchema.parse(payload);
  const result = await inbound.authorize(body.idTag);
  return { idTagInfo: { status: result.status } };
}
