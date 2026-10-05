# Saha release operations and support plan

Draft operational plan, 5 October 2026. No release environment, production pipeline, SLA, RPO/RTO or operational owner is established by this documentation. Existing source instructions mention main-triggered synthetic staging, but actual wiring must be verified before relying on it.

The v2.8 implementation candidate was prepared on `feat/specification-delivery`. `source_commit` records `e813af2f43f6d7c707f084c4472e5a6da8e50125`, the parent of this documented seventh registry-client batch, rather than the commit containing its changes. Dated publication and execution records are maintained separately. The v2.0 application baseline remains `5488bc0d20412a3d4be0c031c99c259c56834d5e`; v2.1 evidence and published v2.2 at `82f20ce`, v2.3 at `88205cd`, v2.4 at `85e85d0`, v2.5 at `f312881`, v2.6 at `61f0751` and v2.7 at `e813af2` remain historical. Every requirement is unapproved and every designed case is `not-run-for-this-specification`.

## Environment boundaries

| Environment | Data / use | Evidence required |
|---|---|---|
| Local contract testing | Isolated in-memory SQLite with synthetic users and actual route/service code | Tests distinguish D1 raw-row behavior, transactions and session guards |
| Local built Worker | Isolated local workerd/D1 and synthetic session fixture | Migration initialization, served API/browser journey and clean shutdown |
| Hosted synthetic pilot | Proposed authorized environment only | Actual binding/route/callback/provider configuration and hosted run report |
| Real school use | Deferred | Policy/content/identity/privacy/recovery/support and sponsor acceptance |

Secrets/session fixtures never enter Git or documentation exports. Keep provider keys server-side. Empty environment templates do not activate services. School/first-administrator bootstrap and legacy remapping require explicit operator work; later reviewed provisioning/status is school-admin scoped. Migrations 0001/0004–0011 do not infer legacy ownership or invent historical review. New pair guards preserve legacy duplicates.

## Release preparation

Verify the reviewed source commit/PR dependencies, actual deployment wiring and target bindings. Identify database state and migration history. Apply additive migrations only in the authorized environment; preserve prior records and use a recoverable snapshot before real migration. Validate foreign keys/constraints and record counts against the approved reference. Confirm exact allowed origins and provider callback registration. The ORF destination remains disabled until confirmed.

Execute applicable [smoke](SMOKE-TESTS.md), [unit/integration](UNIT-INTEGRATION-TESTS.md), [regression](REGRESSION-PLAN.md), [security/nonfunctional](SECURITY-NONFUNCTIONAL-TESTS.md) and [UAT](UAT.md) gates. Empty layers, synthetic fixtures and local browser success do not establish a hosted provider journey. Record open blocking defects and policy decisions before a release decision.

## Deployment verification and rollback

After an authorized deployment, verify served version/build identity, session/scope negatives, account status/session/evidence atomicity, exact curriculum-copy provenance, pinned text/feedback privacy, preserved reading corrections, publication/assignment privacy, all migrations 0000–0014 and actual journal state, configured external app state and monitoring. Use synthetic test accounts and approved data only until real usage is authorized.

Rollback must preserve confirmed records and additive schema compatibility. Do not blindly undo applied migrations or delete revisions/receipts. If persistence is uncertain, inspect the authoritative record before retrying. Define and rehearse the operator’s restore/rollback method for the actual environment before real records are stored.

## Recovery and incident handling

Agree backup encryption/location/access, retention, RPO/RTO and a restore verification checklist. Recovery exercise: restore an isolated authorized snapshot, verify schema/foreign keys, reconcile representative immutable versions/assignments/academic records, invalidate or review session handling, and rerun safety smoke tests. Report measured timings and data loss rather than claiming targets that were not set.

An incident record should include run/source/environment, symptoms, impacted workflow, scope, correlation reference, confirmed persistence and containment action without secrets or unnecessary learner data. Prioritize unauthorized disclosure, corrupted records and inability to authenticate. Assign named on-call/escalation owners before pilot. Do not send external messages from automation without explicit authorization.

