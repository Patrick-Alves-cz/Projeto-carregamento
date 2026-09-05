import { Injectable, Logger } from "@nestjs/common";
import {
  assertVehicleConnectorCompatibility,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@evcharge/domain";
import type { CreateReservationInput } from "@evcharge/shared";
import {
  ChargerStatus,
  ConnectorStatus,
  NotificationType,
  ReservationStatus,
  StationStatus,
  UserRole,
} from "@prisma/client";
import { PrismaService } from "../common/database/database.module";
import { TenantAccessService } from "../common/services/tenant-access.service";
import { AuthenticatedUser } from "../common/types/auth.types";
import { AuditLogger } from "../common/logging/audit-logger";
import { NotificationsService } from "../notifications/notifications.service";
import { ChargingEventsService } from "../charging/charging-events.service";

const LIVE_RESERVATION: ReservationStatus[] = [
  ReservationStatus.PENDING,
  ReservationStatus.CONFIRMED,
  ReservationStatus.ACTIVE,
];

@Injectable()
export class ReservationsService {
  private readonly audit = new AuditLogger(new Logger(ReservationsService.name));
  private readonly graceMinutes = Number(process.env.RESERVATION_GRACE_MINUTES ?? 15);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantAccessService,
    private readonly notifications: NotificationsService,
    private readonly events: ChargingEventsService,
  ) {}

  async create(user: AuthenticatedUser, input: CreateReservationInput) {
    if (user.role !== UserRole.DRIVER) throw new ForbiddenError("Somente motoristas criam reservas");
    if (input.endAt.getTime() - input.startAt.getTime() < 10 * 60_000) {
      throw new ValidationError("Reserva mínima de 10 minutos");
    }
    if (input.startAt.getTime() < Date.now() - 60_000) {
      throw new ValidationError("Horário de início inválido");
    }

    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: input.vehicleId, userId: user.id } });
    if (!vehicle) throw new NotFoundError("Vehicle", input.vehicleId);

    const station = await this.prisma.station.findUnique({
      where: { id: input.stationId },
      include: { chargers: { include: { connectors: true } } },
    });
    if (!station) throw new NotFoundError("Station", input.stationId);
    if (station.status !== StationStatus.ACTIVE) {
      throw new ValidationError("Estação indisponível para reservas");
    }

    const connector = input.connectorId
      ? await this.prisma.connector.findUnique({
          where: { id: input.connectorId },
          include: { charger: true },
        })
      : null;
    if (input.connectorId && !connector) throw new NotFoundError("Connector", input.connectorId);
    if (connector && connector.charger.stationId !== station.id) {
      throw new ValidationError("Conector não pertence a esta estação");
    }
    if (connector) {
      assertVehicleConnectorCompatibility(vehicle.connectorTypes, connector.type);
      if (connector.status === ConnectorStatus.FAULTED || connector.charger.status === ChargerStatus.FAULTED) {
        throw new ValidationError("Conector com falha");
      }
      if (connector.charger.status === ChargerStatus.OFFLINE) {
        throw new ValidationError("Carregador offline");
      }
    }

    const reservation = await this.prisma.$transaction(async (tx) => {
      if (connector) {
        await tx.$queryRaw`SELECT id FROM connectors WHERE id = ${connector.id} FOR UPDATE`;
        const clash = await tx.reservation.findFirst({
          where: {
            connectorId: connector.id,
            status: { in: LIVE_RESERVATION },
            startAt: { lt: input.endAt },
            endAt: { gt: input.startAt },
          },
        });
        if (clash) throw new ConflictError("Já existe uma reserva neste horário");
      }

      const created = await tx.reservation.create({
        data: {
          userId: user.id,
          companyId: station.companyId,
          stationId: station.id,
          connectorId: connector?.id,
          vehicleId: vehicle.id,
          startAt: input.startAt,
          endAt: input.endAt,
          status: ReservationStatus.CONFIRMED,
          graceUntil: new Date(input.startAt.getTime() + this.graceMinutes * 60_000),
          expiresAt: input.endAt,
        },
      });
      return created;
    });

    this.audit.info("reservation.created", {
      reservationId: reservation.id,
      userId: user.id,
      companyId: station.companyId,
      stationId: station.id,
      connectorId: connector?.id,
    });
    await this.notifications.notify({
      userId: user.id,
      type: NotificationType.RESERVATION_CONFIRMED,
      title: "Reserva confirmada",
      body: `Sua reserva em ${station.name} está confirmada.`,
      payload: { reservationId: reservation.id },
      dedupeKey: `reservation-confirmed-${reservation.id}`,
    });
    await this.events.publish({
      type: "reservation.created",
      entityType: "reservation",
      entityId: reservation.id,
      timestamp: new Date(),
      payload: { reservationId: reservation.id, userId: user.id, companyId: station.companyId },
    });
    return reservation;
  }

  async mine(user: AuthenticatedUser) {
    if (user.role !== UserRole.DRIVER) throw new ForbiddenError("Somente motoristas");
    return this.prisma.reservation.findMany({
      where: { userId: user.id },
      include: { station: true, connector: true, vehicle: true },
      orderBy: { startAt: "desc" },
      take: 50,
    });
  }

  async listAdmin(user: AuthenticatedUser) {
    this.tenant.assertOperatorOrAbove(user);
    return this.prisma.reservation.findMany({
      where: this.tenant.isSuperAdmin(user) ? {} : { companyId: { in: user.companyIds } },
      include: { station: true, connector: true, user: { include: { profile: true } } },
      orderBy: { startAt: "desc" },
      take: 100,
    });
  }

  async cancel(user: AuthenticatedUser, id: string) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id } });
    if (!reservation) throw new NotFoundError("Reservation", id);
    if (user.role === UserRole.DRIVER && reservation.userId !== user.id) {
      throw new ForbiddenError("Reserva de outro usuário");
    }
    if (user.role !== UserRole.DRIVER) {
      this.tenant.assertCompanyAccess(user, reservation.companyId);
    }
    if (!LIVE_RESERVATION.includes(reservation.status)) {
      throw new ValidationError("Reserva não pode ser cancelada");
    }
    const updated = await this.prisma.reservation.update({
      where: { id },
      data: { status: ReservationStatus.CANCELLED, cancelledAt: new Date() },
    });
    if (reservation.connectorId) {
      const connector = await this.prisma.connector.findUnique({ where: { id: reservation.connectorId } });
      if (connector?.status === ConnectorStatus.RESERVED) {
        await this.prisma.connector.update({
          where: { id: connector.id },
          data: { status: ConnectorStatus.AVAILABLE },
        });
      }
    }
    this.audit.info("reservation.cancelled", { reservationId: id, userId: user.id });
    await this.events.publish({
      type: "reservation.cancelled",
      entityType: "reservation",
      entityId: id,
      timestamp: new Date(),
      payload: { reservationId: id, userId: reservation.userId, companyId: reservation.companyId },
    });
    return updated;
  }

  async activateDue() {
    const now = new Date();
    const due = await this.prisma.reservation.findMany({
      where: {
        status: ReservationStatus.CONFIRMED,
        startAt: { lte: now },
        endAt: { gt: now },
      },
      take: 50,
    });
    for (const reservation of due) {
      if (reservation.connectorId) {
        const connector = await this.prisma.connector.findUnique({ where: { id: reservation.connectorId } });
        if (connector && connector.status === ConnectorStatus.AVAILABLE) {
          await this.prisma.connector.update({
            where: { id: connector.id },
            data: { status: ConnectorStatus.RESERVED },
          });
        }
      }
      await this.notifications.notify({
        userId: reservation.userId,
        type: NotificationType.RESERVATION_REMINDER,
        title: "Sua reserva começou",
        body: "Dirija-se à estação. Há uma janela de tolerância configurada.",
        payload: { reservationId: reservation.id },
        dedupeKey: `reservation-reminder-${reservation.id}`,
      });
    }
  }

  async expireNoShow() {
    const now = new Date();
    const stale = await this.prisma.reservation.findMany({
      where: {
        status: ReservationStatus.CONFIRMED,
        graceUntil: { lte: now },
      },
      take: 50,
    });
    for (const reservation of stale) {
      await this.prisma.reservation.update({
        where: { id: reservation.id },
        data: { status: ReservationStatus.NO_SHOW },
      });
      if (reservation.connectorId) {
        const connector = await this.prisma.connector.findUnique({ where: { id: reservation.connectorId } });
        if (connector?.status === ConnectorStatus.RESERVED) {
          await this.prisma.connector.update({
            where: { id: connector.id },
            data: { status: ConnectorStatus.AVAILABLE },
          });
        }
      }
      await this.notifications.notify({
        userId: reservation.userId,
        type: NotificationType.RESERVATION_NO_SHOW,
        title: "Reserva expirada",
        body: "Você não chegou a tempo. O conector voltou a ficar disponível.",
        payload: { reservationId: reservation.id },
        dedupeKey: `reservation-noshow-${reservation.id}`,
      });
    }
  }

  async markActiveForSession(reservationId: string) {
    const updated = await this.prisma.reservation.updateMany({
      where: {
        id: reservationId,
        status: { in: [ReservationStatus.CONFIRMED, ReservationStatus.ACTIVE] },
      },
      data: { status: ReservationStatus.ACTIVE },
    });
    if (updated.count === 0) return;
    const reservation = await this.prisma.reservation.findUnique({ where: { id: reservationId } });
    if (!reservation) return;
    await this.notifications.notify({
      userId: reservation.userId,
      type: NotificationType.RESERVATION_STARTED,
      title: "Reserva iniciada",
      body: "Sua recarga vinculada à reserva começou.",
      payload: { reservationId },
      dedupeKey: `reservation-started-${reservationId}`,
    });
  }

  async markCompletedForSession(reservationId: string) {
    await this.prisma.reservation.updateMany({
      where: {
        id: reservationId,
        status: { in: [ReservationStatus.CONFIRMED, ReservationStatus.ACTIVE] },
      },
      data: { status: ReservationStatus.COMPLETED },
    });
  }
}
