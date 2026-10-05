# Platform test strategy

Version 2.8 draft, 5 October 2026. Historical v2.0 source candidate: `5488bc0d20412a3d4be0c031c99c259c56834d5e`. Case design only; no per-case execution or business acceptance is recorded for this specification. Existing-suite verification is recorded separately. Business requirements and approval state are defined in [BRD](BRD.md) and [requirements register](requirements.json).

The v2.8 implementation candidate was prepared on `feat/specification-delivery`. `source_commit` records `e813af2f43f6d7c707f084c4472e5a6da8e50125`, the parent of this documented seventh registry-client batch, rather than the commit containing its changes. Dated publication and execution records are maintained separately. The v2.0 application baseline remains `5488bc0d20412a3d4be0c031c99c259c56834d5e`; v2.1 evidence and published v2.2 at `82f20ce`, v2.3 at `88205cd`, v2.4 at `85e85d0`, v2.5 at `f312881`, v2.6 at `61f0751` and v2.7 at `e813af2` remain historical. Every requirement is unapproved and every designed case is `not-run-for-this-specification`.

## Purpose and scope

Validate identity/access, coherent academic records, original teacher preparation, exact review/distribution and reviewed reading evidence. The working candidate adds reviewed account/profile ownership, live academic batch/pair guards, manual declared curriculum, text/formative evidence with reviewed windows, and preserved readings/corrections/local JSON draft receipts. Verified AI/vendor adapters, existing account role/identity/school remapping, verified licensing, full academic audit, grade/late/family policy and approved pilot decisions remain future scope. Read [FSD](FSD.md), [HLD](HLD.md), [LLD](LLD.md) and [case register](TEST-CASES.json) together; unresolved decisions belong in [decisions/risks](DECISIONS-RISKS.md).

## Four distinct records

1. **Design coverage:** a canonical requirement is linked to one or more concrete cases. All 253 cases here are designed, not executed; the historical v2.0/v2.1 design contained 101.
2. **Existing automation mapping:** evidenceFiles point to existing suite/source/prior-record files. A suite may cover only part of the mapped design case. The runner's layer is a catalogue classification, not a guarantee that a suite is pure unit/integration.
3. **Execution evidence:** revision, environment, migrations, fixtures, command/procedure, timestamp, actual outcomes, sanitized artifacts and defects for an intentional run. Pass requires all expected outcomes; unrun/blocked is not pass.
4. **Business acceptance:** named sponsor/educator/QA/operator decision against approved policies and release scope. Neither source presence nor automation counts establishes it.

## Environments and common fixtures

| Environment | Purpose | Entry requirements | Isolation and exit evidence |
|---|---|---|---|
| In-process Node + SQLite proxy | Deterministic rules, handlers and persistence | Compatible Node/toolchain; installed lockfile; schema migrations; corrected raw-array adapter | Reset disposable DB per suite/case; capture assertions and persisted invariants; close DB |
| Built local workerd + isolated D1 | Runtime/HTTP/session/object scope | Fresh build after code changes; localhost origin; generated synthetic fixtures; explicit local bindings | Local-only test checker; separate disposable state; record build/migrations and HTTP/DB evidence; stop server |
| Local real browser | Staff/learner/print journey | Served environment plus configured test browser and synthetic session fixture | No real credentials/content; observe DOM, errors, full-page navigation and print; close browser/server |
| Approved provider sandbox | Actual HTTPS callback/cookie flow | Named provider/tenant, registered issuer/client/redirect and synthetic accounts | No automatic public registration; private secrets; live flow evidence distinct from injected sessions |
| Proposed AI/adapter sandbox | Future contracts/faults | Approved provider/contract/budget/privacy policy and implemented interface | Mock failures first; no real learner payload or paid activation in this documentation change |
| Recovery/load/accessibility pilot | NFR measurement/drills | Named owner, target/workload/browser or recovery matrix; authorized isolated environment | Measured results with actual workload/targets; no invented SLA or compliance certificate |

