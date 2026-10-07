-- Additive assessment lifecycle and compiled-report evidence (demo workstream A5, reserved number 0020).
-- Existing assessments, results, reviews, reports and receipts are untouched and nothing is backfilled.
-- Every statement is its own breakpoint piece; each trigger is a single complete statement.
CREATE TABLE assessment_publications (
 id TEXT PRIMARY KEY NOT NULL,
 school_id TEXT NOT NULL REFERENCES schools(id),
 assessment_id TEXT NOT NULL REFERENCES assessments(id),
 class_id TEXT NOT NULL REFERENCES classes(id),
 action TEXT NOT NULL CONSTRAINT assessment_publications_action CHECK(action IN ('publish','unpublish')),
 actor_id TEXT NOT NULL REFERENCES users(id),
 reason TEXT CONSTRAINT assessment_publications_reason CHECK(reason IS NULL OR length(reason) BETWEEN 10 AND 500),
 partial_confirmed INTEGER NOT NULL DEFAULT 0 CONSTRAINT assessment_publications_partial CHECK(partial_confirmed IN (0,1)),
 expected_pupils INTEGER NOT NULL CONSTRAINT assessment_publications_expected CHECK(expected_pupils >= 0),
 recorded_results INTEGER NOT NULL CONSTRAINT assessment_publications_recorded CHECK(recorded_results >= 0),
 request_hash TEXT NOT NULL,
 created_at TEXT NOT NULL CONSTRAINT assessment_publications_time CHECK(length(created_at) > 0)
);
--> statement-breakpoint
CREATE INDEX assessment_publications_assessment ON assessment_publications(assessment_id, created_at);
--> statement-breakpoint
CREATE TABLE assessment_metadata_edits (
 id TEXT PRIMARY KEY NOT NULL,
 school_id TEXT NOT NULL REFERENCES schools(id),
 assessment_id TEXT NOT NULL REFERENCES assessments(id),
 class_id TEXT NOT NULL REFERENCES classes(id),
 actor_id TEXT NOT NULL REFERENCES users(id),
 reason TEXT CONSTRAINT assessment_metadata_edits_reason CHECK(reason IS NULL OR length(reason) BETWEEN 10 AND 500),
 before_snapshot TEXT NOT NULL CONSTRAINT assessment_metadata_edits_before CHECK(json_valid(before_snapshot) AND json_type(before_snapshot)='object'),
 after_snapshot TEXT NOT NULL CONSTRAINT assessment_metadata_edits_after CHECK(json_valid(after_snapshot) AND json_type(after_snapshot)='object'),
 request_hash TEXT NOT NULL,
 created_at TEXT NOT NULL CONSTRAINT assessment_metadata_edits_time CHECK(length(created_at) > 0)
);
--> statement-breakpoint
CREATE INDEX assessment_metadata_edits_assessment ON assessment_metadata_edits(assessment_id, created_at);
--> statement-breakpoint
CREATE TABLE report_card_lines (
 id TEXT PRIMARY KEY NOT NULL,
 report_id TEXT NOT NULL REFERENCES report_cards(id),
 student_id TEXT NOT NULL REFERENCES students(id),
 assessment_id TEXT NOT NULL REFERENCES assessments(id),
 result_id TEXT NOT NULL REFERENCES assessment_results(id),
 publication_id TEXT NOT NULL REFERENCES assessment_publications(id),
 assessment_title TEXT NOT NULL,
 assessment_kind TEXT NOT NULL,
 assessment_date TEXT NOT NULL,
 max_score INTEGER NOT NULL CONSTRAINT report_card_lines_max CHECK(max_score >= 0),
 score INTEGER NOT NULL CONSTRAINT report_card_lines_score CHECK(score >= 0 AND score <= max_score),
 grade TEXT,
 result_updated_at TEXT NOT NULL,
 created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX report_card_lines_pair ON report_card_lines(report_id, assessment_id);
--> statement-breakpoint
CREATE INDEX report_card_lines_assessment ON report_card_lines(assessment_id);
--> statement-breakpoint
CREATE TABLE report_card_corrections (
 id TEXT PRIMARY KEY NOT NULL,
 school_id TEXT NOT NULL REFERENCES schools(id),
 student_id TEXT NOT NULL REFERENCES students(id),
 original_report_id TEXT NOT NULL REFERENCES report_cards(id),
 replacement_report_id TEXT NOT NULL REFERENCES report_cards(id),
 reason TEXT NOT NULL CONSTRAINT report_card_corrections_reason CHECK(length(reason) BETWEEN 10 AND 500),
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL CONSTRAINT report_card_corrections_time CHECK(length(created_at) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX report_card_corrections_replacement ON report_card_corrections(replacement_report_id);
--> statement-breakpoint
CREATE INDEX report_card_corrections_original ON report_card_corrections(original_report_id);
--> statement-breakpoint
CREATE TRIGGER assessment_publication_authority BEFORE INSERT ON assessment_publications
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM users actor JOIN classes classroom ON classroom.id=NEW.class_id JOIN assessments assessment ON assessment.id=NEW.assessment_id
  WHERE actor.id=NEW.actor_id AND actor.school_id=NEW.school_id AND classroom.school_id=NEW.school_id AND assessment.class_id=classroom.id
   AND actor.role IN ('admin','teacher') AND (actor.role='admin' OR classroom.teacher_id=actor.id)
   AND actor.disabled_at IS NULL AND coalesce(actor.identity_issuer,'')<>'' AND coalesce(actor.identity_subject,'')<>''
 ) THEN RAISE(ABORT,'saha_assessment_publication_conflict') END;
 SELECT CASE WHEN coalesce((SELECT latest.action FROM assessment_publications latest WHERE latest.assessment_id=NEW.assessment_id ORDER BY latest.rowid DESC LIMIT 1),'unpublish')=NEW.action
  THEN RAISE(ABORT,'saha_assessment_publication_conflict') END;
 SELECT CASE WHEN NEW.action='unpublish' AND NEW.reason IS NULL THEN RAISE(ABORT,'saha_assessment_publication_conflict') END;
 SELECT CASE WHEN NEW.action='unpublish' AND EXISTS (
  SELECT 1 FROM report_card_lines line JOIN report_cards report ON report.id=line.report_id
  WHERE line.assessment_id=NEW.assessment_id AND report.published_at IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM report_card_corrections fix JOIN report_cards replacement ON replacement.id=fix.replacement_report_id
    WHERE fix.original_report_id=report.id AND replacement.published_at IS NOT NULL)
 ) THEN RAISE(ABORT,'saha_assessment_publication_in_use') END;
 SELECT CASE WHEN NEW.expected_pupils IS NOT (SELECT count(DISTINCT pupil.id) FROM students pupil JOIN enrolments active ON active.student_id=pupil.id
   WHERE pupil.school_id=NEW.school_id AND active.class_id=NEW.class_id AND active.status='active')
  OR NEW.recorded_results IS NOT (SELECT count(DISTINCT pupil.id) FROM students pupil JOIN enrolments active ON active.student_id=pupil.id
   JOIN assessment_results saved ON saved.student_id=pupil.id AND saved.assessment_id=NEW.assessment_id
   WHERE pupil.school_id=NEW.school_id AND active.class_id=NEW.class_id AND active.status='active')
 THEN RAISE(ABORT,'saha_assessment_publication_conflict') END;
 SELECT CASE WHEN NEW.action='publish' AND NOT EXISTS (
  SELECT 1 FROM assessments assessment WHERE assessment.id=NEW.assessment_id
   AND typeof(assessment.max_score)='integer' AND assessment.max_score BETWEEN 0 AND 9007199254740991
   AND length(assessment.date)=10 AND assessment.date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(assessment.date,'+0 days')=assessment.date
 ) THEN RAISE(ABORT,'saha_assessment_publication_unready') END;
 SELECT CASE WHEN NEW.action='publish' AND EXISTS (
  SELECT 1 FROM assessment_results saved JOIN assessments assessment ON assessment.id=saved.assessment_id
  WHERE saved.assessment_id=NEW.assessment_id AND (typeof(saved.score)<>'integer' OR saved.score<0 OR saved.score>assessment.max_score
   OR (SELECT count(*) FROM assessment_results pair WHERE pair.assessment_id=saved.assessment_id AND pair.student_id=saved.student_id)>1)
 ) THEN RAISE(ABORT,'saha_assessment_publication_unready') END;
 SELECT CASE WHEN NEW.action='publish' AND EXISTS (
  SELECT 1 FROM students pupil JOIN enrolments active ON active.student_id=pupil.id
  WHERE pupil.school_id=NEW.school_id AND active.class_id=NEW.class_id AND active.status='active'
   AND (SELECT count(*) FROM enrolments pair WHERE pair.student_id=pupil.id AND pair.class_id=NEW.class_id)>1
 ) THEN RAISE(ABORT,'saha_assessment_publication_unready') END;
 SELECT CASE WHEN NEW.action='publish' AND (NEW.recorded_results<1 OR (NEW.recorded_results<NEW.expected_pupils AND NEW.partial_confirmed<>1))
  THEN RAISE(ABORT,'saha_assessment_publication_unready') END;
END;
--> statement-breakpoint
CREATE TRIGGER assessment_publications_no_update BEFORE UPDATE ON assessment_publications BEGIN SELECT RAISE(ABORT,'Assessment publications are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER assessment_publications_no_delete BEFORE DELETE ON assessment_publications BEGIN SELECT RAISE(ABORT,'Assessment publications are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER assessment_metadata_edit_authority BEFORE INSERT ON assessment_metadata_edits
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM users actor JOIN classes classroom ON classroom.id=NEW.class_id JOIN assessments assessment ON assessment.id=NEW.assessment_id
  WHERE actor.id=NEW.actor_id AND actor.school_id=NEW.school_id AND classroom.school_id=NEW.school_id AND assessment.class_id=classroom.id
   AND actor.role IN ('admin','teacher') AND (actor.role='admin' OR classroom.teacher_id=actor.id)
   AND actor.disabled_at IS NULL AND coalesce(actor.identity_issuer,'')<>'' AND coalesce(actor.identity_subject,'')<>''
   AND assessment.id IS json_extract(NEW.after_snapshot,'$.id') AND assessment.class_id IS json_extract(NEW.after_snapshot,'$.classId')
   AND assessment.title IS json_extract(NEW.after_snapshot,'$.title') AND assessment.kind IS json_extract(NEW.after_snapshot,'$.kind')
   AND assessment.max_score IS json_extract(NEW.after_snapshot,'$.maxScore') AND assessment.date IS json_extract(NEW.after_snapshot,'$.date')
   AND assessment.updated_at IS json_extract(NEW.after_snapshot,'$.updatedAt')
   AND json_extract(NEW.before_snapshot,'$.id') IS assessment.id AND json_extract(NEW.before_snapshot,'$.classId') IS assessment.class_id
 ) THEN RAISE(ABORT,'saha_assessment_edit_conflict') END;
 SELECT CASE WHEN NEW.reason IS NULL AND EXISTS (SELECT 1 FROM assessment_results saved WHERE saved.assessment_id=NEW.assessment_id)
  THEN RAISE(ABORT,'saha_assessment_edit_conflict') END;
END;
--> statement-breakpoint
CREATE TRIGGER assessment_metadata_edits_no_update BEFORE UPDATE ON assessment_metadata_edits BEGIN SELECT RAISE(ABORT,'Assessment metadata edits are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER assessment_metadata_edits_no_delete BEFORE DELETE ON assessment_metadata_edits BEGIN SELECT RAISE(ABORT,'Assessment metadata edits are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER report_card_line_authority BEFORE INSERT ON report_card_lines
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM report_cards report JOIN students pupil ON pupil.id=report.student_id
  JOIN assessments assessment ON assessment.id=NEW.assessment_id JOIN classes classroom ON classroom.id=assessment.class_id
  JOIN assessment_results saved ON saved.id=NEW.result_id
  WHERE report.id=NEW.report_id AND report.student_id=NEW.student_id AND report.published_at IS NULL
   AND pupil.school_id=classroom.school_id
   AND EXISTS (SELECT 1 FROM enrolments pair WHERE pair.student_id=NEW.student_id AND pair.class_id=classroom.id)
   AND saved.assessment_id=NEW.assessment_id AND saved.student_id=NEW.student_id
   AND (SELECT count(*) FROM assessment_results duplicate WHERE duplicate.assessment_id=NEW.assessment_id AND duplicate.student_id=NEW.student_id)=1
   AND typeof(saved.score)='integer' AND saved.score=NEW.score AND typeof(assessment.max_score)='integer' AND assessment.max_score=NEW.max_score
   AND saved.score BETWEEN 0 AND assessment.max_score AND saved.grade IS NEW.grade AND saved.updated_at=NEW.result_updated_at
   AND assessment.title=NEW.assessment_title AND assessment.kind=NEW.assessment_kind AND assessment.date=NEW.assessment_date
   AND (SELECT latest.action FROM assessment_publications latest WHERE latest.assessment_id=NEW.assessment_id ORDER BY latest.rowid DESC LIMIT 1)='publish'
   AND NEW.publication_id IS (SELECT latest.id FROM assessment_publications latest WHERE latest.assessment_id=NEW.assessment_id ORDER BY latest.rowid DESC LIMIT 1)
 ) THEN RAISE(ABORT,'saha_report_line_conflict') END;
END;
--> statement-breakpoint
CREATE TRIGGER report_card_lines_no_update BEFORE UPDATE ON report_card_lines BEGIN SELECT RAISE(ABORT,'Report card lines are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER report_card_lines_no_delete BEFORE DELETE ON report_card_lines BEGIN SELECT RAISE(ABORT,'Report card lines are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER report_card_correction_authority BEFORE INSERT ON report_card_corrections
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM users actor JOIN report_cards original ON original.id=NEW.original_report_id JOIN report_cards replacement ON replacement.id=NEW.replacement_report_id
  JOIN students pupil ON pupil.id=NEW.student_id
  WHERE actor.id=NEW.created_by AND actor.school_id=NEW.school_id AND actor.role='admin' AND actor.disabled_at IS NULL
   AND coalesce(actor.identity_issuer,'')<>'' AND coalesce(actor.identity_subject,'')<>''
   AND pupil.school_id=NEW.school_id AND original.student_id=NEW.student_id AND replacement.student_id=NEW.student_id
   AND original.id<>replacement.id AND original.published_at IS NOT NULL AND replacement.published_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM report_card_corrections earlier JOIN report_cards later ON later.id=earlier.replacement_report_id
    WHERE earlier.original_report_id=original.id AND later.published_at IS NOT NULL)
 ) THEN RAISE(ABORT,'saha_report_correction_conflict') END;
