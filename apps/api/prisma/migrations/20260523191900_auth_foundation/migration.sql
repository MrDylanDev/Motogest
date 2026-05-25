-- Auth Foundation Migration
-- Adds GRANTs for taller_app on users/tenants and creates global auth tables.
--
-- email_verifications and refresh_tokens are GLOBAL (no RLS) because they
-- operate before tenant context is established (signup, login, refresh).
-- taller_app gets direct DML access; no RLS policies are added.

-- ============================================
-- GRANTs on existing tables for taller_app
-- ============================================

-- Full DML on users — needed for signup (INSERT), login (SELECT),
-- email verification (UPDATE emailVerified), profile updates.
GRANT SELECT, INSERT, UPDATE, DELETE ON users TO taller_app;

-- INSERT + UPDATE on tenants — needed for atomic signup (creates tenant)
-- and status transitions (pending_verification → active).
-- Upgrades the existing SELECT-only grant.
GRANT INSERT, UPDATE ON tenants TO taller_app;

-- ============================================
-- email_verifications (global, no RLS)
-- ============================================

CREATE TABLE "email_verifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_verifications_token_key" ON "email_verifications"("token");
CREATE INDEX "email_verifications_user_id_idx" ON "email_verifications"("user_id");

ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON email_verifications TO taller_app;

-- ============================================
-- refresh_tokens (global, no RLS)
-- ============================================

CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON refresh_tokens TO taller_app;
