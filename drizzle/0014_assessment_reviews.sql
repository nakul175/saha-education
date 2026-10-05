-- Preserve every old result and legacy API behavior; only new reviewed writes
-- produce attributable immutable evidence. Pair indexes/guards remain unchanged.
CREATE TABLE assessment_reviews (
 id TEXT PRIMARY KEY NOT NULL,
 school_id TEXT NOT NULL REFERENCES schools(id),
 assessment_id TEXT NOT NULL REFERENCES assessments(id),
 class_id TEXT NOT NULL REFERENCES classes(id),
 assessment_snapshot TEXT NOT NULL CONSTRAINT assessment_reviews_snapshot CHECK(json_valid(assessment_snapshot) AND json_type(assessment_snapshot)='object'),
 reviewed_by TEXT NOT NULL REFERENCES users(id),
 reason TEXT NOT NULL CONSTRAINT assessment_reviews_reason CHECK(length(reason) BETWEEN 10 AND 500),
 request_hash TEXT NOT NULL,
 entries_json TEXT NOT NULL CONSTRAINT assessment_reviews_entries CHECK(json_valid(entries_json) AND json_type(entries_json)='array' AND json_array_length(entries_json) BETWEEN 1 AND 100),
 created_at TEXT NOT NULL
);
CREATE INDEX assessment_reviews_assessment_time ON assessment_reviews(school_id,assessment_id,created_at);
CREATE TABLE assessment_review_entries (
 id TEXT PRIMARY KEY NOT NULL,
 review_id TEXT NOT NULL REFERENCES assessment_reviews(id),
 result_id TEXT NOT NULL REFERENCES assessment_results(id),
 student_id TEXT NOT NULL REFERENCES students(id),
 before_record TEXT CONSTRAINT assessment_review_entries_before CHECK(before_record IS NULL OR (json_valid(before_record) AND json_type(before_record)='object')),
 after_record TEXT NOT NULL CONSTRAINT assessment_review_entries_after CHECK(json_valid(after_record) AND json_type(after_record)='object')
);
CREATE UNIQUE INDEX assessment_review_entries_pupil ON assessment_review_entries(review_id,student_id);
CREATE INDEX assessment_review_entries_student ON assessment_review_entries(student_id,review_id);