END;
--> statement-breakpoint
CREATE TRIGGER report_card_corrections_no_update BEFORE UPDATE ON report_card_corrections BEGIN SELECT RAISE(ABORT,'Report corrections are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER report_card_corrections_no_delete BEFORE DELETE ON report_card_corrections BEGIN SELECT RAISE(ABORT,'Report corrections are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER report_publication_current_lines BEFORE INSERT ON report_publication_receipts
BEGIN
 SELECT CASE WHEN EXISTS (
  SELECT 1 FROM report_card_lines line WHERE line.report_id=NEW.report_id AND (
   NOT EXISTS (SELECT 1 FROM assessment_results saved JOIN assessments assessment ON assessment.id=saved.assessment_id
    WHERE saved.id=line.result_id AND typeof(saved.score)='integer' AND saved.score=line.score AND saved.grade IS line.grade
     AND saved.updated_at=line.result_updated_at AND assessment.title=line.assessment_title AND assessment.kind=line.assessment_kind
     AND assessment.date=line.assessment_date AND assessment.max_score=line.max_score)
   OR (SELECT latest.action FROM assessment_publications latest WHERE latest.assessment_id=line.assessment_id ORDER BY latest.rowid DESC LIMIT 1) IS NOT 'publish')
 ) THEN RAISE(ABORT,'saha_report_stale_lines') END;
END;
--> statement-breakpoint
CREATE TRIGGER assessments_published_lock BEFORE UPDATE ON assessments
WHEN (SELECT latest.action FROM assessment_publications latest WHERE latest.assessment_id=OLD.id ORDER BY latest.rowid DESC LIMIT 1)='publish'
BEGIN SELECT RAISE(ABORT,'saha_assessment_published_lock'); END;
--> statement-breakpoint
CREATE TRIGGER assessment_results_published_insert_lock BEFORE INSERT ON assessment_results
WHEN (SELECT latest.action FROM assessment_publications latest WHERE latest.assessment_id=NEW.assessment_id ORDER BY latest.rowid DESC LIMIT 1)='publish'
 AND NOT EXISTS (SELECT 1 FROM assessment_reviews review WHERE review.assessment_id=NEW.assessment_id AND review.created_at=NEW.created_at)
BEGIN SELECT RAISE(ABORT,'saha_assessment_published_lock'); END;
--> statement-breakpoint
CREATE TRIGGER assessment_results_published_update_lock BEFORE UPDATE ON assessment_results
WHEN (SELECT latest.action FROM assessment_publications latest WHERE latest.assessment_id=OLD.assessment_id ORDER BY latest.rowid DESC LIMIT 1)='publish'
 AND NOT EXISTS (SELECT 1 FROM assessment_reviews review WHERE review.assessment_id=OLD.assessment_id AND review.created_at=NEW.updated_at)
BEGIN SELECT RAISE(ABORT,'saha_assessment_published_lock'); END;
