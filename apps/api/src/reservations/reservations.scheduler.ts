import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ReservationsService } from "./reservations.service";
import { WaitlistService } from "./waitlist.service";

@Injectable()
export class ReservationsScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly reservations: ReservationsService,
    private readonly waitlist: WaitlistService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.reservations.activateDue();
      void this.reservations.expireNoShow();
      void this.waitlist.expireClaims();
    }, 20_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
