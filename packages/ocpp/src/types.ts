export const OCPP_16_SUBPROTOCOL = "ocpp1.6";
export const OCPP_PROTOCOL_LABEL = "OCPP 1.6";

export const MessageType = {
  CALL: 2,
  CALLRESULT: 3,
  CALLERROR: 4,
} as const;

export type MessageTypeId = (typeof MessageType)[keyof typeof MessageType];

export const IncomingActions = [
  "BootNotification",
  "Heartbeat",
  "StatusNotification",
  "Authorize",
  "StartTransaction",
  "MeterValues",
  "StopTransaction",
] as const;

export const OutgoingActions = [
  "RemoteStartTransaction",
  "RemoteStopTransaction",
  "Reset",
  "ChangeAvailability",
] as const;

export type IncomingAction = (typeof IncomingActions)[number];
export type OutgoingAction = (typeof OutgoingActions)[number];

export type OcppCall = [typeof MessageType.CALL, string, string, Record<string, unknown>];
export type OcppCallResult = [typeof MessageType.CALLRESULT, string, Record<string, unknown>];
export type OcppCallError = [typeof MessageType.CALLERROR, string, string, string, Record<string, unknown>];
export type OcppFrame = OcppCall | OcppCallResult | OcppCallError;

export type OcppErrorCode =
  | "NotImplemented"
  | "NotSupported"
  | "InternalError"
  | "ProtocolError"
  | "SecurityError"
  | "FormationViolation"
  | "PropertyConstraintViolation"
  | "OccurrenceConstraintViolation"
  | "TypeConstraintViolation"
  | "GenericError";
