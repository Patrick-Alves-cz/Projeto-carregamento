import { Injectable, Logger } from "@nestjs/common";
import {
  ForbiddenError,
  InsufficientBalanceError,
  ValidationError,
} from "@evcharge/domain";
import type { ListWalletTransactionsQuery } from "@evcharge/shared";
import {
  PaymentStatus,
  Prisma,
  UserRole,
  WalletTransactionType,
  WalletTxKind,
} from "@prisma/client";
import { PrismaService } from "../common/database/database.module";
import { AuditLogger } from "../common/logging/audit-logger";
import { AuthenticatedUser } from "../common/types/auth.types";

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

  async getMine(user: AuthenticatedUser) {
    this.assertDriver(user);
    const wallet = await this.getOrCreateWallet(user.id);
    return {
      id: wallet.id,
      userId: wallet.userId,
      balanceCents: wallet.balanceCents,
      currency: wallet.currency,
      updatedAt: wallet.updatedAt,
    };
  }

  async listTransactions(user: AuthenticatedUser, query: ListWalletTransactionsQuery) {
    this.assertDriver(user);
    const wallet = await this.getOrCreateWallet(user.id);
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: "desc" },
        skip,
        take: query.limit,
      }),
      this.prisma.walletTransaction.count({ where: { walletId: wallet.id } }),
    ]);
    return { items, total, page: query.page, limit: query.limit, balanceCents: wallet.balanceCents };
  }

  async assertMinimumBalance(userId: string, minBalanceCents: number): Promise<void> {
    const wallet = await this.getOrCreateWallet(userId);
    if (wallet.balanceCents < minBalanceCents) {
      this.audit.warn("wallet.insufficient", {
        userId,
        minBalanceCents,
        balanceCents: wallet.balanceCents,
      });
      throw new InsufficientBalanceError("Adicione saldo para iniciar a recarga.");
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
        kind: WalletTxKind.CHARGE,
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

  async topUpDemo(
    user: AuthenticatedUser,
    input: { amountCents: number; idempotencyKey?: string },
  ) {
    this.assertDriver(user);
    if (input.amountCents <= 0) throw new ValidationError("Valor inválido");

    const idempotencyKey = input.idempotencyKey ?? `topup-${user.id}-${Date.now()}`;

    return this.prisma.$transaction(async (tx) => {
      if (input.idempotencyKey) {
        const existingPayment = await tx.payment.findUnique({
          where: { idempotencyKey },
        });
        if (existingPayment) {
          const wallet = await this.getOrCreateWallet(user.id);
          return {
            wallet: { id: wallet.id, balanceCents: wallet.balanceCents, currency: wallet.currency },
            payment: existingPayment,
            replayed: true,
          };
        }
      }

      await tx.$queryRaw`SELECT id FROM wallets WHERE user_id = ${user.id} FOR UPDATE`;
      const wallet = await this.getOrCreateWallet(user.id);

      const payment = await tx.payment.create({
        data: {
          userId: user.id,
          amountCents: input.amountCents,
          currency: "BRL",
          status: PaymentStatus.COMPLETED,
          method: "WALLET_DEMO",
          idempotencyKey,
        },
      });

      const rows = await tx.$queryRaw<Array<{ balance_cents: number }>>`
        UPDATE wallets
        SET balance_cents = balance_cents + ${input.amountCents},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${wallet.id}
        RETURNING balance_cents
      `;
      const balanceAfter = rows[0]?.balance_cents ?? wallet.balanceCents + input.amountCents;

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTransactionType.CREDIT,
          kind: WalletTxKind.DEPOSIT,
          amountCents: input.amountCents,
          balanceAfterCents: balanceAfter,
          description: `Depósito DEMO de R$ ${(input.amountCents / 100).toFixed(2)}`,
          idempotencyKey: `wallet-${idempotencyKey}`,
        },
      });

      this.audit.info("wallet.topup", {
        userId: user.id,
        amountCents: input.amountCents,
        paymentId: payment.id,
        balanceAfterCents: balanceAfter,
      });

      return {
        wallet: { id: wallet.id, balanceCents: balanceAfter, currency: wallet.currency },
        payment,
        replayed: false,
      };
    });
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
          kind: WalletTxKind.ADJUSTMENT,
          amountCents,
          balanceAfterCents: balanceAfter,
          description,
          idempotencyKey,
        },
      });

      return { balanceCents: balanceAfter };
    });
  }

  async creditInTx(
    tx: Prisma.TransactionClient,
    params: {
      userId: string;
      amountCents: number;
      description: string;
      idempotencyKey: string;
    },
  ): Promise<number> {
    if (params.amountCents <= 0) throw new ValidationError("Credit amount must be positive");
    const existing = await tx.walletTransaction.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) return existing.balanceAfterCents;

    await tx.$queryRaw`SELECT id FROM wallets WHERE user_id = ${params.userId} FOR UPDATE`;
    const wallet = await tx.wallet.findUnique({ where: { userId: params.userId } });
    if (!wallet) {
      const created = await tx.wallet.create({ data: { userId: params.userId, balanceCents: 0 } });
      return this.applyCredit(tx, created.id, params);
    }
    return this.applyCredit(tx, wallet.id, params);
  }

  private async applyCredit(
    tx: Prisma.TransactionClient,
    walletId: string,
    params: { amountCents: number; description: string; idempotencyKey: string },
  ) {
    const rows = await tx.$queryRaw<Array<{ balance_cents: number }>>`
      UPDATE wallets
      SET balance_cents = balance_cents + ${params.amountCents},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${walletId}
      RETURNING balance_cents
    `;
    const balanceAfter = rows[0]?.balance_cents ?? params.amountCents;
    await tx.walletTransaction.create({
      data: {
        walletId,
        type: WalletTransactionType.CREDIT,
        kind: WalletTxKind.DEPOSIT,
        amountCents: params.amountCents,
        balanceAfterCents: balanceAfter,
        description: params.description,
        idempotencyKey: params.idempotencyKey,
      },
    });
    this.audit.info("wallet.credit", {
      walletId,
      amountCents: params.amountCents,
      balanceAfterCents: balanceAfter,
    });
    return balanceAfter;
  }

  private assertDriver(user: AuthenticatedUser) {
    if (user.role !== UserRole.DRIVER) {
      throw new ForbiddenError("Somente motoristas acessam a carteira");
    }
  }
}
