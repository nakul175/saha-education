# Demo record: in-app notices (FR-12) and audit and corrections (FR-26)

Recorded 6 October 2026 on branch `demo/notices-audit`, created from main `cadd2ebd8df0d1a0d24b609a59a756c725d9012c`. Agent A6 of the overnight demo run. All data is synthetic. Real sign-in, ORF or external sync, paid AI and real-recipient delivery stay disabled; nothing here sends email, text messages or any outbound request. This is an engineering record: every designed case remains unapproved, and no result below is business acceptance. The machine-readable counts are in [DEMO-notices-audit-EXECUTION.json](DEMO-notices-audit-EXECUTION.json). Earlier records and the hosting-failure notes are unchanged.

## 1. Gaps found before any code was written

Compared against the [FSD](../specification/FSD.md), [API contracts](../specification/API-CONTRACTS.md), the FR-12 and FR-26 traceability rows and the 95 designed cases that name FR-12 or FR-26.

FR-12, in-app notices (status was partial):

1. Staff could only create one notification per request for one named recipient. There was no way to write one notice for a class or a chosen set of people, no preview of who would receive it, and no confirmation step.
2. There was no page for staff to send notices. Only the recipient inbox existed.
3. The sender could not see who had read a notice (no per-notice record tying recipients to their notifications).
4. A sent notice could not be corrected with a reason while keeping the original.
5. The inbox returned one unbounded list with no paging, no counts and no way to see who sent a notice.
6. The server accepted any text in a title or message. The page rendered text safely, but tag-like input was never refused at the source.
7. Nothing proved that a notice cannot reach another class, another teacher's learners or another school, because there was no fan-out to prove it for.

FR-26, audit and corrections (status was partial):

1. No administrator view existed. Each area kept its own history (account reviews at `/api/admin/users/events`, profile-link history, attendance and assessment review receipts, reading corrections, report publication receipts, submission windows, feedback, imports, approvals), and none could be read together, filtered or paged.
2. No way to filter by area, person, words or date, and no school-scoped paging with a stable order.
3. Immutable-row triggers existed for several evidence tables but not for `identity_admin_events`, `submission_attempts` or `submission_feedback`.
4. No way for an administrator to add a reasoned correction beside an entry without touching the original.
5. Known and not closed here: legacy attendance, result and enrolment overwrites that never wrote receipts have no history to show; retention, export and deletion policy is unapproved (TC-083).

## 2. What changed

Migration `drizzle/0021_notices_audit.sql` (additive; one statement per breakpoint piece; no original migration touched):

- New tables `notices`, `notice_recipients`, `audit_annotations`, and an index `notifications_user_time` for the paged inbox. Each new table blocks UPDATE and DELETE with its own immutable-row triggers.
- Added the missing immutability triggers for `identity_admin_events`, `submission_attempts` and `submission_feedback`.

Notices (FR-12):

- Staff (teacher or administrator) send to a class (guardians, learners or both) or to 1 to 50 chosen people at `/notices`. A teacher reaches only learners in their own active classes and those learners' guardians; an administrator reaches anyone in their school. The audience is re-checked inside the same database batch that creates the notices, so a person whose authority changed after the preview is not silently included. A preview shows the count and up to five names before sending.
- Each notice is written once with its recipients and one in-app notification per recipient (channel `in_app`). The client UUID is the notice id: an exact retry returns the original (HTTP 200), a changed payload or a different sender gets a conflict (409), so nothing is sent twice.
- Titles and messages are plain text. Control characters and tag-like text are refused with a plain-language message; pages render text only.
- Senders see per-notice read counts and per-person read state at `/notices/[id]`. A correction (reason of 10 to 500 characters) goes to the same people as a new notice titled "Correction: ..." that names the original and the reason; the original is never edited.
- The inbox at `/notifications` now pages newest first (25 per page, cursor based), shows "N unread of M notices", offers Older and Newer buttons and a hide-read filter for the current page, and shows who sent each notice. The API keeps returning a plain array; paging facts travel in `X-Total-Count`, `X-Unread-Count` and `X-Next-Cursor` headers so older callers keep working.

Audit trail (FR-26):

- Administrators open `/admin/audit`: a read-only, school-scoped timeline merged from 14 existing areas (accounts, profile links, new student and guardian records, attendance reviews, assessment reviews, reading corrections, report publication, submission windows, learner feedback, reading imports, resource approvals, curriculum approvals, notices, audit notes). Each entry says what happened, who did it, when, about whom, the reason, and a before and after summary. Filters: area, person, words, from and to dates. Paging is newest first with a stable tie-break; opening an entry shows per-pupil before and after lines for attendance and assessment reviews and its correction notes.
- An entry that touches a pupil from another school is hidden entirely. Request hashes, attempt markers and learner feedback text are never returned.
- An administrator can add a reasoned correction note beside any entry (`audit_annotations`). The note is immutable, replay safe, and the audited record is not changed. There is no update or delete route for the trail, and the database blocks UPDATE and DELETE on the evidence tables it reads from where a trigger exists.
- The 14 sources are read through existing tables only; other workstreams' domain behaviour is unchanged.

