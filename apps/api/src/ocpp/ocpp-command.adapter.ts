import { Injectable } from "@nestjs/common";
import type { OcppCommandPort } from "@evcharge/charger-provider";
import {
  changeAvailabilityResultSchema,
  remoteStartResultSchema,
  remoteStopResultSchema,
  resetResultSchema,
} from "@evcharge/ocpp";
import { OcppConnectionManager } from "./ocpp-connection.manager";
import { OcppInboundService } from "./ocpp-inbound.service";

@Injectable()
export class OcppCommandAdapter implements OcppCommandPort {
  constructor(
    private readonly connections: OcppConnectionManager,
    private readonly inbound: OcppInboundService,
  ) {}

  isOnline(chargerId: string): boolean {
    return this.connections.isOnline(chargerId);
  }

  async remoteStart(chargerId: string, connectorNumber: number, idTag: string): Promise<boolean> {
    const payload = await this.connections.call(chargerId, "RemoteStartTransaction", {
      connectorId: connectorNumber,
      idTag,
    });
    return remoteStartResultSchema.parse(payload).status === "Accepted";
  }

  async remoteStop(chargerId: string, transactionId: number): Promise<boolean> {
    const payload = await this.connections.call(chargerId, "RemoteStopTransaction", { transactionId });
    return remoteStopResultSchema.parse(payload).status === "Accepted";
  }

  async reset(chargerId: string, type: "Hard" | "Soft" = "Soft"): Promise<boolean> {
    const payload = await this.connections.call(chargerId, "Reset", { type });
    return resetResultSchema.parse(payload).status === "Accepted";
  }

  async changeAvailability(
    chargerId: string,
    connectorNumber: number,
    type: "Inoperative" | "Operative",
  ): Promise<boolean> {
    const payload = await this.connections.call(chargerId, "ChangeAvailability", {
      connectorId: connectorNumber,
      type,
    });
    const parsed = changeAvailabilityResultSchema.parse(payload);
    return parsed.status === "Accepted" || parsed.status === "Scheduled";
  }

  lookupTransactionId(chargerId: string, connectorNumber: number): Promise<number | null> {
    return this.inbound.lookupTransactionId(chargerId, connectorNumber);
  }
}
