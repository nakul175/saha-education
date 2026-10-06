-- Local normalized user-supplied results; no provider verification or network synchronization.
CREATE TABLE reading_import_drafts (
 id TEXT PRIMARY KEY NOT NULL, school_id TEXT NOT NULL REFERENCES schools(id), class_id TEXT NOT NULL REFERENCES classes(id),
 created_by TEXT NOT NULL REFERENCES users(id), source_label TEXT NOT NULL, source_reference TEXT NOT NULL,
 request_hash TEXT NOT NULL, rows_json TEXT NOT NULL CHECK(json_valid(rows_json) AND json_type(rows_json)='array' AND json_array_length(rows_json) BETWEEN 1 AND 25),
 status TEXT NOT NULL DEFAULT 'staged' CHECK(status IN ('staged','confirmed','rejected')), revision INTEGER NOT NULL DEFAULT 0 CHECK(revision IN (0,1)), created_at TEXT NOT NULL,
 decision_id TEXT, decision_hash TEXT, reviewed_by TEXT REFERENCES users(id), reviewed_at TEXT, reason TEXT,
 CHECK((status='staged' AND revision=0 AND decision_id IS NULL AND decision_hash IS NULL AND reviewed_by IS NULL AND reviewed_at IS NULL AND reason IS NULL)
 OR (status IN ('confirmed','rejected') AND revision=1 AND decision_id IS NOT NULL AND decision_hash IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND length(trim(reason)) BETWEEN 1 AND 1000))
);
CREATE INDEX reading_import_drafts_school_creator ON reading_import_drafts(school_id,created_by);
CREATE UNIQUE INDEX reading_import_decision_unique ON reading_import_drafts(decision_id);
CREATE TABLE reading_import_items (
 id TEXT PRIMARY KEY NOT NULL, import_id TEXT NOT NULL REFERENCES reading_import_drafts(id), reading_check_id TEXT NOT NULL,
 external_reference TEXT NOT NULL, student_id TEXT NOT NULL REFERENCES students(id), language TEXT NOT NULL, passage_reference TEXT NOT NULL, reading_date TEXT NOT NULL,
 duration_ms INTEGER NOT NULL CHECK(typeof(duration_ms)='integer' AND duration_ms BETWEEN 1000 AND 3600000),
 words_attempted INTEGER NOT NULL, words_correct INTEGER NOT NULL,
 CHECK(typeof(words_attempted)='integer' AND typeof(words_correct)='integer' AND words_attempted BETWEEN 1 AND 500 AND words_correct BETWEEN 0 AND words_attempted)
);
CREATE UNIQUE INDEX reading_import_item_reference ON reading_import_items(import_id,external_reference);
CREATE UNIQUE INDEX reading_import_item_check ON reading_import_items(reading_check_id);
CREATE TABLE reading_import_receipts (
 item_id TEXT PRIMARY KEY NOT NULL REFERENCES reading_import_items(id), school_id TEXT NOT NULL REFERENCES schools(id), source_label TEXT NOT NULL, external_reference TEXT NOT NULL,
 reading_check_id TEXT NOT NULL REFERENCES reading_checks(id),
 reviewed_by TEXT NOT NULL REFERENCES users(id), reviewed_at TEXT NOT NULL
);
CREATE UNIQUE INDEX reading_import_receipt_check ON reading_import_receipts(reading_check_id);
CREATE UNIQUE INDEX reading_import_receipt_source ON reading_import_receipts(school_id,source_label,external_reference);
CREATE TRIGGER reading_import_stage_items AFTER INSERT ON reading_import_drafts
BEGIN
 INSERT INTO reading_import_items SELECT json_extract(value,'$.id'),NEW.id,json_extract(value,'$.readingCheckId'),json_extract(value,'$.externalReference'),
 json_extract(value,'$.studentId'),json_extract(value,'$.language'),json_extract(value,'$.passageReference'),json_extract(value,'$.readingDate'),
 json_extract(value,'$.durationMs'),json_extract(value,'$.wordsAttempted'),json_extract(value,'$.wordsCorrect') FROM json_each(NEW.rows_json);
END;
CREATE TRIGGER reading_import_preserve_draft BEFORE UPDATE ON reading_import_drafts
BEGIN
 SELECT CASE WHEN OLD.status <> 'staged' OR NEW.id<>OLD.id OR NEW.school_id<>OLD.school_id OR NEW.class_id<>OLD.class_id OR NEW.created_by<>OLD.created_by
 OR NEW.source_label<>OLD.source_label OR NEW.source_reference<>OLD.source_reference OR NEW.request_hash<>OLD.request_hash OR NEW.rows_json<>OLD.rows_json OR NEW.created_at<>OLD.created_at
 THEN RAISE(ABORT,'Reading import evidence is immutable') END;
END;
CREATE TRIGGER reading_import_confirm AFTER UPDATE OF status ON reading_import_drafts WHEN NEW.status='confirmed'
BEGIN
 INSERT INTO reading_checks SELECT reading_check_id,NEW.school_id,NEW.class_id,student_id,NEW.reviewed_by,'oral-reading-fluency','manual-reviewed-external',
 language,passage_reference,reading_date,duration_ms,words_attempted,words_correct,NEW.reviewed_at FROM reading_import_items WHERE import_id=NEW.id;
 INSERT INTO reading_import_receipts SELECT id,NEW.school_id,NEW.source_label,external_reference,reading_check_id,NEW.reviewed_by,NEW.reviewed_at FROM reading_import_items WHERE import_id=NEW.id;
END;
CREATE TRIGGER reading_import_no_delete BEFORE DELETE ON reading_import_drafts BEGIN SELECT RAISE(ABORT,'Reading import evidence is immutable'); END;
CREATE TRIGGER reading_import_item_no_update BEFORE UPDATE ON reading_import_items BEGIN SELECT RAISE(ABORT,'Reading import items are immutable'); END;
CREATE TRIGGER reading_import_item_no_delete BEFORE DELETE ON reading_import_items BEGIN SELECT RAISE(ABORT,'Reading import items are immutable'); END;
CREATE TRIGGER reading_import_receipt_no_update BEFORE UPDATE ON reading_import_receipts BEGIN SELECT RAISE(ABORT,'Reading import receipts are immutable'); END;
CREATE TRIGGER reading_import_receipt_no_delete BEFORE DELETE ON reading_import_receipts BEGIN SELECT RAISE(ABORT,'Reading import receipts are immutable'); END;
