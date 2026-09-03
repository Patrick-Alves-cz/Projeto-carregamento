import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { SessionsService } from "./sessions.service";

@Injectable()
export class OrphanSessionReaper implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrphanSessionReaper.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly sessionsService: SessionsService) {}

  onModuleInit(): void {
    const intervalMs = Number(process.env.ORPHAN_SESSION_INTERVAL_MS ?? 15_000);
    this.timer = setInterval(() => {
      void this.sessionsService.reconcileOrphanSessions().catch((error) => {
        this.logger.error("Orphan session reconciliation failed", error);
      });
    }, intervalMs);
    if (typeof this.timer.unref === "function") this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
