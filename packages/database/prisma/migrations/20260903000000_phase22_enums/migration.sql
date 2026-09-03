-- Phase 2.2a: connector types + station access enum
ALTER TYPE "ConnectorType" ADD VALUE IF NOT EXISTS 'GB_T';
ALTER TYPE "ConnectorType" ADD VALUE IF NOT EXISTS 'OTHER';

DO $$ BEGIN
  CREATE TYPE "StationAccessType" AS ENUM ('PUBLIC', 'PRIVATE', 'RESTRICTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
