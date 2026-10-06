# Reviewed profile links, imports and submission windows

First implementation batch in the [four-hour continuation](FOUR-HOUR-DEVELOPMENT.md), based on `398df9c8bf57659a5fd97718f76fe962011cf7d2` on `feat/specification-delivery`. This is a synthetic local implementation candidate. Publication, verification and unfinished work are recorded separately in [validation](../../VALIDATION.md).

## Reviewed profile ownership

School administrators use `/admin/profile-links` to select an exact student or guardian profile and eligible school account. Linking, replacing and explicitly unlinking require review, a single-line reason and the observed profile version. Each successful change appends an immutable event and increments its version atomically. Sessions of affected accounts are revoked in the same batch; the reviewing administrator is protected when repairing malformed legacy ownership. Account role, school and trusted identity are not remapped.

An exact request UUID replay returns its original review alongside the current profile, without reapplying an older ownership change or revoking new sessions. An occupied account, unchanged binding, stale version or conflicting UUID returns 409. Student and guardian profile creation starts unlinked; legacy profile endpoints reject silent ownership changes and direct administrators to the reviewed workflow. Existing relationships and version-zero legacy links are retained rather than backfilled with invented evidence. Profile/account/history displays have stated limits, not school totals.

## Academic integrity and confirmed results

Migration 0009 guards new enrolment and assessment-result pairs with insert/change triggers and supporting nonunique indexes. Existing legacy duplicates remain available for review; no automatic repair deletes or merges confirmed rows. Academic mutations recheck enabled actor, current trusted identity, role/school, class and student eligibility in the actual SQL. Attendance and result batches reject changed or ambiguous members as a whole.

The assessment editor now loads saved scores, feedback and supplied grades. Legitimate zero stays zero; unscored learners start blank. Saving sends only edited rows, preserving other confirmed results. Failed loads or ambiguous pairs block editing, and 409 keeps entered edits visible while requiring explicit reload. Existing result/attendance replacements retain their last-writer behavior; this batch does not add correction history, optimistic result revisions or new grading/date policies. Enrolment selection now uses the selected controlled value, and confirmation messages distinguish a successful write from a failed list refresh.

## Local reading-result imports

`/reading-imports` accepts a strict `saha.reading-results.v1` JSON envelope containing 1–25 normalized numeric observations and exact Saha learner/class IDs. Source labels and result references are user declarations. No vendor export, URL, audio, transcript, name matching or external synchronization is verified or fetched.

Staging saves immutable preview rows without creating readings. Explicit educator confirmation creates all original readings and consumption receipts in one atomic database update; rejection creates none. A receipt is unique for school, exact declared source label and external result reference. Reusing a consumed reference through another draft returns 409 and rolls back that whole confirmation. Original observations remain `manual-reviewed-external`; attributable import receipts retain the declared provenance. Current staff/class/school authority is checked on preview, decisions and evidence reads, with active enrolment additionally required to stage/confirm. Corrections continue through the existing append-only reading review workflow.

## Explicit assignment windows

The assignment response screen shows the current submission window. With no configured review, responses retain the original unrestricted behavior; an informational due date does not become a hidden cutoff. Current class staff may review immediate closing, reopening or an explicit closing time. Browser entry uses the device time zone and sends an exact canonical UTC timestamp.

Reviews append immutable revisions with expected-version arbitration. The actual attempt insertion checks the latest policy using the database clock, including closures that occur after initial validation. New attempts fail safely once closed. Saved attempts, reviewed feedback and exact committed submission UUID retries survive closure. Learners see effective window status without staff reasons/history. Staff feedback remains possible for saved attempts after closure, subject to current authorization. No automatic grade, penalty or guardian publication is introduced.

## Verification boundary and next work

Migrations 0008–0011 are additive and exercised only in disposable synthetic local databases. Fresh final-source build, independent negative/concurrent/retry contracts, browser journeys and populated local recovery passed. The guarded run contains 2,302 checks, with 172 new served and 57 new browser checks; prior journeys and 37 offline prototype checks also passed. See the [actual execution record](DEVELOPMENT-BATCH-1-EXECUTION.json) for dates, counts and limits. Designed specification TC procedures and all business acceptance remain separate and unapproved.

After this batch, review remaining original school/course/class/report/notification services for mutation-time authority and late evidence-read gaps, then implement and verify focused fixes in a separately recorded batch. Keep the sign-in provider, ORF destination, paid AI, real records, messaging and hosted release inactive until their concrete dependencies are supplied and authorized.
