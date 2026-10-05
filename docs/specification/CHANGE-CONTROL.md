# Saha documentation and change control

Draft process, 5 October 2026. Purpose: keep business intent, functional behavior, design, data, screens and test evidence aligned as the platform changes. Repository AGENTS/HANDOVER instructions govern source publication and sponsor merge authority. This process does not add a new permission gate to already authorized drafting or development.

## Document sequence and responsibilities

| Artifact | Primary question | Proposed review responsibility |
|---|---|---|
| BRD | Why is the work needed and what business scope/outcomes apply? | Sponsor and school leadership |
| FSD / requirement register | What does each role do, including failures and publication rules? | Product owner and educator representatives |
| HLD | How do components, boundaries and systems fit together? | Engineering and operator |
| LLD / API / data dictionary | What exact contracts, invariants and algorithms implement the behavior? | Implementer and technical reviewer |
| Wireframes | Can each role understand and complete the intended flow? | Educator/staff/learner usability reviewers |
| Test pack / traceability | How will each requirement be exercised and evidenced? | QA and acceptance reviewers |
| Execution and release evidence | What actually ran, with which environment/data and limitations? | QA, operator and sponsor |

BRD is drafted first, followed by FSD, then HLD, then LLD. Test/data/wireframe work proceeds in parallel against the shared register. All documents in this pack remain drafts until the relevant reviewers record a decision; drafting the next document is not implied approval of the prior one.

## Change path

1. Record the requested behavior, scope and affected business/functional IDs. Preserve prior source/evidence.
2. Update BRD/FSD only where intent or behavior changes; record unresolved policy in the decision register.
3. Update HLD/LLD, API/data constraints, wireframes and integration state affected by that change. Distinguish implemented, proposed and unavailable behavior locally.
4. Revise cases and requirement-to-case/evidence mappings. A suite citation is not a passed case or business acceptance.
5. Implement the authorized change with source-grounded review, affected checks and recorded failures/limits.
6. Commit/push the meaningful batch and open/update its review PR. Merge/deployment remains subject to repository sponsor authority and verified environment wiring.
7. After authorized deployment, execute applicable hosted/pilot checks, attach run evidence and record release/acceptance decision.

## Version and evidence rules

The historical `docs/education` baseline retains its original commit reference. This specification pack is version 2.0 draft, tied to candidate `5488bc0`. Do not edit source commit references to imply that later features existed in that baseline. Record a new source/run reference when behavior changes.

Keep canonical IDs stable. Removing a requirement requires an explicit superseded/removed record rather than quietly reusing its ID. `requirements.json` defines the current register; `TEST-CASES.json` defines case design; CSVs are review exports and must remain consistent. Test execution belongs in a dated run report with environment/source/data/command/result/defects, not a blanket status copied from traceability.

Do not mark acceptance true automatically because code exists, a unit test passes, a related suite has assertions, or a prototype renders. Security-critical failures, uncertain persistence and incomplete provider/environment setup must be visible.

## Checks

Run `python3 scripts/check-documentation.py`, `node scripts/audit-requirements.mjs --check` and `node scripts/check-specification.mjs`. The first two maintain the historical/current docs; the specification check validates new IDs, source paths, links/exports and traceability consistency. These are offline consistency checks, not runtime or educator acceptance.
