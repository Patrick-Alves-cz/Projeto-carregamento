import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PaymentStatus, UserRole } from "@prisma/client";
import { createPaymentSchema, refundPaymentSchema, simulatePaymentSchema } from "@evcharge/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/auth.decorators";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthenticatedUser } from "../common/types/auth.types";
import { PaymentsService } from "./payments.service";

@ApiTags("payments")
@ApiBearerAuth()
@Controller("payments")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get("capabilities")
  capabilities() {
    return this.payments.capabilities();
  }

  @Post()
  @Roles(UserRole.DRIVER)
  @ApiHeader({ name: "Idempotency-Key", required: false })
  @ApiOperation({ summary: "Create a PIX/card/wallet payment" })
  create(
    @Body(new ZodValidationPipe(createPaymentSchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Headers("idempotency-key") idempotencyHeader?: string,
  ) {
    const input = body as { amountCents: number; kind?: "PIX" | "CARD" | "WALLET"; paymentMethodId?: string; idempotencyKey?: string };
    return this.payments.create(user, {
      amountCents: input.amountCents,
      kind: input.kind ?? "PIX",
      paymentMethodId: input.paymentMethodId,
      idempotencyKey: idempotencyHeader?.trim() || input.idempotencyKey,
    });
  }

  @Get("me")
  @Roles(UserRole.DRIVER)
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.payments.listMine(user);
  }

  @Get()
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Company-scoped payment list" })
  listAdmin(
    @CurrentUser() user: AuthenticatedUser,
    @Query("status") status?: PaymentStatus,
    @Query("method") method?: string,
    @Query("provider") provider?: string,
    @Query("stationId") stationId?: string,
    @Query("companyId") companyId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.payments.listAdmin(user, {
      status,
      method,
      provider,
      stationId,
      companyId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Get(":id")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.payments.mine(user, id);
  }

  @Post(":id/simulate")
  @Roles(UserRole.DRIVER)
  @ApiOperation({ summary: "DEMO only: force a payment outcome" })
  simulate(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(simulatePaymentSchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payments.simulate(user, id, body as { outcome: "CONFIRMED" | "FAILED" | "EXPIRED" | "CANCELLED" | "REFUNDED" });
  }

  @Post(":id/refund")
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Request a refund for a confirmed payment" })
  refund(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(refundPaymentSchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Headers("idempotency-key") idempotencyHeader?: string,
  ) {
    const input = body as { reason: string; amountCents?: number; idempotencyKey?: string };
    return this.payments.refund(user, id, {
      ...input,
      idempotencyKey: idempotencyHeader?.trim() || input.idempotencyKey,
    });
  }
}
