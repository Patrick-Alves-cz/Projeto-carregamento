import { Body, Controller, Get, Logger, Param, Post } from "@nestjs/common";
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
import { ChargerCommandsService } from "./charger-commands.service";
import { ChargerCommandType } from "@prisma/client";
import { OcppConnectionManager } from "./ocpp-connection.manager";
import { ChargingEventsService } from "../charging/charging-events.service";
import { AuditLogger } from "../common/logging/audit-logger";
import { OcppAuthService } from "./ocpp-auth.service";

const credentialSchema = z.object({
  confirm: z.literal(true),
  secret: z.string().min(12).max(128).optional(),
});

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
    private readonly commandLog: ChargerCommandsService,
    private readonly connections: OcppConnectionManager,
    private readonly events: ChargingEventsService,
    private readonly ocppAuth: OcppAuthService,
  ) {}

  @Get(":id/ocpp")
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: "OCPP charger detail" })
  async detail(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    const charger = await this.loadCharger(id, user);
    const [events, liveTx, commands, incidents, maintenance] = await Promise.all([
      this.prisma.chargerEvent.findMany({
        where: { chargerId: id, category: "OPERATIONAL" },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      this.prisma.ocppTransaction.findFirst({
        where: { chargerId: id, stoppedAt: null },
        include: { session: true },
      }),
      this.prisma.chargerCommand.findMany({
        where: { chargerId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      this.prisma.incident.findMany({
        where: { chargerId: id },
        orderBy: { lastSeenAt: "desc" },
        take: 10,
      }),
      this.prisma.maintenanceWindow.findMany({
        where: { chargerId: id },
        orderBy: { startsAt: "desc" },
        take: 10,
      }),
    ]);
    return {
      ...this.withConnection(charger),
      events,
      currentTransaction: liveTx,
      commands,
      incidents,
      maintenanceWindows: maintenance,
    };
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

    const result = await this.commandLog.execute({
      chargerId: id,
      type: input.action as ChargerCommandType,
      connectorNumber: input.connectorNumber,
      availability: input.availability,
      idTag: input.idTag,
      resetType: input.resetType,
      userId: user.id,
      confirm: true,
    });
    const accepted = result.accepted;

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
    return { chargerId: id, action: input.action, accepted, commandId: result.commandId, status: result.status };
  }

  @Post(":id/ocpp/credential")
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "Rotate OCPP charger credential",
    description:
      "Revokes the active equipment secret and returns a new plaintext secret once. It is never stored in clear text.",
  })
  async rotateCredential(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(credentialSchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const input = body as z.infer<typeof credentialSchema>;
    const charger = await this.loadCharger(id, user);
    const secret = await this.ocppAuth.rotateCredential(id, input.secret);
    const publicBase = (process.env.OCPP_PUBLIC_URL ?? "ws://localhost:3001/ocpp").replace(/\/$/, "");
    this.audit.info("ocpp.credential.rotated", {
      chargerId: id,
      userId: user.id,
      companyId: charger.station.companyId,
      identity: charger.identity,
    });
    return {
      chargerId: charger.id,
      identity: charger.identity,
      username: charger.identity,
      secret,
      protocol: "OCPP 1.6J",
      ocppUrl: `${publicBase}/${charger.identity}`,
      note: "Guarde o secret agora. Ele não será exibido novamente.",
    };
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
