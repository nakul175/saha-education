# Security and nonfunctional tests

Version 2.1 draft, 5 October 2026. Historical v2.0 source candidate: `5488bc0d20412a3d4be0c031c99c259c56834d5e`. Case design only; no per-case execution or business acceptance is recorded for this specification. Existing-suite verification is recorded separately. Business requirements and approval state are defined in [BRD](BRD.md) and [requirements register](requirements.json).

The v2.1 extensions describe the current working candidate on `feat/specification-delivery`, based on documentation commit `d53adcf`. The original v2.0 application baseline remains `5488bc0d20412a3d4be0c031c99c259c56834d5e`. New behavior is not attributed to that historical SHA; actual execution is recorded separately and all business acceptance remains unapproved.

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

The workload owner must approve school/user/class/resource/version volumes, request mix, concurrency, cold/warm state, duration and intended environment. Record p50/p95/p99 latency, throughput, error/conflict rate, query counts, resource use/cost where available and saturation behavior. Include permission-scoped lists, large histories, concurrent revision/assignment/ORF retries and provider faults; never disable authorization to make results faster.

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
