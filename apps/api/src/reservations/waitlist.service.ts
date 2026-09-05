import { Injectable, Logger } from "@nestjs/common";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@evcharge/domain";
import { ConnectorStatus, NotificationType, UserRole, WaitlistStatus } from "@prisma/client";
import { PrismaService } from "../common/database/database.module";
import { TenantAccessService } from "../common/services/tenant-access.service";
import { AuthenticatedUser } from "../common/types/auth.types";
import { AuditLogger } from "../common/logging/audit-logger";
import { NotificationsService } from "../notifications/notifications.service";
import { ChargingEventsService } from "../charging/charging-events.service";

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
  ) {}

  async join(user: AuthenticatedUser, connectorId: string) {
    if (user.role !== UserRole.DRIVER) throw new ForbiddenError("Somente motoristas entram na fila");
    const connector = await this.prisma.connector.findUnique({
      where: { id: connectorId },
      include: { charger: { include: { station: true } } },
    });
    if (!connector) throw new NotFoundError("Connector", connectorId);
    if (connector.status === ConnectorStatus.AVAILABLE) {
      throw new ValidationError("Este conector já está disponível");
    }

    const existing = await this.prisma.chargingWaitlist.findFirst({
      where: { userId: user.id, connectorId, status: { in: OPEN } },
    });
    if (existing) return existing;

    const last = await this.prisma.chargingWaitlist.findFirst({
      where: { connectorId, status: { in: OPEN } },
      orderBy: { position: "desc" },
    });
    const entry = await this.prisma.chargingWaitlist.create({
      data: {
        userId: user.id,
        companyId: connector.charger.station.companyId,
        stationId: connector.charger.stationId,
        connectorId,
        position: (last?.position ?? 0) + 1,
        status: WaitlistStatus.WAITING,
      },
    });
    this.audit.info("waitlist.joined", { waitlistId: entry.id, userId: user.id, connectorId });
    await this.notifications.notify({
      userId: user.id,
      type: NotificationType.WAITLIST_JOINED,
      title: "Você entrou na fila",
      body: `Sua posição é ${entry.position}.`,
      payload: { waitlistId: entry.id, connectorId },
      dedupeKey: `waitlist-joined-${entry.id}`,
    });
    await this.events.publish({
      type: "waitlist.joined",
      entityType: "waitlist",
      entityId: entry.id,
      timestamp: new Date(),
      payload: { waitlistId: entry.id, userId: user.id, connectorId, companyId: entry.companyId },
    });
    return entry;
  }

  async mine(user: AuthenticatedUser) {
    if (user.role !== UserRole.DRIVER) throw new ForbiddenError("Somente motoristas");
    return this.prisma.chargingWaitlist.findMany({
      where: { userId: user.id },
      include: { station: true, connector: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async listAdmin(user: AuthenticatedUser) {
    this.tenant.assertOperatorOrAbove(user);
    return this.prisma.chargingWaitlist.findMany({
      where: this.tenant.isSuperAdmin(user) ? {} : { companyId: { in: user.companyIds } },
      include: { station: true, connector: true, user: { include: { profile: true } } },
      orderBy: [{ connectorId: "asc" }, { position: "asc" }],
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
    const next = await this.prisma.chargingWaitlist.findFirst({
      where: { connectorId, status: WaitlistStatus.WAITING },
      orderBy: { position: "asc" },
    });
    if (!next) return null;
    const expiresAt = new Date(Date.now() + this.claimMinutes * 60_000);
    const updated = await this.prisma.chargingWaitlist.update({
      where: { id: next.id },
      data: { status: WaitlistStatus.NOTIFIED, notifiedAt: new Date(), expiresAt },
    });
    await this.notifications.notify({
      userId: next.userId,
      type: NotificationType.WAITLIST_NOTIFIED,
      title: "Sua vez na fila",
      body: "O conector ficou disponível. Confirme em alguns minutos.",
      payload: { waitlistId: next.id, connectorId },
      dedupeKey: `waitlist-notified-${next.id}`,
    });
    await this.notifications.notify({
      userId: next.userId,
      type: NotificationType.CONNECTOR_AVAILABLE,
      title: "Conector disponível",
      body: "Você pode iniciar ou reservar agora.",
      payload: { connectorId },
      dedupeKey: `connector-available-${next.id}`,
    });
    await this.events.publish({
      type: "waitlist.notified",
      entityType: "waitlist",
      entityId: next.id,
      timestamp: new Date(),
      payload: { waitlistId: next.id, userId: next.userId, connectorId, companyId: next.companyId },
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
      await this.notifyNext(entry.connectorId);
    }
  }
}
