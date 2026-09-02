import { Injectable, Logger } from "@nestjs/common";
import {
  calculateCostCents,
  InsufficientBalanceError,
  NotFoundError,
  ValidationError,
} from "@evcharge/domain";
import { Prisma, WalletTransactionType } from "@prisma/client";
import { PrismaService } from "../common/database/database.module";

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

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
      throw new InsufficientBalanceError(
        `Saldo insuficiente. Mínimo: R$ ${(minBalanceCents / 100).toFixed(2)}`,
      );
    }
  }

  async debitForSession(
    tx: Prisma.TransactionClient,
    params: {
      userId: string;
      sessionId: string;
      amountCents: number;
      description: string;
      idempotencyKey: string;
    },
  ): Promise<number> {
    if (params.amountCents <= 0) {
      const wallet = await tx.wallet.findUnique({ where: { userId: params.userId } });
      return wallet?.balanceCents ?? 0;
    }

    const existing = await tx.walletTransaction.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) {
      return existing.balanceAfterCents;
    }

    const wallet = await tx.wallet.findUnique({ where: { userId: params.userId } });
    if (!wallet) throw new NotFoundError("Wallet", params.userId);

    const balanceAfter = wallet.balanceCents - params.amountCents;
    if (balanceAfter < 0) {
      throw new InsufficientBalanceError("Saldo insuficiente para continuar a recarga");
    }

    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balanceCents: balanceAfter },
    });

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        sessionId: params.sessionId,
        type: WalletTransactionType.DEBIT,
        amountCents: -params.amountCents,
        balanceAfterCents: balanceAfter,
        description: params.description,
        idempotencyKey: params.idempotencyKey,
      },
    });

    this.logger.log({
      action: "wallet.debit",
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
      const wallet = await this.getOrCreateWallet(userId);
      const balanceAfter = wallet.balanceCents + amountCents;

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balanceCents: balanceAfter },
      });

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
