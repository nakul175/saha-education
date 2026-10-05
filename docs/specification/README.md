# Saha requirements design and testing documentation

Version 2.2 draft, 5 October 2026. This is the current product/specification pack for school administration, AmplifiU-inspired teacher preparation, approved class resources and external oral reading, extended with reviewed accounts/profile ownership, manual curriculum, academic integrity guards, reading corrections/local JSON imports and text/formative work with reviewed submission windows. Source publication, test mapping and document drafting do not establish deployment or business acceptance.

The v2.2 implementation candidate was prepared on `feat/specification-delivery`. `source_commit` records `398df9c8bf57659a5fd97718f76fe962011cf7d2`, the parent of this documented batch, rather than the commit containing its changes. The changes were uncommitted when this specification was assembled; dated publication and execution records are maintained separately. The v2.0 application baseline remains `5488bc0d20412a3d4be0c031c99c259c56834d5e`, and v2.1 evidence remains historical. Every requirement is unapproved and every designed case is `not-run-for-this-specification`.

## Read in this order

1. [BRD](BRD.md): business purpose, stakeholders, outcomes, scope and business rules.
2. [FSD](FSD.md): role journeys, functional requirements, input rules, failures and publication.
3. [HLD](HLD.md): components, data flows, trust boundaries and architecture decisions.
4. [LLD](LLD.md): exact service contracts, algorithms, state changes, concurrency and proposed future details.

The documents were drafted in that sequence. Testing, data/API documentation and wireframes were developed in parallel against the shared [35-requirement register](requirements.json). All requirements remain unapproved drafts; implemented, partial and proposed behavior are distinguished within each document. The original [education baseline](../education/README.md) is preserved as historical evidence.

## Parallel documentation

| Pack | Contents |
|---|---|
| Screens | [Wireframe specification](WIREFRAMES.md), [clickable local prototype](wireframes/index.html) with 12 offline role/state screens |
| Data | [Field-level dictionary](DATA-DICTIONARY.md), [CSV export](DATA-DICTIONARY.csv): 34 tables/288 fields; historical v2.0 was 20/156 and v2.1 was 28/225 |
| Contracts | [Implemented APIs](API-CONTRACTS.md), [CSV inventory](API-CONTRACTS.csv): 51 route files/84 handlers; historical v2.0 was 31/55 and v2.1 was 44/74; [integration contracts](INTEGRATION-CONTRACTS.md) |
| Testing | [Strategy](TEST-STRATEGY.md), [22 scenarios](TEST-SCENARIOS.md), [133 cases CSV](TEST-CASES.csv), [authoritative case JSON](TEST-CASES.json) |
| Test layers | [Smoke](SMOKE-TESTS.md), [unit and integration](UNIT-INTEGRATION-TESTS.md), [regression](REGRESSION-PLAN.md), [security/nonfunctional](SECURITY-NONFUNCTIONAL-TESTS.md), [UAT](UAT.md) |
| Coverage and execution | [Requirement traceability](TRACEABILITY.csv), [execution record](TEST-EXECUTION.md); case design is separate from observed suite execution |
| Governance | [Decisions, assumptions and risks](DECISIONS-RISKS.md), [change control](CHANGE-CONTROL.md), [release/operations](RELEASE-OPERATIONS.md) |

## Review and usage

Sponsor/school leadership reviews BRD and decisions; educators/product reviewers examine FSD and wireframes; engineering/operator reviewers examine HLD/LLD/data/contracts; QA reviews cases and execution gates. A formal approval record needs named reviewers, scope/version, evidence, unresolved defects and decision date. No reviewer has been invented or approval assumed.

The 12-screen wireframe prototype stays a local fictional-data artifact, with no network/API calls or permanent records. The wireframe document maps five v2.1 and three v2.2 implementation screen structures. Every designed case remains `not-run-for-this-specification`, even when a related suite has passed. Current automation mapping is 63 existing/44 planned/26 manual cases; this is coverage context, not 133 case executions. FR-04/21/22/24/26 remain partial because wider role/identity/school remapping and family verification, scoring/norms, pilot rights, grade/late/publication and platform-wide audit/retention work remain incomplete. AI and external adapters remain planned.

See [delivery boundary](../current/SPECIFICATION-DELIVERY.md) for the ten implementation workstreams and concrete policy choices. Actual new build/suite/served/browser results are recorded by the integrating agent in dated evidence, rather than copied into historical execution counts here.

## Consistency checks

```sh
python3 scripts/check-documentation.py
node scripts/audit-requirements.mjs --check
node scripts/check-specification.mjs
```

The specification check verifies canonical IDs, case/CSV/trace consistency, source paths, current migrated field parity, API inventory and local links. It runs in the standard static test layer. These checks prevent document drift; they do not replace behavioral, hosted, accessibility, recovery or educator acceptance tests.

Identity provider, ORF destination, pilot curriculum/grades/languages, reviewer/publication/correction policy and real operational setup remain open. Use the BRD and decision register as the starting review before approving the next functional change.

The current documented batch and its observed runs are maintained in [development batch 1](../current/DEVELOPMENT-BATCH-1.md) and the [four-hour continuation](../current/FOUR-HOUR-DEVELOPMENT.md). Those dated execution records do not change designed-case or business approval states.
