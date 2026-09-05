import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PaymentsService } from "./payments.service";

@Injectable()
export class PaymentsScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly payments: PaymentsService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.payments.expireDue();
    }, 30_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