Fixture set: schools A/B; administrators A/B; assigned and unassigned teachers; active/withdrawn/completed learners; mapped and unmapped student/guardian identities; linked and unrelated families; own/foreign classes; draft/published reports; private marker notes/answers; original resource v1/v2; exact/changed retry UUIDs; approved/unapproved assignments; valid/invalid reviewed ORF counts. Provider fixtures use real cryptographic signatures with synthetic keys; injected sessions test scope and do not demonstrate provider login.

## Layer entry/exit

| Design layer | Entry | Exit and acceptance limit |
|---|---|---|
| Unit | Isolated rule data and explicit boundary expectations | Deterministic validation/calculation results; no production/runtime inference |
| Integration | Real disposable schema/relationships and handler dependencies | Expected status plus persisted-state/transaction/authority assertions; fault/race cases included |
| Smoke | Offline actual route/migration/session boot; served layer needs fresh build/running Worker | Current offline suite replaces historical placeholder; served P 0 access/privacy/version/domain journeys still need separate execution |
| Regression | Changed-area impact and baseline inventory | Risk-tier selection justified, targeted suite outcomes captured; unchanged assertion counts do not prove correctness |
| Security | Two-school/role/profile matrix and mutation origins | No unauthorized disclosure/mutation; safe errors/logs; callback/replay/claim failures verified |
| Performance | Approved representative volume/concurrency/journey mix | Latency/error/saturation/query metrics measured; acceptance blocked without approved targets |
| Accessibility | Proposed standard and chosen browser/assistive-tech matrix | Keyboard/screen-reader/focus/error/contrast/reflow/print evidence; automated scan is supplemental |
| Recovery | Authorized isolated backup/restore/rollback plan | Integrity and critical journeys verified; measured RPO/RTO versus approved objectives |
| UAT | Approved pilot scope/content/policies, named testers and defect disposition | Recorded actual role journeys and named sponsor/educator decision; no learning-benefit claim |

## Gates

A documentation gate checks IDs, links and export consistency only. A development gate requires fresh build/type checking and applicable deterministic/DB suites. A candidate gate adds served current P 0 smoke and browser journeys. A pilot gate requires real synthetic provider callback, approved roster/profile mappings, educator content/review/correction policies, access/privacy invariants, applicable accessibility/performance and authorized recovery evidence. Planned critical controls cannot be waived merely because their current implementation is absent.

Any unauthorized access, staff-answer disclosure, silent confirmed-data loss/corruption, authentication bypass or wrong-version publication is release-blocking. Record defects by case/requirement, severity, actual evidence, owner and retest. Less critical deferrals need named decision, risk, scope and expiry. Broadening scope changes the case/design baseline before acceptance.

## Evidence and reporting

Record case ID, canonical requirement IDs/BR, tested revision, environment, migration list, fixture revision, steps, actual results, expected-result comparisons, pass/fail/blocked, redacted request/response or browser artifacts, database invariants, defect references, tester/date and reviewer/date. Keep secrets, bearer cookies, learner records and transient databases out of tracked evidence. A separate execution record should identify reused historical evidence explicitly and verify its revision/coverage applicability.

Historical outcomes in [VALIDATION](../../VALIDATION.md) include 482 counted static/unit/integration checks (75 unit, 407 integration), 23 served resource checks and 14 browser checks for the earlier workspace candidate. These are historical aggregate observations, not 101 specification-case passes. An additional existing-suite verification during specification preparation initialized the eleven-suite unit/integration count baseline: `node scripts/test.mjs static unit integration --fast --update-baseline` passed 482 counted assertions (75 unit, 407 integration) and three static steps on 5 October 2026. It reused the separately verified executable build because only documentation changed. This records existing-suite execution, not execution/acceptance of the 101 designed cases. The guarded recheck passed on 5 October 2026 with eleven baselined suites, zero quarantine and the same 482 assertions plus three static steps; [execution record](TEST-EXECUTION.md) and [summary](EXECUTION-SUMMARY.json) retain its evidence. Smoke/manual/future-case coverage is excluded from the baseline. The count guard does not establish semantic completeness or business acceptance. See [regression plan](REGRESSION-PLAN.md).

