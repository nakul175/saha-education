# Saha Education handover

## Status

The one place this repository states its current state (verified 8 October 2026 against `origin/main`, the deployment status files and the CI configuration). Dated sections below are history and say so.

| Item | State |
|---|---|
| Application | Next.js 16 / vinext on Cloudflare Workers with D1, verified combined application merged to `main`; v2.12 designs hold unrun cases, so nothing is accepted |
| Hosting | Private copy on the shared DigitalOcean droplet `saha-apps` at https://education.aplyd.org behind a Caddy password wall, synthetic data only; demo sign-in switched on there (deploy kit and switches: [deploy/README.md](deploy/README.md)). Merging to `main` deploys it within about four minutes. The private Sites hosting failure remains unresolved |
| CI | `.github/workflows/ci.yml`, job `verify`: Node 24 (Node 22.22's `node:sqlite` truncates strings at the first NUL and fails one harness-only test), lint baseline (0 errors), typecheck, tests |
| Counts | Not stated here. Designed cases: [docs/specification/TEST-CASES.csv](docs/specification/TEST-CASES.csv); validation record: [VALIDATION.md](VALIDATION.md) |
| Open | Real provider/ORF settings and acceptance (owner), hosted SQL deployment failure on the old Sites host, paid AI and real recipients disabled |
| Entry points | [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md), [docs/DOCUMENTATION-INDEX.md](docs/DOCUMENTATION-INDEX.md); earlier handover notes in [docs/history/](docs/history/) |

The sections below are the accumulated dated updates, newest first where dated, and are kept as written.

## Current update — 8 October 2026

The sponsor approved the Calm workspace redesign and authorized its application-wide merge/deployment. Read [the redesign delivery record](docs/current/CALM-WORKSPACE-REDESIGN.md) first for the new navigation, shared layouts, scoped friendly names, dashboards, resource editor, attendance controls, current test evidence and the private-host verification boundary. The application was merged through [PR30](https://github.com/nakul175/saha-education/pull/30) at `1d3e2cedcce902eac25169928050e90061786a9f`, from tested source `9135113`. All GitHub CI steps passed. The [publication record](docs/current/CALM-WORKSPACE-PUBLICATION.json) distinguishes source merge from unverified hosted deployment. Historical records below retain their original dates and limitations.

## Current delivery

The sponsor requested reconciliation and Claude handover during the authorized final-hour merge window. The [final verified school/course batch](docs/current/EIGHT-HOUR-BATCH-4.md) is merged through PR6 as `bdeea544c8fc8d208f4391bac24e506082ea81f7`; [Claude's handover](docs/history/CLAUDE-HANDOVER-2026-10-06.md) is the next-agent entry point and records exact publication and the paused schedule. Fresh build and final 52 suites/20,952 assertions plus 40 new school/course and 26 retained structure mounted procedures pass. Canonical v2.12 has 371 designed cases/51 scenarios; all unrun and approvalsfalse. The unfinished assessment-detail work is preserved separately on `handoff/assessment-detail-2026-10-06`, commit `e1283e78d7d19f6637c0821304e5a4a5cbd438d6`, with partial 1476-check evidence and no final release credit. The [hosted SQL failure](docs/current/HOSTED-DEPLOYMENT-FAILURE.md) remains unresolved with no returned URL. Existing records below retain their historical source/version boundaries; read the current final publication in Claude's handover first.

**Update, 6 October 2026 (continuation):** the preserved commit was cherry-picked onto main, finished and verified without changing application source; it is no longer unfinished. See [assessment detail completion](docs/current/ASSESSMENT-DETAIL-COMPLETION.md): 53 suites/22,428 assertions on Node 22.22 and 24.19, the mounted procedure 43/43 with 0 external requests and 0 page errors, and mutation checks. Explicit discard sends zero POSTs and does not claim cancellation. The statements above are the original hand-off and are kept for history.

Start with the current [BRD](docs/specification/BRD.md), then [FSD](docs/specification/FSD.md), [HLD](docs/specification/HLD.md) and [LLD](docs/specification/LLD.md). The [specification index](docs/specification/README.md) links the parallel test pack, wireframes, data dictionary, API/integration contracts, risks and operations documents. Read [specification delivery](docs/current/SPECIFICATION-DELIVERY.md), [authentication/access delivery](docs/current/AUTH-ACCESS.md) and [validation](VALIDATION.md) for implementation evidence. The original [education requirements baseline](docs/education/README.md) remains historical; older architecture/data/API documents may contain unsupported statements.

## Implementation boundary

The approved Calm workspace presentation now covers the shared shell and global styles, including formerly detached teaching, reading, account/admin and inbox journeys. Existing server authority and reviewed-save contracts remain. See the [current implementation and verification boundary](docs/current/CALM-WORKSPACE-REDESIGN.md).

Verified OIDC issuer/subject mappings, browser-bound one-use sign-in transactions, opaque digest-stored D1 sessions, live role/school/disabled checks, matching-origin mutation checks, authenticated APIs/page layouts and scoped domain services are implemented. Role cookies/public identity headers confer no authority. Families see linked records and published reports; unpublished assessment results are staff-only. School bootstrap remains explicit operator provisioning.

Student/guardian account ownership now uses the reviewed `/admin/profile-links` workflow with optimistic versions, immutable decisions and atomic affected-session revocation. Legacy profile writes cannot silently relink identities. Original links and student–guardian relationships remain; no automatic history backfill occurs. See [current batch detail](docs/current/DEVELOPMENT-BATCH-1.md).

The separate reviewed attendance editor loads real saved marks and the current active roster, requires explicit dirty changes/reason/confirmation, checks exact original snapshots and atomically saves immutable before/after evidence. Exact committed UUID retries return the original receipt without reapplying marks; conflicts and lost replies retain intended work. The original attendance API retains its existing replacement behavior. The attendance viewer uses one current-scoped snapshot with honest raw counts, calendar-date coverage, invalid-row disclosure and explicit list caps. See [the fourth batch](docs/current/DEVELOPMENT-BATCH-4.md) and [attendance design](docs/specification/ATTENDANCE-DESIGN.md). Representative policy, retention and acceptance remain open.

The reviewed assessment editor uses a current-scoped roster and exact loaded assessment/result snapshots. It preserves zero/null/empty and legacy storage types, blocks unsafe or ambiguous evidence, requires dirty reviewed changes and atomically saves immutable history. Exact UUID retries do not restore older results after later edits. Known access denial hides private current/history data. The assessment list preserves raw calendar dates and labels unsafe maxima for review. The legacy result replacement API retains its previous behavior. See [fifth batch](docs/current/DEVELOPMENT-BATCH-5.md) and [assessment design](docs/specification/ASSESSMENT-DESIGN.md).

Learner, feedback and window actions now keep exact original request bytes/UUIDs independent of refreshed revisions, block another mutation until recovery and show original receipts separately from current history. Known denials hide protected content while a mounted component preserves private pending state. The window delegates sign-in to its parent. Attendance history denial now hides its loaded roster too. Pending state remains in memory; keep the tab open, because hard reload/navigation discards it. See [sixth batch](docs/current/DEVELOPMENT-BATCH-6.md) and [recovery design](docs/specification/LEARNER-RECOVERY-DESIGN.md).

Provider name/tenant/configuration remains pending. Login fails closed without it. No automatic user registration or real recipient/provider activation exists. Migration 0001 intentionally does not backfill legacy relationships; approve and map identities/profile ownership explicitly before usage.

Migrations 0004–0007 add eight tables for account decision/version evidence, curriculum references/versions/source bindings, submission attempts/feedback, and immutable reading corrections. Account administration requires explicit review and a reason, protects self/final-administrator access, and revokes disabled account sessions atomically. It does not remap roles, identities, schools or profiles. Curriculum copying preserves an approved exact source version and creates an unapproved teaching resource. Responses remain bound to the assigned approved version; feedback is reviewed against a specific saved attempt. Corrections append evidence while retaining the original reading observation, including withdrawn same-school history for current authorised staff.

## Verification commands

```sh
node scripts/run-framework.mjs build
node scripts/test.mjs static unit integration --fast
python3 scripts/check-documentation.py
node scripts/audit-requirements.mjs --check
node scripts/check-specification.mjs
node scripts/test.mjs static unit integration smoke --fast --guard
```

Use the manifest's Node/pnpm toolchain; current check environment and actual results are in VALIDATION.md. Fast tests reuse a build; perform a fresh build after code changes. No empty/placeholder test layer is acceptance proof. Served checks are manual and synthetic; see tests/worker-access-check.mjs and its local-only environment requirements.

## Requirement assessment and next delivery

| Requirement | Assessment | Evidence / next boundary |
|---|---|---|
| EDU-F01 | Partial, unapproved | OIDC/session tests pass; real provider and browser callback pending |
| EDU-F02 | Partial, unapproved | Scoped DB/API/served checks pass; full role journey/UAT approval pending |
| EDU-F04/F06 | Partial, unapproved | Explicit identity/profile mapping and reviewed account provisioning/status administration; reviewed profile ownership is implemented; role remapping and real provider lifecycle pending |
| EDU-F11/F12 | Partial, unapproved | Private drafts and retry-safe user-mapped publication notices; policy/UAT pending |
| EDU-N04 | Partial, unapproved | Atomic batches and insert/change pair guards checked; legacy duplicates retained for reviewed repair, broader operational targets remain |
| TCH-01–04 | Partial, unapproved | Structured drafts, immutable revisions, exact-version approval/assignment and learner-safe views; educator/UAT acceptance pending |
| FR-04/21/22/24/26 | Partial, unapproved | Reviewed accounts, manual curriculum source/copy, text/formative attempts and reading corrections implemented; reviewed profile ownership and explicit submission windows are implemented; role remapping, scoring/norms, pilot rights, grades/publication and platform-wide audit/retention remain open |
| BR-01–12; FR-01–26; NFR-01–09 | Draft, unapproved | Current v2.12 has 371 designed cases/51 scenarios, all unrun and unapproved; exact execution records remain separate |
| FR-09 | Partial, unapproved | Reviewed exact attendance snapshots/saves/history and coherent family viewer implemented; school calendars, correction governance, legacy API bypass, retention and UAT remain open |
| FR-10 | Partial, unapproved | Reviewed result snapshots/saves/history and exact conflicts/retries implemented; legacy replacement API, grade/date/correction/retention policy and family publication remain open |
| NFR-05/NFR-06 | Partial, unapproved | Approved Calm workspace design implemented; sampled synthetic browser/responsive checks and source contracts pass. Broader accessibility/educator UAT remains open; [dated evidence](docs/current/CALM-WORKSPACE-REDESIGN.md) |
| Next delivery | Calm workspace application merged to main; private hosted verification pending access | Verify the server deployment status against merged application `1d3e2ce` (or a later main revision with the same application tree). No authenticated server identity/browser session was available. Existing provider/ORF and acceptance boundaries remain; [current handover](docs/current/CALM-WORKSPACE-REDESIGN.md) |

## Remaining product gaps

Teacher/family UI journeys and controls need broader UAT. Academic dates/grade policy, result publication, historical enrolment eligibility, reviewed repair of legacy duplicate pairs, result correction revisions, retention, representative performance/accessibility and operational recovery remain unapproved or incomplete. New pair guards prevent introducing duplicates; they do not delete historical records. Email/SMS delivery remains disabled. A production database/hosting pipeline is not established by the local build.

## Git and release rules

Read AGENTS.md. Commit/push meaningful batches; preserve concurrent work; never force-push. Pull requests target main and require sponsor authority for merge. Main held the legacy Express app before this candidate, so the implementation PR includes the existing rebuild as well as the new stage. Preserve hosting config and historical commits. Confirm actual deployment wiring before merging. Keep secrets, records, fixtures with credentials, databases, caches and generated artifacts out of Git.

## Literacy extension candidate

External ORF launch and append-only manually reviewed reading checks are implemented on `feat/education-literacy-apps`, dependent on the authentication candidate and included in the current candidate. Destination remains blank pending sponsor confirmation; no external SSO/result sync is implemented. Staff UI is `/external-apps`. Migration 0002 is additive. See [external reading](docs/current/EXTERNAL-READING.md) and [AmplifiU teacher workspace plan](docs/current/AMPLIFY-LITERACY-PLAN.md). The sponsor confirmed AmplifiU as the reference teacher AI product. Structured resource drafts/review and class assignments are implemented in the following candidate; confirm the ORF destination and identity provider separately. AI drafting and external result sync remain unimplemented.

## Teacher workspace candidate

Manual lesson/worksheet/quiz/activity drafts, immutable revisions, explicit exact-version review, class assignments and learner views are implemented. Teachers manage their own resources; school administrators manage school resources. Assignments recheck class authority at insertion, preserve the approved version and omit private notes/answer keys from all learner-facing API responses. Staff can print student or explicitly chosen teacher editions. See [teacher workspace](docs/current/TEACHER-WORKSPACE.md) for the earlier scope and [specification delivery](docs/current/SPECIFICATION-DELIVERY.md) for the new manual curriculum source/copy and learner response/formative-feedback extension. AI drafting, vendor curriculum import, grades and external notification delivery remain pending. Templates remain curriculum-neutral until a pilot curriculum is chosen.

## Specification and test pack

Version 2.0 was drafted in BRD → FSD → HLD → LLD order, with parallel QA and contract documentation. The shared register contains 12 business requirements and 35 functional/nonfunctional requirements. The pack includes 101 cases/18 scenarios, smoke/unit/integration/regression/security/nonfunctional/UAT plans, nine clickable wireframe screens, a 20-table/156-field dictionary and 31-route/55-handler API inventory. Planned features and unresolved policies are explicit proposals. No requirement or case has been accepted by document creation.

On 5 October 2026, existing executable suites passed 482 counted checks (75 unit, 407 integration) and three static steps. An actual-run baseline covers eleven meaningful unit/integration suites; its guarded recheck passed with zero quarantine exemptions. Twenty prototype checks passed with desktop/mobile inspection and zero network calls. All 101 newly specified cases remain unrun. See [execution record](docs/specification/TEST-EXECUTION.md) for dates, commands and limits. The placeholder smoke suite is not acceptance evidence.

The following v2.1 implementation slice extends the inventory to 28 tables/225 fields and 44 route files/74 handlers. The fresh build and twenty-suite guarded run passed 1,332 assertions (94 unit, 1,182 integration, 56 meaningful smoke), plus three static steps. Built local checks passed 146 served and 38 browser checks using synthetic sessions. Actual outcomes and discovered fixes are in [validation](VALIDATION.md) and the [sanitized implementation execution record](docs/current/SPECIFICATION-EXECUTION.json). The earlier counts above remain historical; the former placeholder smoke was replaced by executed checks. All 101 designed TC procedures and all business approvals remain unrun/unapproved.

## Four-hour continuation candidate

The first-batch [v2.2 pack](docs/specification/README.md) documents reviewed profile ownership, academic pair/editor safeguards, normalized local reading-import reviews/receipts and explicit submission windows. Migrations 0008–0011 add six tables, giving 34 tables/288 fields and 51 API routes/84 handlers. The [first-batch boundary](docs/current/DEVELOPMENT-BATCH-1.md) explains default unrestricted response access, committed UUID retries after closure, legacy duplicate retention, manual import provenance and remaining last-writer result semantics. The fresh build and 2,302-check guarded run passed, with 172 new served and 57 new browser checks; prior journeys, offline wireframes and populated encrypted local recovery also passed. See [actual first-batch evidence](docs/current/DEVELOPMENT-BATCH-1-EXECUTION.json) and [the continuation log](docs/current/FOUR-HOUR-DEVELOPMENT.md). The remaining-domain review reproduced 16 unsafe outcomes; the next batch addresses their current-authority and report-publication defects. No business acceptance, live-provider activation, merge or hosted deployment is inferred.

## Current authority and publication continuation

The second batch adds a private immutable publication receipt (migration 0012), guarded current-authority reads/writes, atomic report/current guardian notices and role-appropriate school/course/class/report screens. The v2.3 inventory is 35 tables/294 fields, 51 routes/84 handlers and 157 unrun designed cases. Fresh build and 3,619 guarded checks passed, with 104 new served checks, 62 new browser checks and 54 separate automated accessibility samples; prior journeys, prototype and populated local encrypted recovery were also verified. [Scope](docs/current/DEVELOPMENT-BATCH-2.md) and [actual execution evidence](docs/current/DEVELOPMENT-BATCH-2-EXECUTION.json) preserve limits and findings. Dashboard work is next; live provider/ORF, educational policy/UAT and hosted release remain open.

## Coherent dashboard continuation

Third batch adds one current-scoped SQL snapshot per role, honest recorded/missing/ambiguous result coverage, observed attendance counts and bounded published family report summaries. Canonical v2.4 has 181 unrun cases/28 scenarios and unchanged 35 tables/294 fields, 51 routes/84 handlers. Fresh build and 4,168 guarded checks passed (30 meaningful suites), with 31 dashboard browser checks, 62 separate automated accessibility samples and 172/146/104 prior served checks. See [scope](docs/current/DEVELOPMENT-BATCH-3.md), [actual execution](docs/current/DEVELOPMENT-BATCH-3-EXECUTION.json) and [diagnostic/remediation](docs/current/DASHBOARD-REVIEW.md). Reviewed attendance is next; legacy attendance replacement semantics remain unchanged by this batch. All approvals remain false; live providers and hosted release remain pending.


## Four-hour continuation closed on 5 October 2026

The requested 07:27:39–11:27:39 UTC window (12:57:39–16:57:39 India time) is complete. Ten workstreams rotated within the four-agent concurrency limit. Seven tested source batches are pushed; the latest application commit is `7ee7c963575916d35cb0dae388833b1345833471`. Draft[PR6](https://github.com/nakul175/saha-education/pull/6) remains open/unmerged. Final code checks: 15,504 guarded assertions across 39 suites, 30 registry browser procedures, 100 automated WCAG samples, 172/146/104 current served checks and 37 offline prototype checks. Approval/UAT/hostedCI is not inferred.

All workers finished; the local test Worker stopped before cutoff. The matching continuation heartbeat was paused and read backPAUSED during closure at 11:27:53–11:27:59 UTC. No new feature work continued after cutoff. Post-cutoff activity only records/pushes this handover. Application hashes still match final tested source. See[full timed log](docs/current/FOUR-HOUR-DEVELOPMENT.md),[final execution](docs/current/DEVELOPMENT-BATCH-7-EXECUTION.json) and[staging verification boundary](docs/current/HOSTED-STAGING.md).

Next inputs are the named identity provider/tenant and approved ORFURL. Durable client recovery, multi-tab creation protection, academic/pilot policy, educational/UAT, representative accessibility/load and hosted operational verification remain open. All 253 designed cases remain unrun and requirements unapproved. No real learners/messages, provider/paidAI activation, main merge or hosted deployment occurred.

## Overnight demo integration (7 October 2026)

Ten workstreams plus two integration pull requests (#11 to #22) are merged into main. The application now has working pages, server rules and tests for school setup, student and guardian records, courses, classes and enrolment lifecycle, attendance, assessment publication and report cards, reading review and external reading hand-off, curriculum and submission progress, notices and an administrator audit trail, account administration, and a guided synthetic demo school. Final tree: 78 suites, 62,583 assertions, 0 failed; `tsc` and ESLint clean; the first GitHub Actions run passed. Read [the integration record](docs/current/DEMO-integration.md) before relying on any claim: it lists the browser results, the defects found and the open items.

Run the demo locally with `pnpm demo` ([guide](docs/DEMO.md)). A Cloudflare deployment script exists and passes its dry run, but it has **never run against a real account** because no credentials were provided; follow [DEPLOY-CLOUDFLARE](docs/DEPLOY-CLOUDFLARE.md) with a Workers and D1 scoped token. Since 7 October 2026 a private copy runs on the shared DigitalOcean droplet at `https://education.aplyd.org` (Caddy password wall, synthetic data; the demo sign-in was switched on there on 8 October 2026; see [deploy/README.md](deploy/README.md)).

Still true: the 371 designed cases are unrun and nothing is accepted; real identity-provider, ORF, paid AI and real-recipient settings are unprovided and disabled; the private hosted SQL failure is unexplained; several working policies need a named approver (see the record).
