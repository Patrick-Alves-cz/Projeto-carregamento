import { Injectable, Logger } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import {
  ChargerCommandType,
  MaintenanceWindowStatus,
  NotificationType,
  Prisma,
  ReservationStatus,
} from "@prisma/client";
import { NotFoundError, ValidationError } from "@evcharge/domain";
import type { CreateMaintenanceInput } from "@evcharge/shared";
import { PrismaService } from "../common/database/database.module";
import { TenantAccessService } from "../common/services/tenant-access.service";
import { AuthenticatedUser } from "../common/types/auth.types";
import { ChargerCommandsService } from "../ocpp/charger-commands.service";
import { NotificationsService } from "../notifications/notifications.service";
import { ChargingEventsService } from "../charging/charging-events.service";
import { AuditLogger } from "../common/logging/audit-logger";

const BLOCKING: MaintenanceWindowStatus[] = [MaintenanceWindowStatus.ACTIVE];

@Injectable()
export class MaintenanceService {
  private readonly audit = new AuditLogger(new Logger(MaintenanceService.name));

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantAccessService,
    private readonly notifications: NotificationsService,
    private readonly events: ChargingEventsService,
    private readonly moduleRef: ModuleRef,
  ) {}

  private commandService() {
    return this.moduleRef.get(ChargerCommandsService, { strict: false });
  }

  async isResourceBlocked(params: {
    stationId?: string;
    chargerId?: string;
    connectorId?: string;
  }): Promise<boolean> {
    const now = new Date();
    let chargerId = params.chargerId;
    let stationId = params.stationId;
    if (params.connectorId && (!chargerId || !stationId)) {
      const connector = await this.prisma.connector.findUnique({
        where: { id: params.connectorId },
        include: { charger: true },
      });
      if (connector) {
        chargerId = chargerId ?? connector.chargerId;
        stationId = stationId ?? connector.charger.stationId;
      }
    }
    const window = await this.prisma.maintenanceWindow.findFirst({
      where: {
        status: { in: BLOCKING },
        startsAt: { lte: now },
        endsAt: { gte: now },
        OR: [
          stationId ? { stationId } : undefined,
          chargerId ? { chargerId } : undefined,
          params.connectorId ? { connectorId: params.connectorId } : undefined,
        ].filter(Boolean) as Prisma.MaintenanceWindowWhereInput[],
      },
    });
    return Boolean(window);
  }

  async assertNotBlocked(params: { stationId?: string; chargerId?: string; connectorId?: string }) {
    if (await this.isResourceBlocked(params)) {
      throw new ValidationError("Temporariamente indisponível para manutenção.", "MAINTENANCE");
    }
  }

  async create(user: AuthenticatedUser, input: CreateMaintenanceInput) {
    this.tenant.assertOperatorOrAbove(user);
    const target = await this.resolveTarget(input);
    this.tenant.assertCompanyAccess(user, target.companyId);
    const created = await this.prisma.maintenanceWindow.create({
      data: {
        companyId: target.companyId,
        stationId: target.stationId,
        chargerId: target.chargerId,
        connectorId: input.connectorId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        reason: input.reason,
        createdById: user.id,
        status:
          input.startsAt.getTime() <= Date.now()
            ? MaintenanceWindowStatus.ACTIVE
            : MaintenanceWindowStatus.SCHEDULED,
      },
    });
    this.audit.info("maintenance.created", { maintenanceId: created.id, companyId: target.companyId });
    if (created.status === MaintenanceWindowStatus.ACTIVE) {
      await this.activate(created.id);
    }
    return created;
  }

  async list(user: AuthenticatedUser) {
    this.tenant.assertOperatorOrAbove(user);
    return this.prisma.maintenanceWindow.findMany({
      where: this.tenant.isSuperAdmin(user) ? {} : { companyId: { in: user.companyIds } },
      include: { station: true, charger: true, connector: true },
      orderBy: { startsAt: "desc" },
      take: 200,
    });
  }

  async cancel(user: AuthenticatedUser, id: string) {
    const window = await this.prisma.maintenanceWindow.findUnique({ where: { id } });
    if (!window) throw new NotFoundError("MaintenanceWindow", id);
    this.tenant.assertCompanyAccess(user, window.companyId);
    return this.prisma.maintenanceWindow.update({
      where: { id },
      data: { status: MaintenanceWindowStatus.CANCELLED },
    });
  }

  async tick() {
    const now = new Date();
    const due = await this.prisma.maintenanceWindow.findMany({
      where: { status: MaintenanceWindowStatus.SCHEDULED, startsAt: { lte: now } },
      take: 50,
    });
    for (const window of due) await this.activate(window.id);

    const ending = await this.prisma.maintenanceWindow.findMany({
      where: { status: MaintenanceWindowStatus.ACTIVE, endsAt: { lte: now } },
      take: 50,
    });
    for (const window of ending) await this.complete(window.id);
  }

  private async activate(id: string) {
    const window = await this.prisma.maintenanceWindow.update({
      where: { id },
      data: { status: MaintenanceWindowStatus.ACTIVE },
      include: { charger: { include: { connectors: true, station: true } }, station: true, connector: true },
    });
    const chargers = window.charger
      ? [window.charger]
      : window.stationId
        ? await this.prisma.charger.findMany({
            where: { stationId: window.stationId },
            include: { connectors: true, station: true },
          })
        : [];
    for (const charger of chargers) {
      const connectors = window.connectorId
        ? charger.connectors.filter((item) => item.id === window.connectorId)
        : charger.connectors;
      for (const connector of connectors) {
        await this.commandService().execute({
          chargerId: charger.id,
          type: ChargerCommandType.CHANGE_AVAILABILITY,
          connectorId: connector.id,
          connectorNumber: connector.number,
          availability: "Inoperative",
          userId: window.createdById,
        }).catch(() => undefined);
      }
    }
    await this.notifyWindow(window, true);
    await this.notifyReservationHolders(window.stationId ?? window.charger?.stationId, true);
    await this.events.publish({
      type: "maintenance.started",
      entityType: "maintenance",
      entityId: window.id,
      timestamp: new Date(),
      payload: { maintenanceId: window.id, companyId: window.companyId },
    });
  }

  private async complete(id: string) {
    const window = await this.prisma.maintenanceWindow.update({
      where: { id },
      data: { status: MaintenanceWindowStatus.COMPLETED },
      include: { charger: { include: { connectors: true, station: true } }, station: true, connector: true },
    });
    const chargers = window.charger
      ? [window.charger]
      : window.stationId
        ? await this.prisma.charger.findMany({
            where: { stationId: window.stationId },
            include: { connectors: true, station: true },
          })
        : [];
    for (const charger of chargers) {
      const connectors = window.connectorId
        ? charger.connectors.filter((item) => item.id === window.connectorId)
        : charger.connectors;
      for (const connector of connectors) {
        await this.commandService().execute({
          chargerId: charger.id,
          type: ChargerCommandType.CHANGE_AVAILABILITY,
          connectorId: connector.id,
          connectorNumber: connector.number,
          availability: "Operative",
          userId: window.createdById,
        }).catch(() => undefined);
      }
    }
    await this.notifyWindow(window, false);
    await this.events.publish({
      type: "maintenance.ended",
      entityType: "maintenance",
      entityId: window.id,
      timestamp: new Date(),
      payload: { maintenanceId: window.id, companyId: window.companyId },
    });
  }

  private async resolveTarget(input: CreateMaintenanceInput) {
    if (input.connectorId) {
      const connector = await this.prisma.connector.findUnique({
        where: { id: input.connectorId },
        include: { charger: { include: { station: true } } },
      });
      if (!connector) throw new NotFoundError("Connector", input.connectorId);
      return {
        companyId: connector.charger.station.companyId,
        stationId: connector.charger.stationId,
        chargerId: connector.chargerId,
      };
    }
    if (input.chargerId) {
      const charger = await this.prisma.charger.findUnique({
        where: { id: input.chargerId },
        include: { station: true },
      });
      if (!charger) throw new NotFoundError("Charger", input.chargerId);
      return { companyId: charger.station.companyId, stationId: charger.stationId, chargerId: charger.id };
    }
    if (input.stationId) {
      const station = await this.prisma.station.findUnique({ where: { id: input.stationId } });
      if (!station) throw new NotFoundError("Station", input.stationId);
      return { companyId: station.companyId, stationId: station.id, chargerId: undefined };
    }
    throw new ValidationError("Alvo de manutenção inválido");
  }

  private async notifyWindow(
    window: { id: string; companyId: string; reason: string },
    starting: boolean,
  ) {
    const members = await this.prisma.companyMember.findMany({
      where: { companyId: window.companyId, role: { in: ["OWNER", "ADMIN", "OPERATOR"] } },
    });
    for (const member of members) {
      await this.notifications.notify({
        userId: member.userId,
        type: starting ? NotificationType.MAINTENANCE_STARTING : NotificationType.MAINTENANCE_ENDING,
        title: starting ? "Manutenção iniciada" : "Manutenção encerrada",
        body: window.reason,
        payload: { maintenanceId: window.id },
        dedupeKey: `maintenance-${starting ? "start" : "end"}-${window.id}`,
      });
    }
  }

  private async notifyReservationHolders(stationId: string | undefined, starting: boolean) {
    if (!stationId || !starting) return;
    const reservations = await this.prisma.reservation.findMany({
      where: {
        stationId,
        status: { in: [ReservationStatus.CONFIRMED, ReservationStatus.ACTIVE] },
        endAt: { gte: new Date() },
      },
    });
    for (const reservation of reservations) {
      await this.notifications.notify({
        userId: reservation.userId,
        type: NotificationType.CHARGER_UNAVAILABLE_DURING_RESERVATION,
        title: "Carregador indisponível",
        body: "Sua reserva foi afetada por uma manutenção temporária.",
        payload: { reservationId: reservation.id, stationId },
        dedupeKey: `reservation-maintenance-${reservation.id}`,
      });
    }
  }
}
