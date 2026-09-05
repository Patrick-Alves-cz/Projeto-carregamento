import { Injectable, Logger } from "@nestjs/common";
import {
  assertChargerStatusTransition,
  assertConnectorStatusTransition,
  assertSessionStatusTransition,
  assertVehicleConnectorCompatibility,
  calculateCurrentCost,
  calculateFinalCost,
  ConflictError,
  ConnectorUnavailableError,
  ForbiddenError,
  NotFoundError,
  SessionStateError,
  ValidationError,
  isSessionActive,
  readTariffSnapshot,
  sessionVisualState,
  communicationFreshness,
} from "@evcharge/domain";
import type { ListSessionsQuery, StartSessionInput } from "@evcharge/shared";
import {
  ChargerStatus,
  ConnectorStatus,
  NotificationType,
  PaymentStatus,
  Prisma,
  ReservationStatus,
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
import { ReservationsService } from "../reservations/reservations.service";
import { WaitlistService } from "../reservations/waitlist.service";
import { TariffsService } from "../tariffs/tariffs.service";
import { WalletService } from "../wallet/wallet.service";
import { SessionBillingService } from "../payments/session-billing.service";
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
  SessionStatus.CHARGING_COMPLETE,
  SessionStatus.IDLE,
];

type SessionWithInclude = Prisma.ChargingSessionGetPayload<{ include: typeof sessionInclude }>;

function makeIdTag(sessionId: string): string {
  const compact = sessionId.replace(/[^a-zA-Z0-9]/g, "");
  return `S${compact.slice(-19)}`.slice(0, 20);
}

function isDeferred(outcome: unknown): outcome is { deferred: true } {
  return Boolean(outcome && typeof outcome === "object" && "deferred" in outcome && (outcome as { deferred?: boolean }).deferred);
}

function durationMinutes(startedAt: Date | null | undefined, endedAt = new Date()) {
  if (!startedAt) return 0;
  return Math.max(0, (endedAt.getTime() - startedAt.getTime()) / 60_000);
}

