# Risk-based regression plan

Version 2.11 draft, 6 October 2026. Historical v2.0 source candidate: `5488bc0d20412a3d4be0c031c99c259c56834d5e`. Case design only; no per-case execution or business acceptance is recorded for this specification. Existing-suite verification is recorded separately. Business requirements and approval state are defined in [BRD](BRD.md) and [requirements register](requirements.json).

The v2.11 candidate is prepared on `feat/specification-delivery` from recorded second-batch parent `8088b5f88213401ff900506362c227a55120f3c1`. `source_commit` identifies that parent, not the containing implementation/documentation commit. The [eight-hour development record](../current/EIGHT-HOUR-DEVELOPMENT.md) and root-maintained dated execution/release evidence identify actual frozen source, publication, merge and deployment independently. The v2.0 baseline `5488bc0d20412a3d4be0c031c99c259c56834d5e` and published v2.1–v2.8 history remain retained. All requirements are unapproved and all designed cases are `not-run-for-this-specification`.

## Historical reference, not acceptance baseline

[VALIDATION](../../VALIDATION.md) records the earlier workspace's 482 counted checks (75 unit, 407 integration), 23 served resource scenarios and 14 browser checks. Those different counts reflect suite assertions/scenarios/browser observations, not a one-to-one mapping to this case pack. Those historical records do not constitute execution of the designed case pack. Preserve known scope and reasons for count changes; never treat a count increase as improvement or an unchanged count as absence of regression.

`node scripts/test.mjs --check-catalogue` checks classification; `--list --json` inventories suites. `regression`/`full` aliases and guard baseline support exist in the runner, but absent/placeholder layers or inherited health references must not become education acceptance evidence. The [initial assertion-count baseline](../../tests/regression-baseline.json) was initialized on 5 October 2026 from an actual `node scripts/test.mjs static unit integration --fast --update-baseline` run: 482 counted assertions (75 unit, 407 integration), eleven meaningful suites and three static steps. That initial run covered only eleven unit/integration suites; the then-placeholder smoke, manual served/browser checks and future specification cases were excluded. `tests/quarantine.json` remains absent. The guarded recheck passed on 5 October 2026: eleven baselined suites, zero quarantined suites, 482 assertions (75 unit, 407 integration) and three static steps. [Execution record](TEST-EXECUTION.md) and [machine-readable summary](EXECUTION-SUMMARY.json) record that existing-suite run; the count guard is not semantic completeness or business acceptance. The runner explicitly fails guarded execution with no baseline; test that failure using a disposable repository copy without the baseline, rather than treating the current repository as baseline-free. The count guard checks minimum counts and missing suites, not semantic completeness or business acceptance. Do not automatically update a baseline to conceal missing checks. Review the actual catalogue and available suites before scheduling tiers.

## Tiers and triggers

| Tier | Trigger | Required selection | Exit |
|---|---|---|---|
| R0: document consistency | Requirement/design/case/export changes only | Canonical IDs, links, case JSON/CSV and traceability review | Consistent draft exports; no application pass claim |
| R1: deterministic changed area | Validator, normalizer, identity helper or UI form change | Applicable unit/integration suite plus negative/boundary case subset | Actual changed-rule and persistence evidence |
| R2: authority/data integrity | Session/scope/schema/revision/review/assignment/batch change | All current auth/API/resource/reading/launch contracts; targeted race/fault cases; fresh build | No security/integrity regression; unresolved planned critical gaps explicit |
| R3: served candidate | Runtime/config/router/client or publish/print change | R2 plus local served access/literacy/resource and actual browser workflows | Runtime cookies/scope/version/private-field/navigation verified |
| R4: pilot/release | Provider/environment/backup/adapter/AI/curriculum addition or release decision | Applicable R3 plus real synthetic provider, approved NFR drills and named UAT | Documented owners/targets/defects/business decision; blocked dependencies are not passes |

## Impact selection

