import { ChargerStatus, ConnectorStatus } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

const LIVE_SESSIONS = [
  "PENDING",
  "PREPARING",
  "ACTIVE",
  "PAUSED",
  "CHARGING_COMPLETE",
  "IDLE",
] as const;

export async function releaseConnector(prisma: PrismaClient, connectorId: string) {
  await prisma.chargingSession.updateMany({
    where: { connectorId, status: { in: [...LIVE_SESSIONS] } },
    data: { status: "CANCELLED", endedAt: new Date() },
  });
  await prisma.walletHold.updateMany({
    where: { session: { connectorId }, status: "OPEN" },
    data: { status: "RELEASED" },
  });
  const connector = await prisma.connector.findUniqueOrThrow({
    where: { id: connectorId },
    include: { charger: true },
  });
  await prisma.maintenanceWindow.updateMany({
    where: {
      status: { in: ["ACTIVE", "SCHEDULED"] },
      OR: [{ stationId: connector.charger.stationId }, { chargerId: connector.chargerId }, { connectorId }],
    },
    data: { status: "CANCELLED" },
  });
  await prisma.reservation.updateMany({
    where: { connectorId, status: { in: ["PENDING", "CONFIRMED", "ACTIVE"] } },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  await prisma.charger.update({
    where: { id: connector.chargerId },
    data: { status: ChargerStatus.AVAILABLE },
  });
  await prisma.connector.update({
    where: { id: connectorId },
    data: { status: ConnectorStatus.AVAILABLE },
  });
}
