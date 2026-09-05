import { Injectable, Logger } from "@nestjs/common";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@evcharge/domain";
import type { JoinWaitlistInput } from "@evcharge/shared";
import { ConnectorStatus, ConnectorType, NotificationType, UserRole, WaitlistScope, WaitlistStatus } from "@prisma/client";
import { PrismaService } from "../common/database/database.module";
import { TenantAccessService } from "../common/services/tenant-access.service";
import { AuthenticatedUser } from "../common/types/auth.types";
import { AuditLogger } from "../common/logging/audit-logger";
import { NotificationsService } from "../notifications/notifications.service";
import { ChargingEventsService } from "../charging/charging-events.service";
import { WaitTimeEstimator } from "../operations/wait-time.estimator";

const OPEN: WaitlistStatus[] = [WaitlistStatus.WAITING, WaitlistStatus.NOTIFIED];

@Injectable()
export class WaitlistService {
  private readonly audit = new AuditLogger(new Logger(WaitlistService.name));
  private readonly claimMinutes = Number(process.env.WAITLIST_CLAIM_MINUTES ?? 5);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantAccessService,
    private readonly notifications: NotificationsService,
    private readonly events: ChargingEventsService,
    private readonly eta: WaitTimeEstimator,
  ) {}

  async join(user: AuthenticatedUser, input: JoinWaitlistInput | string) {
    if (user.role !== UserRole.DRIVER) throw new ForbiddenError("Somente motoristas entram na fila");
    const body: JoinWaitlistInput = typeof input === "string" ? { connectorId: input } : input;
    const connector = body.connectorId
      ? await this.prisma.connector.findUnique({
          where: { id: body.connectorId },
          include: { charger: { include: { station: true } } },
        })
      : null;
    if (body.connectorId && !connector) throw new NotFoundError("Connector", body.connectorId);

    const stationId = body.stationId ?? connector?.charger.stationId;
    if (!stationId) throw new ValidationError("Estação obrigatória para entrar na fila");
    const station = await this.prisma.station.findUnique({ where: { id: stationId } });
    if (!station) throw new NotFoundError("Station", stationId);

    const now = new Date();
    const maintenance = await this.prisma.maintenanceWindow.findFirst({
      where: {
        status: "ACTIVE",
        startsAt: { lte: now },
        endsAt: { gte: now },
        OR: [
          { stationId },
          connector?.chargerId ? { chargerId: connector.chargerId } : undefined,
          connector?.id ? { connectorId: connector.id } : undefined,
        ].filter(Boolean) as Array<{ stationId: string } | { chargerId: string } | { connectorId: string }>,
      },
    });
    if (maintenance) {
      throw new ValidationError("Temporariamente indisponível para manutenção.", "MAINTENANCE");
    }

    const scope =
      body.scope ??
      (body.connectorId ? WaitlistScope.CONNECTOR : body.connectorType ? WaitlistScope.CONNECTOR_TYPE : WaitlistScope.STATION);
    const connectorType = (body.connectorType ?? connector?.type) as ConnectorType | undefined;
    if (connector && connector.status === ConnectorStatus.AVAILABLE && scope === WaitlistScope.CONNECTOR) {
      throw new ValidationError("Este conector já está disponível");
    }

    const existing = await this.prisma.chargingWaitlist.findFirst({
      where: {
        userId: user.id,
        stationId,
        status: { in: OPEN },
        ...(scope === WaitlistScope.CONNECTOR ? { connectorId: body.connectorId } : {}),
        ...(scope === WaitlistScope.CONNECTOR_TYPE ? { connectorType, scope } : {}),
        ...(scope === WaitlistScope.STATION ? { scope } : {}),
      },
    });
    if (existing) return this.withEta(existing);

    const last = await this.prisma.chargingWaitlist.findFirst({
      where: {
        stationId,
        status: { in: OPEN },
        ...(scope === WaitlistScope.CONNECTOR ? { connectorId: body.connectorId } : {}),
        ...(scope === WaitlistScope.CONNECTOR_TYPE ? { connectorType } : {}),
      },
      orderBy: { position: "desc" },
    });
    const eta = await this.eta.forEntry({
      stationId,
      connectorId: connector?.id,
      connectorType,
      userId: user.id,
    });
    const entry = await this.prisma.chargingWaitlist.create({
      data: {
        userId: user.id,
        companyId: station.companyId,
        stationId,
        connectorId: connector?.id,
        connectorType: connectorType ?? null,
        scope,
        position: (last?.position ?? 0) + 1,
        status: WaitlistStatus.WAITING,
        etaMinutes: eta.minutes,
      },
    });
    this.audit.info("waitlist.joined", { waitlistId: entry.id, userId: user.id, stationId, scope });
    await this.notifications.notify({
      userId: user.id,
      type: NotificationType.WAITLIST_JOINED,
      title: "Você entrou na fila",
      body: eta.available
        ? `Sua posição é ${entry.position}. Espera estimada: ${eta.label}.`
        : `Sua posição é ${entry.position}.`,
      payload: { waitlistId: entry.id, stationId, connectorId: connector?.id ?? null },
      dedupeKey: `waitlist-joined-${entry.id}`,
    });
    await this.events.publish({
      type: "waitlist.joined",
      entityType: "waitlist",
      entityId: entry.id,
      timestamp: new Date(),
      payload: { waitlistId: entry.id, userId: user.id, connectorId: connector?.id ?? null, companyId: entry.companyId },
    });
    return this.withEta(entry);
  }

  async mine(user: AuthenticatedUser) {
    if (user.role !== UserRole.DRIVER) throw new ForbiddenError("Somente motoristas");
    const items = await this.prisma.chargingWaitlist.findMany({
      where: { userId: user.id },
      include: { station: true, connector: true },
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(items.map((item) => this.withEta(item)));
  }

  async listAdmin(user: AuthenticatedUser) {
    this.tenant.assertOperatorOrAbove(user);
    return this.prisma.chargingWaitlist.findMany({
      where: this.tenant.isSuperAdmin(user) ? {} : { companyId: { in: user.companyIds } },
      include: { station: true, connector: true, user: { include: { profile: true } } },
      orderBy: [{ stationId: "asc" }, { position: "asc" }],
      take: 200,
    });
  }

  async cancel(user: AuthenticatedUser, id: string) {
    const entry = await this.prisma.chargingWaitlist.findUnique({ where: { id } });
    if (!entry) throw new NotFoundError("Waitlist", id);
    if (user.role === UserRole.DRIVER && entry.userId !== user.id) throw new ForbiddenError("Fila de outro usuário");
    if (user.role !== UserRole.DRIVER) this.tenant.assertCompanyAccess(user, entry.companyId);
    return this.prisma.chargingWaitlist.update({
      where: { id },
      data: { status: WaitlistStatus.CANCELLED },
    });
  }

  async claim(user: AuthenticatedUser, id: string) {
    if (user.role !== UserRole.DRIVER) throw new ForbiddenError("Somente motoristas");
    const entry = await this.prisma.chargingWaitlist.findFirst({
      where: { id, userId: user.id, status: WaitlistStatus.NOTIFIED },
    });
    if (!entry) throw new ConflictError("Esta chamada da fila não está mais válida");
    if (entry.expiresAt && entry.expiresAt < new Date()) {
      await this.prisma.chargingWaitlist.update({ where: { id }, data: { status: WaitlistStatus.EXPIRED } });
      throw new ConflictError("Janela de confirmação expirada");
    }
    return this.prisma.chargingWaitlist.update({
      where: { id },
      data: { status: WaitlistStatus.CLAIMED, claimedAt: new Date() },
    });
  }

  async notifyNext(connectorId: string) {
    const connector = await this.prisma.connector.findUnique({
      where: { id: connectorId },
      include: { charger: true },
    });
    if (!connector) return null;
    if (await this.eta.connectorHasReservationConflict(connectorId)) return null;

    const next = await this.prisma.chargingWaitlist.findFirst({
      where: {
        status: WaitlistStatus.WAITING,
        stationId: connector.charger.stationId,
        OR: [
          { connectorId, scope: WaitlistScope.CONNECTOR },
          { connectorType: connector.type, scope: WaitlistScope.CONNECTOR_TYPE },
          { scope: WaitlistScope.STATION, OR: [{ connectorType: null }, { connectorType: connector.type }] },
        ],
      },
      orderBy: { position: "asc" },
    });
    if (!next) return null;
    const expiresAt = new Date(Date.now() + this.claimMinutes * 60_000);
    const updated = await this.prisma.chargingWaitlist.update({
      where: { id: next.id },
      data: {
        status: WaitlistStatus.NOTIFIED,
        notifiedAt: new Date(),
        expiresAt,
        connectorId: next.connectorId ?? connector.id,
      },
    });
    await this.notifications.notify({
      userId: next.userId,
      type: NotificationType.WAITLIST_NOTIFIED,
      title: "Sua vez na fila",
      body: "Há um conector compatível disponível. Confirme em alguns minutos.",
      payload: { waitlistId: next.id, connectorId: connector.id },
      dedupeKey: `waitlist-notified-${next.id}`,
    });
    await this.notifications.notify({
      userId: next.userId,
      type: NotificationType.CONNECTOR_AVAILABLE,
      title: "Conector disponível",
      body: "Você pode iniciar ou reservar agora.",
      payload: { connectorId: connector.id },
      dedupeKey: `connector-available-${next.id}`,
    });
    await this.events.publish({
      type: "waitlist.notified",
      entityType: "waitlist",
      entityId: next.id,
      timestamp: new Date(),
      payload: { waitlistId: next.id, userId: next.userId, connectorId: connector.id, companyId: next.companyId },
    });
    return updated;
  }

  async expireClaims() {
    const stale = await this.prisma.chargingWaitlist.findMany({
      where: { status: WaitlistStatus.NOTIFIED, expiresAt: { lte: new Date() } },
      take: 50,
    });
    for (const entry of stale) {
      await this.prisma.chargingWaitlist.update({
        where: { id: entry.id },
        data: { status: WaitlistStatus.EXPIRED },
      });
      if (entry.connectorId) await this.notifyNext(entry.connectorId);
    }
  }

  private async withEta<T extends { stationId: string; connectorId: string | null; connectorType: ConnectorType | null; userId: string; etaMinutes: number | null }>(
    entry: T,
  ) {
    const eta = await this.eta.forEntry({
      stationId: entry.stationId,
      connectorId: entry.connectorId,
      connectorType: entry.connectorType,
      userId: entry.userId,
    });
    return { ...entry, etaMinutes: eta.minutes, etaLabel: eta.label };
  }
}