## Release record template

Record release ID; source/PR/migrations; authorized environment; configuration presence without secret values; test run IDs and results; unresolved decisions/defects; data/recovery evidence; deployment/rollback steps; reviewer and sponsor decision; post-release verification. Retain evidence links and actual limitations.

## v2.2 migration, review and recovery verification

Trace: FR-04/FR-06/FR-08–FR-10/FR-20/FR-24–FR-26; NFR-01–NFR-03/NFR-07–NFR-09. Validate schema re-exports and journal against applied 0011, with 34 tables/288 columns. Migration 0008 adds typed profile versions/immutable events plus new guardian binding guards;0009 adds non-destructive academic pair triggers/indexes;0010 adds reading draft/item/receipt lifecycle triggers;0011 adds immutable submission-window reviews. Apply only in an explicitly authorized isolated environment and preserve confirmed rows/applied migrations.

Verify profile decision/binding/version/old-new session deletion atomicity, reviewing-admin continuity, and denied legacy bypass. Confirm ordinary writes cannot revert concurrent reviewed links. Reconcile existing duplicates without deleting them; ambiguous result batches fail safely. Validate actual all-member attendance/results after withdrawal, actor/class change and lowered score maximum.

For imports, verify stage/reject creates zero observations; confirmed receipts exactly match original normalized values and every item->check; duplicate consumption across drafts rolls back all rows/decision and remains staged. A retry preserves UUID and stored outcome, never relabels user-declared source as verified vendor. For windows, verify default unrestricted/current latest revision, database-clock cutoff on actual attempt write, exact committed replay after closure, later policy preservation and current-authorized feedback.

[Development recovery suite](../../tests/integration/development-recovery-contract.mjs) exercises existing [local encrypted recovery implementation](../../scripts/recovery.mjs) using disposable populated data, exact restored schema/rows and current/retry/privacy boundaries. It is related candidate evidence, not a completed designed TC procedure or hosted recovery capability. Hosted export/cutover, backup location/schedule/key custody, operational ownership and approved RPO/RTO remain unestablished. Restore must preserve triggers/indexes, original reviews/receipts and disabled-session behavior, not merely table counts.

Use [batch execution evidence](../current/DEVELOPMENT-BATCH-1.md) and [continuation record](../current/FOUR-HOUR-DEVELOPMENT.md) for actual dated outcomes/publication. Production activation, external messaging, real records and release acceptance require their own decisions.

## v2.3 additive migration and uncertainty checks

Before a candidate local run, apply exact additive migration 0012 with FK enforcement and verify 35 tables/294 fields, private receipt schema/index and authority/commit/immutability triggers. A populated legacy fixture must retain every published report/notice unchanged and have no backfilled receipt. Preserve migration order, original records and declared external-provider disablement.

Verify a new publication has one receipt with authenticated actor/student/school/time, original report stamp and only current eligible deterministic guardian notices. Inject zero-row/revoked/losing/failing publication and prove no orphan or partial notices; a late notice fault rolls back the whole statement. Recheck SQLite, production D1 adapter and separately served local Worker behavior, including retries and family privacy. Include receipts/triggers in future operational recovery design; source/migration checks do not themselves execute hosted export, cutover, key custody or schedule drills.

An uncertain report draft-create response may already have committed: reload and inspect before creating another. Publication can retry the same report without adding recipients/notices; acknowledgement repeats preserve first read/update times. Historical notices are not deleted after unlink. Root owns dated actual build/test/browser/publication evidence in the continuation log; no acceptance/deployment or retention decision is implied by this draft.

See [second-batch scope and dated evidence boundary](../current/DEVELOPMENT-BATCH-2.md) for integration/publication progress. Historical v2.2 evidence remains separate.

## v2.4 dashboard release and support boundary

