import { Injectable, Logger } from "@nestjs/common";
import {
  ValidationError,
  authorizationAmountCents,
  calculateFinalCost,
  readTariffSnapshot,
} from "@evcharge/domain";
import { PaymentAuthorizationStatus, PaymentStatus, Prisma } from "@prisma/client";
import {
  AsaasPaymentProvider,
  PaymentProviderFactory,
  type PaymentProvider,
} from "@evcharge/payment-provider";
import { PrismaService } from "../common/database/database.module";
import { AuditLogger } from "../common/logging/audit-logger";
import { WalletService } from "../wallet/wallet.service";

@Injectable()
export class SessionBillingService {
  private readonly audit = new AuditLogger(new Logger(SessionBillingService.name));
  private readonly provider: PaymentProvider;
  private readonly energyKwh = Number(process.env.SESSION_AUTH_ENERGY_KWH ?? 30);
  private readonly durationMinutes = Number(process.env.SESSION_AUTH_MINUTES ?? 60);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
  ) {
    this.provider = PaymentProviderFactory.create(process.env.PAYMENT_PROVIDER ?? "mock");
  }

  quoteFromSnapshot(snapshot: ReturnType<typeof readTariffSnapshot>) {
    if (!snapshot) throw new ValidationError("Tarifa indisponível para autorização");
    const estimated = calculateFinalCost({
      energyKwh: this.energyKwh,
      durationMinutes: this.durationMinutes,
      idleMinutes: 0,
      snapshot,
    });
    return {
      estimatedTotalCents: estimated.totalCents,
      authorizedAmountCents: authorizationAmountCents({
        estimatedTotalCents: estimated.totalCents,
        minBalanceCents: snapshot.minBalanceCents,
        energyKwh: this.energyKwh,
        durationMinutes: this.durationMinutes,
      }),
    };
  }

  async authorizeInTx(
    tx: Prisma.TransactionClient,
    params: {
      userId: string;
      sessionId: string;
      paymentKind: string;
      paymentMethodId?: string;
      snapshot: NonNullable<ReturnType<typeof readTariffSnapshot>>;
    },
  ) {
    const quote = this.quoteFromSnapshot(params.snapshot);
    const amount = quote.authorizedAmountCents;
    const existing = await tx.paymentAuthorization.findUnique({ where: { sessionId: params.sessionId } });
    if (existing?.status === PaymentAuthorizationStatus.AUTHORIZED || existing?.status === PaymentAuthorizationStatus.CAPTURED) {
      return quote;
    }
    if (params.paymentKind === "CARD") {
      if (!this.provider.capabilities.supportsCardPreAuthorization) {
        await this.wallet.createHold(tx, {
          userId: params.userId,
          sessionId: params.sessionId,
          amountCents: amount,
          idempotencyKey: `hold-${params.sessionId}`,
        });
        await tx.paymentAuthorization.create({
          data: {
            sessionId: params.sessionId,
            method: "WALLET",
            authorizedAmountCents: amount,
            status: PaymentAuthorizationStatus.AUTHORIZED,
          },
        });
        await tx.chargingSession.update({
          where: { id: params.sessionId },
          data: { billingStatus: "AUTHORIZED", paymentKind: "WALLET" },
        });
        this.audit.info("payment.authorized", { sessionId: params.sessionId, method: "WALLET_FALLBACK", amountCents: amount });
        return quote;
      }
      if (!params.paymentMethodId) throw new ValidationError("Informe um cartão tokenizado", "PAYMENT_REQUIRES_ACTION");
      const method = await tx.paymentMethod.findFirst({
        where: { id: params.paymentMethodId, userId: params.userId, status: "ACTIVE" },
      });
      if (!method) throw new ValidationError("Cartão não encontrado", "PAYMENT_FAILED");
      if (!this.provider.authorizeCard) throw new ValidationError("Pré-autorização indisponível", "PAYMENT_FAILED");
      let charge;
      try {
        charge = await this.provider.authorizeCard({
          amountCents: amount,
          currency: "BRL",
          kind: "CARD",
          idempotencyKey: `auth-${params.sessionId}`,
          customerRef: params.userId,
          paymentMethodToken: method.providerMethodId,
          authorizeOnly: true,
          description: `Pré-autorização sessão ${params.sessionId.slice(-6)}`,
        });
      } catch {
        throw new ValidationError("Não foi possível autorizar o pagamento. Tente outro método.", "PAYMENT_FAILED");
      }
      const payment = await tx.payment.create({
        data: {
          userId: params.userId,
          sessionId: params.sessionId,
          paymentMethodId: method.id,
          amountCents: amount,
          currency: "BRL",
          status: (charge.status as PaymentStatus) ?? PaymentStatus.AUTHORIZED,
          method: "CARD",
          kind: "CARD",
          provider: charge.provider,
          providerRef: charge.providerRef,
        },
      });
      await tx.paymentAuthorization.create({
        data: {
          sessionId: params.sessionId,
          paymentId: payment.id,
          method: "CARD",
          authorizedAmountCents: amount,
          status: PaymentAuthorizationStatus.AUTHORIZED,
          providerReference: charge.providerRef,
        },
      });
      await tx.chargingSession.update({
        where: { id: params.sessionId },
        data: { billingStatus: "AUTHORIZED" },
      });
      this.audit.info("payment.authorized", { sessionId: params.sessionId, paymentId: payment.id, amountCents: amount });
      return quote;
    }

    await this.wallet.createHold(tx, {
      userId: params.userId,
      sessionId: params.sessionId,
      amountCents: amount,
      idempotencyKey: `hold-${params.sessionId}`,
    });
    await tx.paymentAuthorization.create({
      data: {
        sessionId: params.sessionId,
        method: "WALLET",
        authorizedAmountCents: amount,
        status: PaymentAuthorizationStatus.AUTHORIZED,
      },
    });
    await tx.chargingSession.update({
      where: { id: params.sessionId },
      data: { billingStatus: "AUTHORIZED", paymentKind: params.paymentKind === "PIX" ? "WALLET" : params.paymentKind },
    });
    this.audit.info("payment.authorized", { sessionId: params.sessionId, method: "WALLET", amountCents: amount });
    return quote;
  }

  async finalizeInTx(tx: Prisma.TransactionClient, sessionId: string, costCents: number) {
    const auth = await tx.paymentAuthorization.findUnique({ where: { sessionId } });
    if (auth?.status === PaymentAuthorizationStatus.CAPTURED) {
      return { capturedCents: auth.capturedAmountCents, billingStatus: "CAPTURED" };
    }
    try {
      if (auth?.method === "CARD" && auth.providerReference && this.provider.capturePayment) {
        const captured = await this.provider.capturePayment(auth.providerReference, costCents);
        if (auth.paymentId) {
          await tx.payment.update({
            where: { id: auth.paymentId },
            data: { status: PaymentStatus.CONFIRMED, amountCents: captured.amountCents, confirmedAt: new Date() },
          });
        }
        await tx.paymentAuthorization.update({
          where: { id: auth.id },
          data: {
            status: PaymentAuthorizationStatus.CAPTURED,
            capturedAmountCents: captured.amountCents,
            releasedAmountCents: Math.max(0, auth.authorizedAmountCents - captured.amountCents),
          },
        });
      } else {
        await this.wallet.captureHold(tx, { sessionId, amountCents: costCents });
        if (auth) {
          await tx.paymentAuthorization.update({
            where: { id: auth.id },
            data: {
              status: PaymentAuthorizationStatus.CAPTURED,
              capturedAmountCents: costCents,
              releasedAmountCents: Math.max(0, auth.authorizedAmountCents - costCents),
            },
          });
        }
      }
      await tx.chargingSession.update({ where: { id: sessionId }, data: { billingStatus: "CAPTURED" } });
      this.audit.info("billing.finalized", { sessionId, costCents });
      return { capturedCents: costCents, billingStatus: "CAPTURED" };
    } catch (error) {
      await tx.chargingSession.update({ where: { id: sessionId }, data: { billingStatus: "PAYMENT_FAILED" } });
      this.audit.warn("billing.failed", { sessionId, message: error instanceof Error ? error.message : "billing_failed" });
      throw error;
    }
  }

  async releaseInTx(tx: Prisma.TransactionClient, sessionId: string) {
    await this.wallet.releaseHold(tx, sessionId);
    const auth = await tx.paymentAuthorization.findUnique({ where: { sessionId } });
    if (auth?.status === PaymentAuthorizationStatus.AUTHORIZED) {
      if (auth.method === "CARD" && auth.providerReference) {
        await this.provider.cancelPayment(auth.providerReference).catch(() => undefined);
      }
      await tx.paymentAuthorization.update({
        where: { id: auth.id },
        data: { status: PaymentAuthorizationStatus.RELEASED, releasedAmountCents: auth.authorizedAmountCents },
      });
    }
    await tx.chargingSession.update({ where: { id: sessionId }, data: { billingStatus: "RELEASED" } }).catch(() => undefined);
  }

  isAsaas() {
    return this.provider instanceof AsaasPaymentProvider;
  }
}
