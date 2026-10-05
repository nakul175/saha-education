# Security and nonfunctional tests

Version 2.9 draft, 6 October 2026. Historical v2.0 source candidate: `5488bc0d20412a3d4be0c031c99c259c56834d5e`. Case design only; no per-case execution or business acceptance is recorded for this specification. Existing-suite verification is recorded separately. Business requirements and approval state are defined in [BRD](BRD.md) and [requirements register](requirements.json).

The v2.9 candidate is prepared on `feat/specification-delivery` from published parent `053ab13af9dcd6fbb81e436769aefa6e29f00a20`. `source_commit` identifies that parent, not the containing implementation/documentation commit. The [eight-hour development record](../current/EIGHT-HOUR-DEVELOPMENT.md) and root-maintained dated execution/release evidence identify actual frozen source, publication, merge and deployment independently. The v2.0 baseline `5488bc0d20412a3d4be0c031c99c259c56834d5e` and published v2.1–v2.8 history remain retained. All requirements are unapproved and all designed cases are `not-run-for-this-specification`.

## Mandatory boundaries

Security tests use explicit two-school/role/class/profile/recipient fixtures and inspect the full response plus persisted state. No identity is inferred from role cookies, public headers, email matches, client-selected school or an external app. Same-origin checks protect mutations; cookies are bounded and sensitive responses uncached. Test direct server pages as well as APIs to detect alternative disclosure paths.

Private teacher notes and answer keys must be absent from learner-facing server output, including staff student-edition previews. CSS hiding is insufficient. Draft reports and unpublished assessment results remain outside family visibility. Exact version/authority checks must be exercised during write races, not only before them.

| Case | Test | Layer | Target/policy limit |
|---|---|---|---|
| TC-003 | Wrong issuer, audience or authorized party | security | No unauthorized disclosure/mutation; inspect DB and controlled errors |
| TC-004 | Expired token and missing required claims | security | No unauthorized disclosure/mutation; inspect DB and controlled errors |
| TC-005 | Wrong nonce or browser binding | security | No unauthorized disclosure/mutation; inspect DB and controlled errors |
| TC-007 | Email match cannot provision an account | security | No unauthorized disclosure/mutation; inspect DB and controlled errors |
| TC-012 | Expired, malformed and duplicate cookies | security | No unauthorized disclosure/mutation; inspect DB and controlled errors |
| TC-017 | Cross-school and unassigned-class matrix | security | No unauthorized disclosure/mutation; inspect DB and controlled errors |
| TC-018 | Guardian/student profile ownership | security | No unauthorized disclosure/mutation; inspect DB and controlled errors |
| TC-019 | Mutation Origin and no-store contract | security | No unauthorized disclosure/mutation; inspect DB and controlled errors |
| TC-020 | Safe errors and hostile text | security | No unauthorized disclosure/mutation; inspect DB and controlled errors |
| TC-033 | Report drafts private across all entry points | security | No unauthorized disclosure/mutation; inspect DB and controlled errors |
| TC-041 | Author workspace scoping | security | No unauthorized disclosure/mutation; inspect DB and controlled errors |
| TC-053 | Learner/server response excludes private fields | security | No unauthorized disclosure/mutation; inspect DB and controlled errors |
| TC-059 | External launch family and foreign student denial | security | No unauthorized disclosure/mutation; inspect DB and controlled errors |
| TC-064 | Manual provenance cannot be forged | security | No unauthorized disclosure/mutation; inspect DB and controlled errors |
| TC-074 | AI malformed/truncated/unsafe response rejection | security | No unauthorized disclosure/mutation; inspect DB and controlled errors |
| TC-075 | AI request privacy and source prompt injection | security | No unauthorized disclosure/mutation; inspect DB and controlled errors |
| TC-084 | Credential and learner data absent from logs | security | No unauthorized disclosure/mutation; inspect DB and controlled errors |
| TC-086 | Representative list/query performance baseline | performance | Approved targets and representative workload required |
| TC-087 | Contention and retry performance envelope | performance | Approved targets and representative workload required |
| TC-088 | Keyboard/focus and validation announcements | accessibility | Manual assistive-tech/target review required |
| TC-089 | Screen-reader learner and print accessibility | accessibility | Manual assistive-tech/target review required |
| TC-091 | Local encrypted snapshot/restore verification | recovery | Authorized isolated drill; hosted RPO/RTO pending |
| TC-092 | Wrong key/tampered backup and destination refusal | recovery | Authorized isolated drill; hosted RPO/RTO pending |
| TC-093 | Hosted restore and compatible rollback drill | recovery | Authorized isolated drill; hosted RPO/RTO pending |

