-- Existing records intentionally receive no identity or relationship backfill.
-- Map issuer/sub and legacy guardian schools through a reviewed provisioning process.
ALTER TABLE users ADD COLUMN identity_issuer TEXT;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN identity_subject TEXT;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN disabled_at TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX users_identity_unique ON users(identity_issuer, identity_subject);
--> statement-breakpoint
ALTER TABLE students ADD COLUMN user_id TEXT REFERENCES users(id);
--> statement-breakpoint
CREATE UNIQUE INDEX students_user_id_unique ON students(user_id);
--> statement-breakpoint
ALTER TABLE guardians ADD COLUMN school_id TEXT REFERENCES schools(id);
--> statement-breakpoint
CREATE TABLE auth_sessions (
 token_hash TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id),
 expires_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX auth_sessions_user ON auth_sessions(user_id);
--> statement-breakpoint
CREATE TABLE oidc_transactions (
 state_hash TEXT PRIMARY KEY NOT NULL,
 browser_hash TEXT NOT NULL,
 verifier TEXT NOT NULL,
 nonce TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE auth_rate_limits (
 bucket TEXT PRIMARY KEY NOT NULL,
 count INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
--> statement-breakpoint
