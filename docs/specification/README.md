# Saha requirements, design and testing documentation

Version 2.12 draft, 6 October 2026. This is the canonical product/specification pack for school administration, original teacher preparation, approved class learning and external oral reading. The current candidate includes token-specific SQL-time session authority, reviewed student/guardian original UUID receipts, isolated synthetic demonstration and current academic recovery. Current-owned inbox saved-read confirmation and one coherent scoped class/profile viewer remain. Current student profiles/exact-pair guardian association and family assessment metadata remain. This next slice adds verified existing-school dirty-field editing and course catalog/creation with private original-account comparison after uncertain delivery. Staff manual reading-practice planning now connects reviewed observations and exact approved sources to a provisional resource copy with original-request recovery; focus/evidence remain private and are never injected into copied content. Real provider/ORF setup, paid AI, pilot curriculum/licensing and educational/retention/operational policies remain open.

The candidate is prepared on `feat/specification-delivery` from recorded documentation-followup parent `23c2d8f3e8bc3d6e9154f138992a66ce456c0b77`; `source_commit` records the parent, not its containing publication. Actual frozen source, runs, final-hour merge and private deployment belong to [the eight-hour record](../current/EIGHT-HOUR-DEVELOPMENT.md) and dated coordinator-maintained execution evidence. Historical v2.0–v2.8 documents/source/evidence remain retained; drafting/source publication does not establish hosted success or business acceptance.

## Read in this order

1. [BRD](BRD.md): business need, outcomes, roles, scope and rules.
2. [FSD](FSD.md): current role journeys, validation, privacy, failures and publication.
3. [HLD](HLD.md): components, data flow, trust boundaries and architecture choices.
4. [LLD](LLD.md): exact service/state/concurrency contracts and identified future proposals.

The [canonical register](requirements.json) retains 12 business requirements and 35 functional/nonfunctional requirements. All approvals remain false. “Implemented” identifies source behavior within a defined contract, not educator/pilot acceptance. Original [education baseline](../education/README.md) and dated [four-hour continuation](../current/FOUR-HOUR-DEVELOPMENT.md) are historical context.

## Supporting documentation

| Pack | Current contents |
|---|---|
| Data | [Dictionary](DATA-DICTIONARY.md) and [CSV](DATA-DICTIONARY.csv): 63 migrated tables/540 fields through 0025 in the CSV (the Markdown has field tables for 54 of them); lexical SQL and generation metadata boundaries explicit |
| APIs and integrations | [API contracts](API-CONTRACTS.md) and [CSV](API-CONTRACTS.csv): 103 route files/150 exported handlers; [integration boundaries](INTEGRATION-CONTRACTS.md) |
| Registry/session/demo | [Reviewed registry design](REGISTRY-DESIGN.md), [original session and synthetic demo design](SESSION-DEMO-DESIGN.md) |
| Academic and learner details | [Dashboards](DASHBOARD-DESIGN.md), [attendance](ATTENDANCE-DESIGN.md), [assessment results](ASSESSMENT-DESIGN.md), [learner recovery](LEARNER-RECOVERY-DESIGN.md), [academic clients](ACADEMIC-UI-DESIGN.md), [family views](FAMILY-UI-DESIGN.md), [manual reading practice](READING-PRACTICE-DESIGN.md), [profiles and assessment index](PROFILE-ASSESSMENT-UI-DESIGN.md), [current school/course recovery](SCHOOL-COURSE-UI-DESIGN.md) |
| Screens | [Wireframe mapping](WIREFRAMES.md), [12-screen offline fictional prototype](wireframes/index.html); existing login/roster illustrate current demo/reviewed creation |
| Designed testing | [Strategy](TEST-STRATEGY.md), [51 scenarios](TEST-SCENARIOS.md), [371 authoritative JSON cases](TEST-CASES.json), [matching CSV](TEST-CASES.csv) |
| Test layers | [Smoke](SMOKE-TESTS.md), [unit/integration](UNIT-INTEGRATION-TESTS.md), [regression](REGRESSION-PLAN.md), [security/nonfunctional](SECURITY-NONFUNCTIONAL-TESTS.md), [UAT](UAT.md) |
| Coverage/observations | [Requirement traceability](TRACEABILITY.csv), [dated execution](TEST-EXECUTION.md); candidate mappings never mark a case executed |
| Governance/operations | [Decisions/risks](DECISIONS-RISKS.md), [change control](CHANGE-CONTROL.md), [release/operations](RELEASE-OPERATIONS.md) |

