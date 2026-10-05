# Saha requirements design and testing documentation

Version 2.6 draft, 5 October 2026. The fifth batch adds a coherent staff result editor, atomic reviewed dirty-only full result/metadata CAS, immutable before/after evidence and exact original retries. The published fourth batch added reviewed attendance and coherent raw summaries. The published third batch added current-scoped dashboards and truthful recording coverage. The published second batch added current structure/report/notice authority, atomic publication receipts and role-appropriate save recovery. This is the current product/specification pack for school administration, AmplifiU-inspired teacher preparation, approved class resources and external oral reading, extended with reviewed accounts/profile ownership, manual curriculum, academic integrity guards, reading corrections/local JSON imports and text/formative work with reviewed submission windows. Source publication, test mapping and document drafting do not establish deployment or business acceptance.

The v2.6 implementation candidate was prepared on `feat/specification-delivery`. `source_commit` records `f31288162e1f55ec28ad710ab990ec56ac37ce3c`, the parent of this documented fifth assessment-review batch, rather than the commit containing its changes. Dated publication and execution records are maintained separately. The v2.0 application baseline remains `5488bc0d20412a3d4be0c031c99c259c56834d5e`; v2.1 evidence and published v2.2 at `82f20ce`, v2.3 at `88205cd`, v2.4 at `85e85d0` and v2.5 at `f312881` remain historical. Every requirement is unapproved and every designed case is `not-run-for-this-specification`.

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
| Data | [Field-level dictionary](DATA-DICTIONARY.md), [CSV export](DATA-DICTIONARY.csv): 39 tables/325 fields; published v2.5 had 37/309; published v2.3/v2.4 had 35/294; historical v2.0 was 20/156, v2.1 was 28/225 and published v2.2 was 34/288 |
| Contracts | [Implemented APIs](API-CONTRACTS.md), [CSV inventory](API-CONTRACTS.csv): 56 route files/91 handlers; published v2.5 had 54/88; published v2.2–v2.4 had 51/84; historical v2.0 was 31/55 and v2.1 was 44/74; [integration contracts](INTEGRATION-CONTRACTS.md) |
| Testing | [Strategy](TEST-STRATEGY.md), [34 scenarios](TEST-SCENARIOS.md), [229 cases CSV](TEST-CASES.csv), [authoritative case JSON](TEST-CASES.json) |
| Test layers | [Smoke](SMOKE-TESTS.md), [unit and integration](UNIT-INTEGRATION-TESTS.md), [regression](REGRESSION-PLAN.md), [security/nonfunctional](SECURITY-NONFUNCTIONAL-TESTS.md), [UAT](UAT.md) |
| Coverage and execution | [Requirement traceability](TRACEABILITY.csv), [execution record](TEST-EXECUTION.md); case design is separate from observed suite execution |
| Governance | [Decisions, assumptions and risks](DECISIONS-RISKS.md), [change control](CHANGE-CONTROL.md), [release/operations](RELEASE-OPERATIONS.md) |

## Review and usage

Sponsor/school leadership reviews BRD and decisions; educators/product reviewers examine FSD and wireframes; engineering/operator reviewers examine HLD/LLD/data/contracts; QA reviews cases and execution gates. A formal approval record needs named reviewers, scope/version, evidence, unresolved defects and decision date. No reviewer has been invented or approval assumed.

The 12-screen wireframe prototype stays a local fictional-data artifact, with no network/API calls or permanent records. The wireframe document maps five v2.1 and three v2.2 implementation screen structures. Every designed case remains `not-run-for-this-specification`, even when a related suite has passed. Current automation mapping is 144 existing/48 planned/37 manual cases; this is coverage context, not 229 case executions. FR-03 is implemented for current actor/record authorization and coherent dashboard snapshots; it remains unapproved and does not add session-hash revalidation after Principal resolution or new historical entitlement. FR-04/09/21/22/24/26 remain partial because wider role/identity/school remapping and family verification, scoring/norms, pilot rights, grade/late/publication and platform-wide audit/retention work remain incomplete. AI and external adapters remain planned.

See [third-batch dashboard delivery boundary](../current/DEVELOPMENT-BATCH-3.md) and [dashboard design](DASHBOARD-DESIGN.md) for the historical dashboard slice; [published second-batch boundary](../current/DEVELOPMENT-BATCH-2.md) covers authority/publication and role-appropriate administration; [earlier specification delivery](../current/SPECIFICATION-DELIVERY.md) remains historical context. Actual new build/suite/served/browser results are recorded by the integrating agent in dated evidence, rather than copied into historical execution counts here.

## Consistency checks

```sh
python3 scripts/check-documentation.py
node scripts/audit-requirements.mjs --check
node scripts/check-specification.mjs
```

The specification check verifies canonical IDs, case/CSV/trace consistency, source paths, current migrated field parity, API inventory and local links. It runs in the standard static test layer. These checks prevent document drift; they do not replace behavioral, hosted, accessibility, recovery or educator acceptance tests.

Identity provider, ORF destination, pilot curriculum/grades/languages, reviewer/publication/correction policy and real operational setup remain open. Use the BRD and decision register as the starting review before approving the next functional change.

The published v2.2 batch and its observed runs remain in [development batch 1](../current/DEVELOPMENT-BATCH-1.md) and the [four-hour continuation](../current/FOUR-HOUR-DEVELOPMENT.md). Those dated execution records do not change designed-case or business approval states.

The published second and third batches have separate dated scope/evidence in [development batch 2](../current/DEVELOPMENT-BATCH-2.md), [development batch 3](../current/DEVELOPMENT-BATCH-3.md) and the continuation log. The [reproduced original-domain review](../current/REMAINING-DOMAIN-REVIEW.md) explains the defects motivating SC-23–SC-25; diagnostic unsafe outcomes are not passing regression checks.

## Fourth-batch attendance design

[Attendance design](ATTENDANCE-DESIGN.md) specifies the three new API route files/four handlers, two immutable evidence tables, exact review/summary DTOs and recovery limits. The reviewed workflow leaves unrecorded statuses blank, compares full saved evidence, appends attributable receipts atomically and returns original exact UUID evidence without replaying later marks. The existing legacy endpoint keeps its accepted replacement semantics and has no backfilled review history. Summary counts are observed rows, never a calculated attendance rate. SC-29–SC-31 add TC-182–TC-205; source/test links do not promote case execution or acceptance.

The published fourth-batch attendance scope is [development batch 4](../current/DEVELOPMENT-BATCH-4.md). Its final observed runs/publication remain root-maintained dated records, separate from this parent-based design and unrun case register.

## Fifth-batch reviewed assessment results

[Assessment design](ASSESSMENT-DESIGN.md) and [diagnostic/remediation boundary](../current/ASSESSMENT-REVIEW.md) specify the separate reviewed workflow and retained legacy compatibility. SC-32–SC-34 add TC-206–TC-229; all remain unrun. The parent f312881 records published fourth-batch provenance, not the commit containing this candidate. Root-maintained dated batch/publication/execution records remain separate.

The current fifth-batch implementation scope is [development batch 5](../current/DEVELOPMENT-BATCH-5.md); published [attendance batch 4](../current/DEVELOPMENT-BATCH-4.md) remains historical. Actual execution/source publication is root-maintained separately.
