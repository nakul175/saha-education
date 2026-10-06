-- Additive reviewed editor evidence. Existing attendance and legacy write
-- behavior remain; no old replacements are invented as reviewed history.
CREATE TABLE attendance_reviews (
 id TEXT PRIMARY KEY NOT NULL,
 school_id TEXT NOT NULL REFERENCES schools(id),
 class_id TEXT NOT NULL REFERENCES classes(id),
 attendance_date TEXT NOT NULL CONSTRAINT attendance_reviews_date CHECK (
  length(attendance_date)=10 AND attendance_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  AND coalesce(date(attendance_date,'+0 days')=attendance_date,0)),
 reviewed_by TEXT NOT NULL REFERENCES users(id),
 reason TEXT NOT NULL CONSTRAINT attendance_reviews_reason CHECK(length(reason) BETWEEN 10 AND 500),
 request_hash TEXT NOT NULL,
 entries_json TEXT NOT NULL CONSTRAINT attendance_reviews_entries CHECK(
  json_valid(entries_json) AND json_type(entries_json)='array' AND json_array_length(entries_json) BETWEEN 1 AND 100),
 created_at TEXT NOT NULL
);
CREATE INDEX attendance_reviews_class_date_time ON attendance_reviews(school_id,class_id,attendance_date,created_at);
CREATE TABLE attendance_review_entries (
 id TEXT PRIMARY KEY NOT NULL,
 review_id TEXT NOT NULL REFERENCES attendance_reviews(id),
 attendance_id TEXT NOT NULL REFERENCES attendance(id),
 student_id TEXT NOT NULL REFERENCES students(id),
 before_record TEXT CONSTRAINT attendance_review_entries_before CHECK(before_record IS NULL OR (json_valid(before_record) AND json_type(before_record)='object')),
 after_record TEXT NOT NULL CONSTRAINT attendance_review_entries_after CHECK(json_valid(after_record) AND json_type(after_record)='object')
);
CREATE UNIQUE INDEX attendance_review_entries_pupil ON attendance_review_entries(review_id,student_id);
CREATE INDEX attendance_review_entries_student ON attendance_review_entries(student_id,review_id);

CREATE TRIGGER attendance_review_authority BEFORE INSERT ON attendance_reviews
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM users actor JOIN classes classroom ON classroom.id=NEW.class_id
  WHERE actor.id=NEW.reviewed_by AND actor.school_id=NEW.school_id AND classroom.school_id=NEW.school_id
   AND actor.role IN ('admin','teacher') AND (actor.role='admin' OR classroom.teacher_id=actor.id)
   AND actor.disabled_at IS NULL AND coalesce(actor.identity_issuer,'')<>'' AND coalesce(actor.identity_subject,'')<>''
 ) THEN RAISE(ABORT,'saha_attendance_review_conflict') END;
 SELECT CASE WHEN (
  SELECT count(DISTINCT pupil.id) FROM students pupil JOIN enrolments active ON active.student_id=pupil.id
  WHERE pupil.school_id=NEW.school_id AND active.class_id=NEW.class_id AND active.status='active'
 ) > 100 THEN RAISE(ABORT,'saha_attendance_review_conflict') END;
 SELECT CASE WHEN EXISTS (
  SELECT 1 FROM students pupil JOIN enrolments active ON active.student_id=pupil.id
  WHERE pupil.school_id=NEW.school_id AND active.class_id=NEW.class_id AND active.status='active'
   AND (SELECT count(*) FROM enrolments pair WHERE pair.student_id=pupil.id AND pair.class_id=NEW.class_id)>1
 ) THEN RAISE(ABORT,'saha_attendance_review_conflict') END;
 SELECT CASE WHEN (SELECT count(DISTINCT json_extract(value,'$.studentId')) FROM json_each(NEW.entries_json))
  <> json_array_length(NEW.entries_json) THEN RAISE(ABORT,'saha_attendance_review_conflict') END;
 SELECT CASE WHEN EXISTS (
  SELECT 1 FROM json_each(NEW.entries_json) pending WHERE
   coalesce(json_type(pending.value,'$.studentId'),'')<>'text'
   OR coalesce(json_type(pending.value,'$.attendanceId'),'')<>'text'
   OR coalesce(json_extract(pending.value,'$.attendanceId'),'')=''
   OR coalesce(json_extract(pending.value,'$.status'),'') NOT IN ('present','absent','late','excused')
   OR coalesce(json_type(pending.value,'$.note'),'') NOT IN ('null','text')
   OR (length(coalesce(json_extract(pending.value,'$.note'),''))>2000
    AND NOT (json_type(pending.value,'$.expectedRecord')='object'
     AND json_extract(pending.value,'$.expectedRecord.note') IS json_extract(pending.value,'$.note')))
   OR NOT EXISTS (SELECT 1 FROM students pupil JOIN enrolments active ON active.student_id=pupil.id
    WHERE pupil.id=json_extract(pending.value,'$.studentId') AND pupil.school_id=NEW.school_id
     AND active.class_id=NEW.class_id AND active.status='active')
   OR NOT (
    (json_type(pending.value,'$.expectedRecord')='null' AND NOT EXISTS (
      SELECT 1 FROM attendance saved WHERE saved.class_id=NEW.class_id AND saved.date=NEW.attendance_date
       AND saved.student_id=json_extract(pending.value,'$.studentId')))
    OR (json_type(pending.value,'$.expectedRecord')='object'
     AND coalesce(json_type(pending.value,'$.expectedRecord.note'),'') IN ('null','text')
     AND EXISTS (SELECT 1 FROM attendance saved WHERE saved.class_id=NEW.class_id AND saved.date=NEW.attendance_date
      AND saved.student_id=json_extract(pending.value,'$.studentId')
      AND saved.id IS json_extract(pending.value,'$.expectedRecord.id')
      AND saved.id IS json_extract(pending.value,'$.attendanceId')
      AND saved.status IS json_extract(pending.value,'$.expectedRecord.status')
      AND saved.note IS json_extract(pending.value,'$.expectedRecord.note')
      AND saved.recorded_by IS json_extract(pending.value,'$.expectedRecord.recordedBy')
      AND saved.created_at IS json_extract(pending.value,'$.expectedRecord.createdAt')
      AND saved.updated_at IS json_extract(pending.value,'$.expectedRecord.updatedAt')))
   )
   OR (json_type(pending.value,'$.expectedRecord')='object'
    AND json_extract(pending.value,'$.expectedRecord.status') IS json_extract(pending.value,'$.status')
    AND json_extract(pending.value,'$.expectedRecord.note') IS json_extract(pending.value,'$.note'))
 ) THEN RAISE(ABORT,'saha_attendance_review_conflict') END;
