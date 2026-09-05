import { MockPaymentProvider } from "./mock/mock-payment-provider";
import type { PaymentProvider } from "./interfaces/payment-provider";

export class PaymentProviderFactory {
  static create(type = process.env.PAYMENT_PROVIDER ?? "mock"): PaymentProvider {
    if (type === "mock" || type === "demo") return new MockPaymentProvider();
    throw new Error(`Payment provider "${type}" is not configured. Use PAYMENT_PROVIDER=mock.`);
  }
}