## v2.2 focused coverage and recovery boundary

SC-19–SC-22 add 32 concrete designs for profile ownership, academic integrity, local reading drafts and submission windows. The register now contains 253 cases across 37 scenarios, mapped 164 existing/49 planned/40 manual. Existing mapping means related automation/source is available; it never populates TC outcome or business approval. Fixture additions include legacy duplicate pairs/bindings, typed current profile revisions, revoked old/new/reviewer sessions, 25-row drafts, stable consumed-result namespaces, rejected/staged/confirmed histories and latest open/closed/future/elapsed policies.

Related current suites are profile-links-contract, academic-integrity-contract, reading-imports-contract, submission-windows-contract and development-recovery-contract under `tests/integration/`. New manually invoked [served checks](../../tests/worker-development-check.mjs) and [browser checks](../../tests/worker-development-ui-check.mjs) use freshly built disposable local Worker/session fixtures. No assertion counts are copied into case statuses. Actual runs/publication are recorded in [batch evidence](../current/DEVELOPMENT-BATCH-1.md).

The populated encrypted local recovery suite restores exact 34-table evidence/index/trigger state and rechecks current scopes/retries/source consumption. Its disposable local roundtrip does not satisfy hosted restore/cutover, key custody/schedule, operational ownership, RPO/RTO or approved recovery procedure. Those remain intentional separate gates.

## v2.3 reproduced-race design

SC-23–SC-25 add TC-134–TC-157: current actor/reference SQL, final joined roster privacy, atomic publication winner/rollback/recipient selection, preserved legacy evidence and notice scope/recovery. Their procedures deliberately inject authority changes between session/prevalidation and actual SELECT/INSERT/UPDATE. Assert row counts, every original field, receipt/report/notice winner identity, rollback and safe response content, rather than relying on HTTP success alone.

Related suites are [structure authority](../../tests/integration/school-structure-authority-contract.mjs), [independent live-domain authority](../../tests/integration/live-domain-authority-contract.mjs) and [report publication](../../tests/integration/report-publication-contract.mjs). [Local served domain checks](../../tests/worker-domain-check.mjs) remain manual environment evidence. No new designed case is promoted by these links or by a historical v2.2 run. Current pack: 253 designed cases/37 scenarios, 164 existing/49 planned/40 manual. Hosted D1, chosen identity provider, real ORF, representative performance, retention and intentional accessibility/educator UAT remain separate gates.

## v2.4 dashboard design and evidence separation

SC-26–SC-28 add TC-158–TC-181 for one-statement current-role/profile/class snapshots, meaningful recording coverage and family observed attendance/published-only limits. The published v2.4 design contained 181 cases/28 scenarios, 104 existing mappings/46 planned/31 manual. All cases remain not-run-for-this-specification and every approval remains false.

Use real synthetic opaque sessions plus actual migrated SQLite and the production Drizzle D1 prepared driver. Inject current actor/link/class/reference changes immediately before actual query execution, assert one executed statement, minimal privacy projection and consistent dependent data. Construct legacy duplicates before migration 0009, then apply remaining guards and compare every original row. Verify zero/max0, partial/no roster, duplicate/invalid evidence, invalid dates/other attendance status, exact cap/cap+1 and nested JSON on D1. Actual Worker/browser output and count/timestamps belong to root-owned dated evidence; diagnostic reproductions and related suite mappings are not executed TC passes. Representative performance and intentional keyboard/screen-reader/educator procedures remain separate.

## v2.5 reviewed attendance test design

