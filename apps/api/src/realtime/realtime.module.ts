import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ChargingGateway } from "./charging.gateway";
import {
  getJwtAccessExpiresIn,
  getRequiredJwtAccessSecret,
} from "../common/config/jwt-secrets";

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: getRequiredJwtAccessSecret(),
        signOptions: { expiresIn: getJwtAccessExpiresIn() },
      }),
    }),
  ],
  providers: [ChargingGateway],
  exports: [ChargingGateway],
})
export class RealtimeModule {}
