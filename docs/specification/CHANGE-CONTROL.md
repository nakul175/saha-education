# Saha documentation and change control

Draft process, 5 October 2026. Purpose: keep business intent, functional behavior, design, data, screens and test evidence aligned as the platform changes. Repository AGENTS/HANDOVER instructions govern source publication and sponsor merge authority. This process does not add a new permission gate to already authorized drafting or development.

The v2.5 implementation candidate was prepared on `feat/specification-delivery`. `source_commit` records `85e85d054afe039d6c633aa215d900b5881eb911`, the parent of this documented fourth attendance batch, rather than the commit containing its changes. Dated publication and execution records are maintained separately. The v2.0 application baseline remains `5488bc0d20412a3d4be0c031c99c259c56834d5e`; v2.1 evidence and published v2.2 at `82f20ce`, v2.3 at `88205cd` and v2.4 at `85e85d0` remain historical. Every requirement is unapproved and every designed case is `not-run-for-this-specification`.

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

The historical `docs/education` baseline retains its original commit reference. The original v2.0 specification used application candidate `5488bc0`; the v2.1 working extension is on `feat/specification-delivery`, based on documentation commit `d53adcf`. For v2.2, canonical JSON `source_commit` records parent `398df9c8bf57659a5fd97718f76fe962011cf7d2` of the documented batch, not the containing commit; delivery_metadata retains the v2.0 baseline and historical v2.1 context. The candidate was uncommitted when this specification was assembled. Do not imply later features existed at that historical SHA. Record the final new source/run reference in dated delivery evidence when publication is complete.

Keep canonical IDs stable. Removing a requirement requires an explicit superseded/removed record rather than quietly reusing its ID. `requirements.json` defines the current register; `TEST-CASES.json` defines case design; CSVs are review exports and must remain consistent. Test execution belongs in a dated run report with environment/source/data/command/result/defects, not a blanket status copied from traceability.

Do not mark acceptance true automatically because code exists, a unit test passes, a related suite has assertions, or a prototype renders. Security-critical failures, uncertain persistence and incomplete provider/environment setup must be visible.

## Checks

Run `python3 scripts/check-documentation.py`, `node scripts/audit-requirements.mjs --check` and `node scripts/check-specification.mjs`. The first two maintain the historical/current docs; the specification check validates new IDs, source paths, links/exports and traceability consistency. These are offline consistency checks, not runtime or educator acceptance.

The historical v2.2 inventory was 34 tables/288 fields, 51 route files/84 handlers, 133 designed cases/22 scenarios, with 12 offline prototype screens. Requirements and every case remain unapproved/unrun; API/data CSVs mirror current saved contracts. Final publication/run facts belong in root-owned dated batch records.

For v2.3, source_commit is `82f20ce9ae023bdb78d53aecc229331b57bce5eb`, the published v2.2 commit and parent of this documented second batch, not its containing commit. Preserve the v2.2 34-table/288-field, 133-case/22-scenario design and execution as historical. Published v2.3 inventory was 35 tables/294 fields, unchanged 51 routes/84 handlers, 157 designed cases/25 scenarios and the same 12 offline prototype screens. All case execution/requirement approval states remain unchanged; publication/run facts belong to separately dated root-owned evidence.

For v2.4, source_commit is `88205cdce71840066d37ebc3a08d317cea7e3f37`, published v2.3 and parent of this documented third dashboard batch. Preserve v2.3's 157-case/25-scenario design and dated execution as historical. Published v2.4 inventory was 35 tables/294 fields and 51 routes/84 handlers; design expands to 181 cases/28 scenarios with 12 offline prototype screens. FR-03 becomes implemented for its specified current authorization/dashboard scope; all approvals remain false and every designed case remains unrun. New session-hash/historical/grade/calendar/provider/operational policies are not implied.

For v2.5, source_commit is `85e85d054afe039d6c633aa215d900b5881eb911`, the published v2.4 parent of this documented fourth attendance batch, not its containing publication commit. Preserve v2.4's 181-case/28-scenario design and dated execution as historical. Current v2.5 inventory is 37 tables/309 fields, 54 route files/88 handlers and 205 designed cases/31 scenarios; mapped 125 existing/47 planned/33 manual. FR-09/FR-26 remain partial for explicit governance/legacy/result/unified-retention gaps. All approvals false and all cases unrun; actual publication/execution root records remain separate. CSVs use LF and mirror current API/schema/case fields exactly.
