import { Injectable } from "@nestjs/common";
import { ConnectorType, ReservationStatus, SessionStatus, WaitlistStatus } from "@prisma/client";
import { estimateWaitMinutes } from "@evcharge/domain";
import { PrismaService } from "../common/database/database.module";

@Injectable()
export class WaitTimeEstimator {
  private readonly bufferMinutes = Number(process.env.RESERVATION_BUFFER_MINUTES ?? 15);

  constructor(private readonly prisma: PrismaService) {}

  async forEntry(params: {
    stationId: string;
    connectorId?: string | null;
    connectorType?: ConnectorType | null;
    userId?: string;
  }) {
    const connectors = await this.prisma.connector.findMany({
      where: {
        charger: { stationId: params.stationId },
        ...(params.connectorId ? { id: params.connectorId } : {}),
        ...(params.connectorType ? { type: params.connectorType } : {}),
      },
      include: { charger: true },
    });
    const compatible = connectors.filter((item) => !["OFFLINE", "FAULTED"].includes(item.charger.status));
    const availableNow = compatible.filter((item) => item.status === "AVAILABLE").length;
    const queueAhead = await this.prisma.chargingWaitlist.count({
      where: {
        stationId: params.stationId,
        status: WaitlistStatus.WAITING,
        ...(params.connectorId ? { connectorId: params.connectorId } : {}),
        ...(params.connectorType ? { connectorType: params.connectorType } : {}),
        ...(params.userId
          ? { createdAt: { lt: new Date() }, NOT: { userId: params.userId } }
          : {}),
      },
    });
    const live = await this.prisma.chargingSession.findMany({
      where: {
        status: { in: [SessionStatus.ACTIVE, SessionStatus.PAUSED, SessionStatus.CHARGING_COMPLETE, SessionStatus.IDLE] },
        connectorId: { in: compatible.map((item) => item.id) },
      },
    });
    const remaining = live.map((session) => {
      const elapsed = session.startedAt ? (Date.now() - session.startedAt.getTime()) / 60_000 : 0;
      return Math.max(5, 25 - elapsed);
    });
    const history = await this.prisma.chargingSession.findMany({
      where: {
        status: SessionStatus.COMPLETED,
        connectorId: { in: compatible.map((item) => item.id) },
        endedAt: { not: null },
      },
      orderBy: { endedAt: "desc" },
      take: 20,
    });
    const average =
      history.length > 0
        ? history.reduce((sum, session) => {
            const minutes =
              session.startedAt && session.endedAt
                ? (session.endedAt.getTime() - session.startedAt.getTime()) / 60_000
                : 25;
            return sum + minutes;
          }, 0) / history.length
        : null;
    return estimateWaitMinutes({
      compatibleConnectors: compatible.length,
      availableNow,
      queueAhead,
      remainingSessionMinutes: remaining,
      averageSessionMinutes: average,
    });
  }

  async connectorHasReservationConflict(connectorId: string) {
    const bufferMs = this.bufferMinutes * 60_000;
    const clash = await this.prisma.reservation.findFirst({
      where: {
        connectorId,
        status: { in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED, ReservationStatus.ACTIVE] },
        startAt: { lte: new Date(Date.now() + bufferMs) },
        endAt: { gt: new Date() },
      },
    });
    return Boolean(clash);
  }
}
