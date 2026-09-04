import { Global, Module } from "@nestjs/common";
import { SessionsModule } from "../sessions/sessions.module";
import { OcppAuthService } from "./ocpp-auth.service";
import { OcppCommandAdapter } from "./ocpp-command.adapter";
import { OcppConnectionManager } from "./ocpp-connection.manager";
import { OcppInboundService } from "./ocpp-inbound.service";
import { OcppMessageRouter } from "./ocpp-message.router";
import { OcppOpsController } from "./ocpp-ops.controller";
import { OcppReconciliationService, OcppWatchdog } from "./ocpp-watchdog.service";
import { OcppWsServer } from "./ocpp-ws.server";

@Global()
@Module({
  imports: [SessionsModule],
  controllers: [OcppOpsController],
  providers: [
    OcppAuthService,
    OcppConnectionManager,
    OcppInboundService,
    OcppMessageRouter,
    OcppCommandAdapter,
    OcppWsServer,
    OcppWatchdog,
    OcppReconciliationService,
    { provide: "OCPP_COMMAND_PORT", useExisting: OcppCommandAdapter },
  ],
  exports: [OcppCommandAdapter, OcppConnectionManager, OcppWsServer, OcppInboundService, "OCPP_COMMAND_PORT"],
})
export class OcppModule {}
