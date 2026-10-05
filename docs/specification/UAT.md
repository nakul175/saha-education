# Business user acceptance plan

Version 2.9 draft, 6 October 2026. Historical v2.0 source candidate: `5488bc0d20412a3d4be0c031c99c259c56834d5e`. Case design only; no per-case execution or business acceptance is recorded for this specification. Existing-suite verification is recorded separately. Business requirements and approval state are defined in [BRD](BRD.md) and [requirements register](requirements.json).

The v2.9 candidate is prepared on `feat/specification-delivery` from published parent `053ab13af9dcd6fbb81e436769aefa6e29f00a20`. `source_commit` identifies that parent, not the containing implementation/documentation commit. The [eight-hour development record](../current/EIGHT-HOUR-DEVELOPMENT.md) and root-maintained dated execution/release evidence identify actual frozen source, publication, merge and deployment independently. The v2.0 baseline `5488bc0d20412a3d4be0c031c99c259c56834d5e` and published v2.1–v2.8 history remain retained. All requirements are unapproved and all designed cases are `not-run-for-this-specification`.

## Purpose and entry

Validate sponsor-approved pilot workflows with named school administrators, teachers, students/family representatives, educator reviewers, QA and operator. All users/content/data must remain synthetic until approved identity, privacy, correction, retention and operating policies permit real records. The pilot school/curriculum/grade/language, research baseline, review/publisher powers and named signatories are pending.

Entry requires agreed BRD/FSD scope, the relevant implementation and applicable security/integrity checks, a reproducible environment/migration/fixture revision and known defects. A planned feature or policy-dependent workflow is blocked rather than tested through a fabricated interface. Injected-session browser tests validate role journeys but cannot meet live provider sign-in acceptance.

## Acceptance journeys

| Case | Journey | Required people / dependency |
|---|---|---|
| TC-010 | Live synthetic provider/browser callback | Provider operator + mapped synthetic user; registered HTTPS callback pending |
| TC-025 | Roster reconciliation after withdrawals | Educator/sponsor/QA; stated case preconditions and policy decisions |
| TC-030 | Attendance date and attributable corrections | Educator/sponsor/QA; stated case preconditions and policy decisions |
| TC-049 | Approval requires explicit self-review confirmation | Educator/sponsor/QA; stated case preconditions and policy decisions |
| TC-056 | Teacher print edition explicitly opted in | Educator/sponsor/QA; stated case preconditions and policy decisions |
| TC-060 | Confirmed app availability and separate sign-in | Educator/sponsor/QA; stated case preconditions and policy decisions |
| TC-067 | Comparable-task trends and non-diagnostic language | Educator/sponsor/QA; stated case preconditions and policy decisions |
| TC-070 | English/Hindi content and locale completeness | Educator/sponsor/QA; stated case preconditions and policy decisions |
| TC-071 | Language-specific assessment interpretation | Educator/sponsor/QA; stated case preconditions and policy decisions |
| TC-077 | Educator AI content review and disclosure | Educator/sponsor/QA; stated case preconditions and policy decisions |
| TC-096 | School and academic administrator UAT | Educator/sponsor/QA; stated case preconditions and policy decisions |
| TC-097 | Teacher manual preparation and exact-version UAT | Educator/sponsor/QA; stated case preconditions and policy decisions |
| TC-098 | Student approved learning and guardian boundary UAT | Educator/sponsor/QA; stated case preconditions and policy decisions |
| TC-099 | Reviewed ORF interpretation UAT | Educator/sponsor/QA; stated case preconditions and policy decisions |
| TC-101 | Risk-based release acceptance and defect disposition | Educator/sponsor/QA; stated case preconditions and policy decisions |

The case register also supplies supporting security/integration/print/correction procedures. Business acceptance requires the complete chosen journey and agreed expected outcomes, not merely its automated happy path. Test student/guardian negative boundaries alongside authorized experiences. Unsupported guardian assignments must be clearly identified; family report reading does not imply assignment access.

## Business measurement

For BR-03 and BR-12, agree a representative preparation task, baseline method, sample, observer and outcome target before measuring. Record actual elapsed effort and workflow obstacles; no claimed saving without approved comparable baseline. For curriculum/language suitability, educators check correctness, age/grade fit, directions, answer keys, source rights and appropriateness. Original template scaffolds and optional future AI output are not evidence of curriculum approval or learning impact.

