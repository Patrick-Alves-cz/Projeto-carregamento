import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PaymentStatus, SessionStatus, UserRole } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/auth.decorators";
import { AuthenticatedUser } from "../common/types/auth.types";
import { TenantAccessService } from "../common/services/tenant-access.service";
import { PrismaService } from "../common/database/database.module";

@ApiTags("finance")
@ApiBearerAuth()
@Controller("finance")
export class FinanceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantAccessService,
  ) {}

  @Get("summary")
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query("stationId") stationId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    this.tenant.assertOperatorOrAbove(user);
    const companyIds = this.tenant.isSuperAdmin(user) ? undefined : user.companyIds;
    const fromDate = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const toDate = to ? new Date(to) : new Date();
    const stationFilter = stationId
      ? { id: stationId, ...(companyIds ? { companyId: { in: companyIds } } : {}) }
      : companyIds
        ? { companyId: { in: companyIds } }
        : {};

    const sessionWhere = {
      status: SessionStatus.COMPLETED,
      endedAt: { gte: fromDate, lte: toDate },
      connector: { charger: { station: stationFilter } },
    };
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [range, today, month, pending, failed] = await Promise.all([
      this.prisma.chargingSession.aggregate({
        where: sessionWhere,
        _sum: { costCents: true, energyKwh: true },
        _count: true,
        _avg: { costCents: true },
      }),
      this.prisma.chargingSession.aggregate({
        where: { ...sessionWhere, endedAt: { gte: todayStart } },
        _sum: { costCents: true },
      }),
      this.prisma.chargingSession.aggregate({
        where: {
          status: SessionStatus.COMPLETED,
          endedAt: { gte: new Date(todayStart.getFullYear(), todayStart.getMonth(), 1) },
          connector: { charger: { station: stationFilter } },
        },
        _sum: { costCents: true },
      }),
      this.prisma.payment.count({
        where: {
          status: PaymentStatus.PENDING,
          ...(companyIds ? { companyId: { in: companyIds } } : {}),
        },
      }),
      this.prisma.payment.count({
        where: {
          status: PaymentStatus.FAILED,
          ...(companyIds ? { companyId: { in: companyIds } } : {}),
        },
      }),
    ]);

    return {
      revenueCents: range._sum.costCents ?? 0,
      todayCents: today._sum.costCents ?? 0,
      monthCents: month._sum.costCents ?? 0,
      energyKwh: Number(range._sum.energyKwh ?? 0),
      sessions: range._count,
      averageTicketCents: Math.round(range._avg.costCents ?? 0),
      pendingPayments: pending,
      failedPayments: failed,
    };
  }
}
