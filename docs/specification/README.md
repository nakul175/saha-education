# Saha requirements design and testing documentation

Version 2.0 draft, 5 October 2026. This is the current product/specification pack for school administration, AmplifiU-inspired teacher preparation, approved class resources and external oral reading. It describes the candidate at `5488bc0d20412a3d4be0c031c99c259c56834d5e`; source publication, test mapping and document drafting do not establish deployment or business acceptance.

## Read in this order

1. [BRD](BRD.md): business purpose, stakeholders, outcomes, scope and business rules.
2. [FSD](FSD.md): role journeys, functional requirements, input rules, failures and publication.
3. [HLD](HLD.md): components, data flows, trust boundaries and architecture decisions.
4. [LLD](LLD.md): exact service contracts, algorithms, state changes, concurrency and proposed future details.

The documents were drafted in that sequence. Testing, data/API documentation and wireframes were developed in parallel against the shared [35-requirement register](requirements.json). All requirements remain unapproved drafts; implemented, partial and proposed behavior are distinguished within each document. The original [education baseline](../education/README.md) is preserved as historical evidence.

## Parallel documentation

| Pack | Contents |
|---|---|
| Screens | [Wireframe specification](WIREFRAMES.md), [clickable local prototype](wireframes/index.html) with nine role/state screens |
| Data | [Field-level dictionary](DATA-DICTIONARY.md), [CSV export](DATA-DICTIONARY.csv): 20 tables and 156 fields |
| Contracts | [Implemented APIs](API-CONTRACTS.md): 31 route files and 55 handlers; [integration contracts](INTEGRATION-CONTRACTS.md) |
| Testing | [Strategy](TEST-STRATEGY.md), [18 scenarios](TEST-SCENARIOS.md), [101 cases CSV](TEST-CASES.csv), [authoritative case JSON](TEST-CASES.json) |
| Test layers | [Smoke](SMOKE-TESTS.md), [unit and integration](UNIT-INTEGRATION-TESTS.md), [regression](REGRESSION-PLAN.md), [security/nonfunctional](SECURITY-NONFUNCTIONAL-TESTS.md), [UAT](UAT.md) |
| Coverage and execution | [Requirement traceability](TRACEABILITY.csv), [execution record](TEST-EXECUTION.md); case design is separate from observed suite execution |
| Governance | [Decisions, assumptions and risks](DECISIONS-RISKS.md), [change control](CHANGE-CONTROL.md), [release/operations](RELEASE-OPERATIONS.md) |

## Review and usage

Sponsor/school leadership reviews BRD and decisions; educators/product reviewers examine FSD and wireframes; engineering/operator reviewers examine HLD/LLD/data/contracts; QA reviews cases and execution gates. A formal approval record needs named reviewers, scope/version, evidence, unresolved defects and decision date. No reviewer has been invented or approval assumed.

The wireframes are a local prototype with fictional data, no network/API calls and no permanent records. Existing implemented screens are separate. Every newly specified case remains `not-run-for-this-specification`, even when a related existing suite has passed. Planned AI, curriculum libraries, submissions, corrections and external adapters do not become implemented because their designs or cases are documented.

## Consistency checks

```sh
python3 scripts/check-documentation.py
node scripts/audit-requirements.mjs --check
node scripts/check-specification.mjs
```

The specification check verifies canonical IDs, case/CSV/trace consistency, source paths, current migrated field parity, API inventory and local links. It runs in the standard static test layer. These checks prevent document drift; they do not replace behavioral, hosted, accessibility, recovery or educator acceptance tests.

Identity provider, ORF destination, pilot curriculum/grades/languages, reviewer/publication/correction policy and real operational setup remain open. Use the BRD and decision register as the starting review before approving the next functional change.
