-- Phase 2.2b: station discovery metadata + default vehicle
ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "postal_code" TEXT;
ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "access_type" "StationAccessType" NOT NULL DEFAULT 'PUBLIC';
ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "opening_hours" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "is_default" BOOLEAN NOT NULL DEFAULT false;
