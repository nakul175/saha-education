# Saha documentation and change control

Version 2.11 draft process, 6 October 2026. Purpose: keep business intent, functional behavior, design, data, screens and test evidence aligned as the platform changes. Repository AGENTS/HANDOVER instructions govern source publication and sponsor merge authority. This process does not add a new permission gate to already authorized drafting or development.

The v2.11 candidate is prepared on `feat/specification-delivery` from recorded second-batch parent `8088b5f88213401ff900506362c227a55120f3c1`. `source_commit` identifies that parent, not the containing implementation/documentation commit. The [eight-hour development record](../current/EIGHT-HOUR-DEVELOPMENT.md) and root-maintained dated execution/release evidence identify actual frozen source, publication, merge and deployment independently. The v2.0 baseline `5488bc0d20412a3d4be0c031c99c259c56834d5e` and published v2.1–v2.8 history remain retained. All requirements are unapproved and all designed cases are `not-run-for-this-specification`.

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

The historical `docs/education` baseline retains its original commit reference. The original v2.0 specification used application candidate `5488bc0`; the v2.1 working extension is on `feat/specification-delivery`, based on documentation commit `d53adcf`. For v2.2, canonical JSON `source_commit` records parent `398 df9c8bf57659a5fd97718f76fe962011cf7d2` of the documented batch, not the containing commit; delivery_metadata retains the v2.0 baseline and historical v2.1 context. The candidate was uncommitted when this specification was assembled. Do not imply later features existed at that historical SHA. Record the final new source/run reference in dated delivery evidence when publication is complete.

Keep canonical IDs stable. Removing a requirement requires an explicit superseded/removed record rather than quietly reusing its ID. `requirements.json` defines the current register; `TEST-CASES.json` defines case design; CSVs are review exports and must remain consistent. Test execution belongs in a dated run report with environment/source/data/command/result/defects, not a blanket status copied from traceability.

Do not mark acceptance true automatically because code exists, a unit test passes, a related suite has assertions, or a prototype renders. Security-critical failures, uncertain persistence and incomplete provider/environment setup must be visible.

## Checks

Run `python3 scripts/check-documentation.py`, `node scripts/audit-requirements.mjs --check` and `node scripts/check-specification.mjs`. The first two maintain the historical/current docs; the specification check validates new IDs, source paths, links/exports and traceability consistency. These are offline consistency checks, not runtime or educator acceptance.

The historical v2.2 inventory was 34 tables/288 fields, 51 route files/84 handlers, 133 designed cases/22 scenarios, with 12 offline prototype screens. Requirements and every case remain unapproved/unrun; API/data CSVs mirror current saved contracts. Final publication/run facts belong in root-owned dated batch records.

For v2.3, source_commit is `82f20ce9ae023bdb78d53aecc229331b57bce5eb`, the published v2.2 commit and parent of this documented second batch, not its containing commit. Preserve the v2.2 34-table/288-field, 133-case/22-scenario design and execution as historical. Published v2.3 inventory was 35 tables/294 fields, unchanged 51 routes/84 handlers, 157 designed cases/25 scenarios and the same 12 offline prototype screens. All case execution/requirement approval states remain unchanged; publication/run facts belong to separately dated root-owned evidence.

For v2.4, source_commit is `88205cdce71840066d37ebc3a08d317cea7e3f37`, published v2.3 and parent of this documented third dashboard batch. Preserve v2.3's 157-case/25-scenario design and dated execution as historical. Published v2.4 inventory was 35 tables/294 fields and 51 routes/84 handlers; design expands to 181 cases/28 scenarios with 12 offline prototype screens. FR-03 becomes implemented for its specified current authorization/dashboard scope; all approvals remain false and every designed case remains unrun. New session-hash/historical/grade/calendar/provider/operational policies are not implied.

