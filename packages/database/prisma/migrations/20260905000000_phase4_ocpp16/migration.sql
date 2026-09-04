-- Phase 4: OCPP 1.6J identities, credentials, transactions

ALTER TABLE "chargers" ADD COLUMN IF NOT EXISTS "identity" TEXT;
ALTER TABLE "chargers" ADD COLUMN IF NOT EXISTS "vendor" TEXT;
ALTER TABLE "chargers" ADD COLUMN IF NOT EXISTS "firmware_version" TEXT;
ALTER TABLE "chargers" ADD COLUMN IF NOT EXISTS "charge_point_serial_number" TEXT;
ALTER TABLE "chargers" ADD COLUMN IF NOT EXISTS "protocol" TEXT;

UPDATE "chargers" SET "identity" = "serial_number" WHERE "identity" IS NULL;
ALTER TABLE "chargers" ALTER COLUMN "identity" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "chargers_identity_key" ON "chargers"("identity");
CREATE INDEX IF NOT EXISTS "chargers_provider_id_idx" ON "chargers"("provider_id");

ALTER TABLE "charging_sessions" ADD COLUMN IF NOT EXISTS "soc_percent" DECIMAL(5,2);
ALTER TABLE "charging_sessions" ADD COLUMN IF NOT EXISTS "id_tag" TEXT;
ALTER TABLE "charging_sessions" ADD COLUMN IF NOT EXISTS "remote_stop_pending" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "charging_sessions_id_tag_idx" ON "charging_sessions"("id_tag");

ALTER TABLE "meter_values" ADD COLUMN IF NOT EXISTS "soc_percent" DECIMAL(5,2);

CREATE TYPE "ChargerCredentialStatus" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TABLE IF NOT EXISTS "charger_credentials" (
  "id" TEXT NOT NULL,
  "charger_id" TEXT NOT NULL,
  "credential_hash" TEXT NOT NULL,
  "status" "ChargerCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
  "last_used_at" TIMESTAMP(3),
  "rotated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "charger_credentials_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "charger_credentials_charger_id_status_idx" ON "charger_credentials"("charger_id", "status");

CREATE TABLE IF NOT EXISTS "ocpp_authorizations" (
  "id" TEXT NOT NULL,
  "id_tag" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Accepted',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ocpp_authorizations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ocpp_authorizations_id_tag_key" ON "ocpp_authorizations"("id_tag");
CREATE INDEX IF NOT EXISTS "ocpp_authorizations_session_id_idx" ON "ocpp_authorizations"("session_id");
CREATE INDEX IF NOT EXISTS "ocpp_authorizations_expires_at_idx" ON "ocpp_authorizations"("expires_at");

CREATE TABLE IF NOT EXISTS "ocpp_transactions" (
  "id" TEXT NOT NULL,
  "charger_id" TEXT NOT NULL,
  "connector_id" TEXT NOT NULL,
  "connector_number" INTEGER NOT NULL,
  "session_id" TEXT NOT NULL,
  "ocpp_transaction_id" INTEGER NOT NULL,
  "id_tag" TEXT NOT NULL,
  "meter_start_wh" INTEGER NOT NULL,
  "meter_stop_wh" INTEGER,
  "started_at" TIMESTAMP(3) NOT NULL,
  "stopped_at" TIMESTAMP(3),
  "stop_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ocpp_transactions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ocpp_transactions_charger_id_ocpp_transaction_id_key" ON "ocpp_transactions"("charger_id", "ocpp_transaction_id");
CREATE INDEX IF NOT EXISTS "ocpp_transactions_session_id_idx" ON "ocpp_transactions"("session_id");
CREATE INDEX IF NOT EXISTS "ocpp_transactions_connector_id_idx" ON "ocpp_transactions"("connector_id");
CREATE INDEX IF NOT EXISTS "ocpp_transactions_id_tag_idx" ON "ocpp_transactions"("id_tag");

CREATE TABLE IF NOT EXISTS "charger_events" (
  "id" TEXT NOT NULL,
  "charger_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "charger_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "charger_events_charger_id_created_at_idx" ON "charger_events"("charger_id", "created_at");
CREATE INDEX IF NOT EXISTS "charger_events_type_created_at_idx" ON "charger_events"("type", "created_at");

DO $$ BEGIN
  ALTER TABLE "charger_credentials" ADD CONSTRAINT "charger_credentials_charger_id_fkey"
    FOREIGN KEY ("charger_id") REFERENCES "chargers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ocpp_authorizations" ADD CONSTRAINT "ocpp_authorizations_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "charging_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ocpp_transactions" ADD CONSTRAINT "ocpp_transactions_charger_id_fkey"
    FOREIGN KEY ("charger_id") REFERENCES "chargers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ocpp_transactions" ADD CONSTRAINT "ocpp_transactions_connector_id_fkey"
    FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ocpp_transactions" ADD CONSTRAINT "ocpp_transactions_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "charging_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "charger_events" ADD CONSTRAINT "charger_events_charger_id_fkey"
    FOREIGN KEY ("charger_id") REFERENCES "chargers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
