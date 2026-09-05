import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ChargerHealthService } from "./charger-health.service";
import { ChargerReliabilityService } from "./charger-reliability.service";
import { IncidentsService } from "./incidents.service";
import { MaintenanceService } from "./maintenance.service";
import { ReconciliationCasesService } from "./reconciliation-cases.service";
import { OperationsService } from "./operations.service";
import { SessionLifecycleService } from "./session-lifecycle.service";
import { ChargerCommandStatus } from "@prisma/client";
import { PrismaService } from "../common/database/database.module";

@Injectable()
export class OperationsScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private readonly logger = new Logger(OperationsScheduler.name);

  constructor(
    private readonly health: ChargerHealthService,
    private readonly reliability: ChargerReliabilityService,
    private readonly incidents: IncidentsService,
    private readonly maintenance: MaintenanceService,
    private readonly recon: ReconciliationCasesService,
    private readonly operations: OperationsService,
    private readonly lifecycle: SessionLifecycleService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick();
    }, 30_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    try {
      await this.health.refreshAll();
      await this.incidents.detect();
      await this.maintenance.tick();
      await this.recon.detect();
      await this.prisma.chargerCommand.updateMany({
        where: {
          status: { in: [ChargerCommandStatus.QUEUED, ChargerCommandStatus.SENT] },
          sentAt: { lte: new Date(Date.now() - Number(process.env.OCPP_COMMAND_TIMEOUT_MS ?? 10_000) * 2) },
        },
        data: {
          status: ChargerCommandStatus.TIMEOUT,
          errorCode: "TIMEOUT",
          errorMessageSanitized: "Comando expirou",
          completedAt: new Date(),
        },
      });
      await this.lifecycle.applyIdleTransitions();
      await this.reliability.snapshotAll();
      await this.operations.pruneProtocolEvents();
    } catch (error) {
      this.logger.error("operations scheduler failed", error);
    }
  }
}