CREATE TRIGGER assessment_review_authority BEFORE INSERT ON assessment_reviews
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM users actor JOIN classes classroom ON classroom.id=NEW.class_id JOIN assessments assessment ON assessment.id=NEW.assessment_id
  WHERE actor.id=NEW.reviewed_by AND actor.school_id=NEW.school_id AND classroom.school_id=NEW.school_id AND assessment.class_id=classroom.id
   AND actor.role IN ('admin','teacher') AND (actor.role='admin' OR classroom.teacher_id=actor.id)
   AND actor.disabled_at IS NULL AND coalesce(actor.identity_issuer,'')<>'' AND coalesce(actor.identity_subject,'')<>''
   AND typeof(assessment.max_score)='integer' AND assessment.max_score BETWEEN 0 AND 9007199254740991
   AND json_type(NEW.assessment_snapshot,'$.maxScore')='integer' AND json_extract(NEW.assessment_snapshot,'$.maxScoreType')='integer'
   AND assessment.id IS json_extract(NEW.assessment_snapshot,'$.id') AND assessment.class_id IS json_extract(NEW.assessment_snapshot,'$.classId')
   AND assessment.title IS json_extract(NEW.assessment_snapshot,'$.title') AND assessment.kind IS json_extract(NEW.assessment_snapshot,'$.kind')
   AND assessment.max_score IS json_extract(NEW.assessment_snapshot,'$.maxScore') AND assessment.date IS json_extract(NEW.assessment_snapshot,'$.date')
   AND assessment.created_at IS json_extract(NEW.assessment_snapshot,'$.createdAt') AND assessment.updated_at IS json_extract(NEW.assessment_snapshot,'$.updatedAt')
 ) THEN RAISE(ABORT,'saha_assessment_review_conflict') END;
 SELECT CASE WHEN (
  SELECT count(DISTINCT pupil.id) FROM students pupil JOIN enrolments active ON active.student_id=pupil.id
  WHERE pupil.school_id=NEW.school_id AND active.class_id=NEW.class_id AND active.status='active'
 ) > 100 THEN RAISE(ABORT,'saha_assessment_review_conflict') END;
 SELECT CASE WHEN EXISTS (
  SELECT 1 FROM students pupil JOIN enrolments active ON active.student_id=pupil.id
  WHERE pupil.school_id=NEW.school_id AND active.class_id=NEW.class_id AND active.status='active' AND (
   (SELECT count(*) FROM enrolments pair WHERE pair.student_id=pupil.id AND pair.class_id=NEW.class_id)>1
   OR (SELECT count(*) FROM assessment_results pair WHERE pair.student_id=pupil.id AND pair.assessment_id=NEW.assessment_id)>1
   OR EXISTS (SELECT 1 FROM assessment_results opaque WHERE opaque.student_id=pupil.id AND opaque.assessment_id=NEW.assessment_id
    AND (typeof(opaque.score)='blob' OR (typeof(opaque.score)='integer' AND (opaque.score < -9007199254740991 OR opaque.score > 9007199254740991))
     OR (typeof(opaque.score)='real' AND (opaque.score < -1.7976931348623157e308 OR opaque.score > 1.7976931348623157e308))))
  )
 ) THEN RAISE(ABORT,'saha_assessment_review_conflict') END;
 SELECT CASE WHEN (SELECT count(DISTINCT json_extract(value,'$.studentId')) FROM json_each(NEW.entries_json))<>json_array_length(NEW.entries_json)
  THEN RAISE(ABORT,'saha_assessment_review_conflict') END;
 SELECT CASE WHEN EXISTS (
  SELECT 1 FROM json_each(NEW.entries_json) pending JOIN assessments assessment ON assessment.id=NEW.assessment_id WHERE
   coalesce(json_type(pending.value,'$.studentId'),'')<>'text' OR coalesce(json_type(pending.value,'$.resultId'),'')<>'text'
   OR coalesce(json_extract(pending.value,'$.resultId'),'')=''
   OR coalesce(json_type(pending.value,'$.score'),'')<>'integer' OR json_extract(pending.value,'$.score') NOT BETWEEN 0 AND assessment.max_score
   OR coalesce(json_type(pending.value,'$.grade'),'') NOT IN ('text','null') OR coalesce(json_type(pending.value,'$.feedback'),'') NOT IN ('text','null')
   OR (length(coalesce(json_extract(pending.value,'$.grade'),''))>2000 AND NOT (json_type(pending.value,'$.expectedRecord')='object'
    AND json_extract(pending.value,'$.expectedRecord.grade') IS json_extract(pending.value,'$.grade')))
   OR (length(coalesce(json_extract(pending.value,'$.feedback'),''))>2000 AND NOT (json_type(pending.value,'$.expectedRecord')='object'
    AND json_extract(pending.value,'$.expectedRecord.feedback') IS json_extract(pending.value,'$.feedback')))
   OR NOT EXISTS (SELECT 1 FROM students pupil JOIN enrolments active ON active.student_id=pupil.id
    WHERE pupil.id=json_extract(pending.value,'$.studentId') AND pupil.school_id=NEW.school_id AND active.class_id=NEW.class_id AND active.status='active')
   OR NOT (
    (json_type(pending.value,'$.expectedRecord')='null' AND NOT EXISTS (SELECT 1 FROM assessment_results saved
     WHERE saved.assessment_id=NEW.assessment_id AND saved.student_id=json_extract(pending.value,'$.studentId')))
    OR (json_type(pending.value,'$.expectedRecord')='object'
     AND coalesce(json_type(pending.value,'$.expectedRecord.grade'),'') IN ('text','null') AND coalesce(json_type(pending.value,'$.expectedRecord.feedback'),'') IN ('text','null')
     AND EXISTS (SELECT 1 FROM assessment_results saved WHERE saved.assessment_id=NEW.assessment_id AND saved.student_id=json_extract(pending.value,'$.studentId')
      AND saved.id IS json_extract(pending.value,'$.expectedRecord.id') AND saved.id IS json_extract(pending.value,'$.resultId')
      AND saved.assessment_id IS json_extract(pending.value,'$.expectedRecord.assessmentId') AND saved.student_id IS json_extract(pending.value,'$.expectedRecord.studentId')
      AND typeof(saved.score) IS json_extract(pending.value,'$.expectedRecord.scoreType')
      AND ((typeof(saved.score) IN ('integer','real') AND json_type(pending.value,'$.expectedRecord.score') IN ('integer','real'))
       OR (typeof(saved.score)='text' AND json_type(pending.value,'$.expectedRecord.score')='text'))
      AND saved.score IS json_extract(pending.value,'$.expectedRecord.score') AND saved.grade IS json_extract(pending.value,'$.expectedRecord.grade')
      AND saved.feedback IS json_extract(pending.value,'$.expectedRecord.feedback') AND saved.created_at IS json_extract(pending.value,'$.expectedRecord.createdAt')
      AND saved.updated_at IS json_extract(pending.value,'$.expectedRecord.updatedAt')))
   )
   OR (json_type(pending.value,'$.expectedRecord')='object' AND json_extract(pending.value,'$.expectedRecord.scoreType')='integer'
    AND json_extract(pending.value,'$.expectedRecord.score') IS json_extract(pending.value,'$.score')
    AND json_extract(pending.value,'$.expectedRecord.grade') IS json_extract(pending.value,'$.grade')
    AND json_extract(pending.value,'$.expectedRecord.feedback') IS json_extract(pending.value,'$.feedback'))
 ) THEN RAISE(ABORT,'saha_assessment_review_conflict') END;