Spec documents updated for the new routes and tables: API contracts (md and csv, eight new routes plus the notifications paging note) and the data dictionary csv (27 new fields).

## 3. Try it (synthetic)

1. Sign in as a teacher, open Send a notice, choose the class, see "This will reach 3 people", tick the confirmation and send. Try a title containing a "<" tag to see the plain-language refusal.
2. Sign in as a guardian of that class: the notice is unread in Notifications with "Sent by ..."; mark it read. The teacher's detail page then shows "Read" beside that person.
3. As the teacher open the notice and send a correction with a reason; the guardian sees "Correction: ...".
4. A guardian in another class, another teacher and another school's administrator see nothing of it.
5. Sign in as an administrator, open Audit trail, filter by area "Notices sent", open an entry and add a correction note.

## 4. Evidence

Actual results on this branch tip, all on synthetic data:

| Check | Command or procedure | Result |
| --- | --- | --- |
| Guarded run | `node scripts/test.mjs static unit integration smoke --fast --guard` | 55 suites, 22,936 assertions, 0 failed, 0 skipped; regression guard passed (53 baselined suites) |
| New suite: notices | `tests/integration/notices-contract.mjs` | 256 checks passed |
| New suite: audit trail | `tests/integration/audit-trail-contract.mjs` | 224 checks passed |
| Extended suite: family inbox | `tests/integration/family-ui-contract.mjs` | 320 checks in 64 scenarios passed (the original scenarios are unchanged; one paging scenario added) |
| Lint and types | scoped eslint on every changed file; `tsc --noEmit` | clean |
| Catalogue and documents | `node scripts/test.mjs --check-catalogue`; `python3 scripts/check-documentation.py`; `scripts/check-specification.mjs` | pass |
| Mounted browser procedure | `tests/worker-notices-audit-demo-check.mjs` against the built Worker on an isolated local D1 | 23 of 23 passed, 0 external requests, 0 page errors, 0 `alert()` dialogs |
| Existing mounted checks re-run | `worker-family-ui-check`, `worker-access-check`, `worker-domain-check` | family 36 of 36 procedures passed; access passed; domain passed 104 assertions in one run and failed in another on an unrelated 503 (see below) |

The mounted procedure covers: the send form (labelled, keyboard use, preview, confirmation, safe text), a class send once and its exact retry (200) and changed-payload conflict (409), recipients seeing plain text and read state, no leakage to another class, another teacher or another school, chosen people, a reasoned correction, paging of the inbox and the sender list, empty and failed-load states, audit entries from real flows, filters, paging, an entry's before and after detail, a reasoned note, immutability over HTTP, administrator-only access, and 375 px layout with no horizontal scroll. Screenshots were written to the local test output directory only.

Mutation checks (a deliberate defect is introduced, the owning suite must fail, the file is restored): 11 of 11 were detected. They cover the class audience filter, the teacher relation check for chosen people, the tag-like text filter, replay payload comparison, audit school scope, cross-school pupil hiding, the audit paging tie-break, the notice and identity-event immutability triggers, the inbox Older cursor and the hide-read filter.

Sandbox note, stated plainly: in this shared machine the local Worker is sometimes restarted under a request and answers HTTP 503 "Your worker restarted mid-request". A probe of 160 guardian POSTs to four unrelated routes (courses, classes, report cards, notifications) got that 503 for 22 of them, and another workstream saw it on an unrelated PATCH. `worker-domain-check` is the check most exposed because it sends many back-to-back POSTs: it passed once and failed once in the final runs, and failed on a 503 on report cards earlier. None of the failing requests touch the notices or audit code. The notices and audit browser procedure repeats such a request (bounded to 6 attempts; every request it makes is a read or carries a client UUID, so an exact repeat is the designed safe behaviour) and records the count; in the passing run it used 1 repeat. The existing checks were not changed. A baseline build of main was not run to prove the 503 occurs there too; the evidence for "not mine" is that the failing routes are unrelated and the other workstream's report.

Not in the baseline: `tests/regression-baseline.json` does not yet list `integration/notices-contract` and `integration/audit-trail-contract`; the guard prints this as a note. I did not edit the baseline.

## 5. Designed cases

