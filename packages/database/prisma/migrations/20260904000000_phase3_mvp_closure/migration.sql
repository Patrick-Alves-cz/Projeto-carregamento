-- Phase 3: wallet top-up, richer tariffs, invitations, password reset, notifications, receipts

CREATE TYPE "WalletTxKind" AS ENUM ('DEPOSIT', 'CHARGE', 'REFUND', 'ADJUSTMENT');
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');
CREATE TYPE "NotificationType" AS ENUM (
  'LOW_BALANCE',
  'SESSION_STARTED',
  'SESSION_PAUSED',
  'SESSION_RESUMED',
  'SESSION_COMPLETED',
  'SESSION_INSUFFICIENT_BALANCE'
);

ALTER TABLE "tariffs"
  ADD COLUMN IF NOT EXISTS "price_per_minute_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "idle_fee_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "connection_fee_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "valid_from" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "valid_to" TIMESTAMP(3);

ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "tariff_id" TEXT;
ALTER TABLE "connectors" ADD COLUMN IF NOT EXISTS "tariff_id" TEXT;

ALTER TABLE "wallet_transactions" ADD COLUMN IF NOT EXISTS "kind" "WalletTxKind" NOT NULL DEFAULT 'ADJUSTMENT';
UPDATE "wallet_transactions" SET "kind" = 'CHARGE' WHERE "type" = 'DEBIT';
UPDATE "wallet_transactions" SET "kind" = 'DEPOSIT' WHERE "type" = 'CREDIT' AND "session_id" IS NULL;

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "user_id" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;

UPDATE "payments" p
SET "user_id" = s."user_id"
FROM "charging_sessions" s
WHERE p."session_id" = s."id" AND p."user_id" IS NULL;

DELETE FROM "payments" WHERE "user_id" IS NULL;

ALTER TABLE "payments" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "payments" ALTER COLUMN "session_id" DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "payments_idempotency_key_key" ON "payments"("idempotency_key");
CREATE INDEX IF NOT EXISTS "payments_user_id_created_at_idx" ON "payments"("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "receipts" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "receipts_number_key" ON "receipts"("number");
CREATE UNIQUE INDEX IF NOT EXISTS "receipts_session_id_key" ON "receipts"("session_id");
CREATE INDEX IF NOT EXISTS "receipts_user_id_created_at_idx" ON "receipts"("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "invitations" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "role" "UserRole" NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "invited_by_id" TEXT NOT NULL,
  "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
  "accepted_at" TIMESTAMP(3),
  "accepted_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "invitations_token_hash_key" ON "invitations"("token_hash");
CREATE INDEX IF NOT EXISTS "invitations_company_id_status_idx" ON "invitations"("company_id", "status");
CREATE INDEX IF NOT EXISTS "invitations_email_status_idx" ON "invitations"("email", "status");

CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");
CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_id_created_at_idx" ON "password_reset_tokens"("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "in_app_notifications" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "dedupe_key" TEXT,
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "in_app_notifications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "in_app_notifications_dedupe_key_key" ON "in_app_notifications"("dedupe_key");
CREATE INDEX IF NOT EXISTS "in_app_notifications_user_id_created_at_idx" ON "in_app_notifications"("user_id", "created_at");

DO $$ BEGIN
  ALTER TABLE "stations" ADD CONSTRAINT "stations_tariff_id_fkey"
    FOREIGN KEY ("tariff_id") REFERENCES "tariffs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "connectors" ADD CONSTRAINT "connectors_tariff_id_fkey"
    FOREIGN KEY ("tariff_id") REFERENCES "tariffs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "receipts" ADD CONSTRAINT "receipts_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "charging_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "receipts" ADD CONSTRAINT "receipts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "invitations" ADD CONSTRAINT "invitations_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_id_fkey"
    FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_id_fkey"
    FOREIGN KEY ("accepted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