Identity changes require forged/expired/disabled/claim/replay/origin cases and every protected page/API family. Role/profile/enrolment changes require linked/unrelated/cross-school and active/historical cases. Resource schema changes require private-field stripping in raw API, author conflicts, immutable review metadata, pinned assignment and exact print versions. Adapter/AI changes add failure/privacy/budget/replay and educator review. Recovery migrations require old unmapped data fail-closed behavior and restored pinned/versioned content.

The observed vinext beta client navigation failure is a specific regression risk: verify resource/learning/print links use usable full-page navigation and that the detail route actually requests data. A successful static build cannot prove navigation. Browser tests must also verify conflict text preserves user edits, print defaults exclude staff fields, and learner DOM never contains hidden answer markers.

## Failure and baseline control

Record first failure and actual fix/retest rather than overwrite it with final success. Classify implementation defect, harness defect, fixture failure or unresolved policy separately. Quarantine only with a named owner, reason, scope and expiry; critical unauthorized access/data loss cannot be accepted through count-baseline edits. Restore disposable state before retest where necessary. Any semantic requirement change updates BRD→FSD→HLD→LLD and case/traceability before release review.

## Working extension impact

The eleven-suite 482-assertion baseline above is historical v2.0 execution evidence. The current baseline file may be expanded only from a reviewed actual new run; consult dated [execution evidence](TEST-EXECUTION.md) and [validation](../../VALIDATION.md) for current source/counts. No final new assertion total is assumed here.

Account changes add explicit provisioning/uniqueness, protected-administrator races, session/status/event atomicity and old-request replay tests. Curriculum changes add private/approved peer visibility, declared-rights bounds, exact-source copy/provenance and rollback/live authority. Attempts/feedback add active-student ownership, pinned version, immutable sequence/collision and staff privacy. Reading changes add original-entry validation-to-write races, preserved correction chains, immutable triggers, exact-task grouping and withdrawal/reassignment scope. Final downstream read/retry selections must also be tested against authority changes between precheck and selection; a previous principal cannot authorize private evidence indefinitely.

The shared streamed JSON parser affects every caller and needs declared-size, chunked overflow, UTF-8/JSON and schema-boundary checks. The resource list retains one scoped latest-version query. Resource-access regression also injects live account/parent authority changes at create, revision, approval, assignment, downstream version and exact-retry statement boundaries; check safe denial, unchanged rows, no fabricated creation and private-field stripping. The admin teacher count uses a direct scoped aggregate, not the capped account list. Offline route smoke now executes meaningful imports/migrations/session denials; served/browser smoke remains a separate required layer.

## v2.2 change impact

Profile changes require prior identity/session/scope regression plus reviewed ownership tests: unlinked ordinary create, same/omitted binding edits, legacy bypass denial, session revocation/reviewer continuity, exact old retry/current state and profile-transfer history privacy. Academic changes require previous API/result privacy plus duplicate-preserving migration, concurrent pair creation, all-member actual-write guards/current max and late-failure rollback.

Reading import changes require existing original reading semantics and correction history regression plus stage/reject zero-observation, exact 25-row confirmation, consumed-source dedup across draft IDs/schools, source receipt preservation, CAS/retry, active enrollment and current creator/class/actor reads.

Submission-window changes require original default/past-due workflow, existing immutable attempts/feedback, current/latest policy, close/expire between validation and INSERT, exact committed replay after closure, later policy preservation, current-authority rechecks and history cap. Recover all new review/provenance states using the populated disposable local encrypted suite, preserving exact indexes/triggers and scope rather than claiming hosted readiness.

Link applicable SC-19–SC-22 procedures and [batch evidence](../current/DEVELOPMENT-BATCH-1.md); all 253 designed cases remain unrun until intentionally executed and recorded.

## v2.3 original-domain preservation

Always retain existing resource/version, profile/session, curriculum, reading/import and attempt/window suites alongside structure/live-domain/publication contracts when common scopes change. Recheck report/notice response shapes, teacher/student/guardian roster intersections, server-owned IDs/time and admin-only forms. Verify no receipt backfill, no historical notice removal, preserved publication time on retry, no notice after denied/losing publication, and complete rollback after a late notice fault. Explicitly distinguish uncertain non-idempotent draft creation from same-report publication retry and repeat acknowledgement preserving first read/update times. No source fix authorizes legacy deletion, role/school transfer or new educator policy.

