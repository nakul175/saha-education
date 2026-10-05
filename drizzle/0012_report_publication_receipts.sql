-- Additive publication evidence; existing reports and notices remain untouched.
CREATE TABLE report_publication_receipts (
 id TEXT PRIMARY KEY NOT NULL,
 report_id TEXT NOT NULL REFERENCES report_cards(id),
 student_id TEXT NOT NULL REFERENCES students(id),
 school_id TEXT NOT NULL REFERENCES schools(id),
 published_by TEXT NOT NULL REFERENCES users(id),
 published_at TEXT NOT NULL CHECK(length(published_at) > 0)
);
CREATE UNIQUE INDEX report_publication_receipts_report ON report_publication_receipts(report_id);

CREATE TRIGGER report_publication_authority BEFORE INSERT ON report_publication_receipts
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM report_cards report JOIN students student ON student.id=report.student_id
  JOIN users actor ON actor.id=NEW.published_by
  WHERE report.id=NEW.report_id AND report.student_id=NEW.student_id
   AND report.published_at IS NULL AND student.school_id=NEW.school_id
   AND actor.school_id=NEW.school_id AND actor.role='admin' AND actor.disabled_at IS NULL
   AND actor.identity_issuer IS NOT NULL AND actor.identity_issuer<>''
   AND actor.identity_subject IS NOT NULL AND actor.identity_subject<>''
 ) THEN RAISE(ABORT,'saha_report_publication_conflict') END;
END;

CREATE TRIGGER report_publication_commit AFTER INSERT ON report_publication_receipts
BEGIN
 UPDATE report_cards SET published_at=NEW.published_at, updated_at=NEW.published_at
 WHERE id=NEW.report_id AND student_id=NEW.student_id AND published_at IS NULL
  AND EXISTS (SELECT 1 FROM students student WHERE student.id=NEW.student_id AND student.school_id=NEW.school_id)
  AND EXISTS (SELECT 1 FROM users actor WHERE actor.id=NEW.published_by AND actor.school_id=NEW.school_id
   AND actor.role='admin' AND actor.disabled_at IS NULL
   AND actor.identity_issuer IS NOT NULL AND actor.identity_issuer<>''
   AND actor.identity_subject IS NOT NULL AND actor.identity_subject<>'');
 SELECT CASE WHEN changes()<>1 THEN RAISE(ABORT,'saha_report_publication_conflict') END;

 INSERT INTO notifications (id,user_id,channel,title,body,read_at,created_at,updated_at)
 SELECT DISTINCT 'report-card-published:' || NEW.report_id || ':' || recipient.id,
  recipient.id, 'in_app', 'Report Card Published',
  'Your child ' || student.first_name || ' ' || student.last_name || '''s report card has been published.',
  NULL, NEW.published_at, NEW.published_at
 FROM report_cards report JOIN students student ON student.id=report.student_id
 JOIN student_guardians relationship ON relationship.student_id=student.id
 JOIN guardians guardian ON guardian.id=relationship.guardian_id
 JOIN users recipient ON recipient.id=guardian.user_id
 WHERE report.id=NEW.report_id AND report.student_id=NEW.student_id AND report.published_at=NEW.published_at
  AND student.school_id=NEW.school_id AND guardian.school_id=NEW.school_id AND recipient.school_id=NEW.school_id
  AND recipient.role='guardian' AND recipient.disabled_at IS NULL
  AND recipient.identity_issuer IS NOT NULL AND recipient.identity_issuer<>''
  AND recipient.identity_subject IS NOT NULL AND recipient.identity_subject<>''
 ON CONFLICT(id) DO NOTHING;
END;

CREATE TRIGGER report_publication_no_update BEFORE UPDATE ON report_publication_receipts
BEGIN SELECT RAISE(ABORT,'Report publication receipts are immutable'); END;
CREATE TRIGGER report_publication_no_delete BEFORE DELETE ON report_publication_receipts
BEGIN SELECT RAISE(ABORT,'Report publication receipts are immutable'); END;
