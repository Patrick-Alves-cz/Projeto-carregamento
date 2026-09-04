import { Injectable } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { ConflictError, ForbiddenError, NotFoundError } from "@evcharge/domain";
import type { CreateConnectorInput, UpdateConnectorInput } from "@evcharge/shared";
import { PrismaService } from "../common/database/database.module";
import { TenantAccessService } from "../common/services/tenant-access.service";
import { AuthenticatedUser } from "../common/types/auth.types";
import { ChargerProviderService } from "../charging/charger-provider.service";

@Injectable()
export class ConnectorsService {
  constructor(
    private prisma: PrismaService,
    private tenantAccess: TenantAccessService,
    private chargerProvider: ChargerProviderService,
  ) {}

  async findAll(chargerId: string | undefined, user: AuthenticatedUser) {
    this.assertAdminSurface(user);
    const chargerIds = await this.getAccessibleChargerIds(user, chargerId);
    return this.prisma.connector.findMany({
      where: { chargerId: { in: chargerIds } },
      include: { charger: { include: { station: true } } },
      orderBy: [{ chargerId: "asc" }, { number: "asc" }],
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    this.assertAdminSurface(user);
    const connector = await this.prisma.connector.findUnique({
      where: { id },
      include: { charger: { include: { station: true } } },
    });
    if (!connector) throw new NotFoundError("Connector", id);
    if (!this.tenantAccess.isSuperAdmin(user)) {
      this.tenantAccess.assertCompanyAccess(user, connector.charger.station.companyId);
    }
    return connector;
  }

  async create(input: CreateConnectorInput, user: AuthenticatedUser) {
    this.tenantAccess.assertOperatorOrAbove(user);
    const charger = await this.prisma.charger.findUnique({
      where: { id: input.chargerId },
      include: { station: true },
    });
    if (!charger) throw new NotFoundError("Charger", input.chargerId);
    this.tenantAccess.assertCompanyAccess(user, charger.station.companyId);
    if (input.tariffId) {
      const tariff = await this.prisma.tariff.findUnique({ where: { id: input.tariffId } });
      if (!tariff || tariff.companyId !== charger.station.companyId) {
        throw new ForbiddenError("Tarifa inválida para esta empresa");
      }
    }

    try {
      const connector = await this.prisma.connector.create({
        data: {
          chargerId: input.chargerId,
          number: input.number,
          type: input.type,
          maxPowerKw: input.maxPowerKw,
          tariffId: input.tariffId ?? undefined,
          status: "AVAILABLE",
        },
      });
      await this.chargerProvider.syncCharger(input.chargerId);
      return connector;
    } catch {
      throw new ConflictError("Connector number already exists for this charger");
    }
  }

  async update(id: string, input: UpdateConnectorInput, user: AuthenticatedUser) {
    const connector = await this.prisma.connector.findUnique({
      where: { id },
      include: { charger: { include: { station: true } } },
    });
    if (!connector) throw new NotFoundError("Connector", id);
    this.tenantAccess.assertCompanyAccess(user, connector.charger.station.companyId);
    this.tenantAccess.assertOperatorOrAbove(user);
    if (input.tariffId) {
      const tariff = await this.prisma.tariff.findUnique({ where: { id: input.tariffId } });
      if (!tariff || tariff.companyId !== connector.charger.station.companyId) {
        throw new ForbiddenError("Tarifa inválida para esta empresa");
      }
    }

    const updated = await this.prisma.connector.update({ where: { id }, data: input });
    await this.chargerProvider.syncCharger(connector.chargerId);
    return updated;
  }

  private assertAdminSurface(user: AuthenticatedUser) {
    if (user.role === UserRole.DRIVER) {
      throw new ForbiddenError("Motoristas acessam conectores pela estação");
    }
  }

  private async getAccessibleChargerIds(
    user: AuthenticatedUser,
    chargerId?: string,
  ): Promise<string[]> {
    if (chargerId) {
      const charger = await this.prisma.charger.findUnique({
        where: { id: chargerId },
        include: { station: true },
      });
      if (!charger) throw new NotFoundError("Charger", chargerId);
      if (!this.tenantAccess.isSuperAdmin(user)) {
        this.tenantAccess.assertCompanyAccess(user, charger.station.companyId);
      }
      return [chargerId];
    }

    const stationFilter = this.tenantAccess.isSuperAdmin(user)
      ? {}
      : { companyId: { in: user.companyIds } };

    const chargers = await this.prisma.charger.findMany({
      where: { station: stationFilter },
      select: { id: true },
    });
    return chargers.map((c) => c.id);
  }
}
