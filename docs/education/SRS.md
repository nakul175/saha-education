# Software requirements specification

> Documentation version 1.0 · 5 October 2026 · Draft for sponsor review.
> Describes the Next.js rebuild at `b4cbfc5f6855479ed523b5bf4c0aed0d2b6f6e3d`, not the legacy application on `main`.
> Requirements are proposed targets; code presence does not establish acceptance or production readiness.

## Status and interpretation

This is the proposed requirements baseline for the Next.js rebuild. “Partial” means related code exists but acceptance has not been demonstrated. “Gap” means a missing or contradicted capability. “Demo only” is not a production implementation. “Unverified” means operational evidence was not obtained. No requirement is accepted by this documentation change.

## Requirements register

| ID | Priority | Capability | Acceptance criterion | Current assessment | Acceptance case |
|---|---|---|---|---|---|
| EDU-F01 | P0 | Authenticated identity | Verify a real account and derive its role and school from trusted server-side identity; logout invalidates the session. | Demo only | UAT-01 |
| EDU-F02 | P0 | Object authorization | Reject cross-school access, unassigned teacher access and unrelated guardian/student access on every read and write. | Gap | UAT-02 |
| EDU-F03 | P1 | School management | An authorized administrator creates, reads and updates a school; required name validation and persistence are demonstrated. | Partial | UAT-03 |
| EDU-F04 | P0 | User administration | Provision/disable users and assign only approved school roles; class teacher selection resolves to a valid same-school teacher. | Gap | UAT-03 |
| EDU-F05 | P1 | Student records | Create and update a student with valid school, name, birth date, admission number and grade; reject duplicates and unauthorized changes. | Partial | UAT-04 |
| EDU-F06 | P1 | Guardian relationships | Create a guardian and link approved same-school students; repeated linking is safe and unauthorized links are rejected. | Partial | UAT-04 |
| EDU-F07 | P1 | Courses and classes | Create a course and a term class with valid same-school course and teacher; display a persisted roster. | Partial | UAT-05 |
| EDU-F08 | P1 | Enrolment lifecycle | Enrol a student once in a compatible class, then withdraw or complete without erasing history. | Partial | UAT-05 |
| EDU-F09 | P1 | Attendance | Save one status per class/student/date, reload it and correct it with attributable history; identify partial failures. | Partial | UAT-06 |
| EDU-F10 | P1 | Assessments/results | Create an assessment and record only enrolled student results within 0..maxScore, using the approved grade policy and attributable corrections. | Partial | UAT-07 |
| EDU-F11 | P1 | Report publication | Create a private term draft, publish with approved authority and expose it only to authorized family/student accounts. | Partial | UAT-08 |
| EDU-F12 | P1 | In-app notifications | Store publication notices against the guardian user account; recipients read and mark only their own notices; retry avoids duplicate notices. | Partial | UAT-08 |
| EDU-F13 | P2 | Search and lists | Authorized filters/search return matching scoped records with bounded, deterministic pagination. | Gap | UAT-09 |
| EDU-F14 | P2 | Role views | Admin, teacher, guardian and student views complete the approved journeys without dead links or inaccessible required functions. | Partial | UAT-09 |
| EDU-N01 | P0 | Privacy and audit | Log actor/action/time/object for sensitive changes without record bodies or secrets; implement approved retention and correction policy. | Gap | UAT-10 |
| EDU-N02 | P0 | Recovery | Restore a synthetic backup in an isolated environment and demonstrate integrity plus approved recovery objectives. | Unverified | UAT-11 |
| EDU-N03 | P2 | Accessibility | Complete primary journeys with keyboard and screen reader; evaluate WCAG 2.2 AA as the proposed acceptance standard. | Unverified | UAT-09 |
| EDU-N04 | P1 | Reliability and errors | Use consistent 400/401/403/404/409/500 contracts; mutation retry/concurrency cannot silently corrupt records. | Gap | UAT-12 |
| EDU-N05 | P2 | Performance | Demonstrate bounded list queries and an agreed response-time/concurrency target using realistic synthetic school volumes. | Unverified | UAT-12 |
| EDU-N06 | P0 | Release control | Record revision, migration state, environment and evidence; deploy only after acceptance and rehearse rollback without losing confirmed data. | Unverified | UAT-11 |

## Interface requirements

The browser consumes same-origin HTTP endpoints; JSON is the intended request/response format. IDs are opaque strings. The server generates record IDs and creation/update timestamps. Mutations must validate required fields, referenced records, role and object authority before persistence. Date formats, academic timezone, pagination and consistent error bodies must be formalized before integration contracts are frozen. Current APIs and exceptions are recorded in API.md.

## Data integrity requirements

Enforce referential integrity and same-school consistency independently of client selections. Require unique student/class enrolment and assessment/student result pairs; preserve revisions for corrections. Attendance has an existing class/student/date unique index, but its sequential save does not establish atomic batch behavior. Decide whether admission numbers and course codes should be unique per school instead of globally before changing existing schema.

## Non-functional decisions still required

Sponsor/operator must set supported school volumes, response-time targets, availability target, maximum acceptable data loss (RPO), recovery time (RTO), retention periods, supported browsers, academic date policy and grade calculation policy. These targets must not be invented from the framework choice. Security isolation and recovery are launch gates even before numeric service objectives are finalized.

## Traceability

requirements.json is the machine-readable mirror of this register, including code evidence and acceptance case. Source evidence indicates where work is needed, not successful acceptance. Changes to IDs, status or cases must update both files and pass the audit check.
