import { Module } from "@nestjs/common";
import { ChargingModule } from "../charging/charging.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ChargerHealthService } from "./charger-health.service";
import { ChargerReliabilityService } from "./charger-reliability.service";
import { IncidentsController } from "./incidents.controller";
import { IncidentsService } from "./incidents.service";
import { MaintenanceController } from "./maintenance.controller";
import { MaintenanceService } from "./maintenance.service";
import { MeteringHealthService } from "./metering-health.service";
import { OperationsController } from "./operations.controller";
import { OperationsScheduler } from "./operations.scheduler";
import { OperationsService } from "./operations.service";
import { ReconciliationCasesService } from "./reconciliation-cases.service";
import { SessionLifecycleService } from "./session-lifecycle.service";
import { StationAvailabilityService } from "./station-availability.service";
import { WaitTimeEstimator } from "./wait-time.estimator";

@Module({
  imports: [NotificationsModule, ChargingModule],
  controllers: [OperationsController, IncidentsController, MaintenanceController],
  providers: [
    MaintenanceService,
    IncidentsService,
    ChargerHealthService,
    ChargerReliabilityService,
    StationAvailabilityService,
    ReconciliationCasesService,
    WaitTimeEstimator,
    MeteringHealthService,
    OperationsService,
    SessionLifecycleService,
    OperationsScheduler,
  ],
  exports: [
    MaintenanceService,
    IncidentsService,
    ChargerHealthService,
    StationAvailabilityService,
    WaitTimeEstimator,
    MeteringHealthService,
    OperationsService,
    ReconciliationCasesService,
    SessionLifecycleService,
  ],
})
export class OperationsModule {}
