import { Injectable } from "@nestjs/common";
import { ConflictError, NotFoundError } from "@evcharge/domain";
import type { CreateConnectorInput, UpdateConnectorInput } from "@evcharge/shared";
import { PrismaService } from "../common/database/database.module";
import { TenantAccessService } from "../common/services/tenant-access.service";
import { AuthenticatedUser } from "../common/types/auth.types";

@Injectable()
export class ConnectorsService {
  constructor(
    private prisma: PrismaService,
    private tenantAccess: TenantAccessService,
  ) {}

  async findAll(chargerId: string | undefined, user: AuthenticatedUser) {
    const chargerIds = await this.getAccessibleChargerIds(user, chargerId);
    return this.prisma.connector.findMany({
      where: { chargerId: { in: chargerIds } },
      include: { charger: { include: { station: true } } },
      orderBy: [{ chargerId: "asc" }, { number: "asc" }],
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const connector = await this.prisma.connector.findUnique({
      where: { id },
      include: { charger: { include: { station: true } } },
    });
    if (!connector) throw new NotFoundError("Connector", id);
    if (user.role !== "DRIVER" && !this.tenantAccess.isSuperAdmin(user)) {
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

    try {
      return await this.prisma.connector.create({ data: input });
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

    return this.prisma.connector.update({ where: { id }, data: input });
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

    const stationFilter =
      user.role === "DRIVER" || this.tenantAccess.isSuperAdmin(user)
        ? {}
        : { companyId: { in: user.companyIds } };

    const chargers = await this.prisma.charger.findMany({
      where: { station: stationFilter },
      select: { id: true },
    });
    return chargers.map((c) => c.id);
  }
}
