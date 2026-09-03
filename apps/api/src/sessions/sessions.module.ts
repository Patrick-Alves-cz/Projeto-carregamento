import { Module } from "@nestjs/common";
import { ChargingModule } from "../charging/charging.module";
import { WalletModule } from "../wallet/wallet.module";
import { SessionsController } from "./sessions.controller";
import { SessionsService } from "./sessions.service";
import { SessionMeterProcessor } from "./session-meter.processor";
import { OrphanSessionReaper } from "./orphan-session.reaper";

@Module({
  imports: [ChargingModule, WalletModule],
  controllers: [SessionsController],
  providers: [SessionsService, SessionMeterProcessor, OrphanSessionReaper],
  exports: [SessionsService],
})
export class SessionsModule {}
