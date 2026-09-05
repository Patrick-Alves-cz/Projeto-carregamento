import type {
  CreatePaymentInput,
  PaymentProvider,
  ProviderPayment,
  TokenizedCard,
} from "../interfaces/payment-provider";

type Stored = ProviderPayment;

export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";
  private readonly store = new Map<string, Stored>();
  private readonly idempotency = new Map<string, string>();

  async createPayment(input: CreatePaymentInput): Promise<ProviderPayment> {
    const existingRef = this.idempotency.get(input.idempotencyKey);
    if (existingRef) {
      const existing = this.store.get(existingRef);
      if (existing) return existing;
    }

    const providerRef = `mock_${input.kind.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    const payment: Stored = {
      provider: this.name,
      providerRef,
      status: input.kind === "CARD" ? "AUTHORIZED" : "PENDING",
      amountCents: input.amountCents,
      currency: input.currency,
      expiresAt,
    };
    if (input.kind === "PIX") {
      const copy = `00020126580014br.gov.bcb.pix0136${providerRef}520400005303986540${(input.amountCents / 100).toFixed(2)}5802BR5913EV Charge DEMO6009Sao Paulo62070503***6304DEMO`;
      payment.pixCopyPaste = copy;
      payment.pixQrPayload = copy;
    }
    this.store.set(providerRef, payment);
    this.idempotency.set(input.idempotencyKey, providerRef);
    return payment;
  }

  async getPaymentStatus(providerRef: string): Promise<ProviderPayment> {
    const payment = this.store.get(providerRef);
    if (!payment) {
      throw new Error("Payment not found");
    }
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

  async refundPayment(providerRef: string, _amountCents?: number): Promise<ProviderPayment> {
    const payment = await this.getPaymentStatus(providerRef);
    if (payment.status !== "CONFIRMED" && payment.status !== "AUTHORIZED") {
      throw new Error("Only confirmed or authorized payments can be refunded");
    }
    payment.status = "REFUNDED";
    this.store.set(providerRef, payment);
    return payment;
  }

  async tokenizeCard(input: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  }): Promise<TokenizedCard> {
    return {
      token: `tok_mock_${input.last4}_${Date.now()}`,
      brand: input.brand,
      last4: input.last4,
      expMonth: input.expMonth,
      expYear: input.expYear,
    };
  }

  simulate(providerRef: string, status: Stored["status"]): ProviderPayment {
    const payment = this.store.get(providerRef);
    if (!payment) throw new Error("Payment not found");
    payment.status = status;
    this.store.set(providerRef, payment);
    return payment;
  }
}

export class MockPixPaymentProvider extends MockPaymentProvider {
  readonly kind = "PIX" as const;
}

export class MockCardPaymentProvider extends MockPaymentProvider {
  readonly kind = "CARD" as const;
}
