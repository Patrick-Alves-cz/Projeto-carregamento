import { Module } from "@nestjs/common";
import { ChargersAdminController } from "./chargers-admin.controller";
import { ChargersController } from "./chargers.controller";
import { ChargersService } from "./chargers.service";

@Module({
  controllers: [ChargersController, ChargersAdminController],
  providers: [ChargersService],
})
export class ChargersModule {}
