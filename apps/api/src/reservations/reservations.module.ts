import { Module } from "@nestjs/common";
import { ChargingModule } from "../charging/charging.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { FavoritesController } from "./favorites.controller";
import { FavoritesService } from "./favorites.service";
import { ReservationsController } from "./reservations.controller";
import { ReservationsScheduler } from "./reservations.scheduler";
import { ReservationsService } from "./reservations.service";
import { WaitlistController } from "./waitlist.controller";
import { WaitlistService } from "./waitlist.service";

@Module({
  imports: [NotificationsModule, ChargingModule],
  controllers: [ReservationsController, WaitlistController, FavoritesController],
  providers: [ReservationsService, WaitlistService, FavoritesService, ReservationsScheduler],
  exports: [ReservationsService, WaitlistService, FavoritesService],
})
export class ReservationsModule {}