Current manual-domain evidence reads and exact retries repeat live account/role/school/identity and object scope in the actual SELECT. Earlier authorization cannot release identity administration evidence, private curriculum versions or learner feedback after an authority change. The dedicated `tests/integration/evidence-access-contract.mjs` injects disablement, demotion, author/class changes and withdrawal immediately before downstream reads, then checks safe denials or empty collections, omitted private fields and preserved rows. This provides related evidence for TC-014/017/019/022/068/078/079; full cross-route designed matrices and broader privacy/logging cases remain separate.

Resource authority changes require the same statement-boundary checks. `tests/integration/resource-access-contract.mjs` injects disablement, role/identity changes and changed parent authorship before create/version/retry/revision/approval/assignment operations and staff/learner feeds. It checks no fabricated success, no new unauthorized rows, preserved reviewed content and absent private fields. Its evidence links are conservative additions to TC-014/017/019/039/041/045/046/051/052/053, without executing those full designed cases.

## Performance design

The workload owner must approve school/user/class/resource/version volumes, request mix, concurrency, cold/warm state, duration and intended environment. Record p 50/p 95/p 99 latency, throughput, error/conflict rate, query counts, resource use/cost where available and saturation behavior. Include permission-scoped lists, large histories, concurrent revision/assignment/ORF retries and provider faults; never disable authorization to make results faster.

No numeric latency, availability, throughput or scale acceptance target is approved here. Unbounded list/history behavior must be measured and addressed under an agreed pagination/query contract. Observation-only results cannot be a performance pass. Rate limits and overload controls must preserve confirmed records and produce controlled failures.

## Accessibility design

WCAG 2.2 AA is a **proposed** target pending sponsor confirmation, not a certification or current compliance claim. Approve browsers/assistive technology and pilot scripts. Combine automated checks with keyboard-only, screen-reader, focus, field-label/error/status announcement, contrast, text zoom/reflow, mobile, long-content and print review. Test creation/conflict/reload/review checkbox, class selection, learner details and exact student/teacher print editions. Report actual criterion findings and defects; automated tool success is supplemental.

## Privacy, language and future providers

Retention, deletion, export, audio/transcript handling and audit corrections need data-owner policy before real records. Logs must correlate failures without secrets, bearer cookies, learner payloads or private answer fields. Synthetic marker data helps verify leaks without real information. Staff-approved content and language interpretation require educator evidence; valid language syntax is not suitable-language content validation.

Future AI/adapter cases exercise untrusted input, provider failure, credential/privacy minimization, repeat/budget limits and explicit teacher review. They remain planned until actual interfaces/providers/contracts exist. No paid activation, automatic signup, result API, shared session, diagnostic classifier or efficacy claim is authorized by the test plan.

## Recovery and operations

The existing [local recovery tool](../../scripts/recovery.mjs) creates/verifies encrypted local SQLite snapshots and refuses destination overwrite. Local correctness cannot establish intended hosted D1 backup availability or recovery objectives. Hosted restore/compatible rollback needs approved environment/operator/backup plan and measured RPO/RTO. Test all current versioned academic/resource/reading relationships and authority after recovery, not only file hashes.

Correlation, support escalation and incident ownership remain design work. Record faults, who acted, containment/recovery and follow-up; do not claim monitoring readiness merely because a request returns a safe error.

## Evidence and release decision

Every case here remains `not-run-for-this-specification`. Record redacted actual evidence, revision/environment/fixtures, measured values, defects and policy dependencies. Authentication bypass, unauthorized disclosure, staff-answer leakage, wrong-version distribution and silent data loss are release-blocking. Performance/accessibility/recovery acceptance requires approved objectives and named reviewer; no pass from an unapproved threshold.

## v2.2 mandatory negative and operational boundaries

