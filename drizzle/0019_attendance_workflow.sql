-- Attendance workflow additions: school-local calendar settings and an immutable change log for saved marks.
-- Additive only. Original attendance rows, 0013 review receipts and legacy API behaviour are unchanged.
-- Each piece below is exactly one statement so a splitting migration runner cannot cut a statement in half.
CREATE TABLE school_attendance_settings (
 school_id TEXT PRIMARY KEY NOT NULL REFERENCES schools(id),
 timezone TEXT NOT NULL CONSTRAINT school_attendance_settings_timezone CHECK(length(timezone) BETWEEN 1 AND 64 AND timezone NOT GLOB '*[^A-Za-z0-9_+/-]*'),
 future_dates_allowed INTEGER NOT NULL DEFAULT 1 CONSTRAINT school_attendance_settings_future CHECK(future_dates_allowed IN (0,1)),
 updated_by TEXT NOT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE attendance_changes (
 id TEXT PRIMARY KEY NOT NULL,
 attendance_id TEXT NOT NULL,
 class_id TEXT NOT NULL,
 student_id TEXT NOT NULL,
 attendance_date TEXT NOT NULL,
 change_kind TEXT NOT NULL CONSTRAINT attendance_changes_kind CHECK(change_kind IN ('update','delete')),
 before_record TEXT NOT NULL CONSTRAINT attendance_changes_before CHECK(json_valid(before_record) AND json_type(before_record)='object'),
 after_record TEXT CONSTRAINT attendance_changes_after CHECK(after_record IS NULL OR (json_valid(after_record) AND json_type(after_record)='object')),
 changed_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX attendance_changes_class_date ON attendance_changes(class_id,attendance_date,changed_at);
--> statement-breakpoint
CREATE INDEX attendance_changes_student ON attendance_changes(student_id,changed_at);
--> statement-breakpoint
CREATE TRIGGER attendance_changes_on_update AFTER UPDATE ON attendance
WHEN OLD.status IS NOT NEW.status OR OLD.note IS NOT NEW.note OR OLD.recorded_by IS NOT NEW.recorded_by
BEGIN
 INSERT INTO attendance_changes(id,attendance_id,class_id,student_id,attendance_date,change_kind,before_record,after_record,changed_at)
 VALUES (lower(hex(randomblob(16))),OLD.id,OLD.class_id,OLD.student_id,OLD.date,'update',
  json_object('id',OLD.id,'status',OLD.status,'note',OLD.note,'recordedBy',OLD.recorded_by,'createdAt',OLD.created_at,'updatedAt',OLD.updated_at),
  json_object('id',NEW.id,'status',NEW.status,'note',NEW.note,'recordedBy',NEW.recorded_by,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),
  strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
--> statement-breakpoint
CREATE TRIGGER attendance_changes_on_delete AFTER DELETE ON attendance
BEGIN
 INSERT INTO attendance_changes(id,attendance_id,class_id,student_id,attendance_date,change_kind,before_record,after_record,changed_at)
 VALUES (lower(hex(randomblob(16))),OLD.id,OLD.class_id,OLD.student_id,OLD.date,'delete',
  json_object('id',OLD.id,'status',OLD.status,'note',OLD.note,'recordedBy',OLD.recorded_by,'createdAt',OLD.created_at,'updatedAt',OLD.updated_at),
  NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
--> statement-breakpoint
CREATE TRIGGER attendance_changes_no_update BEFORE UPDATE ON attendance_changes
BEGIN SELECT RAISE(ABORT,'Attendance change log is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER attendance_changes_no_delete BEFORE DELETE ON attendance_changes
BEGIN SELECT RAISE(ABORT,'Attendance change log is immutable'); END;
