# Specification implementation delivery

Draft implementation candidate on `feat/specification-delivery`, based on documentation commit `d53adcf` and application source `5488bc0`. The sponsor requested implementation from the BRD → FSD → HLD → LLD pack on 5 October 2026. This authorizes building the next slice; requirement acceptance, live providers, merge and deployment remain separate decisions.

## Ten workstreams

The session supports four concurrent agents including the integrating agent. Ten delegated workstreams run in successive groups of three, with integration and verification continuing alongside them. Shared files and migration numbers have explicit owners.

| Workstream | Scope | Requirement |
|---|---|---|
| 1 | Reviewed identity provisioning, enablement/disablement and administration evidence | FR-04, FR-02, FR-26 |
| 2 | Manual versioned curriculum references, exact review and provisional resource copies | FR-22, FR-13, FR-26 |
| 3 | Immutable learner attempts and reviewed formative feedback | FR-24, FR-17, FR-26 |
| 4 | Attributable reading corrections and comparable observation history | FR-21, FR-20, FR-26 |
| 5 | Account-administration screens | FR-04 |
| 6 | Curriculum library screens and draft selection | FR-22, FR-13 |
| 7 | Learner submission and staff feedback screens | FR-24 |
| 8 | Reading review/history screens | FR-21 |
| 9 | Independent security, integration, regression and local smoke verification | NFR-01, NFR-02, NFR-09 |
| 10 | Design/data/API/test traceability and delivery documentation updates | NFR-09 |

## Implementation choices for this slice

- School administrators provision explicit issuer/subject/role mappings after confirmation, and enable/disable accounts with an attributable reason. Existing roles, issuer/subject mappings and school remain immutable through this new UI; no implicit profile relinking or provider activation occurs.
- Curriculum references are manually authored with permission/source statements. Reviews apply to exact immutable versions. Copying a reviewed reference creates an unapproved resource and preserves its source-version binding. No licensed curriculum or vendor import is inferred.
- Submissions are plain text and reference the assigned approved resource version. Active enrolment is required. Due dates remain informational until a submission-window policy is agreed. Feedback is formative and explicitly reviewed; no automatic grades or family publication is introduced.
- Reading corrections retain original observations and append actor, reason, time and replacement metrics. Comparable history groups matching task/language/duration; no norms, diagnoses or learning-efficacy claims are inferred.
- New original reading entry rechecks live actor/current class/school and active enrolment in its INSERT SELECT; earlier validation cannot authorize a stale write. Reading correction/history uses the current original-class staff and same-school learner, preserving withdrawn observations without loosening original-entry rules.
- Account decisions use an atomic status/session/event/revision batch and private attempt markers to prevent old retries from reapplying a prior state. Roles/issuer/subject/school stay immutable; self/final-administrator access is protected. Display caps are 500 accounts and 200 latest events, not totals or a complete archive.
- All new request envelopes are strict. The common parser streams at most 128 KiB of JSON and rejects invalid declared length, malformed encoding/JSON and oversized content. Current mutation and downstream evidence-read predicates check live authority.
- Resource creation/revision/review/assignment statements and downstream version/retry reads now repeat current enabled account/role/school/identity and parent authority in SQL. Creation returns actual inserted rows or an exact scoped original retry; revoked, demoted or changed-author access cannot reveal private versions. Assignment replay/feed preserves current class/enrolment scope and strips private staff fields. The dedicated resource-access contract supplies related synthetic evidence without changing case execution or acceptance.
- The resource list uses one scoped latest-version query; the administrator dashboard counts enabled teachers in a scoped aggregate. Capacity/latency targets remain unmeasured; other libraries/feedback lists still need representative pagination/query review.
- The [v2.1 specification](../specification/README.md) preserves the historical 5488bc0 application reference while explicitly identifying current working extensions. Its dictionary contains 28 tables/225 fields, API inventory 44 routes/74 handlers and 101 designed cases with 35 existing/44 planned/22 manual automation mappings. Designed cases remain unrun and all requirements remain unapproved.

## Open dependencies and verification

The sign-in provider, confirmed external ORF destination, pilot curriculum/languages, independent reviewer policy, retention and operational targets remain open. Provider-dependent AI/result adapters and real-user activation are outside this slice. Development and testing use isolated synthetic records. Existing acceptance cases remain unrun unless a separate dated case execution is recorded; automated suite evidence is kept distinct.

All ten workstreams are complete for this implementation slice. A fresh final-source production build passed. The combined guarded runner passed 1,332 assertions across twenty suites: 94 unit, 1,182 integration and 56 meaningful executed smoke checks, plus three static steps. The regression baseline now protects all twenty suites, with no lowered thresholds or quarantine exemptions. Affected-file lint checked 53 files with zero errors and one inherited unused-variable warning.

The built local Worker passed 146 served checks and 38 real-browser workflow checks with synthetic sessions. Browser checks exercised account/reading review resets, source copying and escaped text, exact approved assignment content, lost-response UUID replay, truthful saved-but-refresh-failed messages, immutable attempts/feedback, withdrawn reading history, mobile width/labels and role denial. The browser observed zero external requests and zero unhandled page errors. Desktop/mobile captures were visually inspected. This is targeted UI evidence, not formal accessibility or educator acceptance.

See [dated validation](../../VALIDATION.md) and [sanitized execution evidence](SPECIFICATION-EXECUTION.json). The [specification index](../specification/README.md) retains the review sequence; historical source assessments and the earlier v2.0 execution record are preserved. The provider/policy dependencies above remain open.
