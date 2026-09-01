import { Module } from "@nestjs/common";
import { ChargersController } from "./chargers.controller";
import { ChargersService } from "./chargers.service";

@Module({
  controllers: [ChargersController],
  providers: [ChargersService],
})
export class ChargersModule {}
