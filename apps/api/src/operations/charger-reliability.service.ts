import { Injectable } from "@nestjs/common";
import { ChargerCommandStatus, SessionStatus } from "@prisma/client";
import { calculateReliabilityScore } from "@evcharge/domain";
import { PrismaService } from "../common/database/database.module";
import { OcppConnectionManager } from "../ocpp/ocpp-connection.manager";

const WINDOW_MS = 24 * 60 * 60_000;

@Injectable()
export class ChargerReliabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: OcppConnectionManager,
  ) {}

  async snapshotCharger(chargerId: string, persistDaily = true) {
    const charger = await this.prisma.charger.findUnique({
      where: { id: chargerId },
      include: { station: true },
    });
    if (!charger) return null;
    const from = new Date(Date.now() - WINDOW_MS);
    const [
      sessions,
      commands,
      offlineEvents,
      recoveredEvents,
      faultEvents,
    ] = await Promise.all([
      this.prisma.chargingSession.findMany({
        where: { connector: { chargerId }, createdAt: { gte: from } },
        select: { status: true },
      }),
      this.prisma.chargerCommand.findMany({
        where: { chargerId, createdAt: { gte: from } },
        select: { type: true, status: true },
      }),
      this.prisma.chargerEvent.count({
        where: { chargerId, type: "offline", createdAt: { gte: from } },
      }),
      this.prisma.chargerEvent.count({
        where: { chargerId, type: "connected", createdAt: { gte: from } },
      }),
      this.prisma.chargerEvent.count({
        where: { chargerId, type: { in: ["connector.fault", "fault"] }, createdAt: { gte: from } },
      }),
    ]);

    const sessionsStarted = sessions.length;
    const sessionsCompleted = sessions.filter((item) => item.status === SessionStatus.COMPLETED).length;
    const sessionsFailed = sessions.filter((item) => item.status === SessionStatus.FAILED).length;
    const commandsSent = commands.length;
    const commandsSucceeded = commands.filter(
      (item) => item.status === ChargerCommandStatus.ACCEPTED || item.status === ChargerCommandStatus.COMPLETED,
    ).length;
    const remoteStartFailures = commands.filter(
      (item) => item.type === "REMOTE_START" && ["REJECTED", "TIMEOUT", "FAILED"].includes(item.status),
    ).length;
    const remoteStopFailures = commands.filter(
      (item) => item.type === "REMOTE_STOP" && ["REJECTED", "TIMEOUT", "FAILED"].includes(item.status),
    ).length;

    const onlineBoost = this.connections.isOnline(charger.id) || charger.providerId === "mock" ? 60 : 0;
    const seenMinutes = charger.lastSeenAt
      ? Math.min(1440, Math.max(0, Math.round((Date.now() - charger.lastSeenAt.getTime()) / 60_000)))
      : 1440;
    const uptimeMinutes = Math.max(0, 1440 - Math.min(seenMinutes, 1440) + onlineBoost);

    const breakdown = calculateReliabilityScore({
      uptimeMinutes: Math.min(1440, uptimeMinutes),
      windowMinutes: 1440,
      sessionsStarted,
      sessionsCompleted,
      sessionsFailed,
      commandsSent,
      commandsSucceeded,
      remoteStartFailures,
      remoteStopFailures,
      connectorFaultEvents: faultEvents,
      offlineEvents,
      recoveredEvents,
    });

    await this.prisma.charger.update({
      where: { id: chargerId },
      data: { reliabilityScore: breakdown.score },
    });

    if (persistDaily) {
      const day = new Date();
      day.setUTCHours(0, 0, 0, 0);
      await this.prisma.chargerReliabilitySnapshot.upsert({
        where: { chargerId_day: { chargerId, day } },
        update: {
          score: breakdown.score,
          uptimeRate: breakdown.uptimeRate,
          successfulSessionsRate: breakdown.successfulSessionsRate,
          commandSuccessRate: breakdown.commandSuccessRate,
          faultPenalty: breakdown.faultPenalty,
          sessionsStarted,
          sessionsCompleted,
          sessionsFailed,
          remoteStartFailures,
          remoteStopFailures,
          offlineEvents,
          recoveredEvents,
        },
        create: {
          companyId: charger.station.companyId,
          chargerId,
          day,
          score: breakdown.score,
          uptimeRate: breakdown.uptimeRate,
          successfulSessionsRate: breakdown.successfulSessionsRate,
          commandSuccessRate: breakdown.commandSuccessRate,
          faultPenalty: breakdown.faultPenalty,
          sessionsStarted,
          sessionsCompleted,
          sessionsFailed,
          remoteStartFailures,
          remoteStopFailures,
          offlineEvents,
          recoveredEvents,
        },
      });
    }
    return breakdown;
  }

  async snapshotAll() {
    const chargers = await this.prisma.charger.findMany({ select: { id: true } });
    for (const charger of chargers) {
      await this.snapshotCharger(charger.id);
    }
  }
}