For reading, educators confirm the task/scoring/provenance and interpretation boundaries. Numeric ORF rate/accuracy does not demonstrate comprehension, dyslexia risk, validated norms or language equivalence. App availability, source authenticity, corrections and comparable trends are separate acceptance dependencies.

## Execution record template

Record:

- Case/scenario IDs, canonical FR/NFR and BR; pilot scope and approved policy version.
- Tested commit, environment, build, migrations, fixture revision and account role/scope (no raw cookies).
- Tester/observer/date, actual steps, expected-result comparisons and persisted-state checks.
- Redacted screenshots/HTTP evidence, manual educator comments and defects.
- Outcome: pass, fail or blocked; reason and unresolved dependencies.
- Reviewer/approver, date, scope accepted and any explicitly authorized deferral with owner, risk and expiry.

The JSON/CSV design statuses remain not-run; actual execution records are separate controlled artifacts. Approval should reference that executed revision. A future retest after code/policy/provider changes needs its own result and impact review.

## Exit and decision

No critical access/privacy/data integrity/wrong-version defect; approved pilot identity/roster/content/review/correction rules; demonstrated applicable operating/recovery/accessibility/performance evidence; all chosen current journeys executed; future/deferred scope explicit. Require named sponsor and educator sign-off with QA/operator evidence appropriate to release.

If provider, ORF destination, retention, history/correction or recovery prerequisites are missing, record blocked scope and do not label the whole product accepted. Historical 482 checks, 23 served resource cases and 14 browser observations in [VALIDATION](../../VALIDATION.md) support investigation but are not this UAT decision. The newly initialized eleven-suite count baseline records an actual 482-assertion unit/integration run plus three static steps; the guarded recheck passed on 5 October 2026 with eleven baselined suites and zero quarantine. [Execution record](TEST-EXECUTION.md) and [summary](EXECUTION-SUMMARY.json) describe these existing-suite outcomes, which do not execute these UAT cases or supply educator/sponsor approval. No new UAT execution, merge, deployment, learning efficacy or compliance acceptance is claimed.

## v2.2 additional educator and administrator procedures

TC-109 reviews exact profile account ownership/legacy repair with a nominated school administrator; TC-117 reviews duplicate preservation and unresolved academic correction/calendar rules; TC-125 reviews local declared-source reading values/mapping/comparability/rejection with an educator; TC-133 reviews closing-time/current-state/late-policy controls while retaining prior work. Every procedure remains manual and unrun for this specification.

Use fictional data and intentional keyboard, screen-reader, device timezone and mobile review. Confirm staff understand source declarations are user-supplied, preview creates no reading observations, no-op/duplicate/stale choices do not erase evidence, and due date is separate from reviewed cutoff. Record named reviewers/actual environment, issues, unresolved provider/vendor/relationship/pilot decisions and accept/reject scope. Source implementation or related automation is not that decision.

## v2.3 additional intentional review

TC-141: administrators use verified-school course/class creation and existing-school update; teacher/family lists stay usable without admin account lookup and no Create School is offered. TC-149: review saved report before publication; interrupt draft create/publication responses, inspect retained text and stored status and distinguish non-idempotent draft creation from safe same-report publication retry. TC-157: read long personal notices on mobile/keyboard/screen reader, interrupt acknowledgement, inspect retained inbox and same-notice recovery, and review history/retention language separately from current pupil/report entitlement.

The report publication checkbox is a local UI confirmation, not an invented reason/UUID audit contract. Only current administrators mutate reports; supplied grade/summary is not a validated grading engine. Named school/educator reviewers must record language, publication, accessibility and retention decisions. Synthetic suite results and prototype labels do not execute these UAT cases.

## v2.4 intentional dashboard review

TC-180 and TC-181 require nominated reviewers and approved browser/language/assistive targets. Walk all four synthetic roles using native links and Refresh dashboard. Explain absent profile versus absent observation/publication; verify excused-only and unknown attendance status wording, invalid-date flags, partial/no-roster/zero/duplicate/invalid result states and exact totals versus cap. Ask educators whether current-roster recording and school-supplied grades are understandable without implying learning progress or historical completeness.

Record actual judgments, remaining absence/calendar/grade/history policies and defects separately. Current FR-03 implementation status is not educator approval; all 229 TC procedures remain unrun for this specification. Related browser automation or local suite outcomes cannot satisfy this intentional review.

## v2.5 intentional attendance review

