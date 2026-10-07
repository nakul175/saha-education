-- Additive staff notices (in-app only) and administrator audit corrections. No existing row is changed.
CREATE TABLE notices (
 id TEXT PRIMARY KEY NOT NULL,
 school_id TEXT NOT NULL REFERENCES schools(id),
 author_id TEXT NOT NULL REFERENCES users(id),
 audience_kind TEXT NOT NULL,
 class_id TEXT REFERENCES classes(id),
 audience_roles TEXT NOT NULL,
 audience_label TEXT NOT NULL,
 sender_label TEXT NOT NULL,
 title TEXT NOT NULL,
 body TEXT NOT NULL,
 recipient_count INTEGER NOT NULL,
 corrects_notice_id TEXT REFERENCES notices(id),
 correction_reason TEXT,
 request_hash TEXT NOT NULL,
 attempt_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 CONSTRAINT notices_kind CHECK (audience_kind IN ('class', 'recipients', 'correction')),
 CONSTRAINT notices_roles CHECK (audience_roles IN ('guardians', 'learners', 'both', 'selected', 'original')),
 CONSTRAINT notices_title CHECK (length(trim(title)) BETWEEN 1 AND 120),
 CONSTRAINT notices_body CHECK (length(trim(body)) BETWEEN 1 AND 2000),
 CONSTRAINT notices_count CHECK (typeof(recipient_count) = 'integer' AND recipient_count BETWEEN 1 AND 500),
 CONSTRAINT notices_class CHECK ((audience_kind = 'class' AND class_id IS NOT NULL) OR (audience_kind <> 'class' AND class_id IS NULL)),
 CONSTRAINT notices_correction CHECK ((audience_kind = 'correction' AND corrects_notice_id IS NOT NULL AND length(trim(correction_reason)) BETWEEN 10 AND 500) OR (audience_kind <> 'correction' AND corrects_notice_id IS NULL AND correction_reason IS NULL))
);
--> statement-breakpoint
CREATE INDEX notices_school_time ON notices(school_id, created_at);
--> statement-breakpoint
CREATE INDEX notices_author_time ON notices(author_id, created_at);
--> statement-breakpoint
CREATE INDEX notices_corrects ON notices(corrects_notice_id);
--> statement-breakpoint
CREATE TABLE notice_recipients (
 notice_id TEXT NOT NULL REFERENCES notices(id),
 user_id TEXT NOT NULL REFERENCES users(id),
 notification_id TEXT NOT NULL REFERENCES notifications(id),
 PRIMARY KEY (notice_id, user_id)
);
--> statement-breakpoint
CREATE INDEX notice_recipients_user ON notice_recipients(user_id);
--> statement-breakpoint
CREATE TABLE audit_annotations (
 id TEXT PRIMARY KEY NOT NULL,
 school_id TEXT NOT NULL REFERENCES schools(id),
 source TEXT NOT NULL,
 source_id TEXT NOT NULL,
 noted_by TEXT NOT NULL REFERENCES users(id),
 note TEXT NOT NULL,
 request_hash TEXT NOT NULL,
 created_at TEXT NOT NULL,
 CONSTRAINT audit_annotations_note CHECK (length(trim(note)) BETWEEN 10 AND 500),
 CONSTRAINT audit_annotations_source CHECK (length(source) BETWEEN 1 AND 40 AND length(source_id) BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE INDEX audit_annotations_entry ON audit_annotations(school_id, source, source_id);
--> statement-breakpoint
CREATE INDEX audit_annotations_time ON audit_annotations(school_id, created_at);
--> statement-breakpoint
CREATE INDEX notifications_user_time ON notifications(user_id, created_at, id);
--> statement-breakpoint
CREATE TRIGGER notices_no_update BEFORE UPDATE ON notices BEGIN SELECT RAISE(ABORT, 'Sent notices are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER notices_no_delete BEFORE DELETE ON notices BEGIN SELECT RAISE(ABORT, 'Sent notices are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER notice_recipients_no_update BEFORE UPDATE ON notice_recipients BEGIN SELECT RAISE(ABORT, 'Notice recipients are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER notice_recipients_no_delete BEFORE DELETE ON notice_recipients BEGIN SELECT RAISE(ABORT, 'Notice recipients are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER audit_annotations_no_update BEFORE UPDATE ON audit_annotations BEGIN SELECT RAISE(ABORT, 'Audit corrections are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER audit_annotations_no_delete BEFORE DELETE ON audit_annotations BEGIN SELECT RAISE(ABORT, 'Audit corrections are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER identity_admin_events_no_update BEFORE UPDATE ON identity_admin_events BEGIN SELECT RAISE(ABORT, 'Account administration events are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER identity_admin_events_no_delete BEFORE DELETE ON identity_admin_events BEGIN SELECT RAISE(ABORT, 'Account administration events are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER submission_attempts_no_update BEFORE UPDATE ON submission_attempts BEGIN SELECT RAISE(ABORT, 'Submission attempts are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER submission_attempts_no_delete BEFORE DELETE ON submission_attempts BEGIN SELECT RAISE(ABORT, 'Submission attempts are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER submission_feedback_no_update BEFORE UPDATE ON submission_feedback BEGIN SELECT RAISE(ABORT, 'Submission feedback revisions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER submission_feedback_no_delete BEFORE DELETE ON submission_feedback BEGIN SELECT RAISE(ABORT, 'Submission feedback revisions are immutable'); END;
