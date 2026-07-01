-- Add tokenVersion for JWT revocation on security events (#15).
-- Additive, non-destructive: existing rows default to 0, matching the
-- schema default so existing sessions remain valid until a security event
-- bumps the version.
ALTER TABLE "users" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
