# Data dictionary map and migration history

Owner: Nakul Jain · Last reviewed: 2026-10-08 · Update trigger: any new file in `drizzle/`, or a regenerated data dictionary.

## Canonical sources

- Field-level dictionary: [docs/specification/DATA-DICTIONARY.md](../specification/DATA-DICTIONARY.md) and its authoritative CSV [DATA-DICTIONARY.csv](../specification/DATA-DICTIONARY.csv). Its header states the current count (63 tables, 540 columns, migrations 0000–0025) and the CSV lists every column. The Markdown has field tables for 54 tables; the six tables of migration 0017 are described in prose only and the three tables of migration 0021 (`notices`, `notice_recipients`, `audit_annotations`) are **not yet described there**: check against `db/schema.ts` and the SQL (`node scripts/check-specification.mjs` compares the dictionary CSV with a freshly migrated database; run it before trusting a count).
- Plain table overview (old, rebuild baseline, 13 tables): [docs/DATA-MODEL.md](../DATA-MODEL.md) is superseded for field detail.
- Rules for writing migrations and applying them to a hosted database: [docs/RELEASE-CHECKLIST.md](../RELEASE-CHECKLIST.md) sections 2 and 3.

## Rules in one place

Additive only; one statement per `--> statement-breakpoint` piece; never edit, rename or delete an applied migration; journal `when` values must increase; `tests/integration/migration-governance-contract.mjs` pins the SHA-256 of 0000 to 0016 and their journal entries and replays the whole chain. On the droplet each file is applied once and recorded in `/var/lib/saha-education/applied-migrations.txt` ([RUNBOOKS.md](RUNBOOKS.md) 7).

## History (from `drizzle/` and `drizzle/meta/_journal.json`, 25 journal entries)

| No. | File | Topic (from file name; tables created for 0017 onward from the SQL) |
|---|---|---|
| 0000 | `0000_youthful_jamie_braddock.sql` | Initial schema (13 tables) |
| 0001 | `0001_trusted_identity.sql` | Issuer/subject identity fields, sessions, OIDC transactions, login rate limits |
| 0002 | `0002_reviewed_reading.sql` | Reviewed reading |
| 0003 | `0003_teacher_resources.sql` | Teacher resources |
| 0004 | `0004_identity_admin.sql` | Identity administration |
| 0005 | `0005_curriculum.sql` | Curriculum references |
| 0006 | `0006_submissions.sql` | Learner submissions |
| 0007 | `0007_reading_corrections.sql` | Reading corrections |
| 0008 | `0008_profile_links.sql` | Profile links |
| 0009 | `0009_academic_integrity.sql` | Academic integrity (no new table) |
| 0010 | `0010_reading_imports.sql` | Reading imports |
| 0011 | `0011_submission_windows.sql` | Submission windows |
| 0012 | `0012_report_publication_receipts.sql` | Report publication receipts |
| 0013 | `0013_attendance_reviews.sql` | Attendance reviews |
| 0014 | `0014_assessment_reviews.sql` | Assessment reviews |
| 0015 | `0015_registry_creation.sql` | Registry creation receipts |
| 0016 | `0016_synthetic_demo.sql` | Synthetic demo installation marker |
| 0017 | `0017_school_records.sql` | school_setup_settings, school_setup_terms, student_record_status, student_status_events, student_guardian_details, student_guardian_events |
| 0018 | `0018_course_class_enrolment_lifecycle.sql` | course_lifecycle, class_settings, enrolment_lifecycle, academic_change_requests, academic_events |
| 0019 | `0019_attendance_workflow.sql` | school_attendance_settings, attendance_changes |
| 0020 | `0020_assessment_lifecycle_reports.sql` | assessment_publications, assessment_metadata_edits, report_card_lines, report_card_corrections |
| 0021 | `0021_notices_audit.sql` | notices, notice_recipients, audit_annotations |
| 0022 | _no file and no journal entry_ | Number absent in the repository; reason TBD (owner: Nakul Jain). Do not reuse without checking |
| 0023 | `0023_curriculum_status.sql` | curriculum_reference_status_events |
| 0024 | `0024_identity_admin_changes.sql` | identity_admin_changes |
| 0025 | `0025_immutable_evidence_guards.sql` | Guard triggers that make evidence tables immutable (no new table) |

## Known issues (recorded, not fixed here)

- Journal timestamps for 0001 to 0003 are out of order; new entries must be later than all of them (finding F9 in [the security record](../current/DEMO-security-change-control.md)).
- Six migrations (0005, 0010, 0012 to 0015) put several statements in one piece; suspected, unproven, link to the private hosting failure ([DEPLOY-CLOUDFLARE.md](../DEPLOY-CLOUDFLARE.md) last paragraph).
- Retention for every table is undecided: see [RETENTION-SCHEDULE.md](RETENTION-SCHEDULE.md).
