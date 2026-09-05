import { Injectable, Logger } from "@nestjs/common";
import {
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  NotificationType,
  Prisma,
} from "@prisma/client";
import { NotFoundError } from "@evcharge/domain";
import type { ResolveIncidentInput } from "@evcharge/shared";
import { PrismaService } from "../common/database/database.module";
import { TenantAccessService } from "../common/services/tenant-access.service";
import { AuthenticatedUser } from "../common/types/auth.types";
import { NotificationsService } from "../notifications/notifications.service";
import { ChargingEventsService } from "../charging/charging-events.service";
import { AuditLogger } from "../common/logging/audit-logger";

type OpenIncidentInput = {
  companyId: string;
  stationId: string;
  chargerId?: string | null;
  connectorId?: string | null;
  sessionId?: string | null;
  type: IncidentType;
  severity: IncidentSeverity;
  title: string;
  description: string;
  source?: string;
};

@Injectable()
export class IncidentsService {
  private readonly audit = new AuditLogger(new Logger(IncidentsService.name));

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantAccessService,
    private readonly notifications: NotificationsService,
    private readonly events: ChargingEventsService,
  ) {}

  openKey(type: IncidentType, chargerId?: string | null, connectorId?: string | null, sessionId?: string | null) {
    return [type, chargerId ?? "none", connectorId ?? "none", sessionId ?? "none"].join(":");
  }

  async openOrTouch(input: OpenIncidentInput) {
    const key = this.openKey(input.type, input.chargerId, input.connectorId, input.sessionId);
    const existing = await this.prisma.incident.findUnique({ where: { openKey: key } });
    if (existing) {
      return this.prisma.incident.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date(), description: input.description },
      });
    }
    const created = await this.prisma.incident.create({
      data: {
        companyId: input.companyId,
        stationId: input.stationId,
        chargerId: input.chargerId ?? undefined,
        connectorId: input.connectorId ?? undefined,
        sessionId: input.sessionId ?? undefined,
        type: input.type,
        severity: input.severity,
        title: input.title,
        description: input.description,
        source: input.source ?? "system",
        openKey: key,
      },
    });
    this.audit.warn("incident.opened", { incidentId: created.id, type: input.type, companyId: input.companyId });
    await this.events.publish({
      type: "incident.opened",
      entityType: "incident",
      entityId: created.id,
      timestamp: new Date(),
      payload: { incidentId: created.id, companyId: input.companyId, type: input.type },
    });
    await this.notifyOperators(input.companyId, created.id, input);
    return created;
  }

  async resolveOpen(type: IncidentType, chargerId?: string | null, connectorId?: string | null, sessionId?: string | null) {
    const key = this.openKey(type, chargerId, connectorId, sessionId);
    const existing = await this.prisma.incident.findUnique({ where: { openKey: key } });
    if (!existing || existing.status === IncidentStatus.RESOLVED || existing.status === IncidentStatus.IGNORED) {
      return existing;
    }
    return this.prisma.incident.update({
      where: { id: existing.id },
      data: {
        status: IncidentStatus.RESOLVED,
        resolvedAt: new Date(),
        resolution: "Recuperação automática detectada",
        openKey: null,
      },
    });
  }

  async list(user: AuthenticatedUser, query: {
    status?: IncidentStatus;
    severity?: IncidentSeverity;
    stationId?: string;
    chargerId?: string;
    from?: Date;
    to?: Date;
  }) {
    this.tenant.assertOperatorOrAbove(user);
    const where: Prisma.IncidentWhereInput = {
      ...(this.tenant.isSuperAdmin(user) ? {} : { companyId: { in: user.companyIds } }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.stationId ? { stationId: query.stationId } : {}),
      ...(query.chargerId ? { chargerId: query.chargerId } : {}),
      ...(query.from || query.to
        ? { createdAt: { gte: query.from, lte: query.to } }
        : {}),
    };
    return this.prisma.incident.findMany({
      where,
      include: { station: true, charger: true, connector: true },
      orderBy: [{ status: "asc" }, { lastSeenAt: "desc" }],
      take: 200,
    });
  }

  async get(user: AuthenticatedUser, id: string) {
    this.tenant.assertOperatorOrAbove(user);
    const incident = await this.prisma.incident.findUnique({
      where: { id },
      include: { station: true, charger: true, connector: true, session: true },
    });
    if (!incident) throw new NotFoundError("Incident", id);
    this.tenant.assertCompanyAccess(user, incident.companyId);
    return incident;
  }

  async acknowledge(user: AuthenticatedUser, id: string) {
    const incident = await this.get(user, id);
    return this.prisma.incident.update({
      where: { id: incident.id },
      data: { status: IncidentStatus.ACKNOWLEDGED },
    });
  }

  async resolve(user: AuthenticatedUser, id: string, input: ResolveIncidentInput) {
    const incident = await this.get(user, id);
    return this.prisma.incident.update({
      where: { id: incident.id },
      data: {
        status: input.status,
        resolution: input.resolution,
        resolvedAt: new Date(),
        resolvedById: user.id,
        openKey: null,
      },
    });
  }

  async detect() {
    const offlineThreshold = new Date(Date.now() - Number(process.env.OCPP_OFFLINE_THRESHOLD_MS ?? 180_000));
    const staleChargers = await this.prisma.charger.findMany({
      where: {
        OR: [
          { status: "OFFLINE", lastSeenAt: { lte: offlineThreshold } },
          { lastSeenAt: { lte: offlineThreshold }, providerId: { in: ["ocpp16", "ocpp"] } },
        ],
      },
      include: { station: true },
    });
    for (const charger of staleChargers) {
      await this.openOrTouch({
        companyId: charger.station.companyId,
        stationId: charger.stationId,
        chargerId: charger.id,
        type: IncidentType.CHARGER_OFFLINE,
        severity: IncidentSeverity.HIGH,
        title: "Carregador offline",
        description: `${charger.identity} sem comunicação recente.`,
      });
    }

    const recovered = await this.prisma.charger.findMany({
      where: { status: { not: "OFFLINE" }, healthStatus: { not: "OFFLINE" } },
      include: { station: true },
    });
    for (const charger of recovered) {
      const wasOpen = await this.prisma.incident.findFirst({
        where: {
          chargerId: charger.id,
          type: IncidentType.CHARGER_OFFLINE,
          status: { in: [IncidentStatus.OPEN, IncidentStatus.ACKNOWLEDGED] },
        },
      });
      if (wasOpen) {
        await this.resolveOpen(IncidentType.CHARGER_OFFLINE, charger.id);
        await this.notifyOperators(charger.station.companyId, wasOpen.id, {
          companyId: charger.station.companyId,
          stationId: charger.stationId,
          type: IncidentType.CHARGER_OFFLINE,
          severity: IncidentSeverity.INFO,
          title: "Carregador recuperado",
          description: `${charger.identity} voltou a comunicar.`,
        }, true);
        await this.notifyFavoriteDrivers(charger.stationId);
      }
    }

    const faulted = await this.prisma.connector.findMany({
      where: { status: "FAULTED" },
      include: { charger: { include: { station: true } } },
    });
    for (const connector of faulted) {
      await this.openOrTouch({
        companyId: connector.charger.station.companyId,
        stationId: connector.charger.stationId,
        chargerId: connector.chargerId,
        connectorId: connector.id,
        type: IncidentType.CONNECTOR_FAULT,
        severity: IncidentSeverity.HIGH,
        title: "Conector com falha",
        description: `Conector ${connector.number} em falha.`,
      });
    }
  }

  private async notifyOperators(
    companyId: string,
    incidentId: string,
    input: OpenIncidentInput,
    recovered = false,
  ) {
    const members = await this.prisma.companyMember.findMany({
      where: { companyId, role: { in: ["OWNER", "ADMIN", "OPERATOR"] } },
    });
    const type = recovered
      ? NotificationType.CHARGER_RECOVERED
      : input.severity === "CRITICAL"
        ? NotificationType.CRITICAL_INCIDENT
        : input.type === IncidentType.CHARGER_OFFLINE
          ? NotificationType.CHARGER_OFFLINE
          : input.type === IncidentType.CONNECTOR_FAULT
            ? NotificationType.CONNECTOR_FAULT
            : NotificationType.CRITICAL_INCIDENT;
    for (const member of members) {
      await this.notifications.notify({
        userId: member.userId,
        type,
        title: input.title,
        body: input.description,
        payload: { incidentId, companyId },
        dedupeKey: recovered ? `incident-recovered-${incidentId}` : `incident-open-${incidentId}`,
      });
    }
  }

  private async notifyFavoriteDrivers(stationId: string) {
    const favorites = await this.prisma.favoriteStation.findMany({ where: { stationId } });
    for (const favorite of favorites) {
      await this.notifications.notify({
        userId: favorite.userId,
        type: NotificationType.FAVORITE_STATION_ONLINE,
        title: "Estação favorita disponível",
        body: "Uma estação que você salvou voltou a ficar disponível.",
        payload: { stationId },
        dedupeKey: `favorite-online-${stationId}-${favorite.userId}-${new Date().toISOString().slice(0, 13)}`,
      });
    }
  }
}
