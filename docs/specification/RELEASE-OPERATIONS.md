# Saha release operations and support plan

Draft operational plan, updated 5 October 2026. A private synthetic demo Site is now registered, with the coordinator responsible for this timed release. Registration does not establish a deployed version, production pipeline, SLA, approved RPO/RTO or ongoing support owner. Earlier main-triggered staging/freeze statements remain unverified; use [the release readiness audit](../current/RELEASE-READINESS.md) and [hosted verification boundary](../current/HOSTED-STAGING.md).

The historical v2.8 implementation candidate was prepared on `feat/specification-delivery`. Its `source_commit` records `e813af2f43f6d7c707f084c4472e5a6da8e50125`, the parent of the documented seventh registry-client batch, rather than the commit containing its changes. Dated publication and execution records are maintained separately. The v2.0 application baseline remains `5488bc0d20412a3d4be0c031c99c259c56834d5e`; v2.1 evidence and published v2.2 at `82f20ce`, v2.3 at `88205cd`, v2.4 at `85e85d0`, v2.5 at `f312881`, v2.6 at `61f0751` and v2.7 at `e813af2` remain historical. Every requirement is unapproved and every designed case is `not-run-for-this-specification`. The [eight-hour release record](../current/EIGHT-HOUR-DEVELOPMENT.md) governs the subsequent candidate; historical version sections below retain their original scope and limitations.

## Environment boundaries

| Environment | Data / use | Evidence required |
|---|---|---|
| Local contract testing | Isolated in-memory SQLite with synthetic users and actual route/service code | Tests distinguish D1 raw-row behavior, transactions and session guards |
| Local built Worker | Isolated local workerd/D1 and synthetic session fixture | Migration initialization, served API/browser journey and clean shutdown |
| Hosted synthetic demo | Registered private Site; matching version/deployment pending | Actual binding/origin, explicit synthetic enablement, server sessions and hosted run report; real provider remains disabled |
| Real school use | Deferred | Policy/content/identity/privacy/recovery/support and sponsor acceptance |

Secrets/session fixtures never enter Git or documentation exports. Keep provider keys server-side. Empty environment templates do not activate services. School/first-administrator bootstrap and legacy remapping require explicit operator work; later reviewed provisioning/status is school-admin scoped. Migrations 0001/0004–0011 do not infer legacy ownership or invent historical review. New pair guards preserve legacy duplicates.

## Release preparation

Verify the reviewed source commit/PR dependencies, actual deployment wiring and target bindings. Identify database state and migration history. Apply additive migrations only in the authorized environment; preserve prior records and use a recoverable snapshot before real migration. Validate foreign keys/constraints and record counts against the approved reference. Confirm exact allowed origins and provider callback registration. The ORF destination remains disabled until confirmed.

Execute applicable [smoke](SMOKE-TESTS.md), [unit/integration](UNIT-INTEGRATION-TESTS.md), [regression](REGRESSION-PLAN.md), [security/nonfunctional](SECURITY-NONFUNCTIONAL-TESTS.md) and [UAT](UAT.md) gates. Empty layers, synthetic fixtures and local browser success do not establish a hosted provider journey. Record open blocking defects and policy decisions before a release decision.

## Deployment verification and rollback

After an authorized deployment, verify served version/build identity, session/scope negatives, account status/session/evidence atomicity, exact curriculum-copy provenance, pinned text/feedback privacy, preserved reading corrections, publication/assignment privacy, the frozen migration inventory and actual applied state, configured external app state and monitoring. The new working inventory is0000–0016, pending combined validation/publication; inspect the actual target rather than inferring its state from the source journal. Use synthetic test accounts and approved data only until real usage is authorized.

Rollback must preserve confirmed records and additive schema compatibility. Do not blindly undo applied migrations or delete revisions/receipts. If persistence is uncertain, inspect the authoritative record before retrying. Define and rehearse the operator’s restore/rollback method for the actual environment before real records are stored.

## Recovery and incident handling

Agree backup encryption/location/access, retention, RPO/RTO and a restore verification checklist. Recovery exercise: restore an isolated authorized snapshot, verify schema/foreign keys, reconcile representative immutable versions/assignments/academic records, invalidate or review session handling, and rerun safety smoke tests. Report measured timings and data loss rather than claiming targets that were not set.

An incident record should include run/source/environment, symptoms, impacted workflow, scope, correlation reference, confirmed persistence and containment action without secrets or unnecessary learner data. Prioritize unauthorized disclosure, corrupted records and inability to authenticate. Assign named on-call/escalation owners before pilot. Do not send external messages from automation without explicit authorization.

## Release record template

Record release ID; source/PR/migrations; authorized environment; configuration presence without secret values; test run IDs and results; unresolved decisions/defects; data/recovery evidence; deployment/rollback steps; reviewer and sponsor decision; post-release verification. Retain evidence links and actual limitations.

## Current eight-hour release preparation

The sponsor authorized the validated combined release to `main` during 6 October 02:18–03:18 UTC, with the final demo by03:18 UTC. Preserve preceding authentication, literacy, teacher-workspace and specification work through the combined PR; the [ancestry audit](../current/RELEASE-READINESS.md) identifies the documentation commit adapted on import. Recheck remote heads and record the actual merged revision. The repository currently defaults to `rebuild/nextjs`; neither a main merge nor a default-branch setting establishes a hosted Sites version.

