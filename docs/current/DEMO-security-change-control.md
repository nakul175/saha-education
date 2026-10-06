# Demo run: security, atomicity and change control (NFR-01, NFR-02, NFR-09)

Recorded 6 October 2026 on branch `demo/security-change-control` (agent A9 of the overnight demo run). Synthetic data only: no provider, no paid AI, no real recipient, no external network call. Nothing here marks a designed case accepted or an approval true; every case in `docs/specification/TEST-CASES.*` keeps `not-run-for-this-specification` and `approved: false`. The machine-readable record is [DEMO-security-change-control-EXECUTION.json](DEMO-security-change-control-EXECUTION.json).

## 1. Specification gap list (read first)

The specification was read before any test was written. These are the places where it is silent, ambiguous or contradicted by the code, so the tests below encode the stated contract where there is one and are labelled where there is not.

| # | Gap | What was done |
|---|---|---|
| G1 | NFR-01 names identity, same-origin, scope, schemas and safe errors. It has **no requirement for browser hardening** (Content-Security-Policy, framing, nosniff, referrer, permissions, HSTS). | Added as defence in depth (F1) and tested. The CSP keeps `'unsafe-inline'` for scripts and styles because the framework hydrates from inline bootstrap code; whether a stricter nonce policy is wanted is a product/ops decision. |
| G2 | The only request-size rule is the 128 KiB bounded `body()` helper "for endpoints using that helper". `POST /api/external-apps/[id]/launch` did not use it and the contract says nothing about it. | Fixed (F2); test asserts every route reads bodies only through the bounded reader. |
| G3 | Legacy school/student/guardian/course/class/assessment/report/notification schemas have **no per-field length limits**; the contract admits this and relies on the 128 KiB body cap. No decision on limits exists. | Recorded as F5, not changed (policy and other agents' files). |
| G4 | Whether the role gate runs **before** body parsing is stated only for schools, courses, classes, report cards and notices. For students, guardians, resources, curriculum and reading checks the contract is silent, except resources and reading checks say "G/S 403". | The matrix pins the stated cases and reports the rest as ordering observations (F3). |
| G5 | The contract and data dictionary call submission attempts, feedback, identity events, resource/curriculum versions, assignments and reference bindings "immutable", but only some tables have DB triggers (data dictionary line on "immutable-row triggers"). | Added migration 0025 (F4). The data dictionary was not edited (specification exports belong to the integration step); it should gain a sentence for 0025. |
| G6 | No policy says whether a teacher may read an **unpublished** report draft of an assigned pupil. The contract restricts only guardians and students to published reports. | Observed, tested as current behaviour, flagged (F6). |
| G7 | Rate limiting exists only for sign-in (20 per 10 minutes per edge-IP bucket) and demo sign-in (40). The specification itself says this is "not a complete abuse or overload control". No limit applies to authenticated APIs. | Recorded; the sign-in limit is tested. No overload target exists to test. |
| G8 | No approved session policy beyond an 8 hour maximum cookie lifetime; no idle timeout or concurrent-session cap. | Recorded; lifetime is tested. |
| G9 | No approved RPO/RTO, restore method or hosted snapshot facility. TC-091/092/093 need an authorized drill. | Not run (blocked); release rules recorded in [RELEASE-CHECKLIST](../RELEASE-CHECKLIST.md). |
| G10 | The hosted migration failure (`incomplete input: SQLITE_ERROR`, no URL) has no known failing file or applied boundary. | Unchanged and unresolved; new migration written single-statement per piece. See section 7. |
| G11 | No CI is defined (AGENTS.md says no repository workflow proves deployment). | Added a workflow that runs the same commands as a contributor (section 6). It proves nothing about hosting. |
| G12 | The historical drizzle journal is not monotonic (`0001` is later than `0002`/`0003`). | Left as is (applied history is never rewritten); new entries are required to be later than every original entry. |

## 2. What was built

| File | Purpose |
|---|---|
| `tests/support/route-dispatch.mjs`, `authorization-fixture.mjs`, `authorization-matrix-spec.mjs` | In-process router over the real route files; two-school fixture created **through the real routes**; 96-row table transcribed from API-CONTRACTS.md |
| `tests/integration/authorization-matrix-contract.mjs` | NFR-01 matrix over all 96 handlers |
| `tests/integration/security-hardening-contract.mjs` | headers, limits, hostile input, no existence oracle, session/cookie lifecycle, sign-in throttle, error and log leakage |
| `tests/integration/atomicity-concurrency-contract.mjs` | NFR-02: fault injection, retries, key clashes, stale preconditions, contention, immutable-trigger attacks, demo install |
| `tests/integration/migration-governance-contract.mjs` | NFR-09: applied history, journal, additive single-statement migrations, replay and upgrade |
| `tests/worker-security-demo-check.mjs`, `tests/support/write-security-fixture.mjs` | mounted procedure against the built Worker (manual layer) |
| `lib/education/security-headers.ts`, `worker/index.ts` | response hardening (F1) |
| `lib/education/http.ts`, `app/api/external-apps/[id]/launch/route.ts` | bounded launch body (F2) |
| `drizzle/0025_immutable_evidence_guards.sql` and journal entry | 16 guard triggers (F4) |
| `.github/workflows/ci.yml`, `docs/RELEASE-CHECKLIST.md` | change control |

## 3. Findings

Severity is the author's engineering judgement, not an approved rating.

| ID | Route / area | Request | Expected | Actual | Severity | State |
|---|---|---|---|---|---|---|
| F1 | every response | any request | NFR-01 gap G1: hardened browser responses | No CSP, nosniff, frame, referrer, permissions, COOP/CORP or HSTS header on any response; the Worker entry passed the framework response through untouched | medium (defence in depth; API authority was unaffected) | **fixed**: `withSecurityHeaders` in `worker/index.ts` |
| F2 | `POST /api/external-apps/[id]/launch` | stream a 51 MiB body | 128 KiB bound like every other body (G2) | `request.text()` read the whole body (51 MiB pulled) | medium (memory/availability for any signed-in staff account) | **fixed**: `boundedText()`; 400 after at most 128 KiB; suite asserts all 8 body-reading families pull at most 2 MiB of a 40 MiB stream |
| F3 | 12 handlers: `POST /api/students`, `PATCH /api/students/[id]`, `POST /api/guardians`, `POST /api/reading-checks`, `POST/PATCH /api/resources`, `POST /api/resources/[id]/approve`, `/assign`, `POST /api/curriculum`, `PATCH /api/curriculum/[id]`, `/approve`, `/draft` | denied role with a **malformed** body | role gate first (403), as stated for schools/courses/classes/reports/notices; resources and reading checks say "G/S 403" | body is parsed first: 400 | low (a denied role learns only that its body was invalid; with a valid body the denial is 403 and nothing is written, tested) | open; planned small fix after merge of other agents' work (conflict avoidance) |
| F4 | database | direct UPDATE/DELETE of `submission_attempts`, `submission_feedback`, `identity_admin_events`, `reading_checks`, `resource_assignments`, `resource_reference_bindings`, content columns of `resource_versions` and `curriculum_reference_versions` | contract calls these immutable | no DB guard (only API discipline) | low/medium (defence in depth) | **fixed**: migration 0025 |
| F5 | legacy school/student/guardian/course/class/assessment/report/notification inputs | very long text up to the 128 KiB body | bounded fields (G3) | accepted up to the 128 KiB body cap; only the body cap is tested (a body one byte over 128 KiB is refused), no per-field limit exists | low | open (policy) |
| F6 | `GET /api/report-cards[...]` | assigned teacher reads a draft of an assigned pupil | policy undefined (G6) | readable | policy | open (decision needed) |
| F7 | `lib/education/request-body.ts` | none (no route imports it) | one bounded reader | an older **unbounded** helper remains, used only by a unit test | info | open (remove when its test is retired) |
| F8 | sign-in throttle | request without `cf-connecting-ip` | per-address bucket | all such requests share one `unknown` bucket (documented fallback) | info (Cloudflare always sets the header; local/dev only) | recorded |
| F9 | drizzle journal | n/a | monotonic `when` | historical entries 0001 > 0002/0003 | info (recorded risk for timestamp-based migrators) | recorded, guarded for new entries |
| F10 | static files under `/_next/static/` and `/assets/` | GET a hashed script or stylesheet | same hardening headers as other responses | answered by the platform asset layer before the Worker runs (observed in the mounted run), so no Worker-added headers (`nosniff` etc.); no data is in these files | info | recorded (a `_headers` rule is the fix if wanted) |

No data-integrity defect was found in 27 multi-row or CAS write paths and the demo installation (section 4): every injected fault rolled the whole write back, every retry converged, no concurrent group produced two winners. That is a negative result with the stated limits (section 8), not proof of absence.

## 4. Evidence

All numbers are from this branch on Node 24.19.0 unless stated, at the commit named in the pull request.

**NFR-01 authorization matrix** (`node tests/integration/authorization-matrix-contract.mjs`): 20,330 checks, 0 failed; 60 route files and 96 handlers (inventory equals `API-CONTRACTS.csv`); 89 protected handlers x 11 credential states (none, malformed, expired, disabled, unmapped, duplicate, forged role cookie/header, and similar) all 401 with a safe body, `no-store`, no cookie, the request body never read and an unchanged whole-database fingerprint; 8 hostile Origin forms 403 before the body is read; four roles x two schools; about 200 object-scope cells including roster privacy; 2,376 recorded responses scanned for foreign-marker leaks; about 50 hostile valid-body writes from out-of-scope or wrong-role actors with no table change plus positive controls on a second fixture. 12 ordering observations (F3).

**Hardening** (`node tests/integration/security-hardening-contract.mjs`): 322 checks, 0 failed: header unit tests; body limits (40 MiB streams on 8 routes, one byte over 128 KiB, bad and negative `Content-Length`, deeply nested JSON, invalid UTF-8); prototype-pollution keys; hostile identifiers and stored text; no existence oracle on 22 foreign-vs-missing pairs; session cookie flags and digest-only storage; fixation, revocation and disablement; the 21st sign-in start from one address is 429; injected database failures return a generic body and write nothing to the console.

**Atomicity and concurrency** (`node tests/integration/atomicity-concurrency-contract.mjs`): 819 checks, 0 failed. 27 write paths x (every written table at the first, second and last row) = 57 injected failure points, plus 34 for first-use demo installation; after each, the whole-database fingerprint was unchanged, the failure body was generic and the same request then succeeded. 27 exact retries, 18 retry-key clashes (409), 9 stale preconditions (409), 31 concurrency groups of six simultaneous requests (exactly one winner for CAS paths; identical keys converge on one write). 8 whole-batch prevalidation cases. Immutable evidence: the inventory of **56 triggers** is asserted by name; 20 evidence tables are attacked column by column and by mass UPDATE/DELETE (every attempt refused with the trigger's own message); the approval transition on versions still works.

**Change control** (`node tests/integration/migration-governance-contract.mjs`): 411 checks, 0 failed: SHA-256 of 0000-0016 and of their journal entries pinned; unique numbers and timestamps; new entries later than all original entries; 16 pieces / 16 triggers in 0025 each single-statement; chain replays (41 tables, 56 triggers, integrity and foreign-key checks clean); upgrade from 0016 equals a fresh install and keeps every earlier object and column. `node scripts/diagnose-migration-splitting.mjs` was run; 0025 is not listed among the multi-statement pieces.

**Guarded run** (`node scripts/test.mjs static unit integration smoke --fast --guard`): 57 suites, 44,310 assertions, 0 failed; regression guard passed (53 baselined suites). Four new suites are "not in the baseline yet" until the integrator updates `tests/regression-baseline.json`. Documentation (77 files), requirements audit and specification check (41 tables / 338 fields, 371 cases, 60 route files) pass. Whole-repository `tsc --noEmit`: passed with no errors (exit 0, Node 24).

**Mounted procedure** (`tests/worker-security-demo-check.mjs`, built Worker plus isolated local D1 on port 8809, Chromium): fresh run at the tip passed, **1,291 checks, 0 failed**, 0 page errors, 0 CSP violations, 0 external requests, no 5xx. 14 response kinds (login, anonymous and authenticated API and page, 404, 405, hostile Origin, denied role, sign-in start, callback redirect, OPTIONS, HEAD) carry the CSP, nosniff, DENY framing, no-referrer, Permissions-Policy and COOP/CORP headers and no HSTS on the local http origin; API and error responses are `no-store`; the 35 protected page URLs redirect anonymous callers to /login (/login itself is public); 5 actors (admin and teacher, guardian and student of school A, an admin of school B) visited all pages (177 visits, 155 rendered in place, 22 redirected, none showing another school's or another role's marker); in Chromium string `eval` is blocked by the CSP, a cross-origin fetch is blocked, and a foreign page cannot frame the application. Three earlier runs of this script failed or hung for faults in the script itself (the browser dropped a hand-set Cookie header on redirects; `eval` run through the test driver is exempt from the CSP; a blocked frame was evaluated without a timeout and hung), which were fixed before this result. One earlier run also recorded a `503` without any headers for the denied-role request (2 ms, local runtime); it did not recur in the two following runs and its cause is **not explained** (recorded, not dismissed). Observation F10: static files carry no Worker-added headers.

**Mutation checks** (each reverted afterwards): removing a security header, restoring the unbounded launch read, raising the sign-in limit, widening the body cap, dropping a 0025 trigger, shortening the frozen column list, editing an original migration, back-dating the journal entry, merging two triggers into one piece, splitting a batch into sequential awaits (resource create), removing the expected-version predicate (identity status), removing the Origin check / role gate / teacher class scope / no-store in the matrix: every one failed the suite that owns it.

## 5. Designed-case execution record

"Executed" means the named suite performed the case's steps and checked its stated expected results in this run. It is not acceptance. Cases not listed here were not executed by this work.

| Case | Outcome | Evidence and limits |
|---|---|---|
| TC-011 session token digest and cookie properties | executed, passed | hardening suite: SHA-256 digest only, `__Host-` cookie, HttpOnly, Secure, SameSite=Lax, Path=/, no Domain, bounded expiry |
| TC-012 expired, malformed and duplicate cookies | executed, passed | matrix credential states over 89 handlers; pages redirect anonymous callers in the mounted run (malformed-cookie page redirects not separately sampled) |
| TC-016 forged role cookies and public headers | executed, passed | matrix credential states plus hardening `x-user-role` probes |
| TC-017 cross-school and unassigned-class matrix | executed, passed | matrix object-scope and hostile-write groups (the case was "planned") |
| TC-019 mutation Origin and no-store | executed, passed | 8 Origin variants x every mutating handler, `no-store` on every recorded response; real Worker headers sampled in the mounted run |
| TC-020 safe errors and hostile text | executed, partial | API half passed (malformed JSON, unknown keys, hostile text stored as literal JSON). The "read learner/print view" half was not rendered in a browser |
| TC-029 attendance whole-batch invalid input and failure | executed, passed | prevalidation cases and injected faults on the legacy and reviewed batch paths |
| TC-034 report publication and notice atomic retry | executed, passed | publish twice leaves the database unchanged; faults at receipt, report and notice tables roll back |
| TC-039/040/043/044/047 resource create/revision/approval retry, race and stale paths | executed, passed | atomicity scenarios (create replay and clash, revision stale 409, six-way contention one winner, approval) |
| TC-051/052 assignment retry and race | executed, partial | exact retry and key clash; class-authority change during the race is owned by the resource access suites, not re-run here |
| TC-063 ORF immutable retries and actor collisions | executed, passed | reading check create and correction replay, clash, immutable `reading_checks` and `reading_corrections` triggers |
| TC-084 credential and learner data absent from logs | executed, partial | console spy on injected failures and denied requests: 0 lines. Operator logs and evidence exports were not inspected |
| TC-104/105 profile decision replay and CAS atomicity | executed, partial | replay, stale, fault injection and contention on the profile-link write; affected-session deletion is covered by existing suites |
| TC-111/116 enrolment race and academic batch fault | executed, passed | enrolment contention one winner; batch faults and the 128 KiB bound |
| TC-120/122 import confirm and fault CAS | executed, partial | stage and confirm fault injection, retry, stale and contention; duplicate consumption across drafts is owned by existing suites |
| TC-129 window CAS and old-UUID replay | executed, passed | window scenario |
| TC-144/145/147 publication race and trigger fault | executed, partial | one receipt/notice on retry; fault rollback; revoked-actor publication not re-run |
| TC-191/192/193 and TC-217/218/219 reviewed attendance and result faults and races | executed, passed | fault at every written table, six-way contention one winner, exact replay |
| TC-262/263/264/265/268 registry creation | executed, passed | replay 200, clash 409, one winner, fault rolls back receipt and profile |
| TC-279 first demo install | executed, partial | 34 fault points leave an empty database and the retry installs; concurrency installs one school. Content of the seeded rows is owned by the demo suites |
| TC-131 committed submission replay and feedback survive closure | not run here | owned by other agents |
| TC-091/092/093 snapshot, tamper and hosted restore drills | **blocked** | need an authorized drill and approved targets; none run |
| TC-100 traceability, TC-101 release acceptance | manual, not run | the documentation, requirement and specification checks pass; the cases are manual sign-off |
| NFR-09 UAT cases (TC-109, 117, 125, 133, 141, 149, ...) | manual, not run | business sign-off is outside automation |

## 6. Change control delivered

- `.github/workflows/ci.yml`: on pull requests into `main` and pushes to `main`: checks that no existing migration was modified, renamed or deleted, then lint, a fresh build, the guarded run (`node scripts/test.mjs static unit integration smoke --fast --guard`) and the three documentation checks, on Node 24 with the pinned pnpm. Read-only token, no secrets, no deployment. The push of this branch with the workflow file **was accepted by GitHub** (no workflow-scope refusal). The workflow has **not been executed by GitHub from here**, so its first run is unverified.
- `docs/RELEASE-CHECKLIST.md`: pre-PR gates, migration rules (additive, unique number, monotonic `when`, one statement per `--> statement-breakpoint` piece, hash-pinned originals), the hosted-failure protocol, release record, post-deployment verification and forward-only rollback.
- `tests/integration/migration-governance-contract.mjs`: executable form of the migration rules above.

## 7. Hosted migration failure (unchanged)

The private hosted deployment still has no URL and the failing file and last applied boundary are not known. Nothing here changes an original migration or retries the deployment. Migration 0025 was written with one trigger per breakpoint piece so that it cannot be mis-split the way the multi-statement files may have been. Whether the hosted runner accepts triggers whose bodies contain a semicolon inside `BEGIN ... END;` is exactly the unknown; the diagnostic script reports 0025 as not multi-statement, which does not prove the hosted runner's behaviour.

## 8. Limits and not claimed

- The mounted script itself was not mutation-checked (that needs a rebuild per mutation); the in-process suites were. The oracle section was mutation-checked (removing the student scope from `getStudent` fails it).
- Everything is local and synthetic. No hosted, provider, paid-AI or real-recipient behaviour was exercised.
- The in-process harness executes `db.batch()` inside `BEGIN`/`COMMIT` and relies on single-statement atomicity of SQLite. Cloudflare D1 documents batches as transactions, but this was not run against hosted D1. Concurrency is cooperative within one JavaScript process; it exercises the SQL arbitration (unique keys, expected-version predicates), not parallel Workers.
- Fault injection uses `RAISE(ABORT)` triggers. It models a failed statement, not process death, lost responses or storage corruption.
- The matrix expectations are transcribed from the contract; where the contract is silent (G4) the behaviour is reported, not judged.
- The mounted procedure covers one Chromium on a local Worker with fictional data. It is not an accessibility, performance or acceptance result. No numeric performance target exists to test (G7).
- Pages are client shells whose authority is enforced by the APIs; the page matrix checks redirects, error-free rendering, no leak markers, CSP and external-request behaviour, not every control.
- The CI workflow and the release checklist are process artifacts; they do not establish deployment readiness.
- The regression baseline, specification exports and traceability files were not edited (integrator-owned). The data dictionary should gain a line for migration 0025.

## 9. Integration probe against the other open demo branches (local, nothing pushed)

At the time of writing `main` had not moved, so there was no regression on `main` itself. As an early signal the open branches (`demo/identity`, `school-records`, `courses-enrolment`, `attendance`, `assessments-reports`, `reading-review`, `curriculum-submissions`, `experience`, `notices-audit`) were merged one by one into a scratch clone of `origin/main` plus this branch. Append-only files (`drizzle/meta/_journal.json`, `scripts/test-catalogue.mjs`, the specification exports) were reconciled by union; any branch with a source-file conflict was skipped.

| Merged cleanly or with append-only reconciliation | Skipped (source conflicts, integrator must merge by hand) |
|---|---|
| security-change-control, identity, school-records, attendance, assessments-reports, reading-review | courses-enrolment, curriculum-submissions, experience, notices-audit (all conflict in `components/app-shell.tsx`; curriculum-submissions also in `db/schema.ts`; experience also in the attendance page) |

Results on that partial combination:

- **Migration governance: 913 checks passed.** The chain (0017-0021, 0024, 0025 with the reserved numbers) replays, numbers and timestamps are unique, journal order is monotonic, and every new piece is one statement. One rule needed a fix: the single-trigger rule rejected a legitimate trigger body containing `CASE ... END` (0020); it now requires exactly one closing `END` per trigger (fix committed here, mutation-checked).
- **Authorization matrix, hardening and atomicity suites fail by design**, as drift alarms: the tree has 81 route files (21 new route files, 12 new pages) instead of 60 and 26 new triggers on top of the documented 56, and one new `!==` on an idempotency request hash (`assessment-lifecycle.ts`; a fingerprint of an already authenticated actor's own request, not a secret comparison, to be allowlisted). They must be extended with rows, fixtures and trigger names for the new surface **after** the branches are merged; until then a guarded run of the integrated tree will fail these three suites. This is the intended behaviour of an inventory guard, not a defect in the other branches.
- Whether the new handlers keep the role gate, Origin check, `no-store` and school scope is therefore **not yet tested**.
