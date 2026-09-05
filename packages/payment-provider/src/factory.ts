import { MockPaymentProvider } from "./mock/mock-payment-provider";
import { AsaasPaymentProvider } from "./asaas/asaas-payment-provider";
import type { PaymentProvider } from "./interfaces/payment-provider";

let mockSingleton: MockPaymentProvider | null = null;

export class PaymentProviderFactory {
  static create(type = process.env.PAYMENT_PROVIDER ?? "mock"): PaymentProvider {
    if (type === "mock" || type === "demo" || !type) {
      if (!mockSingleton) mockSingleton = new MockPaymentProvider();
      return mockSingleton;
    }
    if (type === "asaas") return new AsaasPaymentProvider();
    throw new Error(`Payment provider "${type}" is not configured. Use PAYMENT_PROVIDER=mock or asaas.`);
  }

  static resetMockInstance() {
    mockSingleton = null;
  }
}
