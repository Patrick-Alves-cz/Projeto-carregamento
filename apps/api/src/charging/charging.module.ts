import { Global, Module } from "@nestjs/common";
import { ChargerProviderService } from "./charger-provider.service";
import { ChargingEventsService } from "./charging-events.service";

@Global()
@Module({
  providers: [ChargerProviderService, ChargingEventsService],
  exports: [ChargerProviderService, ChargingEventsService],
})
export class ChargingModule {}
