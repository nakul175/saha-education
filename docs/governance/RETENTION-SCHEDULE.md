# Retention schedule

Owner: Nakul Jain · Last reviewed: 2026-10-08 · Update trigger: retention decision D-10, any new table, any deletion job.
**Agent-drafted 2026-10-08, not reviewed by a person or counsel; no certification or compliance claimed.** The honest position: **no retention period has been approved for any business record, log or backup** ([DECISIONS-RISKS.md](../specification/DECISIONS-RISKS.md) D-10; [data dictionary](../specification/DATA-DICTIONARY.md): "Retention for all business records, logs/backups and evidence remains pending"). Periods below are therefore TBD, not proposals.

## What the code does today

| Data | Behaviour |
|---|---|
| Web sessions (`auth_sessions`) | Valid 8 hours; expired rows are deleted when a new session is created (opportunistic, `session.ts`) |
| OIDC transactions | Valid 5 minutes, one use; cleanup opportunistic |
| Login throttle buckets | 10-minute windows; no scheduled cleanup shown |
| Everything else | Kept indefinitely. No deletion job, archive or purge exists |

Evidence tables (attempts, feedback, events, versions, receipts) are made immutable by database triggers, so ordinary deletion is blocked by design; corrections append. Any future deletion needs a reviewed migration or procedure.

## Schedule

| Data class | Examples | Retention period | Deletion method | Decision owner |
|---|---|---|---|---|
| Student identity and enrolment | `students`, enrolment tables | TBD | TBD | Nakul Jain with the school |
| Guardian contact data | `guardians`, links | TBD | TBD (unlink history is kept) | same |
| Attendance | `attendance`, reviews, changes | TBD | TBD | same |
| Assessments, report cards, receipts | results, report lines | TBD | TBD | same |
| Learner submissions and feedback | `submission_attempts`, `submission_feedback` | TBD | TBD | same |
| Reading metrics and imports | `reading_checks`, imports | TBD; no audio is collected | TBD | same |
| Notices | `notices`, `notifications` | TBD | TBD | same |
| Account records and identity events | `users`, `identity_admin_*` | TBD | TBD | same |
| Audit and annotations | `audit_annotations`, event tables | TBD | TBD | same |
| Server and proxy logs | journald, Caddy | TBD | TBD | Nakul Jain |
| Backups | snapshot envelopes, droplet backups | TBD | TBD | Nakul Jain |

## Constraints to resolve

Erasure versus immutable evidence and backups; legal hold; what survives when a student leaves; what a guardian may have deleted ([DATA-SUBJECT-REQUESTS.md](DATA-SUBJECT-REQUESTS.md)). Once decided, record the decision in DECISIONS-RISKS.md as D-10 and update this table.
