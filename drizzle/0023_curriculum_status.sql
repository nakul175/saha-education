CREATE TABLE curriculum_reference_status_events (
  id TEXT PRIMARY KEY NOT NULL,
  reference_id TEXT NOT NULL REFERENCES curriculum_references(id),
  revision INTEGER NOT NULL,
  status TEXT NOT NULL,
  reason TEXT NOT NULL,
  changed_by TEXT NOT NULL REFERENCES users(id),
  changed_at TEXT NOT NULL,
  CONSTRAINT curriculum_status_revision CHECK(typeof(revision) = 'integer' AND revision BETWEEN 1 AND 1000000),
  CONSTRAINT curriculum_status_state CHECK(status IN ('active', 'retired')),
  CONSTRAINT curriculum_status_reason CHECK(length(trim(reason)) BETWEEN 10 AND 500)
);
--> statement-breakpoint
CREATE UNIQUE INDEX curriculum_status_reference_revision ON curriculum_reference_status_events(reference_id, revision);
--> statement-breakpoint
CREATE TRIGGER curriculum_status_no_update BEFORE UPDATE ON curriculum_reference_status_events
BEGIN SELECT RAISE(ABORT, 'Curriculum status events are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER curriculum_status_no_delete BEFORE DELETE ON curriculum_reference_status_events
BEGIN SELECT RAISE(ABORT, 'Curriculum status events are immutable'); END;
