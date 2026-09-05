import { Module } from "@nestjs/common";
import { ChargingModule } from "../charging/charging.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { WalletModule } from "../wallet/wallet.module";
import { PaymentMethodsController } from "./payment-methods.controller";
import { PaymentMethodsService } from "./payment-methods.service";
import { PaymentWebhooksController } from "./payment-webhooks.controller";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { PaymentsScheduler } from "./payments.scheduler";
import { FinanceController } from "./finance.controller";
import { SessionBillingService } from "./session-billing.service";
import { PaymentReconciliationService } from "./payment-reconciliation.service";
import { FinanceReconciliationController } from "./finance-reconciliation.controller";

@Module({
  imports: [WalletModule, NotificationsModule, ChargingModule],
  controllers: [
    PaymentsController,
    PaymentWebhooksController,
    PaymentMethodsController,
    FinanceController,
    FinanceReconciliationController,
  ],
  providers: [PaymentsService, PaymentMethodsService, PaymentsScheduler, SessionBillingService, PaymentReconciliationService],
  exports: [PaymentsService, SessionBillingService],
})
export class PaymentsModule {}
