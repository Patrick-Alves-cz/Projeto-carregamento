import { Injectable } from "@nestjs/common";
import {
  ChargerCommandStatus,
  ChargerHealthStatus,
  IncidentStatus,
  ReservationStatus,
  SessionStatus,
  WaitlistStatus,
} from "@prisma/client";
import {
  communicationFreshness,
  healthDriverHint,
  healthDriverLabel,
  reliabilityDriverLabel,
} from "@evcharge/domain";
import { PrismaService } from "../common/database/database.module";
import { TenantAccessService } from "../common/services/tenant-access.service";
import { AuthenticatedUser } from "../common/types/auth.types";
import { OcppConnectionManager } from "../ocpp/ocpp-connection.manager";
import { StationAvailabilityService } from "./station-availability.service";
import { MaintenanceService } from "./maintenance.service";

const LIVE_SESSIONS: SessionStatus[] = [
  SessionStatus.PENDING,
  SessionStatus.PREPARING,
  SessionStatus.ACTIVE,
  SessionStatus.PAUSED,
  SessionStatus.CHARGING_COMPLETE,
  SessionStatus.IDLE,
];

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantAccessService,
    private readonly connections: OcppConnectionManager,
    private readonly availability: StationAvailabilityService,
    private readonly maintenance: MaintenanceService,
  ) {}

  async summary(user: AuthenticatedUser) {
    this.tenant.assertOperatorOrAbove(user);
    const companyFilter = this.tenant.isSuperAdmin(user) ? {} : { companyId: { in: user.companyIds } };
    const stations = await this.prisma.station.findMany({
      where: companyFilter,
      include: { chargers: { include: { connectors: true } } },
    });
    const chargers = stations.flatMap((station) => station.chargers);
    const chargerIds = chargers.map((item) => item.id);
    const [
      activeSessions,
      openIncidents,
      activeReservations,
      waitlist,
      failedCommands,
      completed,
    ] = await Promise.all([
      this.prisma.chargingSession.count({
        where: { status: { in: LIVE_SESSIONS }, connector: { chargerId: { in: chargerIds } } },
      }),
      this.prisma.incident.count({
        where: {
          status: { in: [IncidentStatus.OPEN, IncidentStatus.ACKNOWLEDGED] },
          ...(this.tenant.isSuperAdmin(user) ? {} : { companyId: { in: user.companyIds } }),
        },
      }),
      this.prisma.reservation.count({
        where: {
          status: { in: [ReservationStatus.CONFIRMED, ReservationStatus.ACTIVE] },
          ...(this.tenant.isSuperAdmin(user) ? {} : { companyId: { in: user.companyIds } }),
        },
      }),
      this.prisma.chargingWaitlist.count({
        where: {
          status: { in: [WaitlistStatus.WAITING, WaitlistStatus.NOTIFIED] },
          ...(this.tenant.isSuperAdmin(user) ? {} : { companyId: { in: user.companyIds } }),
        },
      }),
      this.prisma.chargerCommand.count({
        where: {
          status: { in: [ChargerCommandStatus.FAILED, ChargerCommandStatus.TIMEOUT, ChargerCommandStatus.REJECTED] },
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) },
          ...(this.tenant.isSuperAdmin(user) ? {} : { companyId: { in: user.companyIds } }),
        },
      }),
      this.prisma.chargingSession.findMany({
        where: {
          status: SessionStatus.COMPLETED,
          connector: { chargerId: { in: chargerIds } },
        },
        select: { startedAt: true, endedAt: true, energyKwh: true, status: true },
      }),
    ]);

    const healthCounts = {
      healthy: chargers.filter((item) => item.healthStatus === ChargerHealthStatus.HEALTHY).length,
      degraded: chargers.filter((item) => item.healthStatus === ChargerHealthStatus.DEGRADED).length,
      unstable: chargers.filter((item) => item.healthStatus === ChargerHealthStatus.UNSTABLE).length,
      offline: chargers.filter((item) => item.healthStatus === ChargerHealthStatus.OFFLINE || item.status === "OFFLINE").length,
      faulted: chargers.filter((item) => item.healthStatus === ChargerHealthStatus.FAULTED || item.status === "FAULTED").length,
    };
    const reliabilityAvg =
      chargers.length === 0
        ? 0
        : Math.round(chargers.reduce((sum, item) => sum + item.reliabilityScore, 0) / chargers.length);
    const uptime =
      chargers.length === 0 ? 0 : Math.round(((chargers.length - healthCounts.offline) / chargers.length) * 100);

    const resolved = await this.prisma.incident.findMany({
      where: {
        status: IncidentStatus.RESOLVED,
        resolvedAt: { not: null },
        ...(this.tenant.isSuperAdmin(user) ? {} : { companyId: { in: user.companyIds } }),
      },
      take: 100,
    });
    const mttrMinutes =
      resolved.length === 0
        ? 0
        : Math.round(
            resolved.reduce((sum, item) => sum + (item.resolvedAt!.getTime() - item.firstSeenAt.getTime()), 0) /
              resolved.length /
              60_000,
          );

    return {
      stations: stations.length,
      chargers: chargers.length,
      onlineChargers: chargers.filter((item) => this.connections.isOnline(item.id) || item.status !== "OFFLINE").length,
      ...healthCounts,
      activeSessions,
      openIncidents,
      activeReservations,
      waitlist,
      failedCommands24h: failedCommands,
      uptimePercent: uptime,
      reliabilityAverage: reliabilityAvg,
      sessionSuccessRate:
        completed.length === 0 ? 100 : Math.round((completed.length / Math.max(completed.length, 1)) * 100),
      averageSessionMinutes:
        completed.length === 0
          ? 0
          : Math.round(
              completed.reduce((sum, item) => {
                if (!item.startedAt || !item.endedAt) return sum;
                return sum + (item.endedAt.getTime() - item.startedAt.getTime()) / 60_000;
              }, 0) / completed.length,
            ),
      averageEnergyKwh:
        completed.length === 0
          ? 0
          : Number(
              (
                completed.reduce((sum, item) => sum + Number(item.energyKwh), 0) / completed.length
              ).toFixed(2),
            ),
      mttrMinutes,
    };
  }

  async chargerTimeline(user: AuthenticatedUser, chargerId: string) {
    this.tenant.assertOperatorOrAbove(user);
    const charger = await this.prisma.charger.findUnique({
      where: { id: chargerId },
      include: {
        station: true,
        connectors: { orderBy: { number: "asc" } },
        chargerEvents: { orderBy: { createdAt: "desc" }, take: 80, where: { category: "OPERATIONAL" } },
        incidents: { orderBy: { lastSeenAt: "desc" }, take: 20 },
        commands: { orderBy: { createdAt: "desc" }, take: 20 },
        maintenanceWindows: { orderBy: { startsAt: "desc" }, take: 10 },
        reliabilitySnapshots: { orderBy: { day: "desc" }, take: 14 },
      },
    });
    if (!charger) return null;
    this.tenant.assertCompanyAccess(user, charger.station.companyId);
    const sessions = await this.prisma.chargingSession.findMany({
      where: { connector: { chargerId } },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { user: { include: { profile: true } } },
    });
    const recon = await this.prisma.reconciliationCase.findMany({
      where: { chargerId },
      orderBy: { detectedAt: "desc" },
      take: 10,
    });
    const conn = this.connections.get(charger.id);
    const freshness = communicationFreshness({
      connected: this.connections.isOnline(charger.id),
      lastMessageAt: conn?.lastMessageAt ?? charger.lastMessageAt,
      lastHeartbeatAt: charger.lastHeartbeatAt,
      lastSeenAt: charger.lastSeenAt,
    });
    return {
      ...charger,
      freshness,
      ocppOnline: this.connections.isOnline(charger.id),
      lastSeenAt: conn?.lastMessageAt ?? charger.lastSeenAt,
      healthLabel: healthDriverLabel(charger.healthStatus),
      reliabilityLabel: reliabilityDriverLabel(charger.reliabilityScore),
      sessions,
      reconciliationCases: recon,
    };
  }

  async driverStationOps(stationId: string) {
    const station = await this.prisma.station.findUnique({
      where: { id: stationId },
      include: { chargers: { include: { connectors: true } } },
    });
    if (!station) return null;
    const inMaintenance = await this.maintenance.isResourceBlocked({ stationId });
    const availability = this.availability.summarize({
      stationStatus: station.status,
      inMaintenance,
      chargers: station.chargers,
    });
    const scores = station.chargers.map((item) => item.reliabilityScore);
    const reliabilityScore =
      scores.length === 0 ? 100 : Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
    const lastSeen = station.chargers.reduce<Date | null>((latest, charger) => {
      const stamp = charger.lastMessageAt ?? charger.lastSeenAt;
      if (!stamp) return latest;
      if (!latest || stamp > latest) return stamp;
      return latest;
    }, null);
    const connected = station.chargers.some((item) => this.connections.isOnline(item.id) || item.providerId === "mock");
    const freshness = communicationFreshness({
      connected,
      lastMessageAt: lastSeen,
      lastSeenAt: lastSeen,
    });
    const health = station.chargers.some((item) => item.healthStatus === "FAULTED")
      ? "FAULTED"
      : station.chargers.every((item) => item.healthStatus === "OFFLINE")
        ? "OFFLINE"
        : station.chargers.some((item) => item.healthStatus === "UNSTABLE")
          ? "UNSTABLE"
          : station.chargers.some((item) => item.healthStatus === "DEGRADED")
            ? "DEGRADED"
            : inMaintenance
              ? "MAINTENANCE"
              : "HEALTHY";
    return {
      availabilityState: availability.state,
      availability,
      reliabilityScore,
      reliabilityLabel: reliabilityDriverLabel(reliabilityScore),
      health,
      healthLabel: healthDriverLabel(health as "HEALTHY"),
      healthHint: healthDriverHint(health as "HEALTHY"),
      freshness,
      lastSeenAt: lastSeen,
      inMaintenance,
      workingConnectors: availability.available,
      faultedConnectors: availability.faulted,
      occupiedConnectors: availability.occupied,
      reservedConnectors: availability.reserved,
    };
  }

  async pruneProtocolEvents() {
    const days = Number(process.env.CHARGER_EVENT_PROTOCOL_RETENTION_DAYS ?? 7);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60_000);
    await this.prisma.chargerEvent.deleteMany({
      where: { category: "PROTOCOL", createdAt: { lt: cutoff } },
    });
  }
}
