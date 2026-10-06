-- Additive reviewed account administration. Existing identity/profile mappings are unchanged.
CREATE TABLE identity_admin_user_versions (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id),
 version INTEGER NOT NULL,
 CONSTRAINT identity_admin_version_nonnegative CHECK (typeof(version) = 'integer' AND version >= 0)
);
--> statement-breakpoint
CREATE TABLE identity_admin_events (
 id TEXT PRIMARY KEY NOT NULL,
 school_id TEXT NOT NULL REFERENCES schools(id),
 actor_id TEXT NOT NULL REFERENCES users(id),
 user_id TEXT NOT NULL REFERENCES users(id),
 action TEXT NOT NULL,
 reason TEXT NOT NULL,
 reviewed_at TEXT NOT NULL,
 previous_enabled INTEGER,
 next_enabled INTEGER NOT NULL,
 expected_version INTEGER NOT NULL,
 resulting_version INTEGER NOT NULL,
 request_hash TEXT NOT NULL,
 attempt_id TEXT NOT NULL,
 CONSTRAINT identity_admin_events_action CHECK (action IN ('provision', 'enable', 'disable')),
 CONSTRAINT identity_admin_events_flags CHECK ((previous_enabled IS NULL OR previous_enabled IN (0, 1)) AND next_enabled IN (0, 1)),
 CONSTRAINT identity_admin_events_versions CHECK (typeof(expected_version) = 'integer' AND typeof(resulting_version) = 'integer' AND expected_version >= 0 AND resulting_version > expected_version)
);
--> statement-breakpoint
CREATE INDEX identity_admin_events_school_reviewed ON identity_admin_events(school_id, reviewed_at);
--> statement-breakpoint
CREATE INDEX identity_admin_events_user ON identity_admin_events(user_id);
