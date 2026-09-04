import { z } from "zod";
import { MessageType, type OcppCall, type OcppCallError, type OcppCallResult, type OcppFrame } from "./types";

export class OcppProtocolError extends Error {
  constructor(
    message: string,
    public readonly code: string = "ProtocolError",
  ) {
    super(message);
    this.name = "OcppProtocolError";
  }
}

const callSchema = z.tuple([
  z.literal(MessageType.CALL),
  z.string().min(1).max(36),
  z.string().min(1).max(64),
  z.record(z.unknown()),
]);

const callResultSchema = z.tuple([
  z.literal(MessageType.CALLRESULT),
  z.string().min(1).max(36),
  z.record(z.unknown()),
]);

const callErrorSchema = z.tuple([
  z.literal(MessageType.CALLERROR),
  z.string().min(1).max(36),
  z.string(),
  z.string(),
  z.record(z.unknown()),
]);

export function parseOcppFrame(raw: string): OcppFrame {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new OcppProtocolError("Malformed JSON", "FormationViolation");
  }
  if (!Array.isArray(parsed) || parsed.length < 3) {
    throw new OcppProtocolError("OCPP frame must be a JSON array", "ProtocolError");
  }
  const type = parsed[0];
  if (type === MessageType.CALL) {
    const result = callSchema.safeParse(parsed);
    if (!result.success) throw new OcppProtocolError("Invalid CALL frame", "FormationViolation");
    return result.data as OcppCall;
  }
  if (type === MessageType.CALLRESULT) {
    const result = callResultSchema.safeParse(parsed);
    if (!result.success) throw new OcppProtocolError("Invalid CALLRESULT frame", "FormationViolation");
    return result.data as OcppCallResult;
  }
  if (type === MessageType.CALLERROR) {
    const result = callErrorSchema.safeParse(parsed);
    if (!result.success) throw new OcppProtocolError("Invalid CALLERROR frame", "FormationViolation");
    return result.data as OcppCallError;
  }
  throw new OcppProtocolError(`Unknown messageTypeId ${String(type)}`, "ProtocolError");
}

export function serializeCall(uniqueId: string, action: string, payload: Record<string, unknown>): string {
  return JSON.stringify([MessageType.CALL, uniqueId, action, payload]);
}

export function serializeCallResult(uniqueId: string, payload: Record<string, unknown>): string {
  return JSON.stringify([MessageType.CALLRESULT, uniqueId, payload]);
}

export function serializeCallError(
  uniqueId: string,
  errorCode: string,
  errorDescription: string,
  details: Record<string, unknown> = {},
): string {
  return JSON.stringify([MessageType.CALLERROR, uniqueId, errorCode, errorDescription, details]);
}

export function isCall(frame: OcppFrame): frame is OcppCall {
  return frame[0] === MessageType.CALL;
}

export function isCallResult(frame: OcppFrame): frame is OcppCallResult {
  return frame[0] === MessageType.CALLRESULT;
}

export function isCallError(frame: OcppFrame): frame is OcppCallError {
  return frame[0] === MessageType.CALLERROR;
}
