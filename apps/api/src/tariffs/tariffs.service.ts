import { Injectable } from "@nestjs/common";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  calculateEstimatedCost,
  pickEffectiveTariff,
  toTariffSnapshot,
  type TariffLike,
} from "@evcharge/domain";
import type { CreateTariffInput, UpdateTariffInput } from "@evcharge/shared";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/database/database.module";
import { TenantAccessService } from "../common/services/tenant-access.service";
import { AuthenticatedUser } from "../common/types/auth.types";

function asTariffLike(tariff: {
  id: string;
  name: string;
  pricePerKwhCents: number;
  pricePerMinuteCents: number;
  idleFeeCents: number;
  connectionFeeCents: number;
  parkingPriceCents?: number;
  minBalanceCents: number;
  minimumChargeCents?: number;
  currency: string;
  active: boolean;
  validFrom: Date | null;
  validTo: Date | null;
}): TariffLike {
  return tariff;
}

@Injectable()
export class TariffsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantAccess: TenantAccessService,
  ) {}

  async list(user: AuthenticatedUser, companyId?: string) {
    this.tenantAccess.assertOperatorOrAbove(user);
    const where: Prisma.TariffWhereInput = {};
    if (this.tenantAccess.isSuperAdmin(user)) {
      if (companyId) where.companyId = companyId;
    } else {
      where.companyId = { in: user.companyIds };
      if (companyId) {
        this.tenantAccess.assertCompanyAccess(user, companyId);
        where.companyId = companyId;
      }
    }
    return this.prisma.tariff.findMany({
      where,
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    this.tenantAccess.assertOperatorOrAbove(user);
    const tariff = await this.prisma.tariff.findUnique({ where: { id } });
    if (!tariff) throw new NotFoundError("Tariff", id);
    this.tenantAccess.assertCompanyAccess(user, tariff.companyId);
    return tariff;
  }

  async create(input: CreateTariffInput, user: AuthenticatedUser) {
    this.tenantAccess.assertOperatorOrAbove(user);
    this.tenantAccess.assertCompanyAccess(user, input.companyId);
    return this.prisma.tariff.create({
      data: {
        companyId: input.companyId,
        name: input.name,
        pricePerKwhCents: input.pricePerKwhCents,
        pricePerMinuteCents: input.pricePerMinuteCents,
        idleFeeCents: input.idleFeeCents,
        connectionFeeCents: input.connectionFeeCents,
        parkingPriceCents: input.parkingPriceCents,
        minBalanceCents: input.minBalanceCents,
        minimumChargeCents: input.minimumChargeCents,
        currency: input.currency,
        validFrom: input.validFrom ?? null,
        validTo: input.validTo ?? null,
        active: input.active,
      },
    });
  }

  async update(id: string, input: UpdateTariffInput, user: AuthenticatedUser) {
    const tariff = await this.findOne(id, user);
    return this.prisma.tariff.update({
      where: { id: tariff.id },
      data: {
        ...input,
        validFrom: input.validFrom === undefined ? undefined : input.validFrom,
        validTo: input.validTo === undefined ? undefined : input.validTo,
      },
    });
  }

  async remove(id: string, user: AuthenticatedUser) {
    await this.findOne(id, user);
    const sessions = await this.prisma.chargingSession.count({ where: { tariffId: id } });
    if (sessions > 0) {
      return this.prisma.tariff.update({
        where: { id },
        data: { active: false },
      });
    }
    await this.prisma.station.updateMany({ where: { tariffId: id }, data: { tariffId: null } });
    await this.prisma.connector.updateMany({ where: { tariffId: id }, data: { tariffId: null } });
    await this.prisma.tariff.delete({ where: { id } });
    return { id, deleted: true };
  }

  async resolveForConnector(connectorId: string) {
    const connector = await this.prisma.connector.findUnique({
      where: { id: connectorId },
      include: {
        tariff: true,
        charger: {
          include: {
            station: {
              include: {
                tariff: true,
                company: { include: { tariffs: { orderBy: { createdAt: "asc" } } } },
              },
            },
          },
        },
      },
    });
    if (!connector) throw new NotFoundError("Connector", connectorId);

    const tariff = pickEffectiveTariff({
      connectorTariff: connector.tariff ? asTariffLike(connector.tariff) : null,
      stationTariff: connector.charger.station.tariff
        ? asTariffLike(connector.charger.station.tariff)
        : null,
      companyTariffs: connector.charger.station.company.tariffs.map(asTariffLike),
    });
    if (!tariff) {
      throw new ValidationError("Nenhuma tarifa vigente encontrada para este conector");
    }
    return { tariff, snapshot: toTariffSnapshot(tariff), companyId: connector.charger.station.companyId };
  }

  async quote(connectorId: string, energyKwh: number, durationMinutes: number) {
    const { tariff, snapshot } = await this.resolveForConnector(connectorId);
    return {
      tariff: { id: tariff.id, name: tariff.name, currency: tariff.currency },
      snapshot,
      estimate: calculateEstimatedCost({ energyKwh, durationMinutes, snapshot }),
      demoPayments: (process.env.PAYMENT_PROVIDER ?? "mock") === "mock",
    };
  }

  async assertCompanyTariff(tariffId: string, companyId: string) {
    const tariff = await this.prisma.tariff.findUnique({ where: { id: tariffId } });
    if (!tariff) throw new NotFoundError("Tariff", tariffId);
    if (tariff.companyId !== companyId) {
      throw new ConflictError("Tarifa não pertence a esta empresa");
    }
    return tariff;
  }
}
