-- Phase 2.1a: add SessionStatus.PREPARING (must commit before it is referenced)
ALTER TYPE "SessionStatus" ADD VALUE IF NOT EXISTS 'PREPARING';