END;

CREATE TRIGGER assessment_review_commit AFTER INSERT ON assessment_reviews
BEGIN
 UPDATE assessment_results SET
  score=(SELECT json_extract(value,'$.score') FROM json_each(NEW.entries_json) WHERE json_extract(value,'$.resultId')=assessment_results.id),
  grade=(SELECT json_extract(value,'$.grade') FROM json_each(NEW.entries_json) WHERE json_extract(value,'$.resultId')=assessment_results.id),
  feedback=(SELECT json_extract(value,'$.feedback') FROM json_each(NEW.entries_json) WHERE json_extract(value,'$.resultId')=assessment_results.id),updated_at=NEW.created_at
 WHERE assessment_id=NEW.assessment_id AND id IN (SELECT json_extract(value,'$.resultId') FROM json_each(NEW.entries_json) WHERE json_type(value,'$.expectedRecord')='object');
 SELECT CASE WHEN changes()<>(SELECT count(*) FROM json_each(NEW.entries_json) WHERE json_type(value,'$.expectedRecord')='object')
  THEN RAISE(ABORT,'saha_assessment_review_conflict') END;
 INSERT INTO assessment_results(id,assessment_id,student_id,score,grade,feedback,created_at,updated_at)
 SELECT json_extract(value,'$.resultId'),NEW.assessment_id,json_extract(value,'$.studentId'),json_extract(value,'$.score'),json_extract(value,'$.grade'),json_extract(value,'$.feedback'),NEW.created_at,NEW.created_at
 FROM json_each(NEW.entries_json) WHERE json_type(value,'$.expectedRecord')='null';
 SELECT CASE WHEN changes()<>(SELECT count(*) FROM json_each(NEW.entries_json) WHERE json_type(value,'$.expectedRecord')='null')
  THEN RAISE(ABORT,'saha_assessment_review_conflict') END;
 INSERT INTO assessment_review_entries(id,review_id,result_id,student_id,before_record,after_record)
 SELECT NEW.id || ':' || saved.student_id,NEW.id,saved.id,saved.student_id,
  CASE WHEN json_type(pending.value,'$.expectedRecord')='object' THEN json_extract(pending.value,'$.expectedRecord') ELSE NULL END,
  json_object('id',saved.id,'assessmentId',saved.assessment_id,'studentId',saved.student_id,'score',saved.score,'scoreType',typeof(saved.score),
   'grade',saved.grade,'feedback',saved.feedback,'createdAt',saved.created_at,'updatedAt',saved.updated_at)
 FROM json_each(NEW.entries_json) pending JOIN assessment_results saved ON saved.id=json_extract(pending.value,'$.resultId')
  AND saved.assessment_id=NEW.assessment_id AND saved.student_id=json_extract(pending.value,'$.studentId');
 SELECT CASE WHEN changes()<>json_array_length(NEW.entries_json) THEN RAISE(ABORT,'saha_assessment_review_conflict') END;
END;
CREATE TRIGGER assessment_reviews_no_update BEFORE UPDATE ON assessment_reviews BEGIN SELECT RAISE(ABORT,'Assessment reviews are immutable'); END;
CREATE TRIGGER assessment_reviews_no_delete BEFORE DELETE ON assessment_reviews BEGIN SELECT RAISE(ABORT,'Assessment reviews are immutable'); END;
CREATE TRIGGER assessment_review_entries_no_update BEFORE UPDATE ON assessment_review_entries BEGIN SELECT RAISE(ABORT,'Assessment review entries are immutable'); END;
CREATE TRIGGER assessment_review_entries_no_delete BEFORE DELETE ON assessment_review_entries BEGIN SELECT RAISE(ABORT,'Assessment review entries are immutable'); END;
