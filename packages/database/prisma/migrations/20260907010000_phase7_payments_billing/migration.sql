-- Phase 7: session billing, wallet holds, Asaas-ready payment fields, reconciliation

ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'REFUND_PENDING';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED';

DO $$ BEGIN
  CREATE TYPE "WalletHoldStatus" AS ENUM ('OPEN', 'CAPTURED', 'RELEASED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentAuthorizationStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'CAPTURED', 'RELEASED', 'FAILED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentReconciliationStatus" AS ENUM ('OPEN', 'RESOLVED', 'IGNORED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "charging_sessions" ADD COLUMN IF NOT EXISTS "billing_status" TEXT NOT NULL DEFAULT 'NONE';

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "refunded_amount_cents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "refund_reason" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "refund_requested_at" TIMESTAMP(3);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "refund_idempotency_key" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "payments_refund_idempotency_key_key" ON "payments"("refund_idempotency_key");

ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "provider_payment_id" TEXT;
ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'RECEIVED';
ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "error_sanitized" TEXT;
ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "payment_webhook_events_status_received_at_idx" ON "payment_webhook_events"("status", "received_at");

CREATE TABLE IF NOT EXISTS "wallet_holds" (
  "id" TEXT NOT NULL,
  "wallet_id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "captured_cents" INTEGER NOT NULL DEFAULT 0,
  "released_cents" INTEGER NOT NULL DEFAULT 0,
  "status" "WalletHoldStatus" NOT NULL DEFAULT 'OPEN',
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "wallet_holds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "wallet_holds_session_id_key" ON "wallet_holds"("session_id");
CREATE UNIQUE INDEX IF NOT EXISTS "wallet_holds_idempotency_key_key" ON "wallet_holds"("idempotency_key");
CREATE INDEX IF NOT EXISTS "wallet_holds_wallet_id_status_idx" ON "wallet_holds"("wallet_id", "status");

CREATE TABLE IF NOT EXISTS "payment_authorizations" (
  "id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "payment_id" TEXT,
  "method" TEXT NOT NULL,
  "authorized_amount_cents" INTEGER NOT NULL,
  "captured_amount_cents" INTEGER NOT NULL DEFAULT 0,
  "released_amount_cents" INTEGER NOT NULL DEFAULT 0,
  "status" "PaymentAuthorizationStatus" NOT NULL DEFAULT 'PENDING',
  "provider_reference" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_authorizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payment_authorizations_session_id_key" ON "payment_authorizations"("session_id");
CREATE INDEX IF NOT EXISTS "payment_authorizations_payment_id_status_idx" ON "payment_authorizations"("payment_id", "status");

CREATE TABLE IF NOT EXISTS "payment_reconciliation_cases" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "payment_id" TEXT,
  "session_id" TEXT,
  "reason" TEXT NOT NULL,
  "status" "PaymentReconciliationStatus" NOT NULL DEFAULT 'OPEN',
  "details" JSONB NOT NULL DEFAULT '{}',
  "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  "resolution" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_reconciliation_cases_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "payment_reconciliation_cases_company_id_status_detected_at_idx" ON "payment_reconciliation_cases"("company_id", "status", "detected_at");
CREATE INDEX IF NOT EXISTS "payment_reconciliation_cases_payment_id_status_idx" ON "payment_reconciliation_cases"("payment_id", "status");
CREATE INDEX IF NOT EXISTS "payment_reconciliation_cases_session_id_status_idx" ON "payment_reconciliation_cases"("session_id", "status");

DO $$ BEGIN
  ALTER TABLE "wallet_holds" ADD CONSTRAINT "wallet_holds_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "wallet_holds" ADD CONSTRAINT "wallet_holds_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "charging_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "payment_authorizations" ADD CONSTRAINT "payment_authorizations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "charging_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "payment_authorizations" ADD CONSTRAINT "payment_authorizations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "payment_reconciliation_cases" ADD CONSTRAINT "payment_reconciliation_cases_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "payment_reconciliation_cases" ADD CONSTRAINT "payment_reconciliation_cases_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "payment_reconciliation_cases" ADD CONSTRAINT "payment_reconciliation_cases_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "charging_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