95 designed cases name FR-12 or FR-26 (counted from `docs/specification/TEST-CASES.csv`; the specification itself is untouched and every case there stays `not-run-for-this-specification`). Actual results of this workstream are recorded per id in the execution JSON using these meanings: `pass` means the case's expected results were checked by the named automated suites or procedure on this branch; `partial` means part of the case was checked and the gap is named; `blocked` means it needs people, devices or a policy decision that were not provided; `not-run` means the steps were not executed here. Nothing is marked accepted.

Counts: blocked 15, not-run 58, partial 3, pass 19 (total 95).

Cases this workstream executed or assessed:

| Case | Result | Title | Basis |
| --- | --- | --- | --- |
| TC-035 | pass | Notification recipient ownership | automated suites at this branch tip |
| TC-036 | partial | External notifications remain disabled | automated suites and mounted procedure |
| TC-082 | partial | Attributable academic/resource/reading corrections | audit contract |
| TC-083 | blocked | Retention/export/deletion enforcement | policy decision not provided |
| TC-085 | pass | Approval audit reproducibility after later edits | existing suites plus new audit check |
| TC-096 | blocked | School and academic administrator UAT | needs named reviewers |
| TC-149 | blocked | Saved-report review and uncertain draft recovery usability | needs named reviewers |
| TC-150 | pass | Notice reads and acknowledgements reject stale actors | existing automated suites re-run at this branch tip |
| TC-151 | pass | Teacher notice INSERT rechecks class and active pupil relation | existing automated suites re-run at this branch tip |
| TC-152 | pass | Manual notice INSERT rechecks recipient school and account | existing automated suites re-run at this branch tip |
| TC-153 | pass | Notice auth origin body and channel boundaries | existing automated suites re-run at this branch tip |
| TC-154 | pass | Personal notices survive unlink without learner access | existing automated suites re-run at this branch tip |
| TC-155 | pass | Acknowledgement retry preserves content and row identity | existing automated suites re-run at this branch tip |
| TC-156 | partial | Inbox uncertainty retains rows and recovery action | callback suite only |
| TC-157 | blocked | Inbox accessibility and retention wording review | needs named reviewers |
| TC-294 | pass | Every current role receives only its owned inbox | callback suite with actual routes and D1 SQL |
| TC-295 | pass | Inbox fresh account rejects changed owner and obsolete feed | callback suite with actual routes and D1 SQL |
| TC-296 | pass | Read marker lock confirms the actual saved server timestamp | callback suite with actual routes and D1 SQL |
| TC-297 | pass | Lost committed read marker retries the exact original notice | callback suite with actual routes and D1 SQL |
| TC-298 | pass | Late read-status denial hides private notice content | callback suite with actual routes and D1 SQL |
| TC-299 | pass | Pending notice belongs to the original current account | callback suite with actual routes and D1 SQL |
| TC-300 | pass | Acknowledgement or malformed response cannot fabricate a saved read | callback suite with actual routes and D1 SQL |
| TC-301 | pass | Unavailable notice reminder dismissal changes no record | callback suite with actual routes and D1 SQL |
| TC-302 | pass | Unmounted inbox and late marker acknowledgement do not refresh private state | callback suite with actual routes and D1 SQL |
| TC-303 | pass | Legacy inbox dates remain exact stored evidence | callback suite with actual routes and D1 SQL |
| TC-304 | pass | Encoded original notice ID and stored channels preserve scope | callback suite with actual routes and D1 SQL |
| TC-305 | blocked | Family inbox keyboard mobile and read-status recovery review | needs named reviewers |
| TC-313 | blocked | Family current class and inbox usability acceptance | needs named reviewers |

The other 67 cases belong to other areas (attendance, assessment results, report publication, reading, submissions, identity, registry and similar). They are listed with their status and reason in the execution JSON; none was executed here, and those needing people are `blocked`.

## 6. Limits and open items

- The audit trail shows what the existing receipt tables recorded. Legacy overwrites without receipts have no entry. Resource and curriculum approvals are shown but their tables are not made immutable, because approvals legitimately update them.
- Viewing the audit trail is not itself audited. No export, retention or deletion exists (TC-083 is blocked pending an approved policy).
- The inbox hide-read filter applies to the current page only; counts come from the whole inbox.
- Delivery stays in-app. Stored `email` and `sms` labels on older notifications are labels, not delivery evidence.
- Other workstreams may add history tables later; the source list in `lib/education/audit-sources.ts` is the one place to extend, and each source needs its own scope predicate.
- The browser procedure uses one local Chromium and fictional data. Screen-reader, phone-hardware and plain-language review by named people (TC-157, TC-305, TC-313, TC-096) are not performed.
