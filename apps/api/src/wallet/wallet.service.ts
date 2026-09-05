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
    const held = await this.prisma.walletHold.aggregate({
      where: { walletId: wallet.id, status: "OPEN" },
      _sum: { amountCents: true },
    });
    const heldCents = held._sum.amountCents ?? 0;
    return {
      id: wallet.id,
      userId: wallet.userId,
      balanceCents: wallet.balanceCents,
      heldCents,
      availableCents: wallet.balanceCents - heldCents,
      currency: wallet.currency,
      updatedAt: wallet.updatedAt,
    };
  }

  async availableCents(userId: string): Promise<number> {
    const wallet = await this.getOrCreateWallet(userId);
    const held = await this.prisma.walletHold.aggregate({
      where: { walletId: wallet.id, status: "OPEN" },
      _sum: { amountCents: true },
    });
    return wallet.balanceCents - (held._sum.amountCents ?? 0);
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
    const available = await this.availableCents(userId);
    if (available < minBalanceCents) {
      this.audit.warn("wallet.insufficient", { userId, minBalanceCents, availableCents: available });
      throw new InsufficientBalanceError("Adicione saldo para iniciar a recarga.");
    }
  }

  async createHold(
    tx: Prisma.TransactionClient,
    params: { userId: string; sessionId: string; amountCents: number; idempotencyKey: string },
  ) {
    const existing = await tx.walletHold.findUnique({ where: { idempotencyKey: params.idempotencyKey } });
    if (existing) return existing;
    const wallet = await tx.wallet.findUnique({ where: { userId: params.userId } });
    if (!wallet) throw new InsufficientBalanceError("Carteira não encontrada");
    await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${wallet.id} FOR UPDATE`;
    const held = await tx.walletHold.aggregate({
      where: { walletId: wallet.id, status: "OPEN" },
      _sum: { amountCents: true },
    });
    const available = wallet.balanceCents - (held._sum.amountCents ?? 0);
    if (available < params.amountCents) {
      throw new InsufficientBalanceError("Saldo disponível insuficiente para autorizar a recarga.");
    }
    const hold = await tx.walletHold.create({
      data: {
        walletId: wallet.id,
        sessionId: params.sessionId,
        amountCents: params.amountCents,
        status: "OPEN",
        idempotencyKey: params.idempotencyKey,
      },
    });
    this.audit.info("wallet.hold_created", {
      userId: params.userId,
      sessionId: params.sessionId,
      amountCents: params.amountCents,
    });
    return hold;
  }

  async captureHold(
    tx: Prisma.TransactionClient,
    params: { sessionId: string; amountCents: number },
  ) {
    const hold = await tx.walletHold.findUnique({ where: { sessionId: params.sessionId } });
    if (!hold) return null;
    if (hold.status !== "OPEN") return hold;
    const capture = Math.max(0, Math.min(params.amountCents, hold.amountCents));
    const release = hold.amountCents - capture;
    if (capture > 0) {
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: hold.walletId } });
      await this.debitForSession(tx, {
        userId: wallet.userId,
        sessionId: params.sessionId,
        amountCents: capture,
        description: "Cobrança final da recarga",
        idempotencyKey: `billing-capture-${params.sessionId}`,
      });
    }
    const updated = await tx.walletHold.update({
      where: { id: hold.id },
      data: { capturedCents: capture, releasedCents: release, status: "CAPTURED" },
    });
    this.audit.info("wallet.hold_released", {
      sessionId: params.sessionId,
      capturedCents: capture,
      releasedCents: release,
    });
    this.audit.info("wallet.debited", { sessionId: params.sessionId, amountCents: capture });
    return updated;
  }

  async releaseHold(tx: Prisma.TransactionClient, sessionId: string) {
    const hold = await tx.walletHold.findUnique({ where: { sessionId } });
    if (!hold || hold.status !== "OPEN") return hold;
    const updated = await tx.walletHold.update({
      where: { id: hold.id },
      data: { status: "RELEASED", releasedCents: hold.amountCents },
    });
    this.audit.info("wallet.hold_released", { sessionId, releasedCents: hold.amountCents });
    return updated;
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
