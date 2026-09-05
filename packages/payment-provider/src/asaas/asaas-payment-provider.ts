import type {
  CreatePaymentInput,
  ParsedWebhook,
  PaymentProvider,
  PaymentProviderCapabilities,
  ProviderPayment,
  ProviderPaymentStatus,
  TokenizedCard,
} from "../interfaces/payment-provider";

const CAPABILITIES: PaymentProviderCapabilities = {
  supportsPix: true,
  supportsCard: true,
  supportsCardPreAuthorization: true,
  supportsRefund: true,
  supportsSavedPaymentMethod: true,
  supportsWebhookSignature: true,
};

type AsaasPayment = {
  id: string;
  status: string;
  value: number;
  billingType?: string;
  dueDate?: string;
};

export class AsaasPaymentProvider implements PaymentProvider {
  readonly name = "asaas";
  readonly capabilities = CAPABILITIES;
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly environment: string;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.environment = env.PAYMENT_ENVIRONMENT ?? "sandbox";
    this.apiKey = env.PAYMENT_API_KEY;
    this.baseUrl =
      env.PAYMENT_API_URL ??
      (this.environment === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3");
  }

  async createPayment(input: CreatePaymentInput): Promise<ProviderPayment> {
    if (input.kind === "PIX") return this.createPixPayment(input);
    if (input.kind === "CARD") {
      return input.authorizeOnly === false ? this.createCardPayment(input) : this.authorizeCard(input);
    }
    throw new Error("WALLET charges are internal and do not go through Asaas");
  }

  async createPixPayment(input: CreatePaymentInput): Promise<ProviderPayment> {
    const payment = await this.request<AsaasPayment>("/payments", {
      method: "POST",
      headers: { "Idempotency-Key": input.idempotencyKey },
      body: JSON.stringify({
        customer: await this.ensureCustomer(input.customerRef),
        billingType: "PIX",
        value: input.amountCents / 100,
        dueDate: new Date().toISOString().slice(0, 10),
        description: input.description ?? "EV Charge",
        externalReference: input.idempotencyKey,
      }),
    });
    const qr = await this.request<{ payload?: string; encodedImage?: string }>(
      `/payments/${payment.id}/pixQrCode`,
      { method: "GET" },
    ).catch(() => ({ payload: undefined }));
    return this.toProvider(payment, qr.payload);
  }

  async createCardPayment(input: CreatePaymentInput): Promise<ProviderPayment> {
    return this.chargeCard(input, false);
  }

  async authorizeCard(input: CreatePaymentInput): Promise<ProviderPayment> {
    return this.chargeCard(input, true);
  }

  async capturePayment(providerRef: string, amountCents?: number): Promise<ProviderPayment> {
    const payment = await this.request<AsaasPayment>(`/payments/${providerRef}/captureAuthorizedPayment`, {
      method: "POST",
      body: JSON.stringify(amountCents ? { value: amountCents / 100 } : {}),
    });
    return this.toProvider(payment);
  }

  async getPaymentStatus(providerRef: string): Promise<ProviderPayment> {
    const payment = await this.request<AsaasPayment>(`/payments/${providerRef}`, { method: "GET" });
    return this.toProvider(payment);
  }

  async cancelPayment(providerRef: string): Promise<ProviderPayment> {
    const payment = await this.request<AsaasPayment>(`/payments/${providerRef}`, { method: "DELETE" });
    return this.toProvider(payment);
  }

  async refundPayment(providerRef: string, amountCents?: number): Promise<ProviderPayment> {
    const payment = await this.request<AsaasPayment>(`/payments/${providerRef}/refund`, {
      method: "POST",
      body: JSON.stringify(amountCents ? { value: amountCents / 100 } : {}),
    });
    return this.toProvider(payment);
  }

