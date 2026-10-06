-- Additive course/class/enrolment lifecycle (FR-07/FR-08). No existing table is altered, no row is
-- backfilled and legacy enrolment/duplicate evidence is untouched. Reviewed changes are recorded in an
-- immutable request header plus per-effect events; SQL triggers apply and guard every effect so a whole
-- request (up to 25 changes) commits or fails as one statement. Policies here are working choices, not approvals.
CREATE TABLE course_lifecycle (
 course_id TEXT PRIMARY KEY NOT NULL REFERENCES courses(id),
 status TEXT NOT NULL CONSTRAINT course_lifecycle_status CHECK(status IN ('active','retired')),
 changed_at TEXT NOT NULL,
 changed_by TEXT NOT NULL REFERENCES users(id),
 reason TEXT
);
--> statement-breakpoint
CREATE TABLE class_settings (
 class_id TEXT PRIMARY KEY NOT NULL REFERENCES classes(id),
 capacity INTEGER CONSTRAINT class_settings_capacity CHECK(capacity IS NULL OR (typeof(capacity)='integer' AND capacity BETWEEN 1 AND 500)),
 starts_on TEXT CONSTRAINT class_settings_starts CHECK(starts_on IS NULL OR coalesce(date(starts_on)=starts_on,0)),
 ends_on TEXT CONSTRAINT class_settings_ends CHECK(ends_on IS NULL OR coalesce(date(ends_on)=ends_on,0)),
 status TEXT NOT NULL DEFAULT 'open' CONSTRAINT class_settings_status CHECK(status IN ('open','closed')),
 closed_at TEXT,
 closed_by TEXT REFERENCES users(id),
 updated_at TEXT NOT NULL,
 CONSTRAINT class_settings_window CHECK(starts_on IS NULL OR ends_on IS NULL OR starts_on<=ends_on)
);
--> statement-breakpoint
CREATE TABLE enrolment_lifecycle (
 enrolment_id TEXT PRIMARY KEY NOT NULL REFERENCES enrolments(id),
 started_on TEXT NOT NULL CONSTRAINT enrolment_lifecycle_started CHECK(coalesce(date(started_on)=started_on,0)),
 ended_on TEXT CONSTRAINT enrolment_lifecycle_ended CHECK(ended_on IS NULL OR coalesce(date(ended_on)=ended_on,0)),
 end_kind TEXT CONSTRAINT enrolment_lifecycle_kind CHECK(end_kind IS NULL OR end_kind IN ('withdrawn','completed','transferred')),
 updated_at TEXT NOT NULL,
 CONSTRAINT enrolment_lifecycle_order CHECK(ended_on IS NULL OR ended_on>=started_on)
);
--> statement-breakpoint
CREATE TABLE academic_change_requests (
 id TEXT PRIMARY KEY NOT NULL,
 school_id TEXT NOT NULL REFERENCES schools(id),
 actor_id TEXT NOT NULL REFERENCES users(id),
 request_hash TEXT NOT NULL CONSTRAINT academic_change_requests_hash CHECK(length(request_hash)=64 AND request_hash NOT GLOB '*[^0-9a-f]*'),
 reason TEXT CONSTRAINT academic_change_requests_reason CHECK(reason IS NULL OR (length(reason) BETWEEN 5 AND 500 AND instr(reason,char(0))=0)),
 items_json TEXT NOT NULL CONSTRAINT academic_change_requests_items CHECK(json_valid(items_json) AND json_type(items_json)='array' AND json_array_length(items_json) BETWEEN 1 AND 25),
 item_count INTEGER NOT NULL CONSTRAINT academic_change_requests_count CHECK(item_count BETWEEN 1 AND 25),
 created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX academic_change_requests_actor_time ON academic_change_requests(school_id,actor_id,created_at);
--> statement-breakpoint
CREATE TABLE academic_events (
 id TEXT PRIMARY KEY NOT NULL,
 request_id TEXT NOT NULL REFERENCES academic_change_requests(id),
 seq INTEGER NOT NULL,
 school_id TEXT NOT NULL REFERENCES schools(id),
 actor_id TEXT NOT NULL REFERENCES users(id),
 kind TEXT NOT NULL CONSTRAINT academic_events_kind CHECK(kind IN ('course.create','course.edit','course.retire','course.reinstate','class.create','class.edit','class.teacher','class.close','class.reopen','enrolment.enrol','enrolment.withdraw','enrolment.complete','enrolment.reenrol','enrolment.transfer')),
 subject_id TEXT NOT NULL,
 class_id TEXT,
 related_class_id TEXT,
 student_id TEXT,
 effective_on TEXT,
 payload TEXT NOT NULL CONSTRAINT academic_events_payload CHECK(json_valid(payload) AND json_type(payload)='object'),
 created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX academic_events_request ON academic_events(request_id,seq);
--> statement-breakpoint
CREATE INDEX academic_events_subject ON academic_events(school_id,subject_id,created_at);
--> statement-breakpoint
CREATE INDEX academic_events_class ON academic_events(school_id,class_id,created_at);
--> statement-breakpoint
CREATE INDEX academic_events_related_class ON academic_events(school_id,related_class_id,created_at);
--> statement-breakpoint
CREATE INDEX academic_events_student ON academic_events(school_id,student_id,created_at);
--> statement-breakpoint
CREATE TRIGGER academic_change_requests_no_update BEFORE UPDATE ON academic_change_requests
BEGIN SELECT RAISE(ABORT,'Academic change evidence is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER academic_change_requests_no_delete BEFORE DELETE ON academic_change_requests
BEGIN SELECT RAISE(ABORT,'Academic change evidence is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER academic_events_no_update BEFORE UPDATE ON academic_events
BEGIN SELECT RAISE(ABORT,'Academic change evidence is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER academic_events_no_delete BEFORE DELETE ON academic_events
BEGIN SELECT RAISE(ABORT,'Academic change evidence is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER academic_change_requests_guard BEFORE INSERT ON academic_change_requests
BEGIN
 SELECT CASE
 WHEN NOT EXISTS (SELECT 1 FROM users actor WHERE actor.id=NEW.actor_id AND actor.school_id=NEW.school_id AND actor.role='admin' AND actor.disabled_at IS NULL AND coalesce(actor.identity_issuer,'')<>'' AND coalesce(actor.identity_subject,'')<>'') THEN RAISE(ABORT,'saha_academic_conflict:authority')
 WHEN length(NEW.id)<>36 OR substr(NEW.id,9,1)<>'-' OR substr(NEW.id,14,1)<>'-' OR substr(NEW.id,19,1)<>'-' OR substr(NEW.id,24,1)<>'-'
  OR length(replace(NEW.id,'-',''))<>32 OR replace(NEW.id,'-','') GLOB '*[^0-9a-f]*' THEN RAISE(ABORT,'saha_academic_conflict:invalid-request')
 WHEN coalesce(NEW.created_at,'')='' OR json_array_length(NEW.items_json)<>NEW.item_count THEN RAISE(ABORT,'saha_academic_conflict:invalid-request')
 END;
END;
--> statement-breakpoint
CREATE TRIGGER academic_change_requests_expand AFTER INSERT ON academic_change_requests
BEGIN
 INSERT INTO academic_events(id,request_id,seq,school_id,actor_id,kind,subject_id,class_id,related_class_id,student_id,effective_on,payload,created_at)
 SELECT json_extract(item.value,'$.id'),NEW.id,CAST(item.key AS INTEGER),NEW.school_id,NEW.actor_id,json_extract(item.value,'$.kind'),
  json_extract(item.value,'$.subjectId'),json_extract(item.value,'$.classId'),json_extract(item.value,'$.relatedClassId'),
  json_extract(item.value,'$.studentId'),json_extract(item.value,'$.effectiveOn'),json_extract(item.value,'$.payload'),NEW.created_at
 FROM json_each(NEW.items_json) item ORDER BY CAST(item.key AS INTEGER);
END;
--> statement-breakpoint
CREATE TRIGGER academic_event_course_create AFTER INSERT ON academic_events WHEN NEW.kind='course.create'
BEGIN
 SELECT CASE
 WHEN NOT ((coalesce(json_type(NEW.payload,'$.code'),'')='text' AND trim(json_extract(NEW.payload,'$.code'))<>'') AND (coalesce(json_type(NEW.payload,'$.title'),'')='text' AND trim(json_extract(NEW.payload,'$.title'))<>'') AND (coalesce(json_type(NEW.payload,'$.gradeLevel'),'')='text' AND trim(json_extract(NEW.payload,'$.gradeLevel'))<>'') AND coalesce(json_type(NEW.payload,'$.description'),'') IN ('null','text','')) THEN RAISE(ABORT,'saha_academic_conflict:invalid-input')
 WHEN length(NEW.subject_id)<1 THEN RAISE(ABORT,'saha_academic_conflict:invalid-input')
 END;
 INSERT INTO courses(id,school_id,code,title,description,grade_level,created_at,updated_at)
 VALUES(NEW.subject_id,NEW.school_id,trim(json_extract(NEW.payload,'$.code')),trim(json_extract(NEW.payload,'$.title')),CASE WHEN coalesce(json_type(NEW.payload,'$.description'),'')='' OR coalesce(json_type(NEW.payload,'$.description'),'')='null' THEN NULL ELSE json_extract(NEW.payload,'$.description') END,trim(json_extract(NEW.payload,'$.gradeLevel')),NEW.created_at,NEW.created_at);
END;
--> statement-breakpoint
CREATE TRIGGER academic_event_course_edit AFTER INSERT ON academic_events WHEN NEW.kind='course.edit'
BEGIN
 SELECT CASE
 WHEN NOT EXISTS (SELECT 1 FROM courses c WHERE c.id=NEW.subject_id AND c.school_id=NEW.school_id) THEN RAISE(ABORT,'saha_academic_conflict:not-found')
 WHEN NOT EXISTS (SELECT 1 FROM courses c WHERE c.id=NEW.subject_id AND c.school_id=NEW.school_id AND c.updated_at=json_extract(NEW.payload,'$.expectedUpdatedAt')) THEN RAISE(ABORT,'saha_academic_conflict:stale')
 WHEN NOT ((coalesce(json_type(NEW.payload,'$.code'),'')='text' AND trim(json_extract(NEW.payload,'$.code'))<>'') AND (coalesce(json_type(NEW.payload,'$.title'),'')='text' AND trim(json_extract(NEW.payload,'$.title'))<>'') AND (coalesce(json_type(NEW.payload,'$.gradeLevel'),'')='text' AND trim(json_extract(NEW.payload,'$.gradeLevel'))<>'') AND coalesce(json_type(NEW.payload,'$.description'),'') IN ('null','text','')) THEN RAISE(ABORT,'saha_academic_conflict:invalid-input')
 END;
 UPDATE courses SET code=trim(json_extract(NEW.payload,'$.code')),title=trim(json_extract(NEW.payload,'$.title')),description=CASE WHEN coalesce(json_type(NEW.payload,'$.description'),'')='' OR coalesce(json_type(NEW.payload,'$.description'),'')='null' THEN NULL ELSE json_extract(NEW.payload,'$.description') END,grade_level=trim(json_extract(NEW.payload,'$.gradeLevel')),updated_at=NEW.created_at
 WHERE id=NEW.subject_id AND school_id=NEW.school_id;
END;
--> statement-breakpoint
CREATE TRIGGER academic_event_course_retire AFTER INSERT ON academic_events WHEN NEW.kind='course.retire'
BEGIN
 SELECT CASE
 WHEN NOT EXISTS (SELECT 1 FROM courses c WHERE c.id=NEW.subject_id AND c.school_id=NEW.school_id) THEN RAISE(ABORT,'saha_academic_conflict:not-found')
 WHEN NOT EXISTS (SELECT 1 FROM courses c WHERE c.id=NEW.subject_id AND c.school_id=NEW.school_id AND c.updated_at=json_extract(NEW.payload,'$.expectedUpdatedAt')) THEN RAISE(ABORT,'saha_academic_conflict:stale')
 WHEN EXISTS (SELECT 1 FROM course_lifecycle cl WHERE cl.course_id=NEW.subject_id AND cl.status='retired') THEN RAISE(ABORT,'saha_academic_conflict:already-retired')
 END;
 INSERT INTO course_lifecycle(course_id,status,changed_at,changed_by,reason)
 SELECT NEW.subject_id,'retired',NEW.created_at,NEW.actor_id,(SELECT reason FROM academic_change_requests WHERE id=NEW.request_id)
 WHERE 1
 ON CONFLICT(course_id) DO UPDATE SET status='retired',changed_at=excluded.changed_at,changed_by=excluded.changed_by,reason=excluded.reason;
 UPDATE courses SET updated_at=NEW.created_at WHERE id=NEW.subject_id AND school_id=NEW.school_id;
END;
--> statement-breakpoint
CREATE TRIGGER academic_event_course_reinstate AFTER INSERT ON academic_events WHEN NEW.kind='course.reinstate'
BEGIN
 SELECT CASE
 WHEN NOT EXISTS (SELECT 1 FROM courses c WHERE c.id=NEW.subject_id AND c.school_id=NEW.school_id) THEN RAISE(ABORT,'saha_academic_conflict:not-found')
 WHEN NOT EXISTS (SELECT 1 FROM courses c WHERE c.id=NEW.subject_id AND c.school_id=NEW.school_id AND c.updated_at=json_extract(NEW.payload,'$.expectedUpdatedAt')) THEN RAISE(ABORT,'saha_academic_conflict:stale')
 WHEN NOT EXISTS (SELECT 1 FROM course_lifecycle cl WHERE cl.course_id=NEW.subject_id AND cl.status='retired') THEN RAISE(ABORT,'saha_academic_conflict:not-retired')
 END;
 UPDATE course_lifecycle SET status='active',changed_at=NEW.created_at,changed_by=NEW.actor_id,reason=(SELECT reason FROM academic_change_requests WHERE id=NEW.request_id)
 WHERE course_id=NEW.subject_id;
 UPDATE courses SET updated_at=NEW.created_at WHERE id=NEW.subject_id AND school_id=NEW.school_id;
END;
--> statement-breakpoint
CREATE TRIGGER academic_event_class_create AFTER INSERT ON academic_events WHEN NEW.kind='class.create'
BEGIN
 SELECT CASE
 WHEN NOT (coalesce(json_type(NEW.payload,'$.name'),'')='text' AND trim(json_extract(NEW.payload,'$.name'))<>'') OR NOT (coalesce(json_type(NEW.payload,'$.term'),'')='text' AND trim(json_extract(NEW.payload,'$.term'))<>'') OR NOT coalesce(json_type(NEW.payload,'$.schedule'),'') IN ('null','text','') OR coalesce(json_type(NEW.payload,'$.courseId'),'')<>'text' OR coalesce(json_type(NEW.payload,'$.teacherId'),'')<>'text' THEN RAISE(ABORT,'saha_academic_conflict:invalid-input')
 WHEN NOT (coalesce(json_type(NEW.payload,'$.capacity'),'')='null' OR coalesce(json_type(NEW.payload,'$.capacity'),'')='' OR (coalesce(json_type(NEW.payload,'$.capacity'),'')='integer' AND json_extract(NEW.payload,'$.capacity') BETWEEN 1 AND 500)) THEN RAISE(ABORT,'saha_academic_conflict:invalid-capacity')
 WHEN NOT ((coalesce(json_type(NEW.payload,'$.startsOn'),'') IN ('null','') OR (coalesce(json_type(NEW.payload,'$.startsOn'),'')='text' AND coalesce(date(json_extract(NEW.payload,'$.startsOn'))=json_extract(NEW.payload,'$.startsOn'),0))) AND (coalesce(json_type(NEW.payload,'$.endsOn'),'') IN ('null','') OR (coalesce(json_type(NEW.payload,'$.endsOn'),'')='text' AND coalesce(date(json_extract(NEW.payload,'$.endsOn'))=json_extract(NEW.payload,'$.endsOn'),0))) AND NOT (coalesce(json_type(NEW.payload,'$.startsOn'),'')='text' AND coalesce(json_type(NEW.payload,'$.endsOn'),'')='text' AND json_extract(NEW.payload,'$.startsOn')>json_extract(NEW.payload,'$.endsOn'))) THEN RAISE(ABORT,'saha_academic_conflict:invalid-dates')
 WHEN NOT EXISTS (SELECT 1 FROM courses c WHERE c.id=json_extract(NEW.payload,'$.courseId') AND c.school_id=NEW.school_id) THEN RAISE(ABORT,'saha_academic_conflict:course-unavailable')
 WHEN EXISTS (SELECT 1 FROM course_lifecycle cl WHERE cl.course_id=json_extract(NEW.payload,'$.courseId') AND cl.status='retired') THEN RAISE(ABORT,'saha_academic_conflict:course-retired')
 WHEN NOT EXISTS (SELECT 1 FROM users t WHERE t.id=json_extract(NEW.payload,'$.teacherId') AND t.school_id=NEW.school_id AND t.role='teacher' AND t.disabled_at IS NULL AND coalesce(t.identity_issuer,'')<>'' AND coalesce(t.identity_subject,'')<>'') THEN RAISE(ABORT,'saha_academic_conflict:teacher-unavailable')
 END;
 INSERT INTO classes(id,school_id,course_id,teacher_id,name,term,schedule,created_at,updated_at)
 VALUES(NEW.subject_id,NEW.school_id,json_extract(NEW.payload,'$.courseId'),json_extract(NEW.payload,'$.teacherId'),trim(json_extract(NEW.payload,'$.name')),trim(json_extract(NEW.payload,'$.term')),CASE WHEN coalesce(json_type(NEW.payload,'$.schedule'),'')='' OR coalesce(json_type(NEW.payload,'$.schedule'),'')='null' THEN NULL ELSE json_extract(NEW.payload,'$.schedule') END,NEW.created_at,NEW.created_at);
 INSERT INTO class_settings(class_id,capacity,starts_on,ends_on,status,closed_at,closed_by,updated_at)
 VALUES(NEW.subject_id,CASE WHEN coalesce(json_type(NEW.payload,'$.capacity'),'')='' OR coalesce(json_type(NEW.payload,'$.capacity'),'')='null' THEN NULL ELSE json_extract(NEW.payload,'$.capacity') END,CASE WHEN coalesce(json_type(NEW.payload,'$.startsOn'),'')='' OR coalesce(json_type(NEW.payload,'$.startsOn'),'')='null' THEN NULL ELSE json_extract(NEW.payload,'$.startsOn') END,CASE WHEN coalesce(json_type(NEW.payload,'$.endsOn'),'')='' OR coalesce(json_type(NEW.payload,'$.endsOn'),'')='null' THEN NULL ELSE json_extract(NEW.payload,'$.endsOn') END,'open',NULL,NULL,NEW.created_at)
 ON CONFLICT(class_id) DO UPDATE SET capacity=excluded.capacity,starts_on=excluded.starts_on,ends_on=excluded.ends_on,updated_at=excluded.updated_at;
END;
--> statement-breakpoint
CREATE TRIGGER academic_event_class_edit AFTER INSERT ON academic_events WHEN NEW.kind='class.edit'
BEGIN
 SELECT CASE
 WHEN NOT EXISTS (SELECT 1 FROM classes c WHERE c.id=NEW.subject_id AND c.school_id=NEW.school_id) THEN RAISE(ABORT,'saha_academic_conflict:not-found')
 WHEN NOT EXISTS (SELECT 1 FROM classes c WHERE c.id=NEW.subject_id AND c.school_id=NEW.school_id AND c.updated_at=json_extract(NEW.payload,'$.expectedUpdatedAt')) THEN RAISE(ABORT,'saha_academic_conflict:stale')
 WHEN EXISTS (SELECT 1 FROM class_settings s WHERE s.class_id=NEW.subject_id AND s.status='closed') THEN RAISE(ABORT,'saha_academic_conflict:class-closed')
 WHEN NOT (coalesce(json_type(NEW.payload,'$.name'),'')='text' AND trim(json_extract(NEW.payload,'$.name'))<>'') OR NOT (coalesce(json_type(NEW.payload,'$.term'),'')='text' AND trim(json_extract(NEW.payload,'$.term'))<>'') OR NOT coalesce(json_type(NEW.payload,'$.schedule'),'') IN ('null','text','') OR coalesce(json_type(NEW.payload,'$.courseId'),'')<>'text' THEN RAISE(ABORT,'saha_academic_conflict:invalid-input')
 WHEN NOT (coalesce(json_type(NEW.payload,'$.capacity'),'')='null' OR coalesce(json_type(NEW.payload,'$.capacity'),'')='' OR (coalesce(json_type(NEW.payload,'$.capacity'),'')='integer' AND json_extract(NEW.payload,'$.capacity') BETWEEN 1 AND 500)) THEN RAISE(ABORT,'saha_academic_conflict:invalid-capacity')
 WHEN NOT ((coalesce(json_type(NEW.payload,'$.startsOn'),'') IN ('null','') OR (coalesce(json_type(NEW.payload,'$.startsOn'),'')='text' AND coalesce(date(json_extract(NEW.payload,'$.startsOn'))=json_extract(NEW.payload,'$.startsOn'),0))) AND (coalesce(json_type(NEW.payload,'$.endsOn'),'') IN ('null','') OR (coalesce(json_type(NEW.payload,'$.endsOn'),'')='text' AND coalesce(date(json_extract(NEW.payload,'$.endsOn'))=json_extract(NEW.payload,'$.endsOn'),0))) AND NOT (coalesce(json_type(NEW.payload,'$.startsOn'),'')='text' AND coalesce(json_type(NEW.payload,'$.endsOn'),'')='text' AND json_extract(NEW.payload,'$.startsOn')>json_extract(NEW.payload,'$.endsOn'))) THEN RAISE(ABORT,'saha_academic_conflict:invalid-dates')
 WHEN NOT EXISTS (SELECT 1 FROM courses c WHERE c.id=json_extract(NEW.payload,'$.courseId') AND c.school_id=NEW.school_id) THEN RAISE(ABORT,'saha_academic_conflict:course-unavailable')
 WHEN EXISTS (SELECT 1 FROM course_lifecycle cl WHERE cl.course_id=json_extract(NEW.payload,'$.courseId') AND cl.status='retired') AND NOT EXISTS (SELECT 1 FROM classes c WHERE c.id=NEW.subject_id AND c.course_id=json_extract(NEW.payload,'$.courseId')) THEN RAISE(ABORT,'saha_academic_conflict:course-retired')
 WHEN coalesce(json_type(NEW.payload,'$.capacity'),'')='integer' AND (SELECT count(*) FROM enrolments a WHERE a.class_id=NEW.subject_id AND a.status='active')>json_extract(NEW.payload,'$.capacity') THEN RAISE(ABORT,'saha_academic_conflict:capacity-below-active')
 END;
 UPDATE classes SET course_id=json_extract(NEW.payload,'$.courseId'),name=trim(json_extract(NEW.payload,'$.name')),term=trim(json_extract(NEW.payload,'$.term')),schedule=CASE WHEN coalesce(json_type(NEW.payload,'$.schedule'),'')='' OR coalesce(json_type(NEW.payload,'$.schedule'),'')='null' THEN NULL ELSE json_extract(NEW.payload,'$.schedule') END,updated_at=NEW.created_at
 WHERE id=NEW.subject_id AND school_id=NEW.school_id;
 INSERT INTO class_settings(class_id,capacity,starts_on,ends_on,status,closed_at,closed_by,updated_at)
 VALUES(NEW.subject_id,CASE WHEN coalesce(json_type(NEW.payload,'$.capacity'),'')='' OR coalesce(json_type(NEW.payload,'$.capacity'),'')='null' THEN NULL ELSE json_extract(NEW.payload,'$.capacity') END,CASE WHEN coalesce(json_type(NEW.payload,'$.startsOn'),'')='' OR coalesce(json_type(NEW.payload,'$.startsOn'),'')='null' THEN NULL ELSE json_extract(NEW.payload,'$.startsOn') END,CASE WHEN coalesce(json_type(NEW.payload,'$.endsOn'),'')='' OR coalesce(json_type(NEW.payload,'$.endsOn'),'')='null' THEN NULL ELSE json_extract(NEW.payload,'$.endsOn') END,'open',NULL,NULL,NEW.created_at)
 ON CONFLICT(class_id) DO UPDATE SET capacity=excluded.capacity,starts_on=excluded.starts_on,ends_on=excluded.ends_on,updated_at=excluded.updated_at;
END;
--> statement-breakpoint
CREATE TRIGGER academic_event_class_teacher AFTER INSERT ON academic_events WHEN NEW.kind='class.teacher'
BEGIN
 SELECT CASE
 WHEN NOT EXISTS (SELECT 1 FROM classes c WHERE c.id=NEW.subject_id AND c.school_id=NEW.school_id) THEN RAISE(ABORT,'saha_academic_conflict:not-found')
 WHEN NOT EXISTS (SELECT 1 FROM classes c WHERE c.id=NEW.subject_id AND c.school_id=NEW.school_id AND c.updated_at=json_extract(NEW.payload,'$.expectedUpdatedAt')) THEN RAISE(ABORT,'saha_academic_conflict:stale')
 WHEN coalesce(json_type(NEW.payload,'$.fromTeacherId'),'')<>'text' OR coalesce(json_type(NEW.payload,'$.toTeacherId'),'')<>'text' THEN RAISE(ABORT,'saha_academic_conflict:invalid-input')
 WHEN NOT EXISTS (SELECT 1 FROM classes c WHERE c.id=NEW.subject_id AND c.teacher_id=json_extract(NEW.payload,'$.fromTeacherId')) THEN RAISE(ABORT,'saha_academic_conflict:stale')
 WHEN json_extract(NEW.payload,'$.fromTeacherId')=json_extract(NEW.payload,'$.toTeacherId') THEN RAISE(ABORT,'saha_academic_conflict:teacher-unchanged')
 WHEN NOT EXISTS (SELECT 1 FROM users t WHERE t.id=json_extract(NEW.payload,'$.toTeacherId') AND t.school_id=NEW.school_id AND t.role='teacher' AND t.disabled_at IS NULL AND coalesce(t.identity_issuer,'')<>'' AND coalesce(t.identity_subject,'')<>'') THEN RAISE(ABORT,'saha_academic_conflict:teacher-unavailable')
 END;
 UPDATE classes SET teacher_id=json_extract(NEW.payload,'$.toTeacherId'),updated_at=NEW.created_at WHERE id=NEW.subject_id AND school_id=NEW.school_id;
END;
--> statement-breakpoint
CREATE TRIGGER academic_event_class_close AFTER INSERT ON academic_events WHEN NEW.kind='class.close'
BEGIN
 SELECT CASE
 WHEN NOT EXISTS (SELECT 1 FROM classes c WHERE c.id=NEW.subject_id AND c.school_id=NEW.school_id) THEN RAISE(ABORT,'saha_academic_conflict:not-found')
 WHEN NOT EXISTS (SELECT 1 FROM classes c WHERE c.id=NEW.subject_id AND c.school_id=NEW.school_id AND c.updated_at=json_extract(NEW.payload,'$.expectedUpdatedAt')) THEN RAISE(ABORT,'saha_academic_conflict:stale')
 WHEN EXISTS (SELECT 1 FROM class_settings s WHERE s.class_id=NEW.subject_id AND s.status='closed') THEN RAISE(ABORT,'saha_academic_conflict:class-closed')
 END;
 INSERT INTO academic_events(id,request_id,seq,school_id,actor_id,kind,subject_id,class_id,related_class_id,student_id,effective_on,payload,created_at)
 SELECT lower(hex(randomblob(16))),NEW.request_id,NEW.seq,NEW.school_id,NEW.actor_id,'enrolment.complete',e.id,e.class_id,NULL,e.student_id,date(NEW.created_at),
  json_object('expectedUpdatedAt',e.updated_at,'cause','class-close','closedEventId',NEW.id),NEW.created_at
 FROM enrolments e WHERE e.class_id=NEW.subject_id AND e.status='active' AND coalesce(json_extract(NEW.payload,'$.completeActive'),0)=1 ORDER BY e.id;
 INSERT INTO class_settings(class_id,capacity,starts_on,ends_on,status,closed_at,closed_by,updated_at)
 VALUES(NEW.subject_id,NULL,NULL,NULL,'closed',NEW.created_at,NEW.actor_id,NEW.created_at)
 ON CONFLICT(class_id) DO UPDATE SET status='closed',closed_at=excluded.closed_at,closed_by=excluded.closed_by,updated_at=excluded.updated_at;
 UPDATE classes SET updated_at=NEW.created_at WHERE id=NEW.subject_id AND school_id=NEW.school_id;
END;
--> statement-breakpoint
CREATE TRIGGER academic_event_class_reopen AFTER INSERT ON academic_events WHEN NEW.kind='class.reopen'
BEGIN
 SELECT CASE
 WHEN NOT EXISTS (SELECT 1 FROM classes c WHERE c.id=NEW.subject_id AND c.school_id=NEW.school_id) THEN RAISE(ABORT,'saha_academic_conflict:not-found')
 WHEN NOT EXISTS (SELECT 1 FROM classes c WHERE c.id=NEW.subject_id AND c.school_id=NEW.school_id AND c.updated_at=json_extract(NEW.payload,'$.expectedUpdatedAt')) THEN RAISE(ABORT,'saha_academic_conflict:stale')
 WHEN NOT EXISTS (SELECT 1 FROM class_settings s WHERE s.class_id=NEW.subject_id AND s.status='closed') THEN RAISE(ABORT,'saha_academic_conflict:not-closed')
 END;
 UPDATE class_settings SET status='open',closed_at=NULL,closed_by=NULL,updated_at=NEW.created_at WHERE class_id=NEW.subject_id;
 UPDATE classes SET updated_at=NEW.created_at WHERE id=NEW.subject_id AND school_id=NEW.school_id;
END;
--> statement-breakpoint
CREATE TRIGGER academic_event_enrolment_enrol AFTER INSERT ON academic_events WHEN NEW.kind='enrolment.enrol'
BEGIN
 SELECT CASE
 WHEN NOT EXISTS (SELECT 1 FROM students s WHERE s.id=NEW.student_id AND s.school_id=NEW.school_id) THEN RAISE(ABORT,'saha_academic_conflict:student-unavailable')
 WHEN NOT EXISTS (SELECT 1 FROM classes c WHERE c.id=NEW.class_id AND c.school_id=NEW.school_id) THEN RAISE(ABORT,'saha_academic_conflict:class-unavailable')
 WHEN EXISTS (SELECT 1 FROM enrolments en WHERE en.student_id=NEW.student_id AND en.class_id=NEW.class_id) THEN RAISE(ABORT,'saha_academic_conflict:already-enrolled')
 WHEN NOT coalesce(date(NEW.effective_on)=NEW.effective_on,0) THEN RAISE(ABORT,'saha_academic_conflict:date-invalid')
 WHEN EXISTS (SELECT 1 FROM class_settings s WHERE s.class_id=NEW.class_id AND s.status='closed') THEN RAISE(ABORT,'saha_academic_conflict:class-closed')
 WHEN EXISTS (SELECT 1 FROM class_settings s WHERE s.class_id=NEW.class_id AND s.capacity IS NOT NULL AND (SELECT count(*) FROM enrolments a WHERE a.class_id=NEW.class_id AND a.status='active')>=s.capacity) THEN RAISE(ABORT,'saha_academic_conflict:class-full')
 WHEN EXISTS (SELECT 1 FROM class_settings s WHERE s.class_id=NEW.class_id AND s.starts_on IS NOT NULL AND NEW.effective_on<s.starts_on) THEN RAISE(ABORT,'saha_academic_conflict:date-before-class-start')
 WHEN EXISTS (SELECT 1 FROM class_settings s WHERE s.class_id=NEW.class_id AND s.ends_on IS NOT NULL AND NEW.effective_on>s.ends_on) THEN RAISE(ABORT,'saha_academic_conflict:date-after-class-end')
 WHEN NEW.effective_on>date(NEW.created_at) AND NOT EXISTS (SELECT 1 FROM class_settings s WHERE s.class_id=NEW.class_id AND s.starts_on IS NOT NULL AND NEW.effective_on<=s.starts_on) THEN RAISE(ABORT,'saha_academic_conflict:date-in-future')
 END;
 INSERT INTO enrolments(id,student_id,class_id,status,enrolled_at,created_at,updated_at)
 VALUES(NEW.subject_id,NEW.student_id,NEW.class_id,'active',NEW.effective_on||'T00:00:00.000Z',NEW.created_at,NEW.created_at);
 INSERT INTO enrolment_lifecycle(enrolment_id,started_on,ended_on,end_kind,updated_at) VALUES(NEW.subject_id,NEW.effective_on,NULL,NULL,NEW.created_at);
END;
--> statement-breakpoint
CREATE TRIGGER academic_event_enrolment_withdraw AFTER INSERT ON academic_events WHEN NEW.kind='enrolment.withdraw'
BEGIN
 SELECT CASE
 WHEN NOT EXISTS (SELECT 1 FROM enrolments en JOIN classes c ON c.id=en.class_id JOIN students s ON s.id=en.student_id
  WHERE en.id=NEW.subject_id AND c.school_id=NEW.school_id AND s.school_id=NEW.school_id AND en.class_id=NEW.class_id AND en.student_id=NEW.student_id) THEN RAISE(ABORT,'saha_academic_conflict:not-found')
 WHEN coalesce(json_type(NEW.payload,'$.expectedUpdatedAt'),'')='text' AND NOT EXISTS (SELECT 1 FROM enrolments en WHERE en.id=NEW.subject_id AND en.updated_at=json_extract(NEW.payload,'$.expectedUpdatedAt')) THEN RAISE(ABORT,'saha_academic_conflict:stale')
 WHEN (SELECT en.status FROM enrolments en WHERE en.id=NEW.subject_id)<>'active' THEN RAISE(ABORT,'saha_academic_conflict:not-active')
 WHEN NOT coalesce(date(NEW.effective_on)=NEW.effective_on,0) THEN RAISE(ABORT,'saha_academic_conflict:date-invalid')
 WHEN NEW.effective_on>date(NEW.created_at) THEN RAISE(ABORT,'saha_academic_conflict:date-in-future')
 WHEN EXISTS (SELECT 1 FROM enrolments en WHERE en.id=NEW.subject_id AND coalesce((SELECT lc.started_on FROM enrolment_lifecycle lc WHERE lc.enrolment_id=en.id), CASE WHEN coalesce(date(substr(en.enrolled_at,1,10))=substr(en.enrolled_at,1,10),0) THEN substr(en.enrolled_at,1,10) END) IS NOT NULL AND NEW.effective_on<coalesce((SELECT lc.started_on FROM enrolment_lifecycle lc WHERE lc.enrolment_id=en.id), CASE WHEN coalesce(date(substr(en.enrolled_at,1,10))=substr(en.enrolled_at,1,10),0) THEN substr(en.enrolled_at,1,10) END)) THEN RAISE(ABORT,'saha_academic_conflict:date-before-start')
 END;
 UPDATE enrolments SET status='withdrawn',updated_at=NEW.created_at WHERE id=NEW.subject_id;
 INSERT INTO enrolment_lifecycle(enrolment_id,started_on,ended_on,end_kind,updated_at)
 SELECT en.id,coalesce(coalesce((SELECT lc.started_on FROM enrolment_lifecycle lc WHERE lc.enrolment_id=en.id), CASE WHEN coalesce(date(substr(en.enrolled_at,1,10))=substr(en.enrolled_at,1,10),0) THEN substr(en.enrolled_at,1,10) END),NEW.effective_on),NEW.effective_on,'withdrawn',NEW.created_at FROM enrolments en WHERE en.id=NEW.subject_id
 ON CONFLICT(enrolment_id) DO UPDATE SET ended_on=excluded.ended_on,end_kind=excluded.end_kind,updated_at=excluded.updated_at;
END;
--> statement-breakpoint
CREATE TRIGGER academic_event_enrolment_complete AFTER INSERT ON academic_events WHEN NEW.kind='enrolment.complete'
BEGIN
 SELECT CASE
 WHEN NOT EXISTS (SELECT 1 FROM enrolments en JOIN classes c ON c.id=en.class_id JOIN students s ON s.id=en.student_id
  WHERE en.id=NEW.subject_id AND c.school_id=NEW.school_id AND s.school_id=NEW.school_id AND en.class_id=NEW.class_id AND en.student_id=NEW.student_id) THEN RAISE(ABORT,'saha_academic_conflict:not-found')
 WHEN coalesce(json_type(NEW.payload,'$.expectedUpdatedAt'),'')='text' AND NOT EXISTS (SELECT 1 FROM enrolments en WHERE en.id=NEW.subject_id AND en.updated_at=json_extract(NEW.payload,'$.expectedUpdatedAt')) THEN RAISE(ABORT,'saha_academic_conflict:stale')
 WHEN (SELECT en.status FROM enrolments en WHERE en.id=NEW.subject_id)<>'active' THEN RAISE(ABORT,'saha_academic_conflict:not-active')
 WHEN NOT coalesce(date(NEW.effective_on)=NEW.effective_on,0) THEN RAISE(ABORT,'saha_academic_conflict:date-invalid')
 WHEN NEW.effective_on>date(NEW.created_at) THEN RAISE(ABORT,'saha_academic_conflict:date-in-future')
 WHEN EXISTS (SELECT 1 FROM enrolments en WHERE en.id=NEW.subject_id AND coalesce((SELECT lc.started_on FROM enrolment_lifecycle lc WHERE lc.enrolment_id=en.id), CASE WHEN coalesce(date(substr(en.enrolled_at,1,10))=substr(en.enrolled_at,1,10),0) THEN substr(en.enrolled_at,1,10) END) IS NOT NULL AND NEW.effective_on<coalesce((SELECT lc.started_on FROM enrolment_lifecycle lc WHERE lc.enrolment_id=en.id), CASE WHEN coalesce(date(substr(en.enrolled_at,1,10))=substr(en.enrolled_at,1,10),0) THEN substr(en.enrolled_at,1,10) END)) THEN RAISE(ABORT,'saha_academic_conflict:date-before-start')
 END;
 UPDATE enrolments SET status='completed',updated_at=NEW.created_at WHERE id=NEW.subject_id;
 INSERT INTO enrolment_lifecycle(enrolment_id,started_on,ended_on,end_kind,updated_at)
 SELECT en.id,coalesce(coalesce((SELECT lc.started_on FROM enrolment_lifecycle lc WHERE lc.enrolment_id=en.id), CASE WHEN coalesce(date(substr(en.enrolled_at,1,10))=substr(en.enrolled_at,1,10),0) THEN substr(en.enrolled_at,1,10) END),NEW.effective_on),NEW.effective_on,'completed',NEW.created_at FROM enrolments en WHERE en.id=NEW.subject_id
 ON CONFLICT(enrolment_id) DO UPDATE SET ended_on=excluded.ended_on,end_kind=excluded.end_kind,updated_at=excluded.updated_at;
END;
--> statement-breakpoint
CREATE TRIGGER academic_event_enrolment_reenrol AFTER INSERT ON academic_events WHEN NEW.kind='enrolment.reenrol'
BEGIN
 SELECT CASE
 WHEN NOT EXISTS (SELECT 1 FROM enrolments en JOIN classes c ON c.id=en.class_id JOIN students s ON s.id=en.student_id
  WHERE en.id=NEW.subject_id AND c.school_id=NEW.school_id AND s.school_id=NEW.school_id AND en.class_id=NEW.class_id AND en.student_id=NEW.student_id) THEN RAISE(ABORT,'saha_academic_conflict:not-found')
 WHEN coalesce(json_type(NEW.payload,'$.expectedUpdatedAt'),'')='text' AND NOT EXISTS (SELECT 1 FROM enrolments en WHERE en.id=NEW.subject_id AND en.updated_at=json_extract(NEW.payload,'$.expectedUpdatedAt')) THEN RAISE(ABORT,'saha_academic_conflict:stale')
 WHEN (SELECT en.status FROM enrolments en WHERE en.id=NEW.subject_id)='active' THEN RAISE(ABORT,'saha_academic_conflict:already-active')
 WHEN (SELECT en.status FROM enrolments en WHERE en.id=NEW.subject_id)<>'withdrawn' THEN RAISE(ABORT,'saha_academic_conflict:not-withdrawn')
 WHEN (SELECT count(*) FROM enrolments en WHERE en.student_id=NEW.student_id AND en.class_id=NEW.class_id)>1 THEN RAISE(ABORT,'saha_academic_conflict:ambiguous-legacy-pair')
 WHEN NOT coalesce(date(NEW.effective_on)=NEW.effective_on,0) THEN RAISE(ABORT,'saha_academic_conflict:date-invalid')
 WHEN EXISTS (SELECT 1 FROM class_settings s WHERE s.class_id=NEW.class_id AND s.status='closed') THEN RAISE(ABORT,'saha_academic_conflict:class-closed')
 WHEN EXISTS (SELECT 1 FROM class_settings s WHERE s.class_id=NEW.class_id AND s.capacity IS NOT NULL AND (SELECT count(*) FROM enrolments a WHERE a.class_id=NEW.class_id AND a.status='active')>=s.capacity) THEN RAISE(ABORT,'saha_academic_conflict:class-full')
 WHEN EXISTS (SELECT 1 FROM class_settings s WHERE s.class_id=NEW.class_id AND s.starts_on IS NOT NULL AND NEW.effective_on<s.starts_on) THEN RAISE(ABORT,'saha_academic_conflict:date-before-class-start')
 WHEN EXISTS (SELECT 1 FROM class_settings s WHERE s.class_id=NEW.class_id AND s.ends_on IS NOT NULL AND NEW.effective_on>s.ends_on) THEN RAISE(ABORT,'saha_academic_conflict:date-after-class-end')
 WHEN NEW.effective_on>date(NEW.created_at) AND NOT EXISTS (SELECT 1 FROM class_settings s WHERE s.class_id=NEW.class_id AND s.starts_on IS NOT NULL AND NEW.effective_on<=s.starts_on) THEN RAISE(ABORT,'saha_academic_conflict:date-in-future')
 WHEN EXISTS (SELECT 1 FROM enrolments en WHERE en.id=NEW.subject_id AND (SELECT lc.ended_on FROM enrolment_lifecycle lc WHERE lc.enrolment_id=en.id) IS NOT NULL AND NEW.effective_on<(SELECT lc.ended_on FROM enrolment_lifecycle lc WHERE lc.enrolment_id=en.id)) THEN RAISE(ABORT,'saha_academic_conflict:date-before-end')
 END;
 UPDATE enrolments SET status='active',updated_at=NEW.created_at WHERE id=NEW.subject_id;
 INSERT INTO enrolment_lifecycle(enrolment_id,started_on,ended_on,end_kind,updated_at) VALUES(NEW.subject_id,NEW.effective_on,NULL,NULL,NEW.created_at)
 ON CONFLICT(enrolment_id) DO UPDATE SET started_on=excluded.started_on,ended_on=NULL,end_kind=NULL,updated_at=excluded.updated_at;
END;
--> statement-breakpoint
CREATE TRIGGER academic_event_enrolment_transfer AFTER INSERT ON academic_events WHEN NEW.kind='enrolment.transfer'
BEGIN
 SELECT CASE
 WHEN NOT EXISTS (SELECT 1 FROM enrolments en JOIN classes c ON c.id=en.class_id JOIN students s ON s.id=en.student_id
  WHERE en.id=NEW.subject_id AND c.school_id=NEW.school_id AND s.school_id=NEW.school_id AND en.class_id=NEW.class_id AND en.student_id=NEW.student_id) THEN RAISE(ABORT,'saha_academic_conflict:not-found')
 WHEN coalesce(json_type(NEW.payload,'$.expectedUpdatedAt'),'')='text' AND NOT EXISTS (SELECT 1 FROM enrolments en WHERE en.id=NEW.subject_id AND en.updated_at=json_extract(NEW.payload,'$.expectedUpdatedAt')) THEN RAISE(ABORT,'saha_academic_conflict:stale')
 WHEN (SELECT en.status FROM enrolments en WHERE en.id=NEW.subject_id)<>'active' THEN RAISE(ABORT,'saha_academic_conflict:not-active')
 WHEN NEW.related_class_id IS NULL OR NEW.related_class_id=NEW.class_id THEN RAISE(ABORT,'saha_academic_conflict:same-class')
 WHEN NOT EXISTS (SELECT 1 FROM classes c WHERE c.id=NEW.related_class_id AND c.school_id=NEW.school_id) THEN RAISE(ABORT,'saha_academic_conflict:class-unavailable')
 WHEN EXISTS (SELECT 1 FROM enrolments en WHERE en.student_id=NEW.student_id AND en.class_id=NEW.related_class_id AND en.status='active') THEN RAISE(ABORT,'saha_academic_conflict:already-enrolled')
 WHEN EXISTS (SELECT 1 FROM enrolments en WHERE en.student_id=NEW.student_id AND en.class_id=NEW.related_class_id AND en.status='completed') THEN RAISE(ABORT,'saha_academic_conflict:target-completed')
 WHEN (SELECT count(*) FROM enrolments en WHERE en.student_id=NEW.student_id AND en.class_id=NEW.related_class_id)>1 THEN RAISE(ABORT,'saha_academic_conflict:ambiguous-legacy-pair')
 WHEN json_type(NEW.payload,'$.toEnrolmentId') IS NOT 'text' THEN RAISE(ABORT,'saha_academic_conflict:invalid-input')
 WHEN NOT coalesce(date(NEW.effective_on)=NEW.effective_on,0) THEN RAISE(ABORT,'saha_academic_conflict:date-invalid')
 WHEN EXISTS (SELECT 1 FROM class_settings s WHERE s.class_id=NEW.related_class_id AND s.status='closed') THEN RAISE(ABORT,'saha_academic_conflict:class-closed')
 WHEN EXISTS (SELECT 1 FROM class_settings s WHERE s.class_id=NEW.related_class_id AND s.capacity IS NOT NULL AND (SELECT count(*) FROM enrolments a WHERE a.class_id=NEW.related_class_id AND a.status='active')>=s.capacity) THEN RAISE(ABORT,'saha_academic_conflict:class-full')
 WHEN EXISTS (SELECT 1 FROM class_settings s WHERE s.class_id=NEW.related_class_id AND s.starts_on IS NOT NULL AND NEW.effective_on<s.starts_on) THEN RAISE(ABORT,'saha_academic_conflict:date-before-class-start')
 WHEN EXISTS (SELECT 1 FROM class_settings s WHERE s.class_id=NEW.related_class_id AND s.ends_on IS NOT NULL AND NEW.effective_on>s.ends_on) THEN RAISE(ABORT,'saha_academic_conflict:date-after-class-end')
 WHEN NEW.effective_on>date(NEW.created_at) AND NOT EXISTS (SELECT 1 FROM class_settings s WHERE s.class_id=NEW.related_class_id AND s.starts_on IS NOT NULL AND NEW.effective_on<=s.starts_on) THEN RAISE(ABORT,'saha_academic_conflict:date-in-future')
 WHEN EXISTS (SELECT 1 FROM enrolments en WHERE en.id=NEW.subject_id AND coalesce((SELECT lc.started_on FROM enrolment_lifecycle lc WHERE lc.enrolment_id=en.id), CASE WHEN coalesce(date(substr(en.enrolled_at,1,10))=substr(en.enrolled_at,1,10),0) THEN substr(en.enrolled_at,1,10) END) IS NOT NULL AND NEW.effective_on<coalesce((SELECT lc.started_on FROM enrolment_lifecycle lc WHERE lc.enrolment_id=en.id), CASE WHEN coalesce(date(substr(en.enrolled_at,1,10))=substr(en.enrolled_at,1,10),0) THEN substr(en.enrolled_at,1,10) END)) THEN RAISE(ABORT,'saha_academic_conflict:date-before-start')
 WHEN NEW.effective_on>date(NEW.created_at) THEN RAISE(ABORT,'saha_academic_conflict:date-in-future')
 END;
 UPDATE enrolments SET status='withdrawn',updated_at=NEW.created_at WHERE id=NEW.subject_id;
 INSERT INTO enrolment_lifecycle(enrolment_id,started_on,ended_on,end_kind,updated_at)
 SELECT en.id,coalesce(coalesce((SELECT lc.started_on FROM enrolment_lifecycle lc WHERE lc.enrolment_id=en.id), CASE WHEN coalesce(date(substr(en.enrolled_at,1,10))=substr(en.enrolled_at,1,10),0) THEN substr(en.enrolled_at,1,10) END),NEW.effective_on),NEW.effective_on,'transferred',NEW.created_at FROM enrolments en WHERE en.id=NEW.subject_id
 ON CONFLICT(enrolment_id) DO UPDATE SET ended_on=excluded.ended_on,end_kind=excluded.end_kind,updated_at=excluded.updated_at;
 UPDATE enrolments SET status='active',updated_at=NEW.created_at WHERE student_id=NEW.student_id AND class_id=NEW.related_class_id AND status='withdrawn';
 INSERT INTO enrolment_lifecycle(enrolment_id,started_on,ended_on,end_kind,updated_at)
 SELECT en.id,NEW.effective_on,NULL,NULL,NEW.created_at FROM enrolments en WHERE en.student_id=NEW.student_id AND en.class_id=NEW.related_class_id AND en.status='active' AND en.updated_at=NEW.created_at
 ON CONFLICT(enrolment_id) DO UPDATE SET started_on=excluded.started_on,ended_on=NULL,end_kind=NULL,updated_at=excluded.updated_at;
 INSERT INTO enrolments(id,student_id,class_id,status,enrolled_at,created_at,updated_at)
 SELECT json_extract(NEW.payload,'$.toEnrolmentId'),NEW.student_id,NEW.related_class_id,'active',NEW.effective_on||'T00:00:00.000Z',NEW.created_at,NEW.created_at
 WHERE NOT EXISTS (SELECT 1 FROM enrolments en WHERE en.student_id=NEW.student_id AND en.class_id=NEW.related_class_id);
 INSERT INTO enrolment_lifecycle(enrolment_id,started_on,ended_on,end_kind,updated_at)
 SELECT json_extract(NEW.payload,'$.toEnrolmentId'),NEW.effective_on,NULL,NULL,NEW.created_at
 WHERE EXISTS (SELECT 1 FROM enrolments en WHERE en.id=json_extract(NEW.payload,'$.toEnrolmentId') AND en.created_at=NEW.created_at)
  AND NOT EXISTS (SELECT 1 FROM enrolment_lifecycle lc WHERE lc.enrolment_id=json_extract(NEW.payload,'$.toEnrolmentId'));
END;
--> statement-breakpoint
CREATE TRIGGER enrolments_class_rules_insert BEFORE INSERT ON enrolments WHEN NEW.status='active'
BEGIN
 SELECT CASE
 WHEN EXISTS (SELECT 1 FROM class_settings s WHERE s.class_id=NEW.class_id AND s.status='closed') THEN RAISE(ABORT,'saha_academic_conflict:class-closed')
 WHEN EXISTS (SELECT 1 FROM class_settings s WHERE s.class_id=NEW.class_id AND s.capacity IS NOT NULL AND (SELECT count(*) FROM enrolments a WHERE a.class_id=NEW.class_id AND a.status='active')>=s.capacity) THEN RAISE(ABORT,'saha_academic_conflict:class-full')
 END;
END;
--> statement-breakpoint
CREATE TRIGGER enrolments_class_rules_status BEFORE UPDATE OF status ON enrolments WHEN NEW.status='active' AND OLD.status<>'active'
BEGIN
 SELECT CASE
 WHEN EXISTS (SELECT 1 FROM class_settings s WHERE s.class_id=NEW.class_id AND s.status='closed') THEN RAISE(ABORT,'saha_academic_conflict:class-closed')
 WHEN EXISTS (SELECT 1 FROM class_settings s WHERE s.class_id=NEW.class_id AND s.capacity IS NOT NULL AND (SELECT count(*) FROM enrolments a WHERE a.class_id=NEW.class_id AND a.status='active')>=s.capacity) THEN RAISE(ABORT,'saha_academic_conflict:class-full')
 END;
END;
--> statement-breakpoint
CREATE TRIGGER classes_course_rules_insert BEFORE INSERT ON classes
BEGIN
 SELECT CASE WHEN EXISTS (SELECT 1 FROM course_lifecycle cl WHERE cl.course_id=NEW.course_id AND cl.status='retired') THEN RAISE(ABORT,'saha_academic_conflict:course-retired') END;
END;
--> statement-breakpoint
CREATE TRIGGER classes_course_rules_update BEFORE UPDATE OF course_id ON classes WHEN NEW.course_id<>OLD.course_id
BEGIN
 SELECT CASE WHEN EXISTS (SELECT 1 FROM course_lifecycle cl WHERE cl.course_id=NEW.course_id AND cl.status='retired') THEN RAISE(ABORT,'saha_academic_conflict:course-retired') END;
END;