All 371 cases remain `not-run-for-this-specification`. Current automation mapping is 268 existing/50 planned/53 manual; related automation may cover only part of a designed procedure. TC-001–TC-329 retain their exact v2.10 case objects and IDs. Historical v2.9 adapted TC-016,TC-201 and SC-37 procedures to new guarded demo/session/registry contracts, with explicit historical boundary; SC-38–SC-42 added 40 cases to v2.9; SC-43–SC-44 add 20 family procedures and SC-45–SC-46 add 16 manual planning/recovery procedures. Historical SC-47–SC-49 appended 20 profile/association/index procedures. SC-50–SC-51 append 22 current school/course procedures, preserving all 349 v2.11 objects exactly. TC-156 retains its explicitly identified historical v2.3 UI procedure; SC-43 supplies current hiding/recovery design. No aggregate assertion or accessibility sample substitutes for intentional case execution, named educator/operator review or business approval.

Reviewed registry screens now use separate UUID creation APIs, preserving legacy non-idempotent POST compatibility. Immutable original receipt remains distinct from current mutable profile; exact authorized retry never reapplies later edited fields. Pending client bytes stay in page memory and can be lost on navigation. The synthetic demo uses fixed fictional role accounts, normal opaque sessions and pristine separate database installation; any real-provider configuration or foreign school/account closes its authority. This is separate from real-school onboarding and the outer private-hosting audience.

## Review and consistency

Sponsor/school leadership reviews BRD and decisions; educators review role/content flows and wireframes; engineering/operators review architecture/contracts/data/operations; QA reviews procedures/traceability and dated actual evidence. Approval requires named reviewer, version/scope, evidence, unresolved defects and decision date. No reviewer or policy approval is invented.

```sh
python3 scripts/check-documentation.py
node scripts/audit-requirements.mjs --check
node scripts/check-specification.mjs
```

These checks verify IDs/links/export/source/migrated-field/API parity. They do not demonstrate actual hosted deployment, real-provider callback, educator content suitability, representative accessibility/performance, recovery or UAT acceptance. Current source inventories and designed counts supersede older design totals; dated historical observations retain their original revision and limits.

For intentional matching localhost review, use the frozen [family class/inbox browser procedure](../../tests/worker-family-ui-check.mjs); its 36 planned procedures are separate from substituted callback suites and named acceptance. It uses private fictional sessions, creates only five suffix-owned in_app notices, marks three guardian-owned suffix notices and preserves base records. It requires no prior reading procedure. Actual dated outcomes belong to the coordinator-maintained execution records; procedure links do not promote designed case statuses or approvals.

For this slice the [new 40 school/course mounted procedures](../../tests/worker-school-course-ui-check.mjs) are frozen and UNRUN at design freeze; coordinator-owned retained 26 structure adaptation/build/readiness and exact actual outcomes remain separate. Current school/course APIs add no UUID/CAS/immutable receipt. Known ordinary acknowledgements differ from current reads; unknown writes use private original-only read-only comparison with zero-mutation completion, global-code/null-intent limits and no durable page memory.

## Current presentation update — 8 October 2026

The sponsor-approved [Calm workspace implementation](../current/CALM-WORKSPACE-REDESIGN.md) replaces the older visual shell across role journeys. It adds no schema or domain permission. NFR-05/NFR-06 remain partial and unapproved; the sampled responsive/browser and source-contract evidence is separate from all 371 designed cases. Historical wireframes, test procedures and version records retain their original source boundaries.
