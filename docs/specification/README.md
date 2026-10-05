# Saha requirements, design and testing documentation

Version 2.9 draft, 6 October 2026. This is the canonical product/specification pack for school administration, original teacher preparation, approved class learning and external oral reading. The new slice adds token-specific SQL-time session authority, reviewed student/guardian creation with immutable original UUID receipts and a separate default-off isolated synthetic demonstration. Real provider/ORF setup, paid AI, pilot curriculum/licensing and educational/retention/operational policies remain open.

The candidate is prepared on `feat/specification-delivery` from published parent `053ab13af9dcd6fbb81e436769aefa6e29f00a20`; `source_commit` records the parent, not its containing publication. Actual frozen source, runs, final-hour merge and private deployment belong to [the eight-hour record](../current/EIGHT-HOUR-DEVELOPMENT.md) and dated coordinator-maintained execution evidence. Historical v2.0–v2.8 documents/source/evidence remain retained; drafting/source publication does not establish hosted success or business acceptance.

## Read in this order

1. [BRD](BRD.md): business need, outcomes, roles, scope and rules.
2. [FSD](FSD.md): current role journeys, validation, privacy, failures and publication.
3. [HLD](HLD.md): components, data flow, trust boundaries and architecture choices.
4. [LLD](LLD.md): exact service/state/concurrency contracts and identified future proposals.

The [canonical register](requirements.json) retains 12 business requirements and 35 functional/nonfunctional requirements. All approvals remain false. “Implemented” identifies source behavior within a defined contract, not educator/pilot acceptance. Original [education baseline](../education/README.md) and dated [four-hour continuation](../current/FOUR-HOUR-DEVELOPMENT.md) are historical context.

## Supporting documentation

| Pack | Current contents |
|---|---|
| Data | [Dictionary](DATA-DICTIONARY.md) and [CSV](DATA-DICTIONARY.csv):41 migrated tables/338 fields through 0016; lexical SQL and generation metadata boundaries explicit |
| APIs and integrations | [API contracts](API-CONTRACTS.md) and [CSV](API-CONTRACTS.csv):60 route files/96 exported handlers; [integration boundaries](INTEGRATION-CONTRACTS.md) |
| Registry/session/demo | [Reviewed registry design](REGISTRY-DESIGN.md), [original session and synthetic demo design](SESSION-DEMO-DESIGN.md) |
| Academic and learner details | [Dashboards](DASHBOARD-DESIGN.md), [attendance](ATTENDANCE-DESIGN.md), [assessment results](ASSESSMENT-DESIGN.md), [learner recovery](LEARNER-RECOVERY-DESIGN.md), [academic clients](ACADEMIC-UI-DESIGN.md) |
| Screens | [Wireframe mapping](WIREFRAMES.md), [12-screen offline fictional prototype](wireframes/index.html); existing login/roster illustrate current demo/reviewed creation |
| Designed testing | [Strategy](TEST-STRATEGY.md), [42 scenarios](TEST-SCENARIOS.md), [293 authoritative JSON cases](TEST-CASES.json), [matching CSV](TEST-CASES.csv) |
| Test layers | [Smoke](SMOKE-TESTS.md), [unit/integration](UNIT-INTEGRATION-TESTS.md), [regression](REGRESSION-PLAN.md), [security/nonfunctional](SECURITY-NONFUNCTIONAL-TESTS.md), [UAT](UAT.md) |
| Coverage/observations | [Requirement traceability](TRACEABILITY.csv), [dated execution](TEST-EXECUTION.md); candidate mappings never mark a case executed |
| Governance/operations | [Decisions/risks](DECISIONS-RISKS.md), [change control](CHANGE-CONTROL.md), [release/operations](RELEASE-OPERATIONS.md) |

All 293 cases remain `not-run-for-this-specification`. Current automation mapping is 198 existing/50 planned/45 manual; related automation may cover only part of a designed procedure. TC-001–TC-253 retain IDs. Current v2.9 adapts TC-016,TC-201 and SC-37 procedures to new guarded demo/session/registry contracts, with explicit historical boundary; SC-38–SC-42 add 40 new cases. No aggregate assertion or accessibility sample substitutes for intentional case execution, named educator/operator review or business approval.

Reviewed registry screens now use separate UUID creation APIs, preserving legacy non-idempotent POST compatibility. Immutable original receipt remains distinct from current mutable profile; exact authorized retry never reapplies later edited fields. Pending client bytes stay in page memory and can be lost on navigation. The synthetic demo uses fixed fictional role accounts, normal opaque sessions and pristine separate database installation; any real-provider configuration or foreign school/account closes its authority. This is separate from real-school onboarding and the outer private-hosting audience.

## Review and consistency

Sponsor/school leadership reviews BRD and decisions; educators review role/content flows and wireframes; engineering/operators review architecture/contracts/data/operations; QA reviews procedures/traceability and dated actual evidence. Approval requires named reviewer, version/scope, evidence, unresolved defects and decision date. No reviewer or policy approval is invented.

```sh
python3 scripts/check-documentation.py
node scripts/audit-requirements.mjs --check
node scripts/check-specification.mjs
```

These checks verify IDs/links/export/source/migrated-field/API parity. They do not demonstrate actual hosted deployment, real-provider callback, educator content suitability, representative accessibility/performance, recovery or UAT acceptance. Current source inventories and designed counts supersede older design totals; dated historical observations retain their original revision and limits.