  async tokenizeCard(input: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    token?: string;
  }): Promise<TokenizedCard> {
    if (!input.token) {
      throw new Error("Asaas exige token de cartão gerado no checkout. O backend não recebe PAN nem CVV.");
    }
    return {
      token: input.token,
      brand: input.brand,
      last4: input.last4,
      expMonth: input.expMonth,
      expYear: input.expYear,
    };
  }

    parseWebhook(_headers: Record<string, string | undefined>, body: unknown): ParsedWebhook {
    const payload = body as { id?: string; event?: string; payment?: AsaasPayment };
    if (!payload.event || !payload.payment?.id) throw new Error("Invalid Asaas webhook");
    const mapped = mapAsaasStatus(payload.payment.status);
    return {
      eventId: String(payload.id ?? `${payload.event}-${payload.payment.id}`),
      eventType: payload.event,
      providerRef: payload.payment.id,
      status: mapped,
      amountCents: Math.round((payload.payment.value ?? 0) * 100),
      currency: "BRL",
    };
  }

  verifyWebhookToken(headers: Record<string, string | undefined>, secret?: string) {
    if (!secret) return;
    const token = headers["asaas-access-token"] ?? headers["Asaas-Access-Token"];
    if (!token || token !== secret) {
      throw new Error("Invalid Asaas webhook token");
    }
  }

  private async chargeCard(input: CreatePaymentInput, authorizeOnly: boolean): Promise<ProviderPayment> {
    if (!input.paymentMethodToken) throw new Error("Cartão tokenizado obrigatório");
    const payment = await this.request<AsaasPayment>("/payments", {
      method: "POST",
      headers: { "Idempotency-Key": input.idempotencyKey },
      body: JSON.stringify({
        customer: await this.ensureCustomer(input.customerRef),
        billingType: "CREDIT_CARD",
        value: input.amountCents / 100,
        dueDate: new Date().toISOString().slice(0, 10),
        description: input.description ?? "EV Charge",
        creditCardToken: input.paymentMethodToken,
        authorizeOnly,
        externalReference: input.idempotencyKey,
      }),
    });
    return this.toProvider(payment);
  }

  private async ensureCustomer(externalReference: string): Promise<string> {
    const existing = await this.request<{ data?: Array<{ id: string }> }>(
      `/customers?externalReference=${encodeURIComponent(externalReference)}`,
      { method: "GET" },
    );
    if (existing.data?.[0]?.id) return existing.data[0].id;
    const created = await this.request<{ id: string }>("/customers", {
      method: "POST",
      body: JSON.stringify({
        name: `driver-${externalReference.slice(-8)}`,
        externalReference,
      }),
    });
    return created.id;
  }

  private toProvider(payment: AsaasPayment, pix?: string): ProviderPayment {
    return {
      provider: this.name,
      providerRef: payment.id,
      status: mapAsaasStatus(payment.status),
      amountCents: Math.round((payment.value ?? 0) * 100),
      currency: "BRL",
      pixCopyPaste: pix,
      pixQrPayload: pix,
    };
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    if (!this.apiKey) {
      throw new Error("Asaas sandbox requires PAYMENT_API_KEY. Keep PAYMENT_PROVIDER=mock without credentials.");
    }
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        access_token: this.apiKey,
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw new Error(`Asaas request failed (${response.status})`);
    }
    if (response.status === 204) return {} as T;
    return (await response.json()) as T;
  }
}

function mapAsaasStatus(raw: string | undefined): ProviderPaymentStatus {
  const status = (raw ?? "").toUpperCase();
  if (status === "AUTHORIZED") return "AUTHORIZED";
  if (status === "CONFIRMED" || status === "RECEIVED" || status === "RECEIVED_IN_CASH") return "CONFIRMED";
  if (status === "OVERDUE") return "EXPIRED";
  if (status === "REFUNDED") return "REFUNDED";
  if (status === "REFUND_REQUESTED") return "REFUND_PENDING";
  if (status === "DELETED") return "CANCELLED";
  if (status === "FAILED") return "FAILED";
  return "PENDING";
}
