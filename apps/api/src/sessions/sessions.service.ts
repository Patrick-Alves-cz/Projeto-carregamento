import { Injectable, Logger } from "@nestjs/common";
import {
  assertSessionStatusTransition,
  ConflictError,
  ConnectorUnavailableError,
  ForbiddenError,
  NotFoundError,
  SessionStateError,
  ValidationError,
  isSessionActive,
} from "@evcharge/domain";
import type { ListSessionsQuery, StartSessionInput } from "@evcharge/shared";
import {
  ChargerStatus,
  ConnectorStatus,
  PaymentStatus,
  Prisma,
  SessionStatus,
  SessionStopReason,
  UserRole,
} from "@prisma/client";
import { PrismaService } from "../common/database/database.module";
import { TenantAccessService } from "../common/services/tenant-access.service";
import { AuthenticatedUser } from "../common/types/auth.types";
import { ChargingEventsService } from "../charging/charging-events.service";
import { ChargerProviderService } from "../charging/charger-provider.service";
import { WalletService } from "../wallet/wallet.service";

const sessionInclude = {
  user: { include: { profile: true } },
  vehicle: true,
  connector: {
    include: {
      charger: {
        include: {
          station: { include: { company: true } },
        },
      },
    },
  },
  tariff: true,
  payment: true,
} satisfies Prisma.ChargingSessionInclude;

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantAccess: TenantAccessService,
    private readonly chargerProviderService: ChargerProviderService,
    private readonly walletService: WalletService,
    private readonly events: ChargingEventsService,
  ) {}

  async start(input: StartSessionInput, user: AuthenticatedUser) {
    if (user.role !== UserRole.DRIVER) {
      throw new ForbiddenError("Apenas motoristas podem iniciar recargas");
    }

    if (input.idempotencyKey) {
      const existing = await this.prisma.chargingSession.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: sessionInclude,
      });
      if (existing) return this.enrichSession(existing);
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: input.vehicleId, userId: user.id },
    });
    if (!vehicle) throw new NotFoundError("Vehicle", input.vehicleId);

    const connectorSnapshot = await this.prisma.connector.findUnique({
      where: { id: input.connectorId },
      include: { charger: { include: { station: true } } },
    });
    if (!connectorSnapshot) throw new NotFoundError("Connector", input.connectorId);

    const { charger } = connectorSnapshot;
    if (charger.status === ChargerStatus.OFFLINE || charger.status === ChargerStatus.FAULTED) {
      throw new ConnectorUnavailableError("Carregador offline ou com falha");
    }

    const activeTariff = await this.prisma.tariff.findFirst({
      where: { companyId: charger.station.companyId, active: true },
      orderBy: { createdAt: "desc" },
    });
    if (!activeTariff) {
      throw new ValidationError("Nenhuma tarifa ativa encontrada para esta estação");
    }

    await this.walletService.assertMinimumBalance(user.id, activeTariff.minBalanceCents);

    const tariffSnapshot = {
      id: activeTariff.id,
      name: activeTariff.name,
      pricePerKwhCents: activeTariff.pricePerKwhCents,
      minBalanceCents: activeTariff.minBalanceCents,
      currency: activeTariff.currency,
    };

    let sessionId: string | null = null;

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const lock = await tx.connector.updateMany({
          where: {
            id: input.connectorId,
            status: ConnectorStatus.AVAILABLE,
            charger: {
              status: { in: [ChargerStatus.AVAILABLE, ChargerStatus.CHARGING] },
            },
          },
          data: { status: ConnectorStatus.PREPARING },
        });

        if (lock.count === 0) {
          throw new ConnectorUnavailableError("Conector indisponível ou já reservado");
        }

        const activeOnConnector = await tx.chargingSession.findFirst({
          where: {
            connectorId: input.connectorId,
            status: { in: [SessionStatus.PENDING, SessionStatus.ACTIVE, SessionStatus.PAUSED] },
          },
        });
        if (activeOnConnector) {
          throw new ConflictError("Já existe uma sessão ativa neste conector");
        }

        const session = await tx.chargingSession.create({
          data: {
            userId: user.id,
            vehicleId: input.vehicleId,
            connectorId: input.connectorId,
            tariffId: activeTariff.id,
            tariffSnapshot,
            status: SessionStatus.PENDING,
            idempotencyKey: input.idempotencyKey,
          },
        });

        await tx.charger.update({
          where: { id: charger.id },
          data: { status: ChargerStatus.PREPARING },
        });

        return session;
      });

      sessionId = created.id;

      await this.chargerProviderService.provider.startCharging(
        charger.id,
        connectorSnapshot.number,
        created.id,
      );

      const activeSession = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.chargingSession.update({
          where: { id: created.id },
          data: { status: SessionStatus.ACTIVE, startedAt: new Date() },
          include: sessionInclude,
        });

        await tx.connector.update({
          where: { id: input.connectorId },
          data: { status: ConnectorStatus.CHARGING },
        });

        await tx.charger.update({
          where: { id: charger.id },
          data: { status: ChargerStatus.CHARGING, lastSeenAt: new Date() },
        });

        return updated;
      });

      this.logger.log({
        action: "session.start",
        sessionId: activeSession.id,
        userId: user.id,
        connectorId: input.connectorId,
      });

      await this.events.publish({
        type: "session.started",
        entityType: "session",
        entityId: activeSession.id,
        timestamp: new Date(),
        payload: {
          sessionId: activeSession.id,
          status: SessionStatus.ACTIVE,
          userId: user.id,
          connectorId: input.connectorId,
        },
      });

      return this.enrichSession(activeSession);
    } catch (error) {
      if (sessionId) {
        await this.rollbackFailedStart(sessionId, input.connectorId, charger.id);
      } else {
        await this.prisma.connector.updateMany({
          where: { id: input.connectorId, status: ConnectorStatus.PREPARING },
          data: { status: ConnectorStatus.AVAILABLE },
        });
      }
      throw error;
    }
  }

  async stop(sessionId: string, user: AuthenticatedUser) {
    const session = await this.prisma.chargingSession.findUnique({
      where: { id: sessionId },
      include: sessionInclude,
    });
    if (!session) throw new NotFoundError("ChargingSession", sessionId);

    this.assertSessionAccess(session, user);

    if (!isSessionActive(session.status)) {
      throw new SessionStateError(`Sessão não está ativa (${session.status})`);
    }

    assertSessionStatusTransition(session.status, "COMPLETED");

    await this.chargerProviderService.provider.stopCharging(
      session.connector.chargerId,
      session.connector.number,
    );

    const completed = await this.finalizeSessionRecord(
      session,
      SessionStatus.COMPLETED,
      SessionStopReason.USER_STOP,
    );

    this.logger.log({ action: "session.stop", sessionId, userId: user.id });

    await this.events.publish({
      type: "session.completed",
      entityType: "session",
      entityId: sessionId,
      timestamp: new Date(),
      payload: {
        sessionId,
        status: SessionStatus.COMPLETED,
        userId: session.userId,
        connectorId: session.connectorId,
        energyKwh: Number(completed.energyKwh),
        costCents: completed.costCents,
      },
    });

    return completed;
  }

  async pause(sessionId: string, user: AuthenticatedUser) {
    const session = await this.getActiveSessionOrThrow(sessionId, user);
    assertSessionStatusTransition(session.status, "PAUSED");

    const updated = await this.prisma.chargingSession.update({
      where: { id: sessionId },
      data: { status: SessionStatus.PAUSED, pausedAt: new Date() },
      include: sessionInclude,
    });

    await this.events.publish({
      type: "session.paused",
      entityType: "session",
      entityId: sessionId,
      timestamp: new Date(),
      payload: { sessionId, status: SessionStatus.PAUSED },
    });

    return this.enrichSession(updated);
  }

  async resume(sessionId: string, user: AuthenticatedUser) {
    const session = await this.getActiveSessionOrThrow(sessionId, user);
    if (session.status !== SessionStatus.PAUSED) {
      throw new SessionStateError("Sessão não está pausada");
    }
    assertSessionStatusTransition("PAUSED", "ACTIVE");

    const updated = await this.prisma.chargingSession.update({
      where: { id: sessionId },
      data: { status: SessionStatus.ACTIVE, pausedAt: null },
      include: sessionInclude,
    });

    await this.events.publish({
      type: "session.resumed",
      entityType: "session",
      timestamp: new Date(),
      entityId: sessionId,
      payload: { sessionId, status: SessionStatus.ACTIVE },
    });

    return this.enrichSession(updated);
  }

  async findAll(query: ListSessionsQuery, user: AuthenticatedUser) {
    const where: Prisma.ChargingSessionWhereInput = {};
    const connectorWhere: Prisma.ConnectorWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.startedAt = {};
      if (query.from) where.startedAt.gte = query.from;
      if (query.to) where.startedAt.lte = query.to;
    }

    if (user.role === UserRole.DRIVER) {
      where.userId = user.id;
    } else if (this.tenantAccess.isSuperAdmin(user)) {
      if (query.userId) where.userId = query.userId;
    } else {
      connectorWhere.charger = {
        station: { companyId: { in: user.companyIds } },
      };
      if (query.userId) where.userId = query.userId;
    }

    if (query.stationId) {
      const stationScope = connectorWhere.charger?.station;
      connectorWhere.charger = stationScope
        ? { stationId: query.stationId, station: stationScope }
        : { stationId: query.stationId };
    }

    if (Object.keys(connectorWhere).length > 0) {
      where.connector = connectorWhere;
    }

    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      this.prisma.chargingSession.findMany({
        where,
        include: sessionInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take: query.limit,
      }),
      this.prisma.chargingSession.count({ where }),
    ]);

    return {
      items: items.map((s) => this.enrichSession(s)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async findOne(sessionId: string, user: AuthenticatedUser) {
    const session = await this.prisma.chargingSession.findUnique({
      where: { id: sessionId },
      include: {
        ...sessionInclude,
        meterValues: { orderBy: { timestamp: "desc" }, take: 20 },
      },
    });
    if (!session) throw new NotFoundError("ChargingSession", sessionId);
    this.assertSessionAccess(session, user);
    return this.enrichSession(session);
  }

  async getActiveSessionsForOperator(user: AuthenticatedUser) {
    this.tenantAccess.assertOperatorOrAbove(user);

    const where: Prisma.ChargingSessionWhereInput = {
      status: { in: [SessionStatus.PENDING, SessionStatus.ACTIVE, SessionStatus.PAUSED] },
    };

    if (!this.tenantAccess.isSuperAdmin(user)) {
      where.connector = {
        charger: { station: { companyId: { in: user.companyIds } } },
      };
    }

    const sessions = await this.prisma.chargingSession.findMany({
      where,
      include: sessionInclude,
      orderBy: { startedAt: "desc" },
    });

    return sessions.map((s) => this.enrichSession(s));
  }

  private async getActiveSessionOrThrow(sessionId: string, user: AuthenticatedUser) {
    const session = await this.prisma.chargingSession.findUnique({
      where: { id: sessionId },
      include: sessionInclude,
    });
    if (!session) throw new NotFoundError("ChargingSession", sessionId);
    this.assertSessionAccess(session, user);
    if (!isSessionActive(session.status)) {
      throw new SessionStateError("Sessão não está ativa");
    }
    return session;
  }

  private assertSessionAccess(
    session: { userId: string; connector: { charger: { station: { companyId: string } } } },
    user: AuthenticatedUser,
  ) {
    if (user.role === UserRole.DRIVER) {
      if (session.userId !== user.id) {
        throw new ForbiddenError("Acesso negado à sessão de outro usuário");
      }
      return;
    }

    if (this.tenantAccess.isSuperAdmin(user)) return;

    this.tenantAccess.assertCompanyAccess(user, session.connector.charger.station.companyId);
  }

  private async finalizeSessionRecord(
    session: Prisma.ChargingSessionGetPayload<{ include: typeof sessionInclude }>,
    status: SessionStatus,
    stopReason: SessionStopReason,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.chargingSession.update({
        where: { id: session.id },
        data: { status, stopReason, endedAt: new Date() },
        include: sessionInclude,
      });

      await tx.connector.update({
        where: { id: session.connectorId },
        data: { status: ConnectorStatus.AVAILABLE },
      });

      await tx.charger.update({
        where: { id: session.connector.chargerId },
        data: { status: ChargerStatus.AVAILABLE, lastSeenAt: new Date() },
      });

      const existingPayment = await tx.payment.findUnique({
        where: { sessionId: session.id },
      });

      if (!existingPayment && updated.costCents > 0) {
        await tx.payment.create({
          data: {
            sessionId: session.id,
            amountCents: updated.costCents,
            currency: "BRL",
            status: PaymentStatus.COMPLETED,
            method: "WALLET_DEMO",
          },
        });
      }

      return this.enrichSession(updated);
    });
  }

  private async rollbackFailedStart(
    sessionId: string,
    connectorId: string,
    chargerId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.chargingSession.updateMany({
        where: { id: sessionId, status: SessionStatus.PENDING },
        data: {
          status: SessionStatus.FAILED,
          endedAt: new Date(),
          stopReason: SessionStopReason.FAULT,
        },
      });
      await tx.connector.updateMany({
        where: { id: connectorId },
        data: { status: ConnectorStatus.AVAILABLE },
      });
      await tx.charger.updateMany({
        where: { id: chargerId },
        data: { status: ChargerStatus.AVAILABLE },
      });
    });
  }

  private enrichSession(
    session: Prisma.ChargingSessionGetPayload<{ include: typeof sessionInclude }> & {
      meterValues?: Array<{
        id: string;
        timestamp: Date;
        energyKwh: Prisma.Decimal;
        powerKw: Prisma.Decimal;
        voltage: Prisma.Decimal | null;
        current: Prisma.Decimal | null;
      }>;
    },
  ) {
    const durationSeconds = session.startedAt
      ? Math.floor(((session.endedAt ?? new Date()).getTime() - session.startedAt.getTime()) / 1000)
      : 0;

    return {
      ...session,
      energyKwh: Number(session.energyKwh),
      currentPowerKw: session.currentPowerKw ? Number(session.currentPowerKw) : null,
      currentVoltage: session.currentVoltage ? Number(session.currentVoltage) : null,
      currentAmperage: session.currentAmperage ? Number(session.currentAmperage) : null,
      durationSeconds,
      station: session.connector.charger.station,
      charger: session.connector.charger,
      connector: session.connector,
      userName: session.user.profile?.fullName ?? session.user.email,
      meterValues: session.meterValues?.map((mv) => ({
        ...mv,
        energyKwh: Number(mv.energyKwh),
        powerKw: Number(mv.powerKw),
        voltage: mv.voltage ? Number(mv.voltage) : null,
        current: mv.current ? Number(mv.current) : null,
      })),
    };
  }
}
