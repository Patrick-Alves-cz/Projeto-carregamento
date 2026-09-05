export type PaymentKind = "PIX" | "CARD" | "WALLET";

export type ProviderPaymentStatus =
  | "PENDING"
  | "AUTHORIZED"
  | "CONFIRMED"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED"
  | "EXPIRED";

export interface CreatePaymentInput {
  amountCents: number;
  currency: string;
  kind: PaymentKind;
  idempotencyKey: string;
  customerRef: string;
  paymentMethodToken?: string;
  description?: string;
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

export interface PaymentProvider {
  readonly name: string;
  createPayment(input: CreatePaymentInput): Promise<ProviderPayment>;
  getPaymentStatus(providerRef: string): Promise<ProviderPayment>;
  cancelPayment(providerRef: string): Promise<ProviderPayment>;
  refundPayment(providerRef: string, amountCents?: number): Promise<ProviderPayment>;
  tokenizeCard(input: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  }): Promise<TokenizedCard>;
}

export interface PixPaymentProvider extends PaymentProvider {
  kind: "PIX";
}

export interface CardPaymentProvider extends PaymentProvider {
  kind: "CARD";
}
