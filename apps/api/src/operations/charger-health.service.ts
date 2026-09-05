import { Injectable } from "@nestjs/common";
import {
  ChargerCommandStatus,
  ConnectorStatus,
  IncidentStatus,
  ReconciliationCaseStatus,
  SessionStatus,
} from "@prisma/client";
import { calculateChargerHealth, type ChargerHealthStatus } from "@evcharge/domain";
import { PrismaService } from "../common/database/database.module";
import { OcppConnectionManager } from "../ocpp/ocpp-connection.manager";
import { MaintenanceService } from "./maintenance.service";

@Injectable()
export class ChargerHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: OcppConnectionManager,
    private readonly maintenance: MaintenanceService,
  ) {}

  async refreshCharger(chargerId: string) {
    const charger = await this.prisma.charger.findUnique({
      where: { id: chargerId },
      include: { connectors: true, station: true },
    });
    if (!charger) return null;
    const hourAgo = new Date(Date.now() - 60 * 60_000);
    const [failedCommands, sessionFailures, sessionStarts, openHigh, pendingRecon] = await Promise.all([
      this.prisma.chargerCommand.count({
        where: {
          chargerId,
          createdAt: { gte: hourAgo },
          status: { in: [ChargerCommandStatus.REJECTED, ChargerCommandStatus.TIMEOUT, ChargerCommandStatus.FAILED] },
        },
      }),
      this.prisma.chargingSession.count({
        where: {
          connector: { chargerId },
          createdAt: { gte: hourAgo },
          status: SessionStatus.FAILED,
        },
      }),
      this.prisma.chargingSession.count({
        where: { connector: { chargerId }, createdAt: { gte: hourAgo } },
      }),
      this.prisma.incident.count({
        where: { chargerId, status: { in: [IncidentStatus.OPEN, IncidentStatus.ACKNOWLEDGED] }, severity: { in: ["HIGH", "CRITICAL"] } },
      }),
      this.prisma.reconciliationCase.count({
        where: { chargerId, status: ReconciliationCaseStatus.OPEN },
      }),
    ]);
    const inMaintenance = await this.maintenance.isResourceBlocked({
      stationId: charger.stationId,
      chargerId: charger.id,
    });
    const result = calculateChargerHealth({
      chargerStatus: charger.status,
      connectorStatuses: charger.connectors.map((item) => item.status),
      inMaintenance: inMaintenance || charger.station.status === "MAINTENANCE",
      connected: this.connections.isOnline(charger.id) || charger.providerId === "mock",
      lastMessageAt: charger.lastMessageAt,
      lastHeartbeatAt: charger.lastHeartbeatAt,
      lastSeenAt: charger.lastSeenAt,
      reconnectCount24h: charger.reconnectCount24h,
      failedCommands1h: failedCommands,
      sessionFailures1h: sessionFailures,
      sessionStarts1h: sessionStarts,
      openHighIncidents: openHigh,
      pendingReconciliation: pendingRecon > 0,
    });
    await this.prisma.charger.update({
      where: { id: chargerId },
      data: { healthStatus: result.status as ChargerHealthStatus, healthUpdatedAt: new Date() },
    });
    return { ...result, chargerId, reliabilityScore: charger.reliabilityScore };
  }

  async refreshAll() {
    const chargers = await this.prisma.charger.findMany({ select: { id: true } });
    for (const charger of chargers) {
      await this.refreshCharger(charger.id);
    }
  }

  present(charger: {
    healthStatus: string;
    reliabilityScore: number;
    lastSeenAt: Date | null;
    lastMessageAt: Date | null;
    lastHeartbeatAt: Date | null;
    status: string;
    connectors: Array<{ status: ConnectorStatus }>;
  }) {
    const working = charger.connectors.filter(
      (item) => item.status !== ConnectorStatus.FAULTED && item.status !== ConnectorStatus.UNAVAILABLE,
    ).length;
    const faulted = charger.connectors.filter((item) => item.status === ConnectorStatus.FAULTED).length;
    const occupiedStatuses = new Set<ConnectorStatus>([
      ConnectorStatus.PREPARING,
      ConnectorStatus.CHARGING,
      ConnectorStatus.SUSPENDED,
      ConnectorStatus.FINISHING,
    ]);
    const occupied = charger.connectors.filter((item) => occupiedStatuses.has(item.status)).length;
    const reserved = charger.connectors.filter((item) => item.status === ConnectorStatus.RESERVED).length;
    return {
      health: charger.healthStatus,
      reliabilityScore: charger.reliabilityScore,
      lastSeenAt: charger.lastMessageAt ?? charger.lastHeartbeatAt ?? charger.lastSeenAt,
      workingConnectors: working,
      faultedConnectors: faulted,
      occupiedConnectors: occupied,
      reservedConnectors: reserved,
    };
  }
}
