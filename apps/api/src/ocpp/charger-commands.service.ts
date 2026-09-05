import { Injectable, Logger, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  ChargerCommandStatus,
  ChargerCommandType,
  ConnectorStatus,
  Prisma,
} from "@prisma/client";
import { NotFoundError, ValidationError } from "@evcharge/domain";
import { PrismaService } from "../common/database/database.module";
import { ChargerProviderService } from "../charging/charger-provider.service";
import { OcppCommandAdapter } from "./ocpp-command.adapter";
import { OcppConnectionManager } from "./ocpp-connection.manager";
import { AuditLogger } from "../common/logging/audit-logger";

export type ExecuteCommandInput = {
  chargerId: string;
  type: ChargerCommandType;
  connectorId?: string;
  connectorNumber?: number;
  availability?: "Inoperative" | "Operative";
  idTag?: string;
  resetType?: "Hard" | "Soft";
  userId?: string;
  confirm?: boolean;
};

@Injectable()
export class ChargerCommandsService {
  private readonly audit = new AuditLogger(new Logger(ChargerCommandsService.name));

  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: OcppCommandAdapter,
    private readonly connections: OcppConnectionManager,
    @Optional() private readonly chargerProvider?: ChargerProviderService,
  ) {}

  async execute(input: ExecuteCommandInput) {
    const charger = await this.prisma.charger.findUnique({
      where: { id: input.chargerId },
      include: { station: true, connectors: { orderBy: { number: "asc" } } },
    });
    if (!charger) throw new NotFoundError("Charger", input.chargerId);

    const connector =
      input.connectorId
        ? charger.connectors.find((item) => item.id === input.connectorId)
        : input.connectorNumber
          ? charger.connectors.find((item) => item.number === input.connectorNumber)
          : charger.connectors[0];

    const command = await this.prisma.chargerCommand.create({
      data: {
        companyId: charger.station.companyId,
        chargerId: charger.id,
        connectorId: connector?.id,
        type: input.type,
        status: ChargerCommandStatus.QUEUED,
        requestedById: input.userId,
        correlationId: randomUUID(),
        payload: {
          connectorNumber: connector?.number ?? input.connectorNumber ?? null,
          availability: input.availability ?? null,
          resetType: input.resetType ?? null,
        } as Prisma.InputJsonValue,
      },
    });

    const ocpp = charger.providerId === "ocpp16" || charger.providerId === "ocpp";
    if (ocpp && !this.connections.isOnline(charger.id)) {
      await this.prisma.chargerCommand.update({
        where: { id: command.id },
        data: {
          status: ChargerCommandStatus.FAILED,
          errorCode: "CHARGER_OFFLINE",
          errorMessageSanitized: "Carregador sem conexão OCPP",
          completedAt: new Date(),
        },
      });
      throw new ValidationError("Este carregador está temporariamente indisponível.", "CHARGER_OFFLINE");
    }

    await this.prisma.chargerCommand.update({
      where: { id: command.id },
      data: { status: ChargerCommandStatus.SENT, sentAt: new Date() },
    });

    let accepted = false;
    try {
      accepted = await this.send(charger.id, input, connector?.number ?? 1, ocpp);
    } catch (error) {
      const timeout = error instanceof Error && /timeout/i.test(error.message);
      await this.prisma.chargerCommand.update({
        where: { id: command.id },
        data: {
          status: timeout ? ChargerCommandStatus.TIMEOUT : ChargerCommandStatus.FAILED,
          errorCode: timeout ? "TIMEOUT" : "FAILED",
          errorMessageSanitized: timeout ? "Comando expirou" : "Falha ao enviar comando",
          respondedAt: new Date(),
          completedAt: new Date(),
        },
      });
      this.audit.warn("ocpp.command.timeout", {
        chargerId: charger.id,
        commandId: command.id,
        type: input.type,
      });
      return { commandId: command.id, accepted: false, status: timeout ? "TIMEOUT" : "FAILED" };
    }

    await this.prisma.chargerCommand.update({
      where: { id: command.id },
      data: {
        status: accepted ? ChargerCommandStatus.ACCEPTED : ChargerCommandStatus.REJECTED,
        respondedAt: new Date(),
        completedAt: accepted ? new Date() : new Date(),
        errorCode: accepted ? null : "REJECTED",
      },
    });

    if (accepted && input.type === ChargerCommandType.CHANGE_AVAILABILITY && connector && input.availability) {
      await this.prisma.connector.update({
        where: { id: connector.id },
        data: {
          status:
            input.availability === "Inoperative" ? ConnectorStatus.UNAVAILABLE : ConnectorStatus.AVAILABLE,
        },
      });
    }

    await this.prisma.chargerEvent.create({
      data: {
        chargerId: charger.id,
        type: `command.${input.type.toLowerCase()}`,
        category: "OPERATIONAL",
        payload: { commandId: command.id, accepted, userId: input.userId ?? null },
      },
    });

    return {
      commandId: command.id,
      accepted,
      status: accepted ? "ACCEPTED" : "REJECTED",
    };
  }

  async expirePending() {
    const cutoff = new Date(Date.now() - Number(process.env.OCPP_COMMAND_TIMEOUT_MS ?? 10_000) * 2);
    await this.prisma.chargerCommand.updateMany({
      where: { status: { in: [ChargerCommandStatus.QUEUED, ChargerCommandStatus.SENT] }, sentAt: { lte: cutoff } },
      data: {
        status: ChargerCommandStatus.TIMEOUT,
        errorCode: "TIMEOUT",
        errorMessageSanitized: "Comando expirou",
        completedAt: new Date(),
      },
    });
  }

  private async send(
    chargerId: string,
    input: ExecuteCommandInput,
    connectorNumber: number,
    ocpp: boolean,
  ): Promise<boolean> {
    if (!ocpp) {
      if (input.type === ChargerCommandType.CHANGE_AVAILABILITY && this.chargerProvider) {
        await this.chargerProvider.setAvailability(
          chargerId,
          connectorNumber,
          input.availability === "Inoperative" ? "unavailable" : "available",
        );
        return true;
      }
      if (input.type === ChargerCommandType.RESET && this.chargerProvider) {
        await this.chargerProvider.restart(chargerId);
        return true;
      }
      return true;
    }

    switch (input.type) {
      case ChargerCommandType.REMOTE_START:
        if (!input.idTag) throw new ValidationError("idTag é obrigatório");
        return this.commands.remoteStart(chargerId, connectorNumber, input.idTag);
      case ChargerCommandType.REMOTE_STOP: {
        const txId = await this.commands.lookupTransactionId(chargerId, connectorNumber);
        if (txId == null) throw new ValidationError("Nenhuma transação OCPP ativa");
        return this.commands.remoteStop(chargerId, txId);
      }
      case ChargerCommandType.RESET:
        return this.commands.reset(chargerId, input.resetType ?? "Soft");
      case ChargerCommandType.CHANGE_AVAILABILITY:
        if (!input.availability) throw new ValidationError("availability é obrigatório");
        return this.commands.changeAvailability(chargerId, connectorNumber, input.availability);
      default:
        return false;
    }
  }
}
