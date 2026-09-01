import { Injectable } from "@nestjs/common";
import { ConflictError, NotFoundError } from "@evcharge/domain";
import type { CreateCompanyInput, UpdateCompanyInput } from "@evcharge/shared";
import { PrismaService } from "../common/database/database.module";
import { TenantAccessService } from "../common/services/tenant-access.service";
import { AuthenticatedUser } from "../common/types/auth.types";

@Injectable()
export class CompaniesService {
  constructor(
    private prisma: PrismaService,
    private tenantAccess: TenantAccessService,
  ) {}

  async findOne(id: string, user: AuthenticatedUser) {
    this.tenantAccess.assertCompanyAccess(user, id);
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundError("Company", id);
    return company;
  }

  async create(input: CreateCompanyInput, user: AuthenticatedUser) {
    this.tenantAccess.assertSuperAdmin(user);
    try {
      return await this.prisma.company.create({ data: input });
    } catch {
      throw new ConflictError("Company slug or CNPJ already exists");
    }
  }

  async update(id: string, input: UpdateCompanyInput, user: AuthenticatedUser) {
    this.tenantAccess.assertCompanyAccess(user, id);
    this.tenantAccess.assertAdminOrAbove(user);

    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundError("Company", id);

    try {
      return await this.prisma.company.update({ where: { id }, data: input });
    } catch {
      throw new ConflictError("Company update conflict");
    }
  }
}
