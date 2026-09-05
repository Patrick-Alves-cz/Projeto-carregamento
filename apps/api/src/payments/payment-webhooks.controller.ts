import { Body, Controller, Headers, Param, Post, UnauthorizedException, BadRequestException } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { PaymentStatus } from "@prisma/client";
import { webhookPaymentSchema } from "@evcharge/shared";
import { AsaasPaymentProvider } from "@evcharge/payment-provider";
import { Public } from "../common/decorators/auth.decorators";
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
    @Body() body: unknown,
    @Headers("x-webhook-signature") signature?: string,
    @Headers("asaas-access-token") asaasToken?: string,
  ) {
    if (provider === "asaas") {
      const asaas = new AsaasPaymentProvider();
      try {
        asaas.verifyWebhookToken(
          { "asaas-access-token": asaasToken },
          process.env.PAYMENT_WEBHOOK_SECRET,
        );
        const parsed = asaas.parseWebhook({}, body);
        return this.payments.handleWebhook("asaas", {
          eventId: parsed.eventId,
          eventType: parsed.eventType,
          providerRef: parsed.providerRef,
          status: parsed.status as PaymentStatus,
          amountCents: parsed.amountCents,
        });
      } catch {
        throw new UnauthorizedException("Invalid Asaas webhook");
      }
    }

    this.assertSignature(JSON.stringify(body), signature);
    const parsed = webhookPaymentSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException("Invalid webhook payload");
    }
    return this.payments.handleWebhook(provider, {
      eventId: parsed.data.eventId,
      eventType: parsed.data.eventType,
      paymentId: parsed.data.paymentId,
      providerRef: parsed.data.providerRef,
      status: parsed.data.status as PaymentStatus,
      amountCents: parsed.data.amountCents,
    });
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
