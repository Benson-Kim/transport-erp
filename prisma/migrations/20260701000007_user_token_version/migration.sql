-- #15: JWT revocation. Adds users."tokenVersion", incremented on security
-- events (deactivation, role change, credential reset); the jwt callback
-- compares the token's version against the DB and revokes on mismatch.
-- Additive and non-destructive: existing rows default to 0, matching the
-- schema default, so existing sessions stay valid until an event bumps it.
-- Idempotent: CI's migrate-fresh re-applies raw 2026* migration SQL onto a
-- migrated + seeded database, so the IF NOT EXISTS guard must hold (PG >= 9.6).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;
