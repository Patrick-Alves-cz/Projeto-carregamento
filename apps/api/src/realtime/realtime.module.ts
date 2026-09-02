import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ChargingGateway } from "./charging.gateway";

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET ?? "dev-access-secret-change-me",
    }),
  ],
  providers: [ChargingGateway],
  exports: [ChargingGateway],
})
export class RealtimeModule {}
