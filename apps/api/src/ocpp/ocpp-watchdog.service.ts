import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { OcppConnectionManager } from "./ocpp-connection.manager";
import { OcppInboundService } from "./ocpp-inbound.service";
import { OcppLogger } from "./ocpp-logger";
import { PrismaService } from "../common/database/database.module";
import { SessionStatus, ChargerStatus } from "@prisma/client";

@Injectable()
export class OcppWatchdog implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private readonly logger = new OcppLogger(new Logger(OcppWatchdog.name));
  private readonly thresholdMs = Number(process.env.OCPP_OFFLINE_THRESHOLD_MS ?? 180_000);

  constructor(
    private readonly connections: OcppConnectionManager,
    private readonly inbound: OcppInboundService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.checkStale();
    }, 30_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async checkStale() {
    for (const stale of this.connections.listStale(this.thresholdMs)) {
      this.logger.warn("ocpp.connection.close", { chargerId: stale.chargerId, reason: "heartbeat timeout" });
      try {
        stale.ws.close(4001, "heartbeat timeout");
      } catch {
        // ignore
      }
      this.connections.unregister(stale.chargerId, stale.ws);
      await this.inbound.markOffline(stale.chargerId);
    }

    const cutoff = new Date(Date.now() - this.thresholdMs);
    const staleRows = await this.prisma.charger.findMany({
      where: {
        providerId: { in: ["ocpp16", "ocpp"] },
        status: { not: ChargerStatus.OFFLINE },
        OR: [{ lastSeenAt: { lt: cutoff } }, { lastSeenAt: null }],
      },
    });
    for (const charger of staleRows) {
      if (this.connections.isOnline(charger.id)) continue;
      await this.inbound.markOffline(charger.id);
    }
  }
}

@Injectable()
export class OcppReconciliationService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private readonly logger = new Logger(OcppReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: OcppConnectionManager,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.reconcile().catch((error) => this.logger.error("OCPP reconcile failed", error));
    }, 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async reconcile() {
    const live = await this.prisma.chargingSession.findMany({
      where: { status: { in: [SessionStatus.ACTIVE, SessionStatus.PREPARING, SessionStatus.PAUSED] } },
      include: { connector: { include: { charger: true } } },
    });

    for (const session of live) {
      const charger = session.connector.charger;
      if (charger.providerId !== "ocpp16" && charger.providerId !== "ocpp") continue;
      const online = this.connections.isOnline(charger.id);
      if (!online) {
        await this.prisma.chargerEvent.create({
          data: {
            chargerId: charger.id,
            type: "session.needs_reconciliation",
            payload: { sessionId: session.id, status: session.status },
          },
        });
      }
    }
  }
}
