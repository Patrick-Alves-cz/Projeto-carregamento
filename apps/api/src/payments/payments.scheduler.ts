import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PaymentsService } from "./payments.service";
import { PaymentReconciliationService } from "./payment-reconciliation.service";

@Injectable()
export class PaymentsScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private reconTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly payments: PaymentsService,
    private readonly recon: PaymentReconciliationService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.payments.expireDue();
    }, 30_000);
    this.timer.unref?.();
    this.reconTimer = setInterval(() => {
      void this.recon.detect();
    }, 60_000);
    this.reconTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.reconTimer) clearInterval(this.reconTimer);
  }
}