For historical v2.5, source_commit was `85e85d054afe039d6c633aa215d900b5881eb911`, the published v2.4 parent of this documented fourth attendance batch, not its containing publication commit. Preserve v2.4's 181-case/28-scenario design and dated execution as historical. Historical v2.5 inventory was 37 tables/309 fields, 54 route files/88 handlers and 205 designed cases/31 scenarios; mapped 125 existing/47 planned/33 manual. FR-09/FR-26 remain partial for explicit governance/legacy/result/unified-retention gaps. All approvals false and all cases unrun; actual publication/execution root records remain separate. CSVs use LF and mirror current API/schema/case fields exactly.

## v2.6 parent-based assessment review change control

The published fifth design recorded fourth-batch parent f31288162e1f55ec28ad710ab990ec56ac37ce3c, not its containing publication commit 61f0751. It retained 39 tables/325 fields, 56 routes/91 handlers and 229 designed cases/34 scenarios, 144 existing/48 planned/37 manual mappings. Preserve its unrun design and dated actual execution alongside v2.5 and earlier history. The historical sixth pack is identified separately below.

Impact touches coherent staff result reads, separate atomic reviews/history and detail/list recovery/calendar rendering. Legacy accepted replacement200/omitted-text semantics, raw original tuples and educational/provider/publication policy remain unchanged. Record actual unsafe-number fail-first fix separately from earlier diagnostic outcomes; root owns final publication/build/Worker/browser/recovery counts. CSVs use LF and preserve exact source/case/API/schema parity.

## Sixth-batch client recovery change boundary

Parent 61f0751 identifies the published fifth batch, not the commit containing this recovery candidate. No schema/route/handler change: 39 tables/325 fields/56 route files/91 handlers. SC-35–SC-36 added 16 designed procedures; historical v2.7 245 cases/36 scenarios remain unrun with all approvals false. Reproduced unsafe callbacks, actual route/session/D1 callback-state regression, mounted-browser/accessibility and real acceptance remain separate evidence. Publication/build/execution are root-maintained dated records.

## v2.8 seventh registry client change control

Parent e813af2f43f6d7c707f084c4472e5a6da8e50125 identifies published v2.7, not the commit containing this seventh client slice. Inventory stays 39 tables/325 fields/56 routes/91 handlers; design is 253 cases/37 scenarios, 164 existing/49 planned/40 manual mappings. Keep historical v2.7 245 cases/36 scenarios and its dated evidence separate. Approvals false and all cases unrun; source publication and actual execution remain root-maintained. No backend/profile/date/idempotency policy is added.

## Historical v2.9 documentation baseline

Published parent 053ab13 identifies the input to this new candidate, not its containing implementation/documentation commit. The v2.9 dictionary/API inventory was 41 tables/338 fields and 60 route files/96 handlers, with 12 offline fictional prototype screens. Its design contained 293 cases/42 scenarios, mapped 198 existing/50 planned/45 manual. Preserve all old requirement/case IDs and draft approval/outcome states.

SC-38–SC-41 adds 32 new meaningful procedures. TC-016 is clarified as forged role/session selection rather than denial of the separately installed legitimate synthetic demo. TC-201 now expects SQL-time original-session/exact-identity checks. TC-249/250/252/253 and SC-37 retain IDs but adapt v2.8 non-idempotent UI comparison to current reviewed UUID/receipt recovery; historical v2.8 source/outcomes remain dated history. Related source links and counts never mark designed procedures executed.

New 0015/0016 append original registry/installation schema; full 0016 generation metadata is current while historical files remain unchanged. No applied migration, legacy profile/academic row or older receipt is rewritten/backfilled. Actual lexical SQL parity and historical journal ordering risk are explicit. Root owns final combined source/run/merge/deployment/operations records. Release permission in the eighth hour does not waive named real-school provider/curriculum/ORF/AI/retention/UAT gates.

## Additional frozen academic UI scope in v2.9

