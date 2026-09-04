import { Body, Controller, Get, Headers, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { UserRole } from "@prisma/client";
import { listWalletTransactionsQuerySchema, walletTopUpSchema } from "@evcharge/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/auth.decorators";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthenticatedUser } from "../common/types/auth.types";
import { WalletService } from "./wallet.service";

@ApiTags("wallet")
@ApiBearerAuth()
@Controller("wallet")
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @Roles(UserRole.DRIVER)
  @ApiOperation({
    summary: "Get the authenticated driver wallet",
    description: "Operators cannot read driver wallets. Balance is integer cents.",
  })
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.walletService.getMine(user);
  }

  @Get("transactions")
  @Roles(UserRole.DRIVER)
  @ApiOperation({ summary: "List wallet transactions for the authenticated driver" })
  listTransactions(
    @Query(new ZodValidationPipe(listWalletTransactionsQuerySchema)) query: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.walletService.listTransactions(
      user,
      query as Parameters<WalletService["listTransactions"]>[1],
    );
  }

  @Post("top-up")
  @Roles(UserRole.DRIVER)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiHeader({ name: "Idempotency-Key", required: false })
  @ApiOperation({
    summary: "DEMO wallet top-up",
    description:
      "Creates a WALLET_DEMO payment that is auto-approved and credits the wallet. No real gateway.",
  })
  topUp(
    @Body(new ZodValidationPipe(walletTopUpSchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Headers("idempotency-key") idempotencyHeader?: string,
  ) {
    const input = body as { amountCents: number; idempotencyKey?: string };
    return this.walletService.topUpDemo(user, {
      amountCents: input.amountCents,
      idempotencyKey: idempotencyHeader?.trim() || input.idempotencyKey,
    });
  }
}
