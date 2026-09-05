import { Injectable } from "@nestjs/common";
import { ForbiddenError, NotFoundError, ValidationError } from "@evcharge/domain";
import type { CreatePaymentMethodInput } from "@evcharge/shared";
import { PaymentProviderFactory } from "@evcharge/payment-provider";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../common/database/database.module";
import { TenantAccessService } from "../common/services/tenant-access.service";
import { AuthenticatedUser } from "../common/types/auth.types";
import { AuditLogger } from "../common/logging/audit-logger";
import { Logger } from "@nestjs/common";

@Injectable()
export class PaymentMethodsService {
  private readonly audit = new AuditLogger(new Logger(PaymentMethodsService.name));
  private readonly provider = PaymentProviderFactory.create(process.env.PAYMENT_PROVIDER ?? "mock");

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantAccessService,
  ) {}

  async listAdmin(user: AuthenticatedUser) {
    this.tenant.assertOperatorOrAbove(user);
    return this.prisma.paymentMethod.findMany({
      where: this.tenant.isSuperAdmin(user)
        ? { status: "ACTIVE" }
        : {
            status: "ACTIVE",
            user: { companyMembers: { some: { companyId: { in: user.companyIds } } } },
          },
      include: { user: { select: { id: true, email: true, profile: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async list(user: AuthenticatedUser) {
    this.assertDriver(user);
    return this.prisma.paymentMethod.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
  }

  async create(user: AuthenticatedUser, input: CreatePaymentMethodInput) {
    this.assertDriver(user);
    const token = await this.provider.tokenizeCard({
      brand: input.brand,
      last4: input.last4,
      expMonth: input.expMonth,
      expYear: input.expYear,
    });
    const count = await this.prisma.paymentMethod.count({ where: { userId: user.id, status: "ACTIVE" } });
    const method = await this.prisma.paymentMethod.create({
      data: {
        userId: user.id,
        provider: this.provider.name,
        providerMethodId: token.token,
        brand: token.brand,
        last4: token.last4,
        expMonth: token.expMonth,
        expYear: token.expYear,
        isDefault: input.isDefault || count === 0,
      },
    });
    if (method.isDefault) {
      await this.prisma.paymentMethod.updateMany({
        where: { userId: user.id, id: { not: method.id } },
        data: { isDefault: false },
      });
    }
    this.audit.info("payment_method.created", { userId: user.id, brand: method.brand, last4: method.last4 });
    return method;
  }

  async remove(user: AuthenticatedUser, id: string) {
    this.assertDriver(user);
    const method = await this.prisma.paymentMethod.findFirst({ where: { id, userId: user.id } });
    if (!method) throw new NotFoundError("PaymentMethod", id);
    await this.prisma.paymentMethod.update({ where: { id }, data: { status: "REVOKED", isDefault: false } });
    return { id, deleted: true };
  }

  async setDefault(user: AuthenticatedUser, id: string) {
    this.assertDriver(user);
    const method = await this.prisma.paymentMethod.findFirst({ where: { id, userId: user.id, status: "ACTIVE" } });
    if (!method) throw new NotFoundError("PaymentMethod", id);
    await this.prisma.paymentMethod.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
    return this.prisma.paymentMethod.update({ where: { id }, data: { isDefault: true } });
  }

  private assertDriver(user: AuthenticatedUser) {
    if (user.role !== UserRole.DRIVER) throw new ForbiddenError("Somente motoristas gerenciam cartões");
    if (!user) throw new ValidationError("Usuário inválido");
  }
}