The combined first candidate also includes current enrolment/report selected-scope/privacy/recovery clients. SC-42 appends TC-286–TC-293 without renumbering older cases; v2.9 total 293 cases/42 scenarios, 198 existing/50 planned/45 manual. All remain unrun and requirements unapproved. FR-08/FR-11 wording now states current selected-scope safety and distinct non-idempotent comparison versus exact original publication retry. No schema/API/educational/legacy UUID/CAS policy change; current inventory stays 41 tables/338 fields and 60 routes/96 handlers. Actual root execution/release evidence remains separate.

## Family next-batch specification change control

Version 2.10 retains TC-001–TC-293 case objects/IDs and every `not-run-for-this-specification` status/false approval. SC-43–SC-44 adds 20 current inbox/class cases from frozen source; no route/handler/table/field is added (41/338/60/96 unchanged). Canonical Markdown/JSON/CSV/traceability and source-screen mappings move together. Historical v2.9 observations and earlier source records retain their own revisions.

The frozen staff-only manual reading-practice page adds SC-45–SC-46 / TC-314–TC-329 after source inspection. Combined design is 329 cases/46 scenarios, mapped 230 existing/50 planned/49 manual, with unchanged 35 requirements and 41/338/60/96 inventories. Original TC-001–TC-293 objects remain preserved. No speculative pedagogy, verified source rights, provider or AI behavior is promoted. Coordinator-owned actual execution/release records identify verified source/build/commit/deployment independently. A publication parent change updates source_commit consistently without claiming the current pack contains its own hash. Named reviewer evidence is required for acceptance; none is invented by the next batch.

## v2.11 profile and assessment index change control

Recorded parent `8088b5f88213401ff900506362c227a55120f3c1` contains the second-batch v2.10 pack; its original source parent `a418ee4132bfc05d24748ad1d25c5fa5b91b7d69` remains historical. Current source_commit identifies 8088 as intended next-batch parent, not the containing v2.11 commit or a main merge. Root owns separately dated publication/deployment/merge and actual execution records.

All 329 v2.10 case objects are preserved exactly. SC-47–SC-49 append 20 cases TC-330–TC-349; current design 349 cases/49 scenarios, 248 existing/50 planned/51 manual. 12 business and 35 functional/nonfunctional requirements, 41 tables/338 fields/60 routes/96 handlers and 12 fictional offline prototype screens remain. All approvals false/all designed cases unrun. New focused profile/index design and current role/journey/data/API prose distinguish existing exact-pair replay from immutable registry receipts, known acknowledgement from failed current read, mounted memory from durable recovery, raw dates and family metadata/report navigation from private result access. API inventory correction initializes new primary 0 but preserves existing primary on replay; no service contract/schema is changed.

Frozen mounted 36 procedure SHA256 `237d5760223224ec7189f0244ad6111104db29aada6fc9bd80a6cfd00d07f007` remains UNRUN at design freeze. Public link DTO omits isPrimary; browser pair/readback/no-duplicate is distinct from actual SQLite primary persistence. Source observations 422/44/465 plus prior academic 218/lint/tsc do not establish combined next build/mounted pass, provider/hosted/pilot or canonical case acceptance. Exact Markdown/CSV/register/traceability parity and historical-case preservation are checked independently.

Subsequent mounted-procedure metadata: the corrected procedure revision SHA256 `0fc5d8442235b8b4d41e674481c9cffd59e9a09dae2f86d7edec605c7c84deda` executed 36/36 procedures successfully on the matching isolated local fictional Worker at 2026-10-05 21:28:58.298 UTC. The historical `237d5760223224ec7189f0244ad6111104db29aada6fc9bd80a6cfd00d07f007` design freeze above remains retained; app and callback source are unchanged. The coordinator-owned [batch-3 execution record](../current/EIGHT-HOUR-BATCH-3-EXECUTION.json) records actual readiness, procedure corrections, outcomes and limits separately. All 349 canonical cases remain `not-run-for-this-specification` and all business/requirement approvals remain false. This local mounted run grants no public-DTO primary, hosted/provider, screen-reader or business acceptance credit.
