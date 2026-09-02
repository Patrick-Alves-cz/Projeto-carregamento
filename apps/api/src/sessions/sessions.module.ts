import { Module } from "@nestjs/common";
import { ChargingModule } from "../charging/charging.module";
import { WalletModule } from "../wallet/wallet.module";
import { SessionsController } from "./sessions.controller";
import { SessionsService } from "./sessions.service";
import { SessionMeterProcessor } from "./session-meter.processor";

@Module({
  imports: [ChargingModule, WalletModule],
  controllers: [SessionsController],
  providers: [SessionsService, SessionMeterProcessor],
  exports: [SessionsService],
})
export class SessionsModule {}
