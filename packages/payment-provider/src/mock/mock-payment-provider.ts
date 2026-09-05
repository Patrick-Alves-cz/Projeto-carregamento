import type {
  CreatePaymentInput,
  ParsedWebhook,
  PaymentProvider,
  PaymentProviderCapabilities,
  ProviderPayment,
  ProviderPaymentStatus,
  TokenizedCard,
} from "../interfaces/payment-provider";

type Stored = ProviderPayment & { capturedAmountCents?: number };

const CAPABILITIES: PaymentProviderCapabilities = {
  supportsPix: true,
  supportsCard: true,
  supportsCardPreAuthorization: true,
  supportsRefund: true,
  supportsSavedPaymentMethod: true,
  supportsWebhookSignature: true,
};

export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";
  readonly capabilities = CAPABILITIES;
  private readonly store = new Map<string, Stored>();
  private readonly idempotency = new Map<string, string>();

  async createPayment(input: CreatePaymentInput): Promise<ProviderPayment> {
    if (input.kind === "PIX") return this.createPixPayment(input);
    if (input.kind === "CARD") {
      return input.authorizeOnly === false ? this.createCardPayment(input) : this.authorizeCard(input);
    }
    return this.save(input, "CONFIRMED");
  }

  async createPixPayment(input: CreatePaymentInput): Promise<ProviderPayment> {
    return this.save(input, "PENDING", true);
  }

  async createCardPayment(input: CreatePaymentInput): Promise<ProviderPayment> {
    return this.save(input, "CONFIRMED");
  }

  async authorizeCard(input: CreatePaymentInput): Promise<ProviderPayment> {
    return this.save({ ...input, kind: "CARD", authorizeOnly: true }, "AUTHORIZED");
  }

  async capturePayment(providerRef: string, amountCents?: number): Promise<ProviderPayment> {
    const payment = await this.getPaymentStatus(providerRef);
    if (payment.status !== "AUTHORIZED" && payment.status !== "CONFIRMED") {
      throw new Error("Only authorized payments can be captured");
    }
    payment.status = "CONFIRMED";
    if (typeof amountCents === "number") payment.amountCents = amountCents;
    (payment as Stored).capturedAmountCents = amountCents ?? payment.amountCents;
    this.store.set(providerRef, payment);
    return payment;
  }

  async getPaymentStatus(providerRef: string): Promise<ProviderPayment> {
    const payment = this.store.get(providerRef);
    if (!payment) throw new Error("Payment not found");
    return payment;
  }

  async cancelPayment(providerRef: string): Promise<ProviderPayment> {
    const payment = await this.getPaymentStatus(providerRef);
    if (payment.status === "CONFIRMED" || payment.status === "REFUNDED") {
      throw new Error("Cannot cancel a settled payment");
    }
    payment.status = "CANCELLED";
    this.store.set(providerRef, payment);
    return payment;
  }

  async refundPayment(providerRef: string, amountCents?: number): Promise<ProviderPayment> {
    const payment = await this.getPaymentStatus(providerRef);
    if (payment.status !== "CONFIRMED" && payment.status !== "AUTHORIZED" && payment.status !== "REFUNDED") {
      throw new Error("Only confirmed or authorized payments can be refunded");
    }
    payment.status =
      typeof amountCents === "number" && amountCents < payment.amountCents ? "PARTIALLY_REFUNDED" : "REFUNDED";
    this.store.set(providerRef, payment);
    return payment;
  }

  async tokenizeCard(input: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    token?: string;
  }): Promise<TokenizedCard> {
    return {
      token: input.token ?? `tok_mock_${input.last4}_${Date.now()}`,
      brand: input.brand,
      last4: input.last4,
      expMonth: input.expMonth,
      expYear: input.expYear,
    };
  }

  parseWebhook(_headers: Record<string, string | undefined>, body: unknown): ParsedWebhook {
    const payload = body as {
      eventId?: string;
      eventType?: string;
      providerRef?: string;
      status?: ProviderPaymentStatus;
    };
    if (!payload.eventId || !payload.eventType || !payload.status) {
      throw new Error("Invalid mock webhook");
    }
    return {
      eventId: payload.eventId,
      eventType: payload.eventType,
      providerRef: payload.providerRef,
      status: payload.status,
    };
  }

  simulate(providerRef: string, status: ProviderPaymentStatus): ProviderPayment {
    const payment = this.store.get(providerRef);
    if (!payment) throw new Error("Payment not found");
    payment.status = status;
    this.store.set(providerRef, payment);
    return payment;
  }

  private save(input: CreatePaymentInput, status: ProviderPaymentStatus, pix = false): ProviderPayment {
    const existingRef = this.idempotency.get(input.idempotencyKey);
    if (existingRef) {
      const existing = this.store.get(existingRef);
      if (existing) return existing;
    }
    const providerRef = `mock_${input.kind.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const payment: Stored = {
      provider: this.name,
      providerRef,
      status,
      amountCents: input.amountCents,
      currency: input.currency,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    };
    if (pix) {
      const copy = `00020126580014br.gov.bcb.pix0136${providerRef}520400005303986540${(input.amountCents / 100).toFixed(2)}5802BR5913EV Charge DEMO6009Sao Paulo62070503***6304DEMO`;
      payment.pixCopyPaste = copy;
      payment.pixQrPayload = copy;
    }
    this.store.set(providerRef, payment);
    this.idempotency.set(input.idempotencyKey, providerRef);
    return payment;
  }
}

export class MockPixPaymentProvider extends MockPaymentProvider {
  readonly kind = "PIX" as const;
}

export class MockCardPaymentProvider extends MockPaymentProvider {
  readonly kind = "CARD" as const;
}