## v2.4 dashboard regression preservation

Retain older atomic report/notice, academic, reviewed profile, curriculum/resource, attempt/window and reading suites. Add related [focused dashboard](../../tests/integration/dashboard-contract.mjs), [independent dashboard authority](../../tests/integration/dashboard-access-contract.mjs) and [built dashboard UI](../../tests/worker-dashboard-ui-check.mjs) checks against matching fresh source/build. New read projections must not mutate confirmed rows, remove legacy duplicates, publish drafts, introduce a percentage/grade policy or broaden family historical class access.

SC-26–SC-28 remain unrun designs. Compare original legacy rows before/after migration plus read, correct current-role cutoff, exact uncapped totals with bounded lists, nullable invalid maxima, actual zero scores, raw attendance and published-only fields. Build/browser and prior evidence remain dated separately; v2.3 at 88205cd is historical, not a rewritten v2.4 execution record.

## v2.5 reviewed attendance preservation

Select primary/independent reviewed suites, summary suites, old academic integrity, dashboard/access, report/notification/profile link and populated recovery as appropriate. Confirm all original attendance tuple identities/creation fields and legacy duplicate rows survive migration. Legacy concurrent accepted replacements, omitted-note clearing and flexible legacy date contract stay unchanged; no old record receives a fabricated review event. Full-record reviewed CAS, atomic mark/audit failure, immutable history, exact UUID replay after later replacement and current class/school privacy must hold independently.

Retest new recorder/viewer native navigation, selection/date cancellation, explicit confirmation reset, original pending UUID after uncertain or access-denied acknowledgement, conflict reload comparison and confirmed-save refresh failure. Preserve prior v2.4 design/execution separately. SC-29–SC-31 remain designed unrun cases and cannot inherit suite or browser passes; broader assessment correction, calendar/absence/retention and real provider policy stay pending.

## v2.6 reviewed result regression slice

Retain old academic assertions and every confirmed/pre0009 duplicate row. Legacy concurrent result replacements stay 200, omitted grade/feedback clear, legitimate 0 persists and no review backfill appears. New reviewed feedback changes conflict on stale complete records rather than restoring older score/grade; exact old UUID never reapplies values after a later legacy or metadata edit.

Recheck same-school withdrawn original history versus whole-batch transfer denial, live actor/class/reference cutoff, malformed maximum/date, unsafe/nonfinite/blob handling, metadata/time/type CAS and fault rollback of existing/new/result/receipt/events. Include one-SQL coherent reads, current 100/raw 10/history 100 caps, accessible uncertainty/compare and literal date fallback. SC-32–SC-34 remains unrun; [diagnostics](../current/ASSESSMENT-REVIEW.md) are not pass evidence.

## Learner recovery regression boundary

Preserve old submission/window/resource API and immutable evidence tests while adding [original pending recovery](../../tests/integration/learner-recovery-ui-contract.mjs). After lost committed acknowledgement, a later response or open-policy revision must not be overwritten/appended again by stale recovery text. Exact body/UUID/actor survives reload, malformed 2xx,5xx and repeated failure; known denial hides protected views and requires same-actor authorized reload. Known receipt plus failed refresh remains truthful. Mounted-browser/manual evidence is separate from substituted-hook callback tests; SC-35–SC-36 remain unrun.

## Historical v2.8 registry compatibility checks

Retain original student/guardian API thresholds and current-school/private-profile guards. Verify no new create replay/UUID semantics, no binding/transfer/duplicate/date policy changes and no unknown-write repeat. Cover current-scope list/search, superseded replies, same-frame lock, all uncertain outcomes clearing records, original actor-only comparison and known-save/failed-read separation. See SC-37 and [registry design](REGISTRY-DESIGN.md).

## v2.9 focused regression impact