function idleMinutes(session: { idleStartedAt?: Date | null; endedAt?: Date | null }) {
  if (!session.idleStartedAt) return 0;
  const end = session.endedAt ?? new Date();
  return Math.max(0, (end.getTime() - session.idleStartedAt.getTime()) / 60_000);
}

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
    private readonly reservations: ReservationsService,
    private readonly waitlist: WaitlistService,
    private readonly billing: SessionBillingService,
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
    const maintenance = await this.prisma.maintenanceWindow.findFirst({
      where: {
        status: "ACTIVE",
        startsAt: { lte: new Date() },
        endsAt: { gte: new Date() },
        OR: [
          { stationId: charger.stationId },
          { chargerId: charger.id },
          { connectorId: connectorSnapshot.id },
        ],
      },
    });
    if (maintenance) {
      throw new ConnectorUnavailableError("Temporariamente indisponível para manutenção.", "MAINTENANCE");
    }
    if (charger.status === ChargerStatus.OFFLINE || charger.status === ChargerStatus.FAULTED) {
      throw new ConnectorUnavailableError(
        "Este carregador está temporariamente indisponível.",
        charger.status === ChargerStatus.FAULTED ? "CHARGER_FAULTED" : "CHARGER_OFFLINE",
      );
    }

    const reservation = input.reservationId
      ? await this.prisma.reservation.findUnique({ where: { id: input.reservationId } })
      : null;
    if (input.reservationId && !reservation) throw new NotFoundError("Reservation", input.reservationId);
    if (reservation) {
      if (reservation.userId !== user.id) throw new ForbiddenError("Reserva de outro usuário");
      if (
        reservation.status !== ReservationStatus.CONFIRMED &&
        reservation.status !== ReservationStatus.ACTIVE
      ) {
        throw new ValidationError("Esta reserva não está disponível para iniciar");
      }
      if (reservation.stationId !== charger.stationId) {
        throw new ValidationError("Reserva não pertence a esta estação");
      }
      if (reservation.connectorId && reservation.connectorId !== input.connectorId) {
        throw new ValidationError("Reserva não pertence a este conector");
      }
      const now = Date.now();
      const earlyMinutes = Number(process.env.RESERVATION_EARLY_CHECKIN_MINUTES ?? 10);
      if (now < reservation.startAt.getTime() - earlyMinutes * 60_000) {
        throw new ValidationError("Você ainda não está na janela para iniciar esta reserva.", "RESERVATION_WINDOW");
      }
      if (reservation.graceUntil && now > reservation.graceUntil.getTime()) {
        throw new ValidationError("A janela da reserva já expirou.", "RESERVATION_EXPIRED");
      }
    }

    const { tariff: activeTariff, snapshot: tariffSnapshot } =
      await this.tariffsService.resolveForConnector(input.connectorId);

    if ((input.paymentKind ?? "WALLET") !== "CARD") {
      await this.walletService.assertMinimumBalance(user.id, activeTariff.minBalanceCents);
    }

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
            status: {
              in: reservation
                ? [ConnectorStatus.AVAILABLE, ConnectorStatus.RESERVED]
                : [ConnectorStatus.AVAILABLE],
            },
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
            reservationId: reservation?.id,
            paymentKind: input.paymentKind ?? "WALLET",
          },
        });

        const idTag = makeIdTag(session.id);
        assertSessionStatusTransition(session.status, SessionStatus.PREPARING);
        await tx.chargingSession.update({
          where: { id: session.id },
          data: { status: SessionStatus.PREPARING, idTag },
        });
        if (this.chargerProviderService.usesOcpp(charger.providerId)) {
          await tx.ocppAuthorization.create({
            data: {
              idTag,
              sessionId: session.id,
              expiresAt: new Date(Date.now() + 15 * 60_000),
            },
          });
        }

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
      const idTag = created.idTag ?? makeIdTag(created.id);

      await this.prisma.$transaction(async (tx) => {
        await this.billing.authorizeInTx(tx, {
          userId: user.id,
          sessionId: created.id,
          paymentKind: input.paymentKind ?? "WALLET",
          paymentMethodId: input.paymentMethodId,
          snapshot: tariffSnapshot,
        });
      });

      let outcome: unknown;
      try {
        outcome = await this.chargerProviderService.startCharging(
          charger.id,
          connectorSnapshot.number,
          created.id,
          { idTag },
        );
      } catch {
        throw new ConnectorUnavailableError(
          "Não foi possível iniciar o carregamento. Tente novamente ou escolha outro conector.",
          "REMOTE_START_REJECTED",
        );
      }

      const afterCommand = await this.prisma.chargingSession.findUniqueOrThrow({
        where: { id: created.id },
        include: sessionInclude,
      });

      if (isDeferred(outcome)) {
        await this.events.publish({
          type: "session.remote_start_accepted",
          entityType: "session",
          entityId: afterCommand.id,
          timestamp: new Date(),
          payload: {
            sessionId: afterCommand.id,
            status: afterCommand.status,
            userId: user.id,
            connectorId: input.connectorId,
            companyId,
          },
        });
        return this.enrichSession(afterCommand);
      }

      const activeSession = await this.prisma.$transaction(async (tx) => {
        const current = await tx.chargingSession.findUniqueOrThrow({ where: { id: created.id } });
        if (current.status === SessionStatus.ACTIVE) {
          return tx.chargingSession.findUniqueOrThrow({
            where: { id: created.id },
            include: sessionInclude,
          });
        }
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

      if (tariffSnapshot.connectionFeeCents > 0 && activeSession.billingStatus === "NONE") {
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

      if (reservation) {
        await this.reservations.markActiveForSession(reservation.id);
      }

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

    const outcome = await this.chargerProviderService.stopCharging(
      session.connector.chargerId,
      session.connector.number,
    );

    if (isDeferred(outcome)) {
      const pending = await this.prisma.chargingSession.update({
        where: { id: sessionId },
        data: { remoteStopPending: true, stopIdempotencyKey: idempotencyKey },
        include: sessionInclude,
      });
      await this.events.publish({
        type: "session.remote_stop_requested",
        entityType: "session",
        entityId: sessionId,
        timestamp: new Date(),
        payload: {
          sessionId,
          status: pending.status,
          userId: session.userId,
          connectorId: session.connectorId,
          companyId: session.connector.charger.station.companyId,
        },
      });
      return this.enrichSession(pending);
    }

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

    await this.chargerProviderService.pauseCharging(
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

    await this.chargerProviderService.resumeCharging(
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
    if (query.vehicleId) where.vehicleId = query.vehicleId;

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

  async confirmStartFromEquipment(sessionId: string, timestamp: Date) {
    const session = await this.prisma.chargingSession.findUnique({
      where: { id: sessionId },
      include: sessionInclude,
    });
    if (!session) throw new NotFoundError("ChargingSession", sessionId);
    if (session.status === SessionStatus.ACTIVE) {
      return this.enrichSession(session);
    }

    const started = await this.prisma.$transaction(async (tx) => {
      const current = await tx.chargingSession.findUniqueOrThrow({ where: { id: sessionId } });
      if (current.status === SessionStatus.ACTIVE) {
        return tx.chargingSession.findUniqueOrThrow({ where: { id: sessionId }, include: sessionInclude });
      }
      assertSessionStatusTransition(current.status, SessionStatus.ACTIVE);
      const updated = await tx.chargingSession.update({
        where: { id: sessionId },
        data: { status: SessionStatus.ACTIVE, startedAt: timestamp },
        include: sessionInclude,
      });
      const connector = await tx.connector.findUniqueOrThrow({ where: { id: session.connectorId } });
      if (connector.status !== ConnectorStatus.CHARGING) {
        try {
          assertConnectorStatusTransition(connector.status, ConnectorStatus.CHARGING);
        } catch {
          // equipment confirmation is the source of truth
        }
        await tx.connector.update({
          where: { id: session.connectorId },
          data: { status: ConnectorStatus.CHARGING },
        });
      }
      const chargerRow = await tx.charger.findUniqueOrThrow({ where: { id: session.connector.chargerId } });
      if (chargerRow.status !== ChargerStatus.CHARGING && chargerRow.status !== ChargerStatus.OFFLINE) {
        try {
          assertChargerStatusTransition(chargerRow.status, ChargerStatus.CHARGING);
        } catch {
          // keep charger status if transition is illegal
        }
        await tx.charger.update({
          where: { id: session.connector.chargerId },
          data: { status: ChargerStatus.CHARGING, lastSeenAt: timestamp },
        });
      }
      return updated;
    });

    const snapshot = readTariffSnapshot(started.tariffSnapshot);
    if (snapshot && snapshot.connectionFeeCents > 0 && started.costCents === 0 && started.billingStatus === "NONE") {
      await this.prisma.$transaction(async (tx) => {
        await this.walletService.debitForSession(tx, {
          userId: started.userId,
          sessionId: started.id,
          amountCents: snapshot.connectionFeeCents,
          description: "Taxa de conexão",
          idempotencyKey: `connection-${started.id}`,
        });
        await tx.chargingSession.update({
          where: { id: started.id },
          data: { costCents: { increment: snapshot.connectionFeeCents } },
        });
      });
    }

    await this.events.publish({
      type: "session.started",
      entityType: "session",
      entityId: started.id,
      timestamp,
      payload: {
        sessionId: started.id,
        status: SessionStatus.ACTIVE,
        userId: started.userId,
        connectorId: started.connectorId,
        companyId: started.connector.charger.station.companyId,
      },
    });

    await this.notifications.notify({
      userId: started.userId,
      type: NotificationType.SESSION_STARTED,
      title: "Sessão iniciada",
      body: "Sua recarga foi iniciada.",
      payload: { sessionId: started.id },
      dedupeKey: `session-started-${started.id}`,
    });

    if (started.reservationId) {
      await this.reservations.markActiveForSession(started.reservationId);
    }

    return this.enrichSession(
      await this.prisma.chargingSession.findUniqueOrThrow({
        where: { id: started.id },
        include: sessionInclude,
      }),
    );
  }

  async confirmStopFromEquipment(
    sessionId: string,
    input: { energyKwh: number; timestamp: Date; reason?: string },
  ) {
    const session = await this.prisma.chargingSession.findUnique({
      where: { id: sessionId },
      include: sessionInclude,
    });
    if (!session) throw new NotFoundError("ChargingSession", sessionId);

    if (
      session.status === SessionStatus.COMPLETED ||
      session.status === SessionStatus.FAILED ||
      session.status === SessionStatus.CANCELLED
    ) {
      return this.enrichSession(session);
    }

    const energyKwh = Math.max(Number(session.energyKwh), input.energyKwh);
    const snapshot = readTariffSnapshot(session.tariffSnapshot);
    const breakdown = snapshot
      ? calculateFinalCost({
          energyKwh,
          durationMinutes: durationMinutes(session.startedAt, input.timestamp),
          idleMinutes: idleMinutes(session),
          snapshot,
        })
      : null;
    const costCents = Math.max(session.costCents, breakdown?.totalCents ?? session.costCents);
    const hold = await this.prisma.walletHold.findUnique({ where: { sessionId } });
    const auth = await this.prisma.paymentAuthorization.findUnique({ where: { sessionId } });
    const prepaid = Boolean(hold || auth);
    const deltaCents = prepaid ? 0 : costCents - session.costCents;
    await this.prisma.$transaction(async (tx) => {
      await tx.chargingSession.update({
        where: { id: sessionId },
        data: { energyKwh, costCents, remoteStopPending: false },
      });
      if (deltaCents > 0) {
        await this.walletService.debitForSession(tx, {
          userId: session.userId,
          sessionId,
          amountCents: deltaCents,
          description: "Ajuste final da recarga",
          idempotencyKey: `stop-adjust-${sessionId}-${costCents}`,
        });
      }
    });

    const stopReason =
      input.reason === "Remote" || input.reason === "Local"
        ? SessionStopReason.USER_STOP
        : session.stopReason ?? SessionStopReason.USER_STOP;

    const completed = await this.finalizeSessionRecord(
      await this.prisma.chargingSession.findUniqueOrThrow({
        where: { id: sessionId },
        include: sessionInclude,
      }),
      SessionStatus.COMPLETED,
      stopReason,
    );

    await this.events.publish({
      type: "session.stopped",
      entityType: "session",
      entityId: sessionId,
      timestamp: input.timestamp,
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

    await this.events.publish({
      type: "session.completed",
      entityType: "session",
      entityId: sessionId,
      timestamp: input.timestamp,
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

      try {
        await this.billing.finalizeInTx(tx, session.id, updated.costCents);
      } catch {
        const chargerId = session.connector.chargerId;
        const openKey = `PAYMENT_FAILURE:${chargerId}:none:${session.id}`;
        const existingIssue = await tx.incident.findUnique({ where: { openKey } });
        if (!existingIssue) {
          await tx.incident.create({
            data: {
              companyId: session.connector.charger.station.companyId,
              stationId: session.connector.charger.stationId,
              chargerId,
              sessionId: session.id,
              type: "PAYMENT_FAILURE",
              severity: "HIGH",
              title: "Cobrança pendente da sessão",
              description: "A sessão terminou, mas a cobrança final não foi liquidada.",
              openKey,
            },
          });
        }
      }

      const existingPayment = await tx.payment.findUnique({
        where: { sessionId: session.id },
      });

      if (!existingPayment && updated.costCents > 0) {
        await tx.payment.create({
          data: {
            userId: session.userId,
            sessionId: session.id,
            companyId: session.connector.charger.station.companyId,
            amountCents: updated.costCents,
            currency: "BRL",
            status: PaymentStatus.COMPLETED,
            method: updated.paymentKind === "WALLET" ? "WALLET_DEMO" : updated.paymentKind,
            kind: updated.paymentKind,
            provider: "internal",
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
    }).then(async (completed) => {
      try {
        if (session.reservationId) {
          await this.reservations.markCompletedForSession(session.reservationId);
        }
        await this.waitlist.notifyNext(session.connectorId);
      } catch (error) {
        this.logger.error(`Post-stop reservation/waitlist update failed for ${session.id}`, error);
      }
      return completed;
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
      await this.billing.releaseInTx(tx, sessionId);
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
    const breakdown = snapshot
      ? calculateFinalCost({
          energyKwh: Number(session.energyKwh),
          durationMinutes: durationMinutes(startedAt, endedAt),
          idleMinutes: idleMinutes(session),
          snapshot,
        })
      : null;
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
      pricePerKwhCents: snapshot?.pricePerKwhCents ?? 0,
      pricePerMinuteCents: snapshot?.pricePerMinuteCents ?? 0,
      connectionFeeCents: breakdown?.sessionFeeCents ?? snapshot?.connectionFeeCents ?? 0,
      idleFeeCents: breakdown?.idleCents ?? snapshot?.idleFeeCents ?? 0,
      parkingCents: breakdown?.parkingCents ?? 0,
      energyCents: breakdown?.energyCents ?? 0,
      timeCents: breakdown?.timeCents ?? 0,
      totalCents: session.costCents,
      paymentMethod: session.paymentKind === "WALLET" ? "Carteira DEMO" : session.paymentKind,
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
    const freshness = communicationFreshness({
      connected: session.connector.charger.status !== "OFFLINE",
      lastMessageAt: session.lastMeterAt ?? session.connector.charger.lastMessageAt,
      lastSeenAt: session.connector.charger.lastSeenAt,
    });
    const costBreakdown = snapshot
      ? calculateCurrentCost({
          energyKwh: Number(session.energyKwh),
          durationMinutes: durationMinutes(session.startedAt, session.endedAt ?? new Date()),
          idleMinutes: idleMinutes(session),
          chargingComplete: session.status === SessionStatus.CHARGING_COMPLETE || session.status === SessionStatus.IDLE,
          snapshot,
        })
      : null;

    return {
      ...session,
      energyKwh: Number(session.energyKwh),
      currentPowerKw: session.currentPowerKw ? Number(session.currentPowerKw) : null,
      currentVoltage: session.currentVoltage ? Number(session.currentVoltage) : null,
      currentAmperage: session.currentAmperage ? Number(session.currentAmperage) : null,
      socPercent: session.socPercent != null ? Number(session.socPercent) : null,
      durationSeconds,
      station: session.connector.charger.station,
      charger: session.connector.charger,
      connector: session.connector,
      userName: session.user.profile?.fullName ?? session.user.email,
      tariffSnapshot: snapshot ?? session.tariffSnapshot,
      walletBalanceCents,
      remainingCents,
      lowBalance,
      costBreakdown,
      visual: sessionVisualState({
        status: session.status,
        communicationStale:
          freshness === "STALE" || freshness === "OFFLINE",
        chargingComplete: session.status === SessionStatus.CHARGING_COMPLETE,
        idle: session.status === SessionStatus.IDLE,
        billingStatus: session.billingStatus,
      }),
      freshness,
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
