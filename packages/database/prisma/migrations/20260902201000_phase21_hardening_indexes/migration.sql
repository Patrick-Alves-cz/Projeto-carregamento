-- Phase 2.1b: refresh families, session locks, security events

ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "family_id" TEXT;
UPDATE "refresh_tokens" SET "family_id" = "id" WHERE "family_id" IS NULL OR "family_id" = '';
ALTER TABLE "refresh_tokens" ALTER COLUMN "family_id" SET NOT NULL;
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "replaced_by_id" TEXT;
CREATE INDEX IF NOT EXISTS "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

ALTER TABLE "charging_sessions" ADD COLUMN IF NOT EXISTS "stop_idempotency_key" TEXT;

DROP INDEX IF EXISTS "charging_sessions_idempotency_key_key";
CREATE UNIQUE INDEX IF NOT EXISTS "charging_sessions_user_id_idempotency_key_key"
  ON "charging_sessions"("user_id", "idempotency_key");
CREATE UNIQUE INDEX IF NOT EXISTS "charging_sessions_user_id_stop_idempotency_key_key"
  ON "charging_sessions"("user_id", "stop_idempotency_key");

CREATE UNIQUE INDEX IF NOT EXISTS "charging_sessions_one_active_per_connector"
  ON "charging_sessions"("connector_id")
  WHERE "status" IN ('PENDING', 'PREPARING', 'ACTIVE', 'PAUSED');

CREATE TABLE IF NOT EXISTS "security_events" (
  "id" TEXT NOT NULL,
  "user_id" TEXT,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "security_events_type_created_at_idx" ON "security_events"("type", "created_at");
CREATE INDEX IF NOT EXISTS "security_events_user_id_created_at_idx" ON "security_events"("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "idempotency_records" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "resource_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_records_user_id_operation_key_key"
  ON "idempotency_records"("user_id", "operation", "key");