TC-203 and TC-205 require nominated staff/family/academic owners and the selected browser/language/assistive matrix. Walk blank unrecorded marks, deliberate status/note changes, exact before/after/actor/reason evidence, no-op and stale conflicts, current roster ambiguity/cap, uncertain original UUID recovery, withdrawal/transfer history limits and saved-with-refresh-failure states. Explain mutable legacy replacements versus immutable reviewed receipts; no old review history is invented.

Review named summary cards, actual saved status counts, no-data/invalid-date/excused/other evidence, currentActive and visible truncation. Ask whether wording avoids a false percentage, expected school-day denominator or learning claim. Record unresolved calendar/date-governance/absence/history/correction/retention and usability decisions explicitly. All 205 designed cases remain unrun until intentionally performed and recorded; no synthetic provider/browser/local execution substitutes for business approval.

## v2.6 educator reviewed-result acceptance

Named educators/sponsor must intentionally walk missing/zero/invalid/duplicate/current-active/withdrawn evidence, supplied grade/feedback, complete before/after, current-authority loss, metadata/result conflict and original retry after later change. Confirm users distinguish original immutable review from current saved result and understand that a blocked/legacy record is not automatically repaired or graded. Record proposed scoring/grade, historical/correction governance, family publication, legacy bypass and retention decisions with scope/date/owner.

TC-224–TC-226 and TC-229 remain manual/unrun; no reviewer, acceptance, learning effect or accessibility certification is invented. Source/browser/SQLite evidence is engineering context only. Providers, hosted deployment and real learner use require separate approved setup.

## Learner recovery acceptance design

TC-243–TC-244 remain manual/unrun. Named reviewers should inspect exact pending retry versus new save, original receipt versus latest history/window, known saved outcome with failed refresh, hidden protected evidence, separate-tab sign-in and explicit authorized reload. Confirm keyboard/status/mobile/locale wording and the page-memory lifetime limitation: full navigation/close is not a durable outbox. No educator, real-provider, live-record or operational acceptance is inferred from callback or local browser suites.

## Historical v2.8 registry acceptance design decisions

TC-253 remains unrun. Named administrators review actual RHF/Radix student dialog and guardian form, search count wording, keyboard/mobile navigation, current-account privacy, known saved versus uncertain delivery and manual comparison instructions. Review page-memory loss and deliberate guardian duplicate risk. Neither callback suites nor mounted synthetic browser checks establish this acceptance. Existing birthday/calendar, account-link/family verification and operational policy remain unresolved where previously partial.

The preceding v2.8 comparison language records historical design; current reviewed creation and exact retry are specified below and in [registry design](REGISTRY-DESIGN.md).

## v2.9 current registry and private synthetic demonstration review

TC-253 adapts its retained ID to current reviewed forms, original receipts and explicit exact retry rather than historical manual comparison. TC-276/TC-277 requires named administrator/educator/operator review of real RHF/Radix form behavior, fresh-scope privacy, uncertain recovery,400409 retained-field review, original-versus-current evidence, keyboard/mobile/focus/status and in-page lifetime. Deliberate different UUID/legacy guardian duplicates are possible; receipt idempotency is not entity or family verification. Birth-date/calendar/retention/deprecation policies remain open.

TC-284/TC-285 requires a genuinely successful private deployment matching frozen source/migrations/settings/isolated database, independently verified outer audience and normal in-app role sessions. Review fictional acknowledgement, all four role journeys, role switching/logout, disabled/unavailable behavior, stored sample edit persistence and zero real-provider/ORF/AI/message activation. Aggregate local/hosted automation never supplies a named UAT decision. Shared sample identities are demonstration accounts, not real viewer or family verification.

Sponsor's final-hour merge/demo authority is recorded in the [eight-hour log](../current/EIGHT-HOUR-DEVELOPMENT.md); it does not approve a real school pilot or populate business/educator acceptance. Require exact version, actual steps/results, named reviewer/date, defects/disposition and explicit open policy decisions before any broader activation. All 293 design procedures stay unrun here.

## Academic selected-scope and restored-account acceptance design

TC-293 requires intentional mounted named review of class/learner changes with late replies, read-only role controls, focusable denied/save messages, private draft/choices/review clearing, rapid entry/duplicate action and old control safety. Interrupt actual enrolment/report-draft save and compare under original current account without blind retry; separately recover original saved-report publication after denied/lost reply and ensure one established receipt/notice. Another actor must never see or release pending private details. Record keyboard/mobile/assistive observations and in-page lifetime/legacy/educational-policy limits; related substituted callback suites cannot approve this unrun procedure.
