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

@Module({
  imports: [WalletModule, NotificationsModule, ChargingModule],
  controllers: [PaymentsController, PaymentWebhooksController, PaymentMethodsController, FinanceController],
  providers: [PaymentsService, PaymentMethodsService, PaymentsScheduler],
  exports: [PaymentsService],
})
export class PaymentsModule {}