Preserve all prior meaningful suite thresholds and accepted legacy API response/replacement semantics. Include original session SQL execution tests whenever common access predicates or Principal propagation change; test actual token deletion/expiry/owner/exact mapping after earlier awaits with nonempty positive controls and unrelated/new-token controls. JSON/public role forgery remains denied and no sensitive evidence serializes.

Keep reviewed registry and legacy profile cases together: atomic originals, exact/colliding concurrent UUIDs, global admission uniqueness, original current-actor privacy, later profile edits/login links, whole rollback and postcommit denial. Client regression retains all prior scope/search/same-frame/read-failure cases while adapting old manual comparison to current explicit exact retry; correlate receipt timestamps/replay flag, fresh retry preflight and400409/draft resets. Current mounted file differs from retained v2.8 history.

Demo regression separately proves default-off/no-provider bypass, pristine seed claim, fixed roles, no reset/backfill, ordinary session switch, runtime/marker/foreign account closure and zero external calls. Preserve older academic/resource/reading/submission/report/notice scopes and synthetic fixtures. New design total 349 cases/49 scenarios is not a requested assertion-count reduction or execution claim. Broaden after actual failures/source changes and record exact run revision/environment; hosted load, restore and educator/accessibility acceptance remain distinct.

## Academic client regression selection

Keep existing enrolment/report/publication current-authority/legacy compatibility alongside [academic callback suite](../../tests/integration/academic-ui-contract.mjs). Exercise nonempty positive controls, late former selected replies, captured controls/unmount, session preflight/current mutation denial, same-frame action locks, exact rapid draft fields and success correlation. Compare retained record/publication/notice evidence under lost replies and restored original-account recovery. Current non-idempotent enrolment/draft comparison must not be confused with reviewed registry UUID replay or original report publication retry. Mounted browser/assistive and policies remain independently reviewed.

## Family inbox and class regression impact

Retain all notice owner-only/coalesce and class current SQL scope tests while adding [family callbacks](../../tests/integration/family-ui-contract.mjs). Verify saved read times come only from fresh current-owned records, first timestamp survives exact explicit retry, unknown ACK/read failure exposes no previous body and a different actor cannot inspect/retry/dismiss original reminders. Current stored channels remain unchanged with zero delivery. Unmounted late marker acknowledgement must start no private refresh.

Class clients consume one coherent existing snapshot rather than partial child requests. Exercise mixed actor, revoked family link, wrong class/profile school, malformed JSON, route Promise changes, late generation and unmount. Empty availability must not infer absence of other enrolments; repeated profile presentation preserves every legacy row. Family viewer links and staff recorder links remain separate current roles. SC-43–SC-44 stays unrun; mounted/assistive/educator/representative load evidence is independent.

## Manual reading-practice regression boundary

Preserve original manual reading/correction/source/resource services and legacy evidence while composing them in the planner. Compare exact original copy UUID/bytes/source binding under committed uncertainty, restored original scope, later reading corrections/source/resource versions and rejected recovery. Initial known rejection and an already uncertain recovery must remain distinct. No private focus/learner/reading material enters copied content, and no assignment or approval is produced by copying.

Repeat current-scope/obsolete callback/unmount checks after planner changes and existing resource review/assignment/learner-safe edition checks when their code changes. SC-45–SC-46 remain designed/unrun; related callback automation and a hosted demonstration do not establish mounted educational acceptance. The 12-screen fictional prototype and 41/338/60/96 inventories remain unchanged.

## Profile association and assessment index regression selection

Preserve all 329 prior case objects, registry immutable creation receipts, reviewed login ownership, current family/academic services and unchanged staff assessment detail/editor. Add actor/school/route/generation private clearing, empty versus unavailable, exact DOB/date/max display, known acknowledgement plus failed current read and original lost pair retry. Replays must preserve existing pair/primary in isolated SQLite; public DTO cannot support primary browser credit. Started association may persist after unmount; no rollback promise. New design 349/49 is separate from root's next combined suite/build/mounted evidence. No case outcome or acceptance state changes.
