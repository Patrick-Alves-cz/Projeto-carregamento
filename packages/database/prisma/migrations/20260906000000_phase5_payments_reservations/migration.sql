-- Phase 5: payments, reservations, waitlist, favorites, tariff extras

ALTER TYPE "ConnectorStatus" ADD VALUE IF NOT EXISTS 'RESERVED';

ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'AUTHORIZED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'CONFIRMED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'RESERVATION_CONFIRMED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'RESERVATION_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'RESERVATION_STARTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'RESERVATION_EXPIRED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'RESERVATION_NO_SHOW';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CONNECTOR_AVAILABLE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WAITLIST_JOINED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WAITLIST_NOTIFIED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYMENT_CONFIRMED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYMENT_FAILED';

DO $$ BEGIN
  CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'NO_SHOW');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'NOTIFIED', 'CLAIMED', 'EXPIRED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentMethodStatus" AS ENUM ('ACTIVE', 'REVOKED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "tariffs" ADD COLUMN IF NOT EXISTS "parking_price_cents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tariffs" ADD COLUMN IF NOT EXISTS "minimum_charge_cents" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "charging_sessions" ADD COLUMN IF NOT EXISTS "reservation_id" TEXT;
ALTER TABLE "charging_sessions" ADD COLUMN IF NOT EXISTS "payment_kind" TEXT NOT NULL DEFAULT 'WALLET';
CREATE INDEX IF NOT EXISTS "charging_sessions_reservation_id_idx" ON "charging_sessions"("reservation_id");

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "company_id" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "payment_method_id" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'WALLET';
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "provider" TEXT NOT NULL DEFAULT 'mock';
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "provider_ref" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "pix_copy_paste" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "pix_qr_payload" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP(3);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "confirmed_at" TIMESTAMP(3);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "failure_code" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "wallet_credited" BOOLEAN NOT NULL DEFAULT false;

UPDATE "payments" SET "wallet_credited" = true WHERE "status" IN ('COMPLETED', 'CONFIRMED');

CREATE INDEX IF NOT EXISTS "payments_company_id_status_created_at_idx" ON "payments"("company_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "payments_provider_provider_ref_idx" ON "payments"("provider", "provider_ref");
CREATE INDEX IF NOT EXISTS "payments_status_expires_at_idx" ON "payments"("status", "expires_at");

CREATE TABLE IF NOT EXISTS "payment_methods" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'mock',
  "provider_method_id" TEXT NOT NULL,
  "brand" TEXT NOT NULL,
  "last4" TEXT NOT NULL,
  "exp_month" INTEGER NOT NULL,
  "exp_year" INTEGER NOT NULL,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "status" "PaymentMethodStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "payment_methods_user_id_status_idx" ON "payment_methods"("user_id", "status");

CREATE TABLE IF NOT EXISTS "payment_webhook_events" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "external_event_id" TEXT NOT NULL,
  "payment_id" TEXT,
  "event_type" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "processed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "payment_webhook_events_provider_external_event_id_key" ON "payment_webhook_events"("provider", "external_event_id");
CREATE INDEX IF NOT EXISTS "payment_webhook_events_payment_id_idx" ON "payment_webhook_events"("payment_id");

CREATE TABLE IF NOT EXISTS "reservations" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "station_id" TEXT NOT NULL,
  "connector_id" TEXT,
  "vehicle_id" TEXT NOT NULL,
  "start_at" TIMESTAMP(3) NOT NULL,
  "end_at" TIMESTAMP(3) NOT NULL,
  "status" "ReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
  "grace_until" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "reservations_user_id_status_start_at_idx" ON "reservations"("user_id", "status", "start_at");
CREATE INDEX IF NOT EXISTS "reservations_company_id_status_start_at_idx" ON "reservations"("company_id", "status", "start_at");
CREATE INDEX IF NOT EXISTS "reservations_connector_id_start_at_end_at_idx" ON "reservations"("connector_id", "start_at", "end_at");
CREATE INDEX IF NOT EXISTS "reservations_station_id_start_at_idx" ON "reservations"("station_id", "start_at");

CREATE TABLE IF NOT EXISTS "charging_waitlist" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "station_id" TEXT NOT NULL,
  "connector_id" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
  "notified_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "claimed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "charging_waitlist_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "charging_waitlist_connector_id_status_position_idx" ON "charging_waitlist"("connector_id", "status", "position");
CREATE INDEX IF NOT EXISTS "charging_waitlist_user_id_status_idx" ON "charging_waitlist"("user_id", "status");
CREATE INDEX IF NOT EXISTS "charging_waitlist_company_id_status_idx" ON "charging_waitlist"("company_id", "status");

CREATE TABLE IF NOT EXISTS "favorite_stations" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "station_id" TEXT NOT NULL,
  "connector_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "favorite_stations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "favorite_stations_user_id_station_id_key" ON "favorite_stations"("user_id", "station_id");
CREATE INDEX IF NOT EXISTS "favorite_stations_user_id_created_at_idx" ON "favorite_stations"("user_id", "created_at");

DO $$ BEGIN
  ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "payments" ADD CONSTRAINT "payments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "reservations" ADD CONSTRAINT "reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "reservations" ADD CONSTRAINT "reservations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "reservations" ADD CONSTRAINT "reservations_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "reservations" ADD CONSTRAINT "reservations_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "reservations" ADD CONSTRAINT "reservations_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "charging_sessions" ADD CONSTRAINT "charging_sessions_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "charging_waitlist" ADD CONSTRAINT "charging_waitlist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "charging_waitlist" ADD CONSTRAINT "charging_waitlist_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "charging_waitlist" ADD CONSTRAINT "charging_waitlist_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "charging_waitlist" ADD CONSTRAINT "charging_waitlist_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "favorite_stations" ADD CONSTRAINT "favorite_stations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "favorite_stations" ADD CONSTRAINT "favorite_stations_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "favorite_stations" ADD CONSTRAINT "favorite_stations_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