Test admin-only exact profile login decisions, no legacy userId bypass, typed target/role/school/identity/occupancy guards, current revision/hash/actor replay, affected sessions with reviewer exclusion, and no past-school event release. No guardian relationship verification or wider identity remap is implied.

Test new academic pair guards without deleting legacy duplicates, ambiguous result full-batch denial and current live actor/class/every learner/max-score checks at actual SQL. Local JSON sources are untrusted input: strict 1–25 rows/128 KiB/exact declared references, no URL fetch/autolink, no hidden score/source spoofing, stage/reject zero observations, all-row terminal/receipt rollback and school-isolated consumed-result uniqueness. Unknown/foreign IDs must never authorize new evidence.

Test window review staff-only, safe student summary/no history metadata, immutable CAS/current-state replay, database-clock latest-policy enforcement on actual attempt insertion, prior committed UUID/feedback preservation and live authority after closure. Clock/timezone labels and page controls need intentional accessibility/pilot review; server scope remains final authority.

[Development recovery](../../tests/integration/development-recovery-contract.mjs) links local encrypted populated restore/privacy/retry evidence to designed recovery cases. Actual host export/cutover, key custody, periodic backup, RPO/RTO, workload, screen-reader and educator policy evidence remain pending. Neither 34 restored tables nor a browser screenshot certifies operational/security/accessibility readiness.

## v2.3 current SQL and publication threats

TC-134–TC-157 cover late account disable/role/school/mapping removal, class reassignment, selected course/teacher eligibility, pupil transfer and actual reviewed guardian/student unlink. Change state immediately before the final target statement and inspect that no stale-school row/private pupil/account field or newly misdirected notice escapes. Root's common scope and each actual mutation are both required; a UI role check or early lookup is insufficient.

A publication receipt uniquely arbitrates the report; its triggers must roll back report and all notices on any failure. Test zero eligible recipient, losing concurrent writer, duplicate guardian mappings, legacy publication without backfill and raw receipt UPDATE/DELETE guards. Notice history remains recipient-owned after unlink, independently of current report entitlement; retention/deletion approval is unresolved. The live predicate checks matching current ID/role/school and nonempty trusted identity, but cannot compare a prior issuer/subject absent from Principal; arbitrary identity remapping is not an implemented capability.

Related actual SQLite/session/D1/localhost checks do not establish representative load, full screen-reader compliance, hosted backup/key custody, real provider operations or production readiness. Every designed case remains unrun.

## v2.4 dashboard security and nonfunctional matrix

SC-26–SC-28 require current actor ID/role/school/enabled/nonempty mapping on the actual SELECT, current explicit family ownership/class relationships and published-only reports. Lost actor is null/denied, not a zero metric. A one-query snapshot must omit old names/admission/class IDs after current relation loss and exclude family raw results, private notes/drafts/summaries, reading evidence and identity secrets. Quoted/HTML/Unicode stored text remains literal and escaped.

The prepared D1 driver checks JSON objects/empty arrays and bound count; a single statement/capped output is not a measured performance target. Capacity TC-179 remains planned. Native links, role/status headings, long-text mobile wrapping and explicit counts/no-data/limits have designed accessibility TC-180 and educator TC-181, intentionally unrun. No session-hash revocation guarantee after Principal resolution, historical-entitlement expansion, norm/efficacy or compliance/accessibility certification is added.

## v2.5 reviewed attendance threat and limit matrix

TC-182–TC-201 require role/body/origin denial, strict explicit evidence, actual-SQL actor/class/active pupil guards, full-record CAS, global cap/legacy ambiguity recheck, one-winner/one-UUID arbitration, whole-batch history transfer hiding and no private summary fields. Disable/demotion/school/mapping/reassignment changes must reach the actual awaited statement, not only an earlier mock validation. Unexpected mid-audit failures roll back marks, receipt and entries. A durable commit can precede denied readback; never disclose old evidence or imply failure means rollback.

Reason validation counts Unicode code points matching SQL length, including short emoji rejection as 400; unchanged oversized legacy notes are preserved only with exact full saved evidence. Every unrecorded status remains blank/null until deliberate review. Summary has no notes/account/birth date, percentage or school-calendar denominator; invalid/unknown stored evidence remains visible as counts/flags. Capped response length does not establish bounded SQL workload or SLA. TC-203 accessible recorder/recovery, TC-204 measured capacity/recovery and TC-205 educator procedures remain unrun; privacy/retention/assistive/browser targets require named review.

