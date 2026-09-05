-- Phase 6: charger health, incidents, maintenance, commands, reliability, reconciliation

ALTER TYPE "SessionStatus" ADD VALUE IF NOT EXISTS 'CHARGING_COMPLETE';
ALTER TYPE "SessionStatus" ADD VALUE IF NOT EXISTS 'IDLE';

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CHARGER_OFFLINE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CHARGER_RECOVERED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CONNECTOR_FAULT';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CRITICAL_INCIDENT';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SESSION_STUCK';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'COMMAND_TIMEOUT';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MAINTENANCE_STARTING';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MAINTENANCE_ENDING';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'FAVORITE_STATION_ONLINE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'IDLE_FEE_WARNING';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CHARGER_UNAVAILABLE_DURING_RESERVATION';

DO $$ BEGIN
  CREATE TYPE "ChargerHealthStatus" AS ENUM ('HEALTHY', 'DEGRADED', 'UNSTABLE', 'OFFLINE', 'FAULTED', 'MAINTENANCE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CommunicationFreshness" AS ENUM ('LIVE', 'RECENT', 'STALE', 'OFFLINE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "StationAvailabilityState" AS ENUM ('AVAILABLE', 'LIMITED', 'BUSY', 'RESERVED', 'OFFLINE', 'FAULTED', 'MAINTENANCE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "IncidentType" AS ENUM (
    'CHARGER_OFFLINE', 'CONNECTOR_FAULT', 'SESSION_FAILURE', 'REMOTE_START_FAILURE',
    'REMOTE_STOP_FAILURE', 'COMMUNICATION_LOSS', 'PAYMENT_FAILURE', 'RESERVATION_FAILURE',
    'METERING_ANOMALY', 'UNKNOWN'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "IncidentSeverity" AS ENUM ('INFO', 'WARNING', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'IGNORED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MaintenanceWindowStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ChargerCommandType" AS ENUM ('REMOTE_START', 'REMOTE_STOP', 'RESET', 'CHANGE_AVAILABILITY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ChargerCommandStatus" AS ENUM ('QUEUED', 'SENT', 'ACCEPTED', 'REJECTED', 'TIMEOUT', 'FAILED', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ReconciliationCaseStatus" AS ENUM ('OPEN', 'RESOLVED', 'IGNORED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "WaitlistScope" AS ENUM ('CONNECTOR', 'CONNECTOR_TYPE', 'STATION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "chargers" ADD COLUMN IF NOT EXISTS "last_heartbeat_at" TIMESTAMP(3);
ALTER TABLE "chargers" ADD COLUMN IF NOT EXISTS "last_boot_at" TIMESTAMP(3);
ALTER TABLE "chargers" ADD COLUMN IF NOT EXISTS "last_message_at" TIMESTAMP(3);
ALTER TABLE "chargers" ADD COLUMN IF NOT EXISTS "health_status" "ChargerHealthStatus" NOT NULL DEFAULT 'OFFLINE';
ALTER TABLE "chargers" ADD COLUMN IF NOT EXISTS "health_updated_at" TIMESTAMP(3);
ALTER TABLE "chargers" ADD COLUMN IF NOT EXISTS "reliability_score" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "chargers" ADD COLUMN IF NOT EXISTS "reconnect_count_24h" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "chargers_health_status_idx" ON "chargers"("health_status");

ALTER TABLE "charging_sessions" ADD COLUMN IF NOT EXISTS "charging_completed_at" TIMESTAMP(3);
ALTER TABLE "charging_sessions" ADD COLUMN IF NOT EXISTS "idle_started_at" TIMESTAMP(3);
ALTER TABLE "charging_sessions" ADD COLUMN IF NOT EXISTS "last_meter_at" TIMESTAMP(3);
ALTER TABLE "charging_sessions" ADD COLUMN IF NOT EXISTS "watchdog_class" TEXT;

ALTER TABLE "charging_waitlist" ADD COLUMN IF NOT EXISTS "connector_type" "ConnectorType";
ALTER TABLE "charging_waitlist" ADD COLUMN IF NOT EXISTS "scope" "WaitlistScope" NOT NULL DEFAULT 'CONNECTOR';
ALTER TABLE "charging_waitlist" ADD COLUMN IF NOT EXISTS "eta_minutes" INTEGER;

ALTER TABLE "charging_waitlist" ALTER COLUMN "connector_id" DROP NOT NULL;

DROP INDEX IF EXISTS "charging_waitlist_connector_id_status_position_idx";
CREATE INDEX IF NOT EXISTS "charging_waitlist_connector_id_status_position_idx"
  ON "charging_waitlist"("connector_id", "status", "position");
CREATE INDEX IF NOT EXISTS "charging_waitlist_station_id_status_position_idx"
  ON "charging_waitlist"("station_id", "status", "position");

ALTER TABLE "charger_events" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'OPERATIONAL';
CREATE INDEX IF NOT EXISTS "charger_events_category_created_at_idx" ON "charger_events"("category", "created_at");

CREATE TABLE IF NOT EXISTS "incidents" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "station_id" TEXT NOT NULL,
  "charger_id" TEXT,
  "connector_id" TEXT,
  "session_id" TEXT,
  "type" "IncidentType" NOT NULL,
  "severity" "IncidentSeverity" NOT NULL,
  "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'system',
  "open_key" TEXT,
  "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  "resolution" TEXT,
  "resolved_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "incidents_open_key_key" ON "incidents"("open_key");
CREATE INDEX IF NOT EXISTS "incidents_company_id_status_severity_idx" ON "incidents"("company_id", "status", "severity");
CREATE INDEX IF NOT EXISTS "incidents_charger_id_status_idx" ON "incidents"("charger_id", "status");
CREATE INDEX IF NOT EXISTS "incidents_station_id_status_idx" ON "incidents"("station_id", "status");
CREATE INDEX IF NOT EXISTS "incidents_type_status_idx" ON "incidents"("type", "status");

CREATE TABLE IF NOT EXISTS "maintenance_windows" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "station_id" TEXT,
  "charger_id" TEXT,
  "connector_id" TEXT,
  "starts_at" TIMESTAMP(3) NOT NULL,
  "ends_at" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "MaintenanceWindowStatus" NOT NULL DEFAULT 'SCHEDULED',
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "maintenance_windows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "maintenance_windows_company_id_status_starts_at_idx"
  ON "maintenance_windows"("company_id", "status", "starts_at");
CREATE INDEX IF NOT EXISTS "maintenance_windows_charger_id_status_idx" ON "maintenance_windows"("charger_id", "status");
CREATE INDEX IF NOT EXISTS "maintenance_windows_station_id_status_idx" ON "maintenance_windows"("station_id", "status");
CREATE INDEX IF NOT EXISTS "maintenance_windows_status_starts_at_ends_at_idx"
  ON "maintenance_windows"("status", "starts_at", "ends_at");

CREATE TABLE IF NOT EXISTS "charger_commands" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "charger_id" TEXT NOT NULL,
  "connector_id" TEXT,
  "type" "ChargerCommandType" NOT NULL,
  "status" "ChargerCommandStatus" NOT NULL DEFAULT 'QUEUED',
  "requested_by" TEXT,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_at" TIMESTAMP(3),
  "responded_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "error_code" TEXT,
  "error_message_sanitized" TEXT,
  "correlation_id" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "charger_commands_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "charger_commands_correlation_id_key" ON "charger_commands"("correlation_id");
CREATE INDEX IF NOT EXISTS "charger_commands_charger_id_created_at_idx" ON "charger_commands"("charger_id", "created_at");
CREATE INDEX IF NOT EXISTS "charger_commands_company_id_status_created_at_idx"
  ON "charger_commands"("company_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "charger_commands_status_sent_at_idx" ON "charger_commands"("status", "sent_at");

CREATE TABLE IF NOT EXISTS "charger_reliability_snapshots" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "charger_id" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "score" INTEGER NOT NULL,
  "uptime_rate" DOUBLE PRECISION NOT NULL,
  "successful_sessions_rate" DOUBLE PRECISION NOT NULL,
  "command_success_rate" DOUBLE PRECISION NOT NULL,
  "fault_penalty" INTEGER NOT NULL,
  "sessions_started" INTEGER NOT NULL DEFAULT 0,
  "sessions_completed" INTEGER NOT NULL DEFAULT 0,
  "sessions_failed" INTEGER NOT NULL DEFAULT 0,
  "remote_start_failures" INTEGER NOT NULL DEFAULT 0,
  "remote_stop_failures" INTEGER NOT NULL DEFAULT 0,
  "offline_events" INTEGER NOT NULL DEFAULT 0,
  "recovered_events" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "charger_reliability_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "charger_reliability_snapshots_charger_id_day_key"
  ON "charger_reliability_snapshots"("charger_id", "day");
CREATE INDEX IF NOT EXISTS "charger_reliability_snapshots_company_id_day_idx"
  ON "charger_reliability_snapshots"("company_id", "day");

CREATE TABLE IF NOT EXISTS "reconciliation_cases" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "charger_id" TEXT NOT NULL,
  "session_id" TEXT,
  "reason" TEXT NOT NULL,
  "status" "ReconciliationCaseStatus" NOT NULL DEFAULT 'OPEN',
  "classification" TEXT NOT NULL DEFAULT 'REQUIRES_RECONCILIATION',
  "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  "resolution" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reconciliation_cases_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "reconciliation_cases_charger_id_status_idx" ON "reconciliation_cases"("charger_id", "status");
CREATE INDEX IF NOT EXISTS "reconciliation_cases_company_id_status_detected_at_idx"
  ON "reconciliation_cases"("company_id", "status", "detected_at");
CREATE INDEX IF NOT EXISTS "reconciliation_cases_session_id_status_idx" ON "reconciliation_cases"("session_id", "status");

DO $$ BEGIN
  ALTER TABLE "incidents" ADD CONSTRAINT "incidents_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "incidents" ADD CONSTRAINT "incidents_station_id_fkey"
    FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "incidents" ADD CONSTRAINT "incidents_charger_id_fkey"
    FOREIGN KEY ("charger_id") REFERENCES "chargers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "incidents" ADD CONSTRAINT "incidents_connector_id_fkey"
    FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "incidents" ADD CONSTRAINT "incidents_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "charging_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "incidents" ADD CONSTRAINT "incidents_resolved_by_id_fkey"
    FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "maintenance_windows" ADD CONSTRAINT "maintenance_windows_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "maintenance_windows" ADD CONSTRAINT "maintenance_windows_station_id_fkey"
    FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "maintenance_windows" ADD CONSTRAINT "maintenance_windows_charger_id_fkey"
    FOREIGN KEY ("charger_id") REFERENCES "chargers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "maintenance_windows" ADD CONSTRAINT "maintenance_windows_connector_id_fkey"
    FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "maintenance_windows" ADD CONSTRAINT "maintenance_windows_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "charger_commands" ADD CONSTRAINT "charger_commands_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "charger_commands" ADD CONSTRAINT "charger_commands_charger_id_fkey"
    FOREIGN KEY ("charger_id") REFERENCES "chargers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "charger_commands" ADD CONSTRAINT "charger_commands_connector_id_fkey"
    FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "charger_commands" ADD CONSTRAINT "charger_commands_requested_by_fkey"
    FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "charger_reliability_snapshots" ADD CONSTRAINT "charger_reliability_snapshots_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "charger_reliability_snapshots" ADD CONSTRAINT "charger_reliability_snapshots_charger_id_fkey"
    FOREIGN KEY ("charger_id") REFERENCES "chargers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "reconciliation_cases" ADD CONSTRAINT "reconciliation_cases_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "reconciliation_cases" ADD CONSTRAINT "reconciliation_cases_charger_id_fkey"
    FOREIGN KEY ("charger_id") REFERENCES "chargers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "reconciliation_cases" ADD CONSTRAINT "reconciliation_cases_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "charging_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
