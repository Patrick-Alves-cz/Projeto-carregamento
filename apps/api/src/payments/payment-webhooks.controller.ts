import { Body, Controller, Headers, Param, Post, UnauthorizedException } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { PaymentStatus } from "@prisma/client";
import { webhookPaymentSchema } from "@evcharge/shared";
import { Public } from "../common/decorators/auth.decorators";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { PaymentsService } from "./payments.service";
import { createHmac, timingSafeEqual } from "node:crypto";

@ApiTags("payments")
@Controller("payments/webhooks")
export class PaymentWebhooksController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @Post(":provider")
  @ApiOperation({ summary: "Payment provider webhook. Signature validated when PAYMENT_WEBHOOK_SECRET is set." })
  handle(
    @Param("provider") provider: string,
    @Body(new ZodValidationPipe(webhookPaymentSchema)) body: unknown,
    @Headers("x-webhook-signature") signature?: string,
  ) {
    this.assertSignature(JSON.stringify(body), signature);
    const input = body as {
      eventId: string;
      eventType: string;
      paymentId?: string;
      providerRef?: string;
      status: PaymentStatus;
    };
    return this.payments.handleWebhook(provider, input);
  }

  private assertSignature(raw: string, signature?: string) {
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (!secret) return;
    if (!signature) throw new UnauthorizedException("Missing webhook signature");
    const expected = createHmac("sha256", secret).update(raw).digest("hex");
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      throw new UnauthorizedException("Invalid webhook signature");
    }
  }
}