Use private Site `appgprj_6ac3f931d31881918ffa33404d3b43a6`, retained in the hosting manifest. The coordinator publishes a matching verified source/archive and records exact source identity, version and deployment identifiers, final successful status and returned URL. The registered origin alone is not a demo result. The legacy Cloudflare staging helper is not the current Education deployment procedure; its absent configuration, health-specific checks and scheduled-handler comments do not supply release evidence.

Additive0015 creates immutable reviewed registry-creation receipts;0016 creates the isolated synthetic installation marker. At the 19:33 UTC audit, all17 SQL files and journal tags agree, and fresh local execution yields41 tables/338 fields, foreign-key check clear and integrity check ok. This packaging diagnostic is separate from guarded checks, browser evidence and remote application. Verify current authority/session, original actor/UUID/payload receipt recovery, current denial/privacy and legacy API compatibility in the frozen combined candidate before publishing.

Snapshots at that audit covered only0000–0003; the coordinator subsequently appended a reconstructed current0016 snapshot without changing the earlier metadata. Coordinator verification confirmed41 tables/338 fields and semantic agreement with fresh migrated SQLite for columns/types/nullability/defaults/composite primary keys/foreign keys/named declared indexes, excluding column order changed by ALTER. Disposable cloned-history generation reported no schema changes and created no migration. Retain these results with dated release evidence and preserve SQL-only triggers/index guards independently. Such metadata does not reconstruct historical deployment proof. Also preserve the known0001–0003 timestamp mismatch: the installed standard Drizzle D1 migrator can skip0002/0003 when resumed after0001, so automatic timestamp-based resume is not verified. Inspect the actual target's applied state and use an explicit safe plan.

The bundled Sites packager includes the complete source migration tree; that proves packaging behavior, not remote migration completion. Migration application precedes Worker upload and may survive a later publish failure. If a failed migration is confirmed unapplied, repair only that precise unapplied delta/metadata and create a new verified version. If the boundary is uncertain, inspect it before retrying or editing history. Never blindly remove confirmed receipts, source rows, applied schema or synthetic installation state to force a deployment.

Keep this demonstration isolated and visibly synthetic, with explicit runtime enablement and actual server-issued sessions/current role and school authority. Missing real-provider configuration must remain closed. Do not use public identity headers or a browser-selected role as real account authority. Real records, recipients, provider activation, paid AI, and the external oral-reading destination require their separate settings and authorization. Record unknown outcomes and retained limitations; hosted deployment does not accept designed cases or education policy.

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

## Eight-hour private demo and family/planner release

The authorized deadline is03:18 UTC6 October2026; merge validated combined source only within02:18–03:18 UTC. First source `a418ee4` is pushed;[second evidence](../current/EIGHT-HOUR-BATCH-2-EXECUTION.json) uses an exact isolated source excluding later profile/index edits. Preserve all applied migrations and private audience. First-source family attendance500 is fixed in source2 with exact guarded class factoring and actual demo200; do not deploy the known first-source failure as final release. New planner creates only an unapproved exact-source draft requiring existing review/assignment. Recovery keeps original in-page requests only. Verify actual hosted origin/cookies, additive migration history, four real synthetic role sessions, read scopes, runtime queries and returned deployment URL before final handover; no real provider/ORF/AI/recipients are activated. The existing external-app RSC return-link failure is corrected; actual final four-role/51-menu/two-staff-backlink review and full49 regression pass. Other child/backlinks require separate future coverage.

## Current eight-hour source and hosted gate

Verified source2 `8088b5f88213401ff900506362c227a55120f3c1` is published. Source3's[actual record](../current/EIGHT-HOUR-BATCH-3-EXECUTION.json) reports19,187 assertions50 suites and36 mounted procedures with unchanged migrations/API/schema. All349 designed cases remain unrun and approvalsfalse. Private saved version1/source8088 failed with incomplete input: SQLITE_ERROR and no URL. The[failure record](../current/HOSTED-DEPLOYMENT-FAILURE.md) preserves exact IDs/archive/source and uncertain applied history. Pause migration edits/identical deterministic retries until the actual failed/unapplied boundary is known; continue unrelated source verification. No hosted readiness or automatic deployment follows from Git publication. Combined release/merge authority begins02:18 UTC and ends03:18 UTC6 October2026.

## Final reconciliation and Claude handover,6 October2026

The isolated school/course application passed a fresh build and the02:52–02:53 UTC combined run:20,952 assertions/52 suites (119 unit,20,656 integration,177 smoke), three static steps and all52 regression minima with zero failures/skips/exemptions. Exact source hashes and40 new school/course plus26 retained structure mounted procedures are in [the final batch record](../current/EIGHT-HOUR-BATCH-4-EXECUTION.json). Stopped manual attempts are excluded; all original meaningful procedures remain. Canonical v2.12 has371 unrun designed cases/51 scenarios and no business approvals. Separate assessment WIP e1283e78 is preserved remotely with partial1476-check evidence, excluded from this source. Usage limits stopped two streams around22:04; queued-heartbeat development progress is not claimed. The user requested verified Git merge and Claude handover; hosting remains failed with incomplete SQL input/no returned URL. PR6 merged as `bdeea544c8fc8d208f4391bac24e506082ea81f7` with exact verified tree equality. Earlier PR2–5 are included/marked merged; PR1 is superseded through its audited adapted documentation. The heartbeat is PAUSED. docs/history/CLAUDE-HANDOVER-2026-10-06.md and docs/current/CLAUDE-HANDOVER-PUBLICATION.json record continuation; earlier source-specific records remain unchanged.
