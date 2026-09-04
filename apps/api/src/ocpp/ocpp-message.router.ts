import { Injectable, Logger } from "@nestjs/common";
import { isCall, serializeCallError, serializeCallResult, type OcppFrame } from "@evcharge/ocpp";
import { OcppConnectionManager } from "./ocpp-connection.manager";
import { OcppInboundService } from "./ocpp-inbound.service";
import { OcppLogger } from "./ocpp-logger";
import {
  handleAuthorize,
  handleBootNotification,
  handleHeartbeat,
  handleMeterValues,
  handleStartTransaction,
  handleStatusNotification,
  handleStopTransaction,
} from "./handlers";

@Injectable()
export class OcppMessageRouter {
  private readonly logger = new OcppLogger(new Logger(OcppMessageRouter.name));

  constructor(
    private readonly connections: OcppConnectionManager,
    private readonly inbound: OcppInboundService,
  ) {}

  async handle(chargerId: string, companyId: string, raw: string): Promise<string | null> {
    this.connections.touch(chargerId);
    this.logger.info("ocpp.message.received", { chargerId });

    let frame: OcppFrame;
    try {
      frame = this.connections.parse(raw);
    } catch (error) {
      this.logger.warn("ocpp.protocol.error", {
        chargerId,
        reason: error instanceof Error ? error.message : "invalid",
      });
      return serializeCallError("0", "FormationViolation", "Malformed OCPP payload");
    }

    if (this.connections.resolveIncomingResult(frame)) {
      return null;
    }

    if (!isCall(frame)) {
      this.logger.warn("ocpp.protocol.error", { chargerId, reason: "unexpected frame" });
      return null;
    }

    const [, uniqueId, action, payload] = frame;
    try {
      const result = await this.dispatch(chargerId, companyId, action, payload);
      return serializeCallResult(uniqueId, result);
    } catch (error) {
      this.logger.warn("ocpp.protocol.error", {
        chargerId,
        action,
        reason: error instanceof Error ? error.message : "handler",
      });
      return serializeCallError(
        uniqueId,
        "InternalError",
        error instanceof Error ? error.message : "Handler failed",
      );
    }
  }

  private async dispatch(
    chargerId: string,
    companyId: string,
    action: string,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    switch (action) {
      case "BootNotification":
        return handleBootNotification(this.inbound, chargerId, companyId, payload);
      case "Heartbeat":
        return handleHeartbeat(this.inbound, chargerId, companyId, payload);
      case "StatusNotification":
        return handleStatusNotification(this.inbound, chargerId, companyId, payload);
      case "Authorize":
        return handleAuthorize(this.inbound, payload);
      case "StartTransaction":
        return handleStartTransaction(this.inbound, chargerId, companyId, payload);
      case "MeterValues":
        return handleMeterValues(this.inbound, chargerId, companyId, payload);
      case "StopTransaction":
        return handleStopTransaction(this.inbound, chargerId, companyId, payload);
      default:
        this.logger.warn("ocpp.protocol.error", { chargerId, action, reason: "NotImplemented" });
        throw new Error(`NotImplemented: ${action}`);
    }
  }
}
