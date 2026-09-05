import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./auth/auth.module";
import { ChargersModule } from "./chargers/chargers.module";
import { ChargingModule } from "./charging/charging.module";
import { CompaniesModule } from "./companies/companies.module";
import { ConnectorsModule } from "./connectors/connectors.module";
import { CommonModule } from "./common/common.module";
import { DatabaseModule } from "./common/database/database.module";
import { DomainExceptionFilter } from "./common/filters/domain-exception.filter";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { HealthModule } from "./health/health.module";
import { InvitationsModule } from "./invitations/invitations.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { OcppModule } from "./ocpp/ocpp.module";
import { OpsModule } from "./ops/ops.module";
import { OperationsModule } from "./operations/operations.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { SessionsModule } from "./sessions/sessions.module";
import { StationsModule } from "./stations/stations.module";
import { TariffsModule } from "./tariffs/tariffs.module";
import { UsersModule } from "./users/users.module";
import { VehiclesModule } from "./vehicles/vehicles.module";
import { WalletModule } from "./wallet/wallet.module";
import { PaymentsModule } from "./payments/payments.module";
import { ReservationsModule } from "./reservations/reservations.module";

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    DatabaseModule,
    CommonModule,
    ChargingModule,
    OcppModule,
    InvitationsModule,
    NotificationsModule,
    OpsModule,
    OperationsModule,
    TariffsModule,
    WalletModule,
    PaymentsModule,
    ReservationsModule,
    AuthModule,
    UsersModule,
    CompaniesModule,
    VehiclesModule,
    StationsModule,
    ChargersModule,
    ConnectorsModule,
    SessionsModule,
    RealtimeModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
