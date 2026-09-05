import { Module } from "@nestjs/common";
import { PricingService } from "./pricing.service";
import { TariffsController } from "./tariffs.controller";
import { TariffsService } from "./tariffs.service";

@Module({
  controllers: [TariffsController],
  providers: [TariffsService, PricingService],
  exports: [TariffsService, PricingService],
})
export class TariffsModule {}
