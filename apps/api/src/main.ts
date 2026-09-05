import "reflect-metadata";
import { config } from "dotenv";
import { resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { getAllowedCorsOrigins } from "./common/config/cors-origins";
import {
  getRequiredJwtAccessSecret,
  getRequiredJwtRefreshSecret,
} from "./common/config/jwt-secrets";

config({ path: resolve(__dirname, "../../../.env") });
config({ path: resolve(__dirname, "../../../packages/database/.env"), override: true });

async function bootstrap() {
  getRequiredJwtAccessSecret();
  getRequiredJwtRefreshSecret();

  const app = await NestFactory.create(AppModule);
  const expressApp = app.getHttpAdapter().getInstance() as { set: (key: string, value: unknown) => void };
  expressApp.set("trust proxy", 1);
  app.use(cookieParser());
  app.useWebSocketAdapter(new IoAdapter(app));

  app.setGlobalPrefix("api");

  app.enableCors({
    origin: getAllowedCorsOrigins(),
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
  });

  const config = new DocumentBuilder()
    .setTitle("EV Charge Platform API")
    .setDescription(
      [
        "API da plataforma de recarga de veículos elétricos.",
        "",
        "Roles: DRIVER, OPERATOR, ADMIN, SUPER_ADMIN.",
        "Public register is DRIVER-only.",
        "Session start/stop accept Idempotency-Key (header or body).",
        "Session states: PENDING → PREPARING → ACTIVE ↔ PAUSED → COMPLETED|FAILED|CANCELLED.",
        "Connector states: AVAILABLE → PREPARING → CHARGING ↔ SUSPENDED → AVAILABLE.",
        "Wallet endpoints: GET /wallet, GET /wallet/transactions, POST /wallet/top-up (DEMO).",
        "Tariffs: CRUD /tariffs. Session start snapshots the effective tariff.",
        "Invitations: POST /invitations (ADMIN+), POST /invitations/:token/accept, POST /invitations/:id/revoke.",
        "Password recovery: POST /auth/forgot-password, POST /auth/reset-password.",
        "OCPP 1.6J gateway: wss://host/ocpp/:identity (subprotocol ocpp1.6).",
        "Admin OCPP: GET /chargers/:id/ocpp, POST /chargers/:id/ocpp/command, POST /chargers/:id/ocpp/credential.",
      ].join("\n"),
    )
    .setVersion("1.5.0")
    .addBearerAuth()
    .addCookieAuth("evcharge_access")
    .build();

  if (process.env.SWAGGER_ENABLED !== "false") {
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/docs", app, document);
  }

  const port = process.env.API_PORT ?? 3001;
  await app.listen(port);

  console.log(`API running on http://localhost:${port}/api`);
  if (process.env.SWAGGER_ENABLED !== "false") {
    console.log(`Swagger docs on http://localhost:${port}/api/docs`);
  }
}

bootstrap();
