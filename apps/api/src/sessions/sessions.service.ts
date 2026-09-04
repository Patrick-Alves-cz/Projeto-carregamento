import { Injectable, Logger } from "@nestjs/common";
import {
  assertChargerStatusTransition,
  assertConnectorStatusTransition,
  assertSessionStatusTransition,
  assertVehicleConnectorCompatibility,
  ConflictError,
  ConnectorUnavailableError,
  ForbiddenError,
  NotFoundError,
  SessionStateError,
  isSessionActive,
  readTariffSnapshot,
} from "@evcharge/domain";
import type { ListSessionsQuery, StartSessionInput } from "@evcharge/shared";
import {
  ChargerStatus,
  ConnectorStatus,
  NotificationType,
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
import { NotificationsService } from "../notifications/notifications.service";
import { TariffsService } from "../tariffs/tariffs.service";
import { WalletService } from "../wallet/wallet.service";
import { AuditLogger } from "../common/logging/audit-logger";

const sessionInclude = {
  user: { include: { profile: true, wallet: true } },
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
  receipt: true,
} satisfies Prisma.ChargingSessionInclude;

const ACTIVE_STATUSES: SessionStatus[] = [
  SessionStatus.PENDING,
  SessionStatus.PREPARING,
  SessionStatus.ACTIVE,
  SessionStatus.PAUSED,
];

type SessionWithInclude = Prisma.ChargingSessionGetPayload<{ include: typeof sessionInclude }>;

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);
  private readonly audit = new AuditLogger(this.logger);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantAccess: TenantAccessService,
    private readonly chargerProviderService: ChargerProviderService,
    private readonly walletService: WalletService,
    private readonly events: ChargingEventsService,
    private readonly tariffsService: TariffsService,
    private readonly notifications: NotificationsService,
  ) {}

  async start(input: StartSessionInput, user: AuthenticatedUser) {
    if (user.role !== UserRole.DRIVER) {
      this.audit.warn("authorization.denied", { userId: user.id, action: "session.start" });
      throw new ForbiddenError("Apenas motoristas podem iniciar recargas");
    }

    if (input.idempotencyKey) {
      const existing = await this.prisma.chargingSession.findFirst({
        where: { userId: user.id, idempotencyKey: input.idempotencyKey },
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

    assertVehicleConnectorCompatibility(vehicle.connectorTypes, connectorSnapshot.type);

    const { charger } = connectorSnapshot;
    if (charger.status === ChargerStatus.OFFLINE || charger.status === ChargerStatus.FAULTED) {
      throw new ConnectorUnavailableError("Carregador offline ou com falha");
    }

    const { tariff: activeTariff, snapshot: tariffSnapshot } =
      await this.tariffsService.resolveForConnector(input.connectorId);

    await this.walletService.assertMinimumBalance(user.id, activeTariff.minBalanceCents);

    const companyId = charger.station.companyId;
    let sessionId: string | null = null;
    let lockedConnector = false;

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT id FROM connectors WHERE id = ${input.connectorId} FOR UPDATE
        `;

        const lock = await tx.connector.updateMany({
          where: {
            id: input.connectorId,
            status: ConnectorStatus.AVAILABLE,
            charger: {
              status: { in: [ChargerStatus.AVAILABLE, ChargerStatus.CHARGING, ChargerStatus.SUSPENDED] },
            },
          },
          data: { status: ConnectorStatus.PREPARING },
        });

        if (lock.count === 0) {
          this.audit.warn("connector.conflict", {
            userId: user.id,
            connectorId: input.connectorId,
          });
          throw new ConnectorUnavailableError("Conector indisponível ou já reservado");
        }
        lockedConnector = true;

        const activeOnConnector = await tx.chargingSession.findFirst({
          where: {
            connectorId: input.connectorId,
            status: { in: ACTIVE_STATUSES },
          },
        });
        if (activeOnConnector) {
          this.audit.warn("connector.conflict", {
            userId: user.id,
            connectorId: input.connectorId,
            sessionId: activeOnConnector.id,
          });
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

        assertSessionStatusTransition(session.status, SessionStatus.PREPARING);
        await tx.chargingSession.update({
          where: { id: session.id },
          data: { status: SessionStatus.PREPARING },
        });

        if (charger.status === ChargerStatus.AVAILABLE) {
          assertChargerStatusTransition(charger.status, ChargerStatus.PREPARING);
          await tx.charger.update({
            where: { id: charger.id },
            data: { status: ChargerStatus.PREPARING },
          });
        }

        return session;
      });

      sessionId = created.id;

      await this.chargerProviderService.provider.startCharging(
        charger.id,
        connectorSnapshot.number,
        created.id,
      );

      const activeSession = await this.prisma.$transaction(async (tx) => {
        const current = await tx.chargingSession.findUniqueOrThrow({ where: { id: created.id } });
        assertSessionStatusTransition(current.status, SessionStatus.ACTIVE);

        const updated = await tx.chargingSession.update({
          where: { id: created.id },
          data: { status: SessionStatus.ACTIVE, startedAt: new Date() },
          include: sessionInclude,
        });

        const connector = await tx.connector.findUniqueOrThrow({ where: { id: input.connectorId } });
        assertConnectorStatusTransition(connector.status, ConnectorStatus.CHARGING);
        await tx.connector.update({
          where: { id: input.connectorId },
          data: { status: ConnectorStatus.CHARGING },
        });

        const chargerRow = await tx.charger.findUniqueOrThrow({ where: { id: charger.id } });
        if (chargerRow.status !== ChargerStatus.CHARGING) {
          assertChargerStatusTransition(chargerRow.status, ChargerStatus.CHARGING);
          await tx.charger.update({
            where: { id: charger.id },
            data: { status: ChargerStatus.CHARGING, lastSeenAt: new Date() },
          });
        }

        return updated;
      });

      this.audit.info("session.start", {
        sessionId: activeSession.id,
        userId: user.id,
        connectorId: input.connectorId,
        companyId,
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
          companyId,
        },
      });

      if (tariffSnapshot.connectionFeeCents > 0) {
        await this.prisma.$transaction(async (tx) => {
          await this.walletService.debitForSession(tx, {
            userId: user.id,
            sessionId: activeSession.id,
            amountCents: tariffSnapshot.connectionFeeCents,
            description: "Taxa de conexão",
            idempotencyKey: `connection-${activeSession.id}`,
          });
          await tx.chargingSession.update({
            where: { id: activeSession.id },
            data: { costCents: { increment: tariffSnapshot.connectionFeeCents } },
          });
        });
      }

      await this.notifications.notify({
        userId: user.id,
        type: NotificationType.SESSION_STARTED,
        title: "Sessão iniciada",
        body: "Sua recarga foi iniciada.",
        payload: { sessionId: activeSession.id },
        dedupeKey: `session-started-${activeSession.id}`,
      });

      const started = await this.prisma.chargingSession.findUniqueOrThrow({
        where: { id: activeSession.id },
        include: sessionInclude,
      });
      return this.enrichSession(started);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        input.idempotencyKey
      ) {
        const existing = await this.prisma.chargingSession.findFirst({
          where: { userId: user.id, idempotencyKey: input.idempotencyKey },
          include: sessionInclude,
        });
        if (existing) return this.enrichSession(existing);
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        this.audit.warn("connector.conflict", {
          userId: user.id,
          connectorId: input.connectorId,
        });
        throw new ConnectorUnavailableError("Conector indisponível ou já reservado");
      }

      if (sessionId) {
        await this.rollbackFailedStart(sessionId, input.connectorId, charger.id);
      } else if (lockedConnector) {
        await this.prisma.connector.updateMany({
          where: { id: input.connectorId, status: ConnectorStatus.PREPARING },
          data: { status: ConnectorStatus.AVAILABLE },
        });
      }
      throw error;
    }
  }

  async stop(sessionId: string, user: AuthenticatedUser, idempotencyKey?: string) {
    const session = await this.prisma.chargingSession.findUnique({
      where: { id: sessionId },
      include: sessionInclude,
    });
    if (!session) throw new NotFoundError("ChargingSession", sessionId);

    this.assertSessionAccess(session, user);

    if (idempotencyKey && session.stopIdempotencyKey === idempotencyKey) {
      return this.enrichSession(session);
    }

    if (!isSessionActive(session.status)) {
      throw new SessionStateError(`Sessão não está ativa (${session.status})`);
    }

    assertSessionStatusTransition(session.status, "COMPLETED");

    const stopReason =
      user.role === UserRole.DRIVER ? SessionStopReason.USER_STOP : SessionStopReason.ADMIN;

    await this.chargerProviderService.provider.stopCharging(
      session.connector.chargerId,
      session.connector.number,
    );

    const completed = await this.finalizeSessionRecord(
      session,
      SessionStatus.COMPLETED,
      stopReason,
      idempotencyKey,
    );

    this.audit.info("session.stop", {
      sessionId,
      userId: user.id,
      companyId: session.connector.charger.station.companyId,
    });

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
        companyId: session.connector.charger.station.companyId,
        energyKwh: Number(completed.energyKwh),
        costCents: completed.costCents,
      },
    });

    await this.notifications.notify({
      userId: session.userId,
      type: NotificationType.SESSION_COMPLETED,
      title: "Recarga finalizada",
      body: "Sua recarga foi encerrada. O recibo já está disponível.",
      payload: { sessionId },
      dedupeKey: `session-completed-${sessionId}`,
    });

    return completed;
  }

  async pause(sessionId: string, user: AuthenticatedUser) {
    const session = await this.getOwnedSessionOrThrow(sessionId, user);
    if (session.status !== SessionStatus.ACTIVE) {
      throw new SessionStateError("Sessão não está ativa");
    }
    assertSessionStatusTransition(session.status, "PAUSED");

    await this.chargerProviderService.provider.pauseCharging(
      session.connector.chargerId,
      session.connector.number,
    );

    const connector = session.connector;
    assertConnectorStatusTransition(connector.status, ConnectorStatus.SUSPENDED);

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.chargingSession.update({
        where: { id: sessionId },
        data: { status: SessionStatus.PAUSED, pausedAt: new Date(), currentPowerKw: 0 },
        include: sessionInclude,
      });
      await tx.connector.update({
        where: { id: connector.id },
        data: { status: ConnectorStatus.SUSPENDED },
      });
      await this.syncChargerStatus(tx, connector.chargerId);
      return next;
    });

    await this.events.publish({
      type: "session.paused",
      entityType: "session",
      entityId: sessionId,
      timestamp: new Date(),
      payload: {
        sessionId,
        status: SessionStatus.PAUSED,
        userId: session.userId,
        connectorId: session.connectorId,
        companyId: session.connector.charger.station.companyId,
      },
    });

    await this.notifications.notify({
      userId: session.userId,
      type: NotificationType.SESSION_PAUSED,
      title: "Sessão pausada",
      body: "A recarga está pausada. Energia e custo não aumentam enquanto pausada.",
      payload: { sessionId },
      dedupeKey: `session-paused-${sessionId}-${updated.pausedAt?.toISOString() ?? "now"}`,
    });

    return this.enrichSession(updated);
  }

  async resume(sessionId: string, user: AuthenticatedUser) {
    const session = await this.getOwnedSessionOrThrow(sessionId, user);
    if (session.status !== SessionStatus.PAUSED) {
      throw new SessionStateError("Sessão não está pausada");
    }
    assertSessionStatusTransition("PAUSED", "ACTIVE");

    await this.chargerProviderService.provider.resumeCharging(
      session.connector.chargerId,
      session.connector.number,
    );

    assertConnectorStatusTransition(session.connector.status, ConnectorStatus.CHARGING);

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.chargingSession.update({
        where: { id: sessionId },
        data: { status: SessionStatus.ACTIVE, pausedAt: null },
        include: sessionInclude,
      });
      await tx.connector.update({
        where: { id: session.connectorId },
        data: { status: ConnectorStatus.CHARGING },
      });
      const charger = await tx.charger.findUniqueOrThrow({
        where: { id: session.connector.chargerId },
      });
      if (charger.status !== ChargerStatus.CHARGING) {
        assertChargerStatusTransition(charger.status, ChargerStatus.CHARGING);
        await tx.charger.update({
          where: { id: charger.id },
          data: { status: ChargerStatus.CHARGING, lastSeenAt: new Date() },
        });
      }
      return next;
    });

    await this.events.publish({
      type: "session.resumed",
      entityType: "session",
      timestamp: new Date(),
      entityId: sessionId,
      payload: {
        sessionId,
        status: SessionStatus.ACTIVE,
        userId: session.userId,
        connectorId: session.connectorId,
        companyId: session.connector.charger.station.companyId,
      },
    });

    await this.notifications.notify({
      userId: session.userId,
      type: NotificationType.SESSION_RESUMED,
      title: "Sessão retomada",
      body: "A recarga voltou a atualizar telemetria.",
      payload: { sessionId },
      dedupeKey: `session-resumed-${sessionId}-${updated.updatedAt.toISOString()}`,
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

  async getReceipt(sessionId: string, user: AuthenticatedUser) {
    const session = await this.findOne(sessionId, user);
    if (session.receipt) return session.receipt;
    throw new NotFoundError("Receipt", sessionId);
  }

  async getActiveSessionsForOperator(user: AuthenticatedUser) {
    this.tenantAccess.assertOperatorOrAbove(user);

    const where: Prisma.ChargingSessionWhereInput = {
      status: { in: ACTIVE_STATUSES },
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

  async reconcileOrphanSessions(maxAgeMs = Number(process.env.ORPHAN_SESSION_TIMEOUT_MS ?? 60_000)) {
    const cutoff = new Date(Date.now() - maxAgeMs);
    const orphans = await this.prisma.chargingSession.findMany({
      where: {
        status: { in: [SessionStatus.PENDING, SessionStatus.PREPARING] },
        createdAt: { lte: cutoff },
      },
      include: { connector: true },
    });

    for (const session of orphans) {
      try {
        assertSessionStatusTransition(session.status, SessionStatus.FAILED);
        await this.prisma.$transaction(async (tx) => {
          await tx.chargingSession.update({
            where: { id: session.id },
            data: {
              status: SessionStatus.FAILED,
              stopReason: SessionStopReason.TIMEOUT,
              endedAt: new Date(),
            },
          });
          const connector = await tx.connector.findUniqueOrThrow({
            where: { id: session.connectorId },
          });
          if (connector.status === ConnectorStatus.PREPARING) {
            assertConnectorStatusTransition(connector.status, ConnectorStatus.AVAILABLE);
            await tx.connector.update({
              where: { id: connector.id },
              data: { status: ConnectorStatus.AVAILABLE },
            });
          }
          await this.syncChargerStatus(tx, session.connector.chargerId);
        });

        this.audit.warn("session.orphan.reconciled", {
          sessionId: session.id,
          previousStatus: session.status,
        });
      } catch (error) {
        this.logger.error(`Failed to reconcile orphan session ${session.id}`, error);
      }
    }

    return orphans.length;
  }

  private async getOwnedSessionOrThrow(sessionId: string, user: AuthenticatedUser) {
    const session = await this.prisma.chargingSession.findUnique({
      where: { id: sessionId },
      include: sessionInclude,
    });
    if (!session) throw new NotFoundError("ChargingSession", sessionId);
    this.assertSessionAccess(session, user);
    return session;
  }

  private assertSessionAccess(
    session: { userId: string; connector: { charger: { station: { companyId: string } } } },
    user: AuthenticatedUser,
  ) {
    if (user.role === UserRole.DRIVER) {
      if (session.userId !== user.id) {
        this.audit.warn("authorization.denied", { userId: user.id, action: "session.access" });
        throw new ForbiddenError("Acesso negado à sessão de outro usuário");
      }
      return;
    }

    if (this.tenantAccess.isSuperAdmin(user)) return;

    this.tenantAccess.assertCompanyAccess(user, session.connector.charger.station.companyId);
  }

  private async finalizeSessionRecord(
    session: SessionWithInclude,
    status: SessionStatus,
    stopReason: SessionStopReason,
    stopIdempotencyKey?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.chargingSession.findUniqueOrThrow({ where: { id: session.id } });
      assertSessionStatusTransition(current.status, status);

      const updated = await tx.chargingSession.update({
        where: { id: session.id },
        data: { status, stopReason, endedAt: new Date(), stopIdempotencyKey },
        include: sessionInclude,
      });

      const connector = await tx.connector.findUniqueOrThrow({ where: { id: session.connectorId } });
      if (connector.status !== ConnectorStatus.AVAILABLE) {
        assertConnectorStatusTransition(connector.status, ConnectorStatus.AVAILABLE);
        await tx.connector.update({
          where: { id: session.connectorId },
          data: { status: ConnectorStatus.AVAILABLE },
        });
      }

      await this.syncChargerStatus(tx, session.connector.chargerId);

      const existingPayment = await tx.payment.findUnique({
        where: { sessionId: session.id },
      });

      if (!existingPayment && updated.costCents > 0) {
        await tx.payment.create({
          data: {
            userId: session.userId,
            sessionId: session.id,
            amountCents: updated.costCents,
            currency: "BRL",
            status: PaymentStatus.COMPLETED,
            method: "WALLET_DEMO",
          },
        });
      }

      await this.ensureReceipt(tx, updated);

      return this.enrichSession(
        await tx.chargingSession.findUniqueOrThrow({
          where: { id: session.id },
          include: sessionInclude,
        }),
      );
    });
  }

  private async syncChargerStatus(tx: Prisma.TransactionClient, chargerId: string) {
    const charger = await tx.charger.findUniqueOrThrow({
      where: { id: chargerId },
      include: { connectors: true },
    });
    const connectors = charger.connectors;

    let next: ChargerStatus = ChargerStatus.AVAILABLE;
    if (connectors.some((c) => c.status === ConnectorStatus.CHARGING)) {
      next = ChargerStatus.CHARGING;
    } else if (connectors.some((c) => c.status === ConnectorStatus.PREPARING)) {
      next = ChargerStatus.PREPARING;
    } else if (connectors.some((c) => c.status === ConnectorStatus.SUSPENDED)) {
      next = ChargerStatus.SUSPENDED;
    } else if (connectors.some((c) => c.status === ConnectorStatus.FINISHING)) {
      next = ChargerStatus.FINISHING;
    } else if (connectors.every((c) => c.status === ConnectorStatus.FAULTED) && connectors.length > 0) {
      next = ChargerStatus.FAULTED;
    } else if (
      connectors.every((c) => c.status === ConnectorStatus.UNAVAILABLE) &&
      charger.status === ChargerStatus.OFFLINE
    ) {
      next = ChargerStatus.OFFLINE;
    }

    if (next === charger.status) {
      await tx.charger.update({
        where: { id: chargerId },
        data: { lastSeenAt: new Date() },
      });
      return;
    }

    assertChargerStatusTransition(charger.status, next);
    await tx.charger.update({
      where: { id: chargerId },
      data: { status: next, lastSeenAt: new Date() },
    });
  }

  private async rollbackFailedStart(
    sessionId: string,
    connectorId: string,
    chargerId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const session = await tx.chargingSession.findUnique({ where: { id: sessionId } });
      if (session && (session.status === SessionStatus.PENDING || session.status === SessionStatus.PREPARING)) {
        assertSessionStatusTransition(session.status, SessionStatus.FAILED);
        await tx.chargingSession.update({
          where: { id: sessionId },
          data: {
            status: SessionStatus.FAILED,
            endedAt: new Date(),
            stopReason: SessionStopReason.FAULT,
          },
        });
      }
      const connector = await tx.connector.findUnique({ where: { id: connectorId } });
      if (connector && connector.status === ConnectorStatus.PREPARING) {
        assertConnectorStatusTransition(connector.status, ConnectorStatus.AVAILABLE);
        await tx.connector.update({
          where: { id: connectorId },
          data: { status: ConnectorStatus.AVAILABLE },
        });
      }
      await this.syncChargerStatus(tx, chargerId);
    });
  }

  private async ensureReceipt(tx: Prisma.TransactionClient, session: SessionWithInclude) {
    const existing = await tx.receipt.findUnique({ where: { sessionId: session.id } });
    if (existing) return existing;
    const snapshot = readTariffSnapshot(session.tariffSnapshot);
    const startedAt = session.startedAt;
    const endedAt = session.endedAt ?? new Date();
    const durationSeconds = startedAt
      ? Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000))
      : 0;
    const dateKey = endedAt.toISOString().slice(0, 10).replace(/-/g, "");
    const payload = {
      brand: "EV Charge",
      station: {
        name: session.connector.charger.station.name,
        address: session.connector.charger.station.address,
      },
      charger: { serialNumber: session.connector.charger.serialNumber },
      connector: { number: session.connector.number, type: session.connector.type },
      vehicle: { brand: session.vehicle.brand, model: session.vehicle.model },
      startedAt,
      endedAt,
      durationSeconds,
      energyKwh: Number(session.energyKwh),
      tariff: snapshot,
      connectionFeeCents: snapshot?.connectionFeeCents ?? 0,
      idleFeeCents: snapshot?.idleFeeCents ?? 0,
      totalCents: session.costCents,
      paymentMethod: "Carteira DEMO",
    };
    return tx.receipt.create({
      data: {
        number: `EV-${dateKey}-${session.id.slice(-6).toUpperCase()}`,
        sessionId: session.id,
        userId: session.userId,
        payload,
      },
    });
  }

  private enrichSession(
    session: SessionWithInclude & {
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

    const snapshot = readTariffSnapshot(session.tariffSnapshot);
    const walletBalanceCents = session.user.wallet?.balanceCents ?? 0;
    const remainingCents = Math.max(0, walletBalanceCents);
    const lowBalance = snapshot ? remainingCents < snapshot.minBalanceCents : false;

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
      tariffSnapshot: snapshot ?? session.tariffSnapshot,
      walletBalanceCents,
      remainingCents,
      lowBalance,
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