END;

CREATE TRIGGER attendance_review_commit AFTER INSERT ON attendance_reviews
BEGIN
 INSERT INTO attendance(id,class_id,student_id,date,status,note,recorded_by,created_at,updated_at)
 SELECT json_extract(pending.value,'$.attendanceId'),NEW.class_id,json_extract(pending.value,'$.studentId'),NEW.attendance_date,
  json_extract(pending.value,'$.status'),json_extract(pending.value,'$.note'),NEW.reviewed_by,
  coalesce(json_extract(pending.value,'$.expectedRecord.createdAt'),NEW.created_at),NEW.created_at
 FROM json_each(NEW.entries_json) pending WHERE 1
 ON CONFLICT(class_id,student_id,date) DO UPDATE SET status=excluded.status,note=excluded.note,
  recorded_by=excluded.recorded_by,updated_at=excluded.updated_at;
 SELECT CASE WHEN changes()<>json_array_length(NEW.entries_json) THEN RAISE(ABORT,'saha_attendance_review_conflict') END;
 INSERT INTO attendance_review_entries(id,review_id,attendance_id,student_id,before_record,after_record)
 SELECT NEW.id || ':' || saved.student_id,NEW.id,saved.id,saved.student_id,
  CASE WHEN json_type(pending.value,'$.expectedRecord')='object' THEN json_extract(pending.value,'$.expectedRecord') ELSE NULL END,
  json_object('id',saved.id,'status',saved.status,'note',saved.note,'recordedBy',saved.recorded_by,'createdAt',saved.created_at,'updatedAt',saved.updated_at)
 FROM json_each(NEW.entries_json) pending JOIN attendance saved ON saved.id=json_extract(pending.value,'$.attendanceId')
  AND saved.student_id=json_extract(pending.value,'$.studentId') AND saved.class_id=NEW.class_id AND saved.date=NEW.attendance_date;
 SELECT CASE WHEN changes()<>json_array_length(NEW.entries_json) THEN RAISE(ABORT,'saha_attendance_review_conflict') END;
END;
CREATE TRIGGER attendance_reviews_no_update BEFORE UPDATE ON attendance_reviews
BEGIN SELECT RAISE(ABORT,'Attendance reviews are immutable'); END;
CREATE TRIGGER attendance_reviews_no_delete BEFORE DELETE ON attendance_reviews
BEGIN SELECT RAISE(ABORT,'Attendance reviews are immutable'); END;
CREATE TRIGGER attendance_review_entries_no_update BEFORE UPDATE ON attendance_review_entries
BEGIN SELECT RAISE(ABORT,'Attendance review entries are immutable'); END;
CREATE TRIGGER attendance_review_entries_no_delete BEFORE DELETE ON attendance_review_entries
BEGIN SELECT RAISE(ABORT,'Attendance review entries are immutable'); END;
