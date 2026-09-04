import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { NotFoundError, ValidationError } from "@evcharge/domain";
import { Roles } from "../common/decorators/auth.decorators";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthenticatedUser } from "../common/types/auth.types";
import { TenantAccessService } from "../common/services/tenant-access.service";
import { PrismaService } from "../common/database/database.module";
import { OcppCommandAdapter } from "./ocpp-command.adapter";
import { OcppConnectionManager } from "./ocpp-connection.manager";
import { ChargingEventsService } from "../charging/charging-events.service";
import { AuditLogger } from "../common/logging/audit-logger";
import { Logger } from "@nestjs/common";

const commandSchema = z.object({
  action: z.enum(["REMOTE_START", "REMOTE_STOP", "RESET", "CHANGE_AVAILABILITY"]),
  connectorNumber: z.number().int().positive().optional(),
  idTag: z.string().max(20).optional(),
  availability: z.enum(["Inoperative", "Operative"]).optional(),
  resetType: z.enum(["Hard", "Soft"]).optional(),
  confirm: z.literal(true),
});

@ApiTags("ocpp")
@ApiBearerAuth()
@Controller("chargers")
export class OcppOpsController {
  private readonly audit = new AuditLogger(new Logger(OcppOpsController.name));

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantAccessService,
    private readonly commands: OcppCommandAdapter,
    private readonly connections: OcppConnectionManager,
    private readonly events: ChargingEventsService,
  ) {}

  @Get(":id/ocpp")
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: "OCPP charger detail" })
  async detail(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    const charger = await this.loadCharger(id, user);
    const events = await this.prisma.chargerEvent.findMany({
      where: { chargerId: id },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    const liveTx = await this.prisma.ocppTransaction.findFirst({
      where: { chargerId: id, stoppedAt: null },
      include: { session: true },
    });
    return { ...this.withConnection(charger), events, currentTransaction: liveTx };
  }

  @Post(":id/ocpp/command")
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Send an authorized OCPP command" })
  async command(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(commandSchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const input = body as z.infer<typeof commandSchema>;
    const charger = await this.loadCharger(id, user);
    if (user.role === UserRole.DRIVER) {
      throw new ValidationError("Motoristas não enviam comandos OCPP");
    }

    let accepted = false;
    try {
      switch (input.action) {
        case "REMOTE_START":
          if (!input.connectorNumber || !input.idTag) {
            throw new ValidationError("connectorNumber e idTag são obrigatórios");
          }
          accepted = await this.commands.remoteStart(id, input.connectorNumber, input.idTag);
          break;
        case "REMOTE_STOP": {
          const txId = await this.commands.lookupTransactionId(id, input.connectorNumber ?? 1);
          if (txId == null) throw new ValidationError("Nenhuma transação OCPP ativa");
          accepted = await this.commands.remoteStop(id, txId);
          break;
        }
        case "RESET":
          accepted = await this.commands.reset(id, input.resetType ?? "Soft");
          break;
        case "CHANGE_AVAILABILITY":
          if (!input.connectorNumber || !input.availability) {
            throw new ValidationError("connectorNumber e availability são obrigatórios");
          }
          accepted = await this.commands.changeAvailability(id, input.connectorNumber, input.availability);
          break;
      }
    } catch (error) {
      this.audit.warn("ocpp.command.rejected", {
        chargerId: id,
        action: input.action,
        userId: user.id,
        result: "error",
      });
      throw error;
    }

    this.audit.info(accepted ? "ocpp.command.accepted" : "ocpp.command.rejected", {
      chargerId: id,
      action: input.action,
      userId: user.id,
      companyId: charger.station.companyId,
      result: accepted ? "accepted" : "rejected",
    });
    if (input.action === "REMOTE_START" || input.action === "REMOTE_STOP") {
      await this.events.publish({
        type: input.action === "REMOTE_START" ? "session.remote_start_requested" : "session.remote_stop_requested",
        entityType: "charger",
        entityId: id,
        timestamp: new Date(),
        payload: {
          chargerId: id,
          companyId: charger.station.companyId,
          action: input.action,
          accepted,
          userId: user.id,
        },
      });
    }
    await this.prisma.chargerEvent.create({
      data: {
        chargerId: id,
        type: `command.${input.action.toLowerCase()}`,
        payload: { userId: user.id, accepted },
      },
    });
    return { chargerId: id, action: input.action, accepted };
  }

  private async loadCharger(id: string, user: AuthenticatedUser) {
    this.tenant.assertOperatorOrAbove(user);
    const charger = await this.prisma.charger.findUnique({
      where: { id },
      include: { station: true, connectors: { orderBy: { number: "asc" } } },
    });
    if (!charger) throw new NotFoundError("Charger", id);
    this.tenant.assertCompanyAccess(user, charger.station.companyId);
    return charger;
  }

  private withConnection<
    T extends {
      id: string;
      lastSeenAt: Date | null;
      protocol?: string | null;
      providerId?: string | null;
    },
  >(charger: T) {
    const conn = this.connections.get(charger.id);
    return {
      ...charger,
      protocol:
        charger.providerId === "ocpp16" || charger.providerId === "ocpp" || charger.protocol === "ocpp1.6"
          ? "OCPP 1.6"
          : charger.protocol ?? "mock",
      ocppOnline: this.connections.isOnline(charger.id),
      ocppConnectedAt: conn?.connectedAt ?? null,
      lastSeenAt: conn?.lastMessageAt ?? charger.lastSeenAt,
    };
  }
}
