-- Phase 2: charging sessions, tariffs, wallet, expanded status enums

ALTER TYPE "ChargerStatus" RENAME TO "ChargerStatus_old";
CREATE TYPE "ChargerStatus" AS ENUM (
  'AVAILABLE', 'PREPARING', 'CHARGING', 'SUSPENDED', 'FINISHING', 'UNAVAILABLE', 'FAULTED', 'OFFLINE'
);
ALTER TABLE "chargers" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "chargers" ALTER COLUMN "status" TYPE "ChargerStatus"
  USING (
    CASE "status"::text
      WHEN 'ONLINE' THEN 'AVAILABLE'
      ELSE "status"::text
    END
  )::"ChargerStatus";
ALTER TABLE "chargers" ALTER COLUMN "status" SET DEFAULT 'OFFLINE';
DROP TYPE "ChargerStatus_old";

ALTER TYPE "ConnectorStatus" RENAME TO "ConnectorStatus_old";
CREATE TYPE "ConnectorStatus" AS ENUM (
  'AVAILABLE', 'PREPARING', 'CHARGING', 'SUSPENDED', 'FINISHING', 'UNAVAILABLE', 'FAULTED'
);
ALTER TABLE "connectors" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "connectors" ALTER COLUMN "status" TYPE "ConnectorStatus"
  USING (
    CASE "status"::text
      WHEN 'OCCUPIED' THEN 'CHARGING'
      ELSE "status"::text
    END
  )::"ConnectorStatus";
ALTER TABLE "connectors" ALTER COLUMN "status" SET DEFAULT 'UNAVAILABLE';
DROP TYPE "ConnectorStatus_old";

CREATE TYPE "SessionStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "SessionStopReason" AS ENUM ('USER_STOP', 'INSUFFICIENT_BALANCE', 'FAULT', 'DISCONNECTED', 'TIMEOUT', 'ADMIN');
CREATE TYPE "WalletTransactionType" AS ENUM ('CREDIT', 'DEBIT', 'HOLD', 'RELEASE', 'REFUND');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');

ALTER TABLE "chargers" ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMP(3);

CREATE TABLE "tariffs" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "price_per_kwh_cents" INTEGER NOT NULL,
  "min_balance_cents" INTEGER NOT NULL DEFAULT 500,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tariffs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tariffs_company_id_active_idx" ON "tariffs"("company_id", "active");
ALTER TABLE "tariffs" ADD CONSTRAINT "tariffs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "charging_sessions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "connector_id" TEXT NOT NULL,
  "tariff_id" TEXT NOT NULL,
  "tariff_snapshot" JSONB NOT NULL,
  "status" "SessionStatus" NOT NULL DEFAULT 'PENDING',
  "stop_reason" "SessionStopReason",
  "started_at" TIMESTAMP(3),
  "ended_at" TIMESTAMP(3),
  "paused_at" TIMESTAMP(3),
  "energy_kwh" DECIMAL(12,4) NOT NULL DEFAULT 0,
  "current_power_kw" DECIMAL(10,2),
  "current_voltage" DECIMAL(10,2),
  "current_amperage" DECIMAL(10,2),
  "cost_cents" INTEGER NOT NULL DEFAULT 0,
  "idempotency_key" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "charging_sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "charging_sessions_idempotency_key_key" ON "charging_sessions"("idempotency_key");
CREATE INDEX "charging_sessions_user_id_status_idx" ON "charging_sessions"("user_id", "status");
CREATE INDEX "charging_sessions_connector_id_status_idx" ON "charging_sessions"("connector_id", "status");
CREATE INDEX "charging_sessions_status_started_at_idx" ON "charging_sessions"("status", "started_at");
ALTER TABLE "charging_sessions" ADD CONSTRAINT "charging_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "charging_sessions" ADD CONSTRAINT "charging_sessions_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "charging_sessions" ADD CONSTRAINT "charging_sessions_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "charging_sessions" ADD CONSTRAINT "charging_sessions_tariff_id_fkey" FOREIGN KEY ("tariff_id") REFERENCES "tariffs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "meter_values" (
  "id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "energy_kwh" DECIMAL(12,4) NOT NULL,
  "power_kw" DECIMAL(10,2) NOT NULL,
  "voltage" DECIMAL(10,2),
  "current" DECIMAL(10,2),
  "temperature" DECIMAL(5,2),
  CONSTRAINT "meter_values_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "meter_values_session_id_timestamp_idx" ON "meter_values"("session_id", "timestamp");
ALTER TABLE "meter_values" ADD CONSTRAINT "meter_values_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "charging_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "wallets" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "balance_cents" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "wallet_transactions" (
  "id" TEXT NOT NULL,
  "wallet_id" TEXT NOT NULL,
  "session_id" TEXT,
  "type" "WalletTransactionType" NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "balance_after_cents" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "idempotency_key" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "wallet_transactions_idempotency_key_key" ON "wallet_transactions"("idempotency_key");
CREATE INDEX "wallet_transactions_wallet_id_created_at_idx" ON "wallet_transactions"("wallet_id", "created_at");
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "charging_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "payments" (
  "id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "method" TEXT NOT NULL DEFAULT 'WALLET_DEMO',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payments_session_id_key" ON "payments"("session_id");
ALTER TABLE "payments" ADD CONSTRAINT "payments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "charging_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "charging_events" (
  "id" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "charging_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "charging_events_entity_type_entity_id_created_at_idx" ON "charging_events"("entity_type", "entity_id", "created_at");
