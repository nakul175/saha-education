-- Schema-only installation evidence for an explicitly enabled isolated demo.
-- Sample rows are created separately in a bounded atomic pristine-database batch.
CREATE TABLE demo_installations (
 id TEXT PRIMARY KEY NOT NULL,
 school_id TEXT NOT NULL,
 seed_nonce TEXT NOT NULL,
 created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX demo_installations_school ON demo_installations(school_id);