No migration/API/provider is added: 35 SQL tables/294 fields and 51 routes/84 handlers remain. Build the matching server service/four pages, prepare only synthetic local fixtures, and verify current role/link/class changes, raw observed counts, coverage warnings, bounded lists/exact totals and native navigation. Preserve prior batch source/evidence, confirmed rows and legacy duplicate guards. Root maintains third-batch build/suite/Worker/browser execution with actual revision/time/count/limits.

If a dashboard warns needs-review, route legacy data review through existing administrator/educator process; do not choose a score or delete a duplicate automatically. Treat unavailability/failed refresh separately from no observations. `asOf` is the SQL cutoff, and later relation/session changes require new resolution/read. Session-only revocation after resolved Principal is not a live-actor snapshot guarantee. Representative capacity, retention, incident owners, chosen provider/ORF and hosted release remain unresolved gates.

## v2.5 attendance migration and recovery preparation

Verify additive 0013, new receipt/entry schema/indexes/real-date CHECK, actual current-authority/CAS commit triggers and immutable-row guards, with 37 tables/309 fields and 54 route files/88 handlers. Preserve every old attendance row and applied migration; no legacy receipt backfill or destructive duplicate reconciliation. Build matching recorder/viewer/services and use only disposable synthetic local sessions/records until the intended environment and school policies are approved.

Reconcile a successful reviewed batch to exact before/after snapshots, current mark identities/creation time, authenticated reviewer/reason and one durable UUID. Inject stale actor/class/active member/prior-field/cap/ambiguity and mid-audit failures; verify no partial state. Retry original after legacy replacement/withdrawal without reapplication. Loss of scope after commit must hide acknowledgement while retaining durable evidence. A populated recovery should preserve marks/receipts/entries/immutable guards, full-batch current-school history privacy and original UUID replay; local encrypted roundtrip is separate from hosted export/cutover/key custody/schedule/RPO/RTO proof.

Root owns actual dated build/suite/Worker/browser/recovery records and current batch scope. Catalogue/source links do not accept designed cases. Operator/academic owners must separately agree capacity, correction/calendar/absence, historical scope, retention and support responsibilities before real records. No live provider, ORF, deployment or external delivery is activated.

## v2.6 reviewed-result release and recovery boundary

Verify additive 0014 against39 tables/325 fields and 56 route files/91 handlers,10-field receipts/six-field entries, indexes, full current-authority/CAS/commit triggers and immutable UPDATE/DELETE blocks. Preserve applied migrations/old results/duplicates; no destructive cleanup or fabricated legacy audit. Build current service/detail/list/raw date helper together and verify production D1 RETURNING/trigger behavior plus prior compatibility.

Populate disposable encrypted local recovery with original reviewed result and later legacy edit; restore exact inventory/indexes/triggers/evidence and test original UUID replay/current privacy/immutability without reapplying old values. Local restore does not prove hosted export/cutover, key custody, schedules, support SLA or approved RTO/RPO. Root owns dated actual evidence. Real provider/ORF, grade/publication/correction/retention policy and intentional acceptance remain release gates.

## Learner pending recovery support boundary

An unresolved original UUID/body is held only in the current page. Keep the page open and sign in in another tab when required; reload under the original current authorized actor before exact retry. Do not advise retyping retained text as a new request merely because the latest attempt/policy changed. A valid original receipt stays saved even if current readback fails; respect hidden private evidence after denial. Browser close/navigation loses local state and requires scoped support investigation rather than a fabricated durable replay guarantee. No schema/deployment/provider/key/retention change accompanies this slice.

## v2.8 registry operational boundary

For an uncertain registry creation, do not repeat the original create. Reload with the original authorized administrator, compare submitted identifiers against saved list data, and explicitly start a blank draft only after comparison. Hard reload/navigation discards private reminders; the slice supplies no durable reconciliation or automatic deduplication. Keep synthetic callback/browser evidence and diagnostic failures separate from approval/live identity/hosted checks. No migration is introduced.
