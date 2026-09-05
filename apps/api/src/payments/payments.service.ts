import { Injectable, Logger } from "@nestjs/common";
import { ForbiddenError, isPaidStatus, mapProviderPaymentStatus, NotFoundError, toPrismaPaymentStatus, ValidationError } from "@evcharge/domain";
import type { CreatePaymentInput, SimulatePaymentInput } from "@evcharge/shared";
import {
  MockPaymentProvider,
  PaymentProviderFactory,
  type PaymentKind,
  type PaymentProvider,
} from "@evcharge/payment-provider";
import { NotificationType, PaymentStatus, Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "../common/database/database.module";
import { AuditLogger } from "../common/logging/audit-logger";
import { AuthenticatedUser } from "../common/types/auth.types";
import { TenantAccessService } from "../common/services/tenant-access.service";
import { WalletService } from "../wallet/wallet.service";
import { NotificationsService } from "../notifications/notifications.service";
import { ChargingEventsService } from "../charging/charging-events.service";
import { PaymentReconciliationService } from "./payment-reconciliation.service";

const SUCCESS_STATUSES: PaymentStatus[] = [PaymentStatus.CONFIRMED, PaymentStatus.COMPLETED];

@Injectable()
export class PaymentsService {
  private readonly audit = new AuditLogger(new Logger(PaymentsService.name));
  private readonly provider: PaymentProvider;

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly notifications: NotificationsService,
    private readonly events: ChargingEventsService,
    private readonly tenant: TenantAccessService,
    private readonly recon: PaymentReconciliationService,
  ) {
    this.provider = PaymentProviderFactory.create(process.env.PAYMENT_PROVIDER ?? "mock");
  }

  isDemo() {
    return this.provider.name === "mock";
  }

  capabilities() {
    return {
      provider: this.provider.name,
      environment: process.env.PAYMENT_ENVIRONMENT ?? "sandbox",
      demo: this.isDemo(),
      ...this.provider.capabilities,
    };
  }

  async create(user: AuthenticatedUser, input: CreatePaymentInput & { idempotencyKey?: string }) {
    this.assertDriver(user);
    const idempotencyKey = input.idempotencyKey ?? `pay-${user.id}-${Date.now()}`;
    if (input.idempotencyKey) {
      const existing = await this.prisma.payment.findUnique({ where: { idempotencyKey } });
      if (existing) return this.toView(existing, true);
    }

    const kind = (input.kind ?? "PIX") as PaymentKind;
    let paymentMethodToken: string | undefined;
    if (kind === "CARD") {
      if (!input.paymentMethodId) throw new ValidationError("Informe um cartão tokenizado");
      const method = await this.prisma.paymentMethod.findFirst({
        where: { id: input.paymentMethodId, userId: user.id, status: "ACTIVE" },
      });
      if (!method) throw new NotFoundError("PaymentMethod", input.paymentMethodId);
      paymentMethodToken = method.providerMethodId;
    }

    const charge = await this.provider.createPayment({
      amountCents: input.amountCents,
      currency: "BRL",
      kind,
      idempotencyKey,
      customerRef: user.id,
      paymentMethodToken,
      description: "Crédito de carteira EV Charge",
      authorizeOnly: kind === "CARD" ? false : undefined,
    });

    const payment = await this.prisma.payment.create({
      data: {
        userId: user.id,
        amountCents: input.amountCents,
        currency: "BRL",
        status: PaymentStatus.PENDING,
        method: kind === "WALLET" ? "WALLET_DEMO" : kind,
        kind,
        provider: charge.provider,
        providerRef: charge.providerRef,
        pixCopyPaste: charge.pixCopyPaste,
        pixQrPayload: charge.pixQrPayload,
        expiresAt: charge.expiresAt,
        paymentMethodId: input.paymentMethodId,
        companyId: user.companyIds[0],
        idempotencyKey,
      },
    });

    this.audit.info("payment.created", {
      paymentId: payment.id,
      userId: user.id,
      amountCents: payment.amountCents,
      kind,
      provider: payment.provider,
    });
    await this.events.publish({
      type: "payment.created",
      entityType: "payment",
      entityId: payment.id,
      timestamp: new Date(),
      payload: { paymentId: payment.id, userId: user.id, amountCents: payment.amountCents, kind },
    });

    if (kind !== "PIX" && (charge.status === "CONFIRMED" || charge.status === "AUTHORIZED")) {
      return this.confirmInternal(payment.id, charge.status);
    }
    return this.toView(payment, false);
  }

  async mine(user: AuthenticatedUser, id: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundError("Payment", id);
    if (user.role === UserRole.DRIVER && payment.userId !== user.id) {
      throw new ForbiddenError("Pagamento de outro usuário");
    }
    if (user.role !== UserRole.DRIVER && user.role !== UserRole.SUPER_ADMIN) {
      if (payment.companyId) this.tenant.assertCompanyAccess(user, payment.companyId);
    }
    return this.toView(payment, false);
  }

  async listMine(user: AuthenticatedUser) {
    this.assertDriver(user);
    return this.prisma.payment.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async listAdmin(
    user: AuthenticatedUser,
    query: {
      status?: PaymentStatus;
      stationId?: string;
      from?: Date;
      to?: Date;
      method?: string;
      provider?: string;
      companyId?: string;
    },
  ) {
    this.tenant.assertOperatorOrAbove(user);
    const where: Prisma.PaymentWhereInput = {};
    if (!this.tenant.isSuperAdmin(user)) {
      where.OR = [
        { companyId: { in: user.companyIds } },
        {
          session: {
            connector: { charger: { station: { companyId: { in: user.companyIds } } } },
          },
        },
      ];
    }
    if (query.status) where.status = query.status;
    if (query.method) where.method = query.method;
    if (query.provider) where.provider = query.provider;
    if (query.companyId) {
      this.tenant.assertCompanyAccess(user, query.companyId);
      where.companyId = query.companyId;
    }
    if (query.stationId) {
      where.session = {
        connector: { charger: { stationId: query.stationId } },
      };
    }
    if (query.from || query.to) {
      where.createdAt = {
        gte: query.from,
        lte: query.to,
      };
    }
    return this.prisma.payment.findMany({
      where,
      include: {
        session: { include: { connector: { include: { charger: { include: { station: true } } } }, user: { include: { profile: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async simulate(user: AuthenticatedUser, id: string, input: SimulatePaymentInput) {
    this.assertDriver(user);
    if (!this.isDemo()) throw new ValidationError("Simulação disponível apenas no provider DEMO");
    const payment = await this.prisma.payment.findFirst({ where: { id, userId: user.id } });
    if (!payment) throw new NotFoundError("Payment", id);
    if (payment.providerRef && this.provider instanceof MockPaymentProvider) {
      this.provider.simulate(payment.providerRef, input.outcome);
    }
    return this.applyStatus(payment.id, input.outcome as PaymentStatus, `sim-${id}-${input.outcome}`);
  }

  async handleWebhook(provider: string, body: {
    eventId: string;
    eventType: string;
    paymentId?: string;
    providerRef?: string;
    status: PaymentStatus;
    amountCents?: number;
  }) {
    this.audit.info("webhook.received", { provider, eventType: body.eventType, eventId: body.eventId });
    const existingEvent = await this.prisma.paymentWebhookEvent.findUnique({
      where: { provider_externalEventId: { provider, externalEventId: body.eventId } },
    });
    if (existingEvent?.processedAt) {
      return { replayed: true, paymentId: existingEvent.paymentId };
    }

    const event = existingEvent ?? await this.prisma.paymentWebhookEvent.create({
      data: {
        provider,
        externalEventId: body.eventId,
        eventType: body.eventType,
        providerPaymentId: body.providerRef,
        payload: { eventType: body.eventType, status: body.status, amountCents: body.amountCents },
        paymentId: body.paymentId,
        status: "RECEIVED",
      },
    });

    const payment = body.paymentId
      ? await this.prisma.payment.findUnique({ where: { id: body.paymentId } })
      : body.providerRef
        ? await this.prisma.payment.findFirst({ where: { provider, providerRef: body.providerRef } })
        : null;
    if (!payment) {
      await this.prisma.paymentWebhookEvent.update({
        where: { id: event.id },
        data: { status: "FAILED", errorSanitized: "payment_not_found" },
      });
      throw new NotFoundError("Payment", body.paymentId ?? body.providerRef ?? "unknown");
    }

    let status = toDbPaymentStatus(body.status);
    let remoteAmount = body.amountCents;
    if (provider === "asaas" && payment.providerRef) {
      try {
        const remote = await this.provider.getPaymentStatus(payment.providerRef);
        status = toDbPaymentStatus(remote.status);
        remoteAmount = remote.amountCents;
      } catch {
        this.audit.warn("webhook.failed", { paymentId: payment.id, reason: "provider_status_unavailable" });
      }
    }
    if (typeof remoteAmount === "number" && remoteAmount !== payment.amountCents) {
      if (payment.companyId) {
        await this.recon.openCase({
          companyId: payment.companyId,
          paymentId: payment.id,
          reason: "AMOUNT_MISMATCH",
          details: { expected: payment.amountCents, received: remoteAmount },
        });
      }
      await this.prisma.paymentWebhookEvent.update({
        where: { id: event.id },
        data: { status: "FAILED", errorSanitized: "amount_mismatch", processedAt: new Date(), paymentId: payment.id },
      });
      return { replayed: false, paymentId: payment.id, status: payment.status, rejected: "amount_mismatch" };
    }

    const result = await this.applyStatus(payment.id, status, body.eventId);
    await this.prisma.paymentWebhookEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date(), paymentId: payment.id, status: "PROCESSED" },
    });
    this.audit.info("webhook.processed", { paymentId: payment.id, eventId: body.eventId, status: result.status });
    return { replayed: false, paymentId: result.id, status: result.status };
  }

  async refund(
    user: AuthenticatedUser,
    id: string,
    input: { reason: string; amountCents?: number; idempotencyKey?: string },
  ) {
    this.tenant.assertOperatorOrAbove(user);
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundError("Payment", id);
    if (payment.companyId) this.tenant.assertCompanyAccess(user, payment.companyId);
    const key = input.idempotencyKey ?? `refund-${id}`;
    if (payment.refundIdempotencyKey === key && (payment.status === PaymentStatus.REFUNDED || payment.status === PaymentStatus.REFUND_PENDING)) {
      return this.toView(payment, true);
    }
    if (!isPaidStatus(payment.status) && payment.status !== PaymentStatus.AUTHORIZED) {
      throw new ValidationError("Somente pagamentos confirmados podem ser estornados");
    }
    this.audit.info("payment.refund_requested", { paymentId: id, userId: user.id, reason: input.reason });
    await this.prisma.payment.update({
      where: { id },
      data: {
        status: PaymentStatus.REFUND_PENDING,
        refundReason: input.reason,
        refundRequestedAt: new Date(),
        refundIdempotencyKey: key,
      },
    });
    if (payment.providerRef && this.provider.capabilities.supportsRefund) {
      const refunded = await this.provider.refundPayment(payment.providerRef, input.amountCents);
      const next =
        refunded.status === "PARTIALLY_REFUNDED" ? PaymentStatus.PARTIALLY_REFUNDED : PaymentStatus.REFUNDED;
      if (payment.walletCredited) {
        await this.prisma.$transaction(async (tx) => {
          await this.wallet.debitForSession(tx, {
            userId: payment.userId,
            sessionId: payment.sessionId,
            amountCents: input.amountCents ?? payment.amountCents,
            description: `Estorno ${id.slice(-6)}`,
            idempotencyKey: `refund-debit-${id}`,
          });
        });
      }
      const updated = await this.prisma.payment.update({
        where: { id },
        data: {
          status: next,
          refundedAmountCents: input.amountCents ?? payment.amountCents,
        },
      });
      this.audit.info("payment.refunded", { paymentId: id, amountCents: updated.refundedAmountCents });
      return this.toView(updated, false);
    }
    return this.applyStatus(id, PaymentStatus.REFUNDED, key);
  }

  async expireDue() {
    const due = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.PENDING,
        expiresAt: { lte: new Date() },
      },
      take: 50,
    });
    for (const payment of due) {
      await this.applyStatus(payment.id, PaymentStatus.EXPIRED, `expire-${payment.id}`);
    }
  }

  private async applyStatus(paymentId: string, next: PaymentStatus, idempotencyKey: string) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment) throw new NotFoundError("Payment", paymentId);

      if (SUCCESS_STATUSES.includes(payment.status) && SUCCESS_STATUSES.includes(next)) {
        return payment;
      }
      if (payment.status === next) return payment;
      const blocked: PaymentStatus[] = [
        PaymentStatus.CANCELLED,
        PaymentStatus.EXPIRED,
        PaymentStatus.REFUNDED,
        PaymentStatus.FAILED,
      ];
      if (blocked.includes(payment.status) && SUCCESS_STATUSES.includes(next)) {
        this.audit.warn("payment.ignored_out_of_order", { paymentId, from: payment.status, to: next });
        return payment;
      }

      const data: Prisma.PaymentUpdateInput = { status: next };
      if (SUCCESS_STATUSES.includes(next)) data.confirmedAt = new Date();
      if (next === PaymentStatus.CANCELLED || next === PaymentStatus.EXPIRED) data.cancelledAt = new Date();
      if (next === PaymentStatus.FAILED) data.failureCode = "PROVIDER_FAILED";
      if (next === PaymentStatus.REFUNDED || next === PaymentStatus.PARTIALLY_REFUNDED) {
        data.refundedAmountCents = payment.amountCents;
      }

      const updated = await tx.payment.update({ where: { id: paymentId }, data });

      if (SUCCESS_STATUSES.includes(next) && !payment.walletCredited) {
        await this.wallet.creditInTx(tx, {
          userId: updated.userId,
          amountCents: updated.amountCents,
          description: `Crédito de pagamento ${updated.id.slice(-6)}`,
          idempotencyKey: `payment-credit-${updated.id}`,
        });
        await tx.payment.update({
          where: { id: payment.id },
          data: { walletCredited: true },
        });
        this.audit.info("wallet.credited", {
          paymentId: payment.id,
          userId: payment.userId,
          amountCents: payment.amountCents,
          idempotencyKey,
        });
      }

      if (
        (next === PaymentStatus.REFUNDED || next === PaymentStatus.PARTIALLY_REFUNDED) &&
        payment.walletCredited
      ) {
        await this.wallet.debitForSession(tx, {
          userId: payment.userId,
          sessionId: payment.sessionId,
          amountCents: payment.amountCents,
          description: `Estorno ${payment.id.slice(-6)}`,
          idempotencyKey: `refund-debit-${payment.id}`,
        });
      } else if (
        (next === PaymentStatus.REFUNDED || next === PaymentStatus.PARTIALLY_REFUNDED) &&
        payment.sessionId &&
        !payment.walletCredited
      ) {
        await this.wallet.creditInTx(tx, {
          userId: payment.userId,
          amountCents: payment.amountCents,
          description: `Estorno da sessão ${payment.sessionId.slice(-6)}`,
          idempotencyKey: `refund-credit-${payment.id}`,
        });
      }

      return updated;
    }).then(async (updated) => {
      if (SUCCESS_STATUSES.includes(updated.status)) {
        this.audit.info("payment.paid", { paymentId: updated.id, userId: updated.userId, amountCents: updated.amountCents });
        await this.notifications.notify({
          userId: updated.userId,
          type: NotificationType.PAYMENT_CONFIRMED,
          title: "Pagamento confirmado",
          body: "Seu crédito foi adicionado à carteira.",
          payload: { paymentId: updated.id },
          dedupeKey: `payment-confirmed-${updated.id}`,
        });
        await this.events.publish({
          type: "payment.paid",
          entityType: "payment",
          entityId: updated.id,
          timestamp: new Date(),
          payload: { paymentId: updated.id, userId: updated.userId, amountCents: updated.amountCents },
        });
      }
      if (updated.status === PaymentStatus.FAILED) {
        this.audit.info("payment.failed", { paymentId: updated.id, userId: updated.userId });
        await this.notifications.notify({
          userId: updated.userId,
          type: NotificationType.PAYMENT_FAILED,
          title: "Pagamento não confirmado",
          body: "Não foi possível confirmar este pagamento.",
          payload: { paymentId: updated.id },
          dedupeKey: `payment-failed-${updated.id}`,
        });
      }
      if (updated.status === PaymentStatus.CANCELLED) {
        this.audit.info("payment.cancelled", { paymentId: updated.id });
      }
      if (updated.status === PaymentStatus.REFUNDED || updated.status === PaymentStatus.PARTIALLY_REFUNDED) {
        this.audit.info("payment.refunded", { paymentId: updated.id, amountCents: updated.refundedAmountCents });
        await this.events.publish({
          type: "payment.refunded",
          entityType: "payment",
          entityId: updated.id,
          timestamp: new Date(),
          payload: { paymentId: updated.id, amountCents: updated.refundedAmountCents },
        });
      }
      return this.toView(updated, false);
    });
  }

  private async confirmInternal(paymentId: string, _from: string) {
    return this.applyStatus(paymentId, PaymentStatus.CONFIRMED, `auto-${paymentId}`);
  }

  toView(payment: {
    id: string;
    status: PaymentStatus;
    amountCents: number;
    method: string;
    kind: string;
    provider: string;
    providerRef?: string | null;
    pixCopyPaste?: string | null;
    pixQrPayload?: string | null;
    expiresAt?: Date | null;
    confirmedAt?: Date | null;
    refundedAmountCents?: number;
    refundReason?: string | null;
    sessionId?: string | null;
    createdAt: Date;
  }, replayed: boolean) {
    return {
      ...payment,
      demo: this.isDemo(),
      replayed,
    };
  }

  private assertDriver(user: AuthenticatedUser) {
    if (user.role !== UserRole.DRIVER) throw new ForbiddenError("Somente motoristas criam pagamentos");
  }
}

function toDbPaymentStatus(raw: string): PaymentStatus {
  const mapped = toPrismaPaymentStatus(mapProviderPaymentStatus(raw));
  if ((Object.values(PaymentStatus) as string[]).includes(mapped)) {
    return mapped as PaymentStatus;
  }
  return PaymentStatus.PENDING;
}