SC-29–SC-31 add TC-182–TC-205. Current inventory is 253 designed cases/37 scenarios, mapped 164 existing/49 planned/40 manual; every execution_status remains not-run-for-this-specification and all approvals remain false. Related suites are [primary review](../../tests/integration/attendance-review-contract.mjs), [independent authority/rollback](../../tests/integration/attendance-review-access-contract.mjs) and [coherent summary](../../tests/integration/attendance-summary-contract.mjs). Root records actual suite/build/Worker/browser counts and timestamps separately.

Use actual real synthetic sessions/routes/migrations/SQLite, inject authority and prior-field changes at awaited SELECT/receipt INSERT, compare all confirmed records and immutable evidence, and force a second audit failure to verify full rollback. Test exact calendar and Unicode bounds, dirty/no-op/null/empty/long unchanged notes, 100/101 roster/history, legacy duplicate pairs preserved through 0009, concurrent CAS/UUID arbitration, original retry after legacy replacement/withdrawal and whole-batch transfer hiding. Preserve legacy concurrent 200 and omitted-note-clears assertions. Summary checks cover coherent names/raw counts/current eligibility, minimal family privacy, invalid/other/no-data evidence and honest totals. Browser source is related evidence; intentional assistive/educator procedures and representative capacity/hosted recovery remain pending.

Independent summary [access contract](../../tests/integration/attendance-summary-access-contract.mjs) supplies related actual-session/SQLite/prepared-driver scope/coherence/minimal-field/legacy/cap evidence. This source mapping does not populate any TC outcome or business acceptance.

## v2.6 reviewed result procedures and evidence separation

SC-32–SC-34 add TC-206–TC-229. Current pack: 253 designed cases/37 scenarios, 164 existing/49 planned/40 manual mappings; all execution_status values remain not-run-for-this-specification and all approvals false. [Primary](../../tests/integration/assessment-review-contract.mjs), [independent production-D1 access](../../tests/integration/assessment-review-access-contract.mjs) and [legacy](../../tests/integration/academic-integrity-contract.mjs) suites are candidate evidence links, not intentionally executed TC procedures. Root records actual run counts/time/source/build separately.

Fixtures include exact raw numeric storage types, ±unsafe INTEGER, ±nonfinite REAL, opaque BLOB, malformed maximum/date, preserved preguard duplicates/current cap and original null/empty/long text. Actual SQL hooks change actor/class/assessment/pupil/metadata/records at awaited execution, not merely before service calls. Test mixed new/existing rollback, global untouched-pupil gates, whole-batch transfer privacy, original UUID/reordered concurrency and later legacy replacement. The diagnostic unsafe findings motivating this slice are separate from passes in [review boundary](../current/ASSESSMENT-REVIEW.md).

## v2.7 recovery procedures and honest callback evidence

SC-35–SC-36 add TC-230–TC-245. Current pack: 253 designed cases/37 scenarios, 164 existing/49 planned/40 manual mappings. All cases remain not-run-for-this-specification and approvals remain false. [Independent recovery contracts](../../tests/integration/learner-recovery-ui-contract.mjs) combine actual routes/sessions/production-D1 SQLite with unchanged transpiled callbacks and substituted hooks/elements. This is explicitly not mounted-browser evidence. [Local browser procedures](../../tests/worker-learner-recovery-ui-check.mjs) and accessibility/UAT remain separate. Root records actual final counts/time/source/environment; diagnostic unsafe outcomes receive no passing credit.

## v2.8 registry test layers

SC-37 adds TC-246–TC-253. Current design has 253 cases/37 scenarios: 164 existing, 49 planned and 40 manual mappings, all unrun with approvals false. [Independent contracts](../../tests/integration/registry-ui-contract.mjs) qualify actual route/session/production-D1 SQLite and substituted React/RHF callback evidence; [mounted procedures](../../tests/worker-registry-ui-check.mjs) separately cover real forms/dialog/navigation/mobile. Diagnostic unsafe outcomes are excluded from passing counts. Root maintains final observed counts/times/source separately.