## v2.6 reviewed result security and capacity gates

Cover role denial before malformed body, real opaque session/current mapping, matching origin, strict explicit evidence/128 KiB bounds, raw numeric truth and SQL-time actor/reference/pupil loss on read/write/replay/history. Unsafe INTEGER/nonfinite REAL/BLOB cannot become rounded CAS/default zero/false null. Original receipt lookup checks current staff/original class/all original pupil schools; remaining-pupil filter never leaks transferred batch, private hash/envelope/account identity never serialize.

Inject fault after result writes but before all immutable entries, assert entire receipt/new/existing result rollback, verify UPDATE/DELETE triggers and current postcommit readback denial with durable rows. v2.9 private verified-object evidence revalidates original token/expiry/exact issuer-subject at actual SQL without public sensitive fields. Trusted unmarked internal callers retain account-scoped compatibility. Local prepared D1/Worker/synthetic checks do not approve representative latency, assistive access, retention, hosted recovery/key custody or educator policy. TC-228/TC-229 remain planned/manual unrun gates.

## Client recovery privacy and authority

TC-234–TC-235/238–TC-242 exercise known 401/403/404 hiding, exact original actor binding, role/feed refresh, obsolete response cancellation and current200/history 403 partial-view invalidation. Pending body/UUID stays private in page memory and cannot be replayed by another account. Current SQL remains final; client checks do not retract previously delivered content or revalidate session digest after Principal resolution. Temporary history 5xx is distinguished from denial. No response body, private material or identity credential is logged by the focused suite. Mobile/screen-reader/provider/capacity acceptance remains separate.

## Historical v2.8 registry privacy adversaries

Hold an old administrator list response while reloading as guardian; change actor between session/list/session and create preflight; switch cookie after actual POST commit but before 503/network/malformed acknowledgement. Every unavailable/uncertain boundary must clear old private rows/principal/create controls. Different administrators must not see pending identifiers or release comparison. Original actor recovery cannot send a blind POST. These finite synthetic checks do not establish continuous session monitoring, real identity acceptance or hosted performance. See TC-246–TC-253.

## v2.9 token execution, receipt privacy and demo isolation

SC-38–SC-41 requires actual original-session deletion/expiry/owner/exact-identity changes at SQL execution, not only before the API call. Assert nonempty valid controls, no leaked protected marker, no unauthorized persisted parent/child/receipt, no rescue by another same-account session and minimal frozen Principal JSON. Public headers/cookies/body cannot authorize; trusted unmarked internal compatibility must not become a route bypass.

Registry privacy includes immutable original complete snapshot/reason with current original-admin/school scope, no hash/session/identity export, strict role-before-body/origin/128KiB enforcement, known constraint409 versus uncertain unrelated failure and late final-read denial. Original profile changes/links survive replay; page-memory pending values/receipt details hide under other/denied actors. Cross-tab different UUIDs do not constitute entity deduplication. Review plaintext reason/profile retention and export policies separately.

Synthetic runtime must fail closed on invalid/default-off flag/ID, any school-provider setting, nonpristine install, absent/changed marker and foreign school/account issuer/school. Fixed synthetic sign-in follows strict fictional acknowledgement and normal opaque cookie/session checks; outer private-hosting audience remains independent. Source seed has no real recipients/external calls/reset. Test configured threshold/rate failures intentionally; do not infer representative edge/IP integrity, capacity or certification from local contract checks.

Formal accessibility/assistive and educator review, supported-language content, approved scale/latency, hosted key custody/restore/RPO/RTO, incident ownership and real provider/ORF configuration remain separate gates. Current automation and 293 designed cases are traceability context, not business approval.

## Academic actor, selection and pending privacy

SC-42 tests that current class/learner and actor refs constrain captured obsolete controls and late response generations; unmount ignores private inventory. Admin-only mutation controls supplement server role scope, with family draft exclusion and fresh preflight. Actual401/403 publication hides private report/draft/choices/review and old mutation authority. Pending original names/draft/report identity remain hidden from other accounts; only freshly restored original account can reload/compare or explicitly retry original saved-report publication. In-memory lifetime, broader educator/accessibility/retention/history/load/recovery policies remain open.
