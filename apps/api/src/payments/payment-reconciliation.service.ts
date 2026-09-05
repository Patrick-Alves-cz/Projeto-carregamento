import { Injectable, Logger } from "@nestjs/common";
import { PaymentReconciliationStatus, PaymentStatus, Prisma, SessionStatus } from "@prisma/client";
import { PaymentProviderFactory, type PaymentProvider } from "@evcharge/payment-provider";
import { PrismaService } from "../common/database/database.module";
import { TenantAccessService } from "../common/services/tenant-access.service";
import { AuthenticatedUser } from "../common/types/auth.types";
import { AuditLogger } from "../common/logging/audit-logger";

@Injectable()
export class PaymentReconciliationService {
  private readonly audit = new AuditLogger(new Logger(PaymentReconciliationService.name));
  private readonly provider: PaymentProvider;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantAccessService,
  ) {
    this.provider = PaymentProviderFactory.create(process.env.PAYMENT_PROVIDER ?? "mock");
  }

  async detect() {
    const pendingWebhooks = await this.prisma.paymentWebhookEvent.findMany({
      where: { processedAt: null, status: { not: "FAILED" } },
      take: 50,
    });
    for (const event of pendingWebhooks) {
      if (!event.paymentId) continue;
      const payment = await this.prisma.payment.findUnique({ where: { id: event.paymentId } });
      if (!payment?.companyId) continue;
      await this.open({
        companyId: payment.companyId,
        paymentId: payment.id,
        reason: "WEBHOOK_PENDING",
        details: { eventId: event.externalEventId },
      });
    }

    const paidLike = await this.prisma.payment.findMany({
      where: { status: { in: [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED] }, providerRef: { not: null } },
      take: 50,
    });
    for (const payment of paidLike) {
      if (!payment.providerRef || payment.provider === "internal") continue;
      try {
        const remote = await this.provider.getPaymentStatus(payment.providerRef);
        if ((remote.status === "CONFIRMED" || remote.status === "REFUNDED") && payment.companyId) {
          await this.open({
            companyId: payment.companyId,
            paymentId: payment.id,
            reason: remote.status === "REFUNDED" ? "REFUND_MISMATCH" : "GATEWAY_PAID_INTERNAL_PENDING",
            details: { providerRef: payment.providerRef, remoteStatus: remote.status },
          });
        }
      } catch {
        this.audit.warn("webhook.failed", { paymentId: payment.id, reason: "status_lookup_failed" });
      }
    }

    const completed = await this.prisma.chargingSession.findMany({
      where: { status: SessionStatus.COMPLETED, billingStatus: { in: ["AUTHORIZED", "PAYMENT_FAILED"] } },
      include: { connector: { include: { charger: { include: { station: true } } } } },
      take: 50,
    });
    for (const session of completed) {
      await this.open({
        companyId: session.connector.charger.station.companyId,
        sessionId: session.id,
        reason: "SESSION_COMPLETED_WITHOUT_FINAL_BILLING",
        details: { billingStatus: session.billingStatus, costCents: session.costCents },
      });
    }
  }

  async list(user: AuthenticatedUser) {
    this.tenant.assertOperatorOrAbove(user);
    return this.prisma.paymentReconciliationCase.findMany({
      where: this.tenant.isSuperAdmin(user) ? {} : { companyId: { in: user.companyIds } },
      include: { payment: true, session: true },
      orderBy: { detectedAt: "desc" },
      take: 100,
    });
  }

  async openCase(input: {
    companyId: string;
    paymentId?: string;
    sessionId?: string;
    reason: string;
    details: Record<string, unknown>;
  }) {
    return this.open(input);
  }

  private async open(input: {
    companyId: string;
    paymentId?: string;
    sessionId?: string;
    reason: string;
    details: Record<string, unknown>;
  }) {
    const existing = await this.prisma.paymentReconciliationCase.findFirst({
      where: {
        companyId: input.companyId,
        reason: input.reason,
        status: PaymentReconciliationStatus.OPEN,
        paymentId: input.paymentId ?? null,
        sessionId: input.sessionId ?? null,
      },
    });
    if (existing) return existing;
    this.audit.info("webhook.received", { reason: input.reason, paymentId: input.paymentId });
    return this.prisma.paymentReconciliationCase.create({
      data: {
        companyId: input.companyId,
        paymentId: input.paymentId,
        sessionId: input.sessionId,
        reason: input.reason,
        details: input.details as Prisma.InputJsonValue,
      },
    });
  }
}
