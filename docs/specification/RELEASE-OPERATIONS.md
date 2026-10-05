# Saha release operations and support plan

Draft operational plan, 5 October 2026. No release environment, production pipeline, SLA, RPO/RTO or operational owner is established by this documentation. Existing source instructions mention main-triggered synthetic staging, but actual wiring must be verified before relying on it.

## Environment boundaries

| Environment | Data / use | Evidence required |
|---|---|---|
| Local contract testing | Isolated in-memory SQLite with synthetic users and actual route/service code | Tests distinguish D1 raw-row behavior, transactions and session guards |
| Local built Worker | Isolated local workerd/D1 and synthetic session fixture | Migration initialization, served API/browser journey and clean shutdown |
| Hosted synthetic pilot | Proposed authorized environment only | Actual binding/route/callback/provider configuration and hosted run report |
| Real school use | Deferred | Policy/content/identity/privacy/recovery/support and sponsor acceptance |

Secrets and session fixtures never enter Git or documentation exports. Keep provider keys server-side. Empty environment templates do not activate services. School/bootstrap/account mapping requires explicit authorized operator work; no legacy ownership links are inferred by migration.

## Release preparation

Verify the reviewed source commit/PR dependencies, actual deployment wiring and target bindings. Identify database state and migration history. Apply additive migrations only in the authorized environment; preserve prior records and use a recoverable snapshot before real migration. Validate foreign keys/constraints and record counts against the approved reference. Confirm exact allowed origins and provider callback registration. The ORF destination remains disabled until confirmed.

Execute applicable [smoke](SMOKE-TESTS.md), [unit/integration](UNIT-INTEGRATION-TESTS.md), [regression](REGRESSION-PLAN.md), [security/nonfunctional](SECURITY-NONFUNCTIONAL-TESTS.md) and [UAT](UAT.md) gates. Empty layers, synthetic fixtures and local browser success do not establish a hosted provider journey. Record open blocking defects and policy decisions before a release decision.

## Deployment verification and rollback

After an authorized deployment, verify served version/build identity, session behavior, scope-negative reads/writes, resource publication/assignment privacy, current database migration state, configured external app state and operator monitoring. Use synthetic test accounts and approved data only until real usage is authorized.

Rollback must preserve confirmed records and additive schema compatibility. Do not blindly undo applied migrations or delete revisions/receipts. If persistence is uncertain, inspect the authoritative record before retrying. Define and rehearse the operator’s restore/rollback method for the actual environment before real records are stored.

## Recovery and incident handling

Agree backup encryption/location/access, retention, RPO/RTO and a restore verification checklist. Recovery exercise: restore an isolated authorized snapshot, verify schema/foreign keys, reconcile representative immutable versions/assignments/academic records, invalidate or review session handling, and rerun safety smoke tests. Report measured timings and data loss rather than claiming targets that were not set.

An incident record should include run/source/environment, symptoms, impacted workflow, scope, correlation reference, confirmed persistence and containment action without secrets or unnecessary learner data. Prioritize unauthorized disclosure, corrupted records and inability to authenticate. Assign named on-call/escalation owners before pilot. Do not send external messages from automation without explicit authorization.

## Release record template

Record release ID; source/PR/migrations; authorized environment; configuration presence without secret values; test run IDs and results; unresolved decisions/defects; data/recovery evidence; deployment/rollback steps; reviewer and sponsor decision; post-release verification. Retain evidence links and actual limitations.
