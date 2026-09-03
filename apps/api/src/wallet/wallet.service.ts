import { Injectable, Logger } from "@nestjs/common";
import {
  calculateCostCents,
  InsufficientBalanceError,
  ValidationError,
} from "@evcharge/domain";
import { Prisma, WalletTransactionType } from "@prisma/client";
import { PrismaService } from "../common/database/database.module";
import { AuditLogger } from "../common/logging/audit-logger";

@Injectable()
export class WalletService {
  private readonly audit = new AuditLogger(new Logger(WalletService.name));

  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateWallet(userId: string) {
    const existing = await this.prisma.wallet.findUnique({ where: { userId } });
    if (existing) return existing;

    return this.prisma.wallet.create({
      data: { userId, balanceCents: 0, currency: "BRL" },
    });
  }

  async assertMinimumBalance(userId: string, minBalanceCents: number): Promise<void> {
    const wallet = await this.getOrCreateWallet(userId);
    if (wallet.balanceCents < minBalanceCents) {
      this.audit.warn("wallet.insufficient", {
        userId,
        minBalanceCents,
        balanceCents: wallet.balanceCents,
      });
      throw new InsufficientBalanceError(
        `Saldo insuficiente. Mínimo: R$ ${(minBalanceCents / 100).toFixed(2)}`,
      );
    }
  }

  async debitForSession(
    tx: Prisma.TransactionClient,
    params: {
      userId: string;
      sessionId?: string | null;
      amountCents: number;
      description: string;
      idempotencyKey: string;
    },
  ): Promise<number> {
    if (params.amountCents <= 0) {
      const wallet = await tx.wallet.findUnique({ where: { userId: params.userId } });
      return wallet?.balanceCents ?? 0;
    }

    await tx.$queryRaw`
      SELECT id FROM wallets WHERE user_id = ${params.userId} FOR UPDATE
    `;

    const existing = await tx.walletTransaction.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) {
      return existing.balanceAfterCents;
    }

    const updated = await tx.$queryRaw<Array<{ id: string; balance_cents: number }>>`
      UPDATE wallets
      SET balance_cents = balance_cents - ${params.amountCents},
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ${params.userId}
        AND balance_cents >= ${params.amountCents}
      RETURNING id, balance_cents
    `;

    if (updated.length === 0) {
      this.audit.warn("wallet.insufficient", {
        userId: params.userId,
        sessionId: params.sessionId,
        amountCents: params.amountCents,
      });
      throw new InsufficientBalanceError("Saldo insuficiente para continuar a recarga");
    }

    const walletId = updated[0]!.id;
    const balanceAfter = updated[0]!.balance_cents;

    await tx.walletTransaction.create({
      data: {
        walletId,
        sessionId: params.sessionId ?? undefined,
        type: WalletTransactionType.DEBIT,
        amountCents: -params.amountCents,
        balanceAfterCents: balanceAfter,
        description: params.description,
        idempotencyKey: params.idempotencyKey,
      },
    });

    this.audit.info("wallet.debit", {
      userId: params.userId,
      sessionId: params.sessionId,
      amountCents: params.amountCents,
      balanceAfterCents: balanceAfter,
    });

    return balanceAfter;
  }

  async creditDemo(
    userId: string,
    amountCents: number,
    description: string,
    idempotencyKey?: string,
  ) {
    if (amountCents <= 0) throw new ValidationError("Credit amount must be positive");

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM wallets WHERE user_id = ${userId} FOR UPDATE`;
      const wallet = await this.getOrCreateWallet(userId);

      const rows = await tx.$queryRaw<Array<{ balance_cents: number }>>`
        UPDATE wallets
        SET balance_cents = balance_cents + ${amountCents},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${wallet.id}
        RETURNING balance_cents
      `;
      const balanceAfter = rows[0]?.balance_cents ?? wallet.balanceCents + amountCents;

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTransactionType.CREDIT,
          amountCents,
          balanceAfterCents: balanceAfter,
          description,
          idempotencyKey,
        },
      });

      return { balanceCents: balanceAfter };
    });
  }

  calculateSessionCost(energyKwh: number, pricePerKwhCents: number): number {
    return calculateCostCents(energyKwh, pricePerKwhCents);
  }
}
