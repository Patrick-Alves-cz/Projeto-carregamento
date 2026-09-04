import { Injectable } from "@nestjs/common";
import { ChargerStatus, PaymentStatus, SessionStatus } from "@prisma/client";
import { PrismaService } from "../common/database/database.module";
import { TenantAccessService } from "../common/services/tenant-access.service";
import { AuthenticatedUser } from "../common/types/auth.types";

const ACTIVE_STATUSES: SessionStatus[] = [
  SessionStatus.PENDING,
  SessionStatus.PREPARING,
  SessionStatus.ACTIVE,
  SessionStatus.PAUSED,
];

@Injectable()
export class OpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantAccess: TenantAccessService,
  ) {}

  async summary(user: AuthenticatedUser) {
    this.tenantAccess.assertOperatorOrAbove(user);
    const companyFilter = this.tenantAccess.isSuperAdmin(user)
      ? {}
      : { companyId: { in: user.companyIds } };

    const stations = await this.prisma.station.findMany({
      where: companyFilter,
      include: { chargers: true },
    });
    const chargers = stations.flatMap((station) => station.chargers);
    const chargerIds = chargers.map((charger) => charger.id);

    const [activeSessions, completed, distinctUsers] = await Promise.all([
      this.prisma.chargingSession.count({
        where: {
          status: { in: ACTIVE_STATUSES },
          connector: { chargerId: { in: chargerIds } },
        },
      }),
      this.prisma.chargingSession.aggregate({
        where: {
          status: SessionStatus.COMPLETED,
          connector: { chargerId: { in: chargerIds } },
        },
        _sum: { costCents: true, energyKwh: true },
      }),
      this.prisma.chargingSession.findMany({
        where: {
          status: SessionStatus.COMPLETED,
          connector: { chargerId: { in: chargerIds } },
        },
        distinct: ["userId"],
        select: { userId: true },
      }),
    ]);

    const available = chargers.filter((charger) => charger.status === ChargerStatus.AVAILABLE).length;
    const occupied = chargers.filter((charger) => charger.status === ChargerStatus.CHARGING).length;
    const offline = chargers.filter(
      (charger) =>
        charger.status === ChargerStatus.OFFLINE ||
        charger.status === ChargerStatus.FAULTED ||
        charger.status === ChargerStatus.UNAVAILABLE,
    ).length;

    return {
      stations: stations.length,
      chargers: chargers.length,
      availableChargers: available,
      occupiedChargers: occupied,
      offlineChargers: offline,
      activeSessions,
      demoRevenueCents: completed._sum.costCents ?? 0,
      energyKwh: Number(completed._sum.energyKwh ?? 0),
      activeCustomers: distinctUsers.length,
    };
  }

  async payments(user: AuthenticatedUser) {
    this.tenantAccess.assertOperatorOrAbove(user);
    const companyIds = this.tenantAccess.isSuperAdmin(user) ? undefined : user.companyIds;
    return this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.COMPLETED,
        session: companyIds
          ? { connector: { charger: { station: { companyId: { in: companyIds } } } } }
          : { isNot: null },
      },
      include: {
        session: {
          include: {
            connector: { include: { charger: { include: { station: true } } } },
            user: { include: { profile: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
}
