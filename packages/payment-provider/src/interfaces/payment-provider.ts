export type PaymentKind = "PIX" | "CARD" | "WALLET";

export type ProviderPaymentStatus =
  | "PENDING"
  | "AUTHORIZED"
  | "PROCESSING"
  | "CONFIRMED"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "REFUND_PENDING"
  | "EXPIRED";

export type PaymentProviderCapabilities = {
  supportsPix: boolean;
  supportsCard: boolean;
  supportsCardPreAuthorization: boolean;
  supportsRefund: boolean;
  supportsSavedPaymentMethod: boolean;
  supportsWebhookSignature: boolean;
};

export interface CreatePaymentInput {
  amountCents: number;
  currency: string;
  kind: PaymentKind;
  idempotencyKey: string;
  customerRef: string;
  paymentMethodToken?: string;
  description?: string;
  authorizeOnly?: boolean;
}

export interface ProviderPayment {
  provider: string;
  providerRef: string;
  status: ProviderPaymentStatus;
  amountCents: number;
  currency: string;
  pixCopyPaste?: string;
  pixQrPayload?: string;
  expiresAt?: Date;
}

export interface TokenizedCard {
  token: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface ParsedWebhook {
  eventId: string;
  eventType: string;
  providerRef?: string;
  status: ProviderPaymentStatus;
  amountCents?: number;
  currency?: string;
}

export interface PaymentProvider {
  readonly name: string;
  readonly capabilities: PaymentProviderCapabilities;
  createPayment(input: CreatePaymentInput): Promise<ProviderPayment>;
  createPixPayment?(input: CreatePaymentInput): Promise<ProviderPayment>;
  createCardPayment?(input: CreatePaymentInput): Promise<ProviderPayment>;
  authorizeCard?(input: CreatePaymentInput): Promise<ProviderPayment>;
  capturePayment?(providerRef: string, amountCents?: number): Promise<ProviderPayment>;
  getPaymentStatus(providerRef: string): Promise<ProviderPayment>;
  cancelPayment(providerRef: string): Promise<ProviderPayment>;
  refundPayment(providerRef: string, amountCents?: number): Promise<ProviderPayment>;
  tokenizeCard(input: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    token?: string;
  }): Promise<TokenizedCard>;
  parseWebhook?(headers: Record<string, string | undefined>, body: unknown): ParsedWebhook;
}

export interface PixPaymentProvider extends PaymentProvider {
  kind: "PIX";
}

export interface CardPaymentProvider extends PaymentProvider {
  kind: "CARD";
}
