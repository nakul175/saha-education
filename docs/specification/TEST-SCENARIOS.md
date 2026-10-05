# Platform test scenarios

Version 2.5 draft, 5 October 2026. Historical v2.0 source candidate: `5488bc0d20412a3d4be0c031c99c259c56834d5e`. Case design only; no per-case execution or business acceptance is recorded for this specification. Existing-suite verification is recorded separately. Business requirements and approval state are defined in [BRD](BRD.md) and [requirements register](requirements.json).

The v2.5 implementation candidate was prepared on `feat/specification-delivery`. `source_commit` records `85e85d054afe039d6c633aa215d900b5881eb911`, the parent of this documented fourth attendance batch, rather than the commit containing its changes. Dated publication and execution records are maintained separately. The v2.0 application baseline remains `5488bc0d20412a3d4be0c031c99c259c56834d5e`; v2.1 evidence and published v2.2 at `82f20ce`, v2.3 at `88205cd` and v2.4 at `85e85d0` remain historical. Every requirement is unapproved and every designed case is `not-run-for-this-specification`.

The [case JSON](TEST-CASES.json) is authoritative for procedures/data/expected results; [case CSV](TEST-CASES.csv) mirrors every field with full steps and expectations. [Traceability](TRACEABILITY.csv) maps each canonical requirement to cases and its BR. `automation=existing` means a related runnable suite exists; it does not declare exact-case execution or business acceptance. `planned` means automation/interface work is needed; `manual` requires intentional human execution.

This draft contains **205 cases in 31 scenarios**, covers all **35 functional/nonfunctional requirements and 12 business requirements**, and leaves every case `not-run-for-this-specification`.

| Scenario | Scope | Cases | Requirement IDs |
|---|---|---|---|
| SC-01 | OIDC sign-in and provider boundaries | TC-001, TC-002, TC-003, TC-004, TC-005, TC-006, TC-007, TC-008, TC-009, TC-010 | FR-01, FR-02, FR-04, NFR-01, NFR-02, NFR-04, NFR-08 |
| SC-02 | Session lifecycle and live account authority | TC-011, TC-012, TC-013, TC-014, TC-015 | FR-02, FR-03, FR-04, NFR-01 |
| SC-03 | Record and origin authorization | TC-016, TC-017, TC-018, TC-019, TC-020 | FR-01, FR-03, FR-06, FR-13, FR-17, NFR-01 |
| SC-04 | School, user and family administration | TC-021, TC-022, TC-023, TC-024, TC-025 | FR-03, FR-04, FR-05, FR-06, FR-08, NFR-02 |
| SC-05 | Academic structure and recording | TC-026, TC-027, TC-028, TC-029, TC-030, TC-031, TC-032 | FR-03, FR-07, FR-08, FR-09, FR-10, FR-26, NFR-02 |
| SC-06 | Report publication and recipient notices | TC-033, TC-034, TC-035, TC-036 | FR-03, FR-11, FR-12, NFR-02, NFR-03 |
| SC-07 | Original resource authoring | TC-037, TC-038, TC-039, TC-040, TC-041, TC-042 | FR-03, FR-13, NFR-01, NFR-02, NFR-05 |
| SC-08 | Concurrent revisions and exact-version review | TC-043, TC-044, TC-045, TC-046, TC-047, TC-048, TC-049 | FR-03, FR-14, FR-15, NFR-02, NFR-05 |
| SC-09 | Assignment, learner privacy and printing | TC-050, TC-051, TC-052, TC-053, TC-054, TC-055, TC-056 | FR-03, FR-08, FR-15, FR-16, FR-17, FR-18, NFR-02, NFR-03, NFR-05 |
| SC-10 | External application launch | TC-057, TC-058, TC-059, TC-060 | FR-03, FR-19, FR-25, NFR-01, NFR-03 |
| SC-11 | Reviewed numeric ORF and correction history | TC-061, TC-062, TC-063, TC-064, TC-065, TC-066, TC-067 | FR-03, FR-20, FR-21, FR-26, NFR-01, NFR-02, NFR-03, NFR-06 |
| SC-12 | Curriculum sources and language suitability | TC-068, TC-069, TC-070, TC-071 | FR-13, FR-21, FR-22, FR-23, NFR-06 |
| SC-13 | Future AI drafting: failure, review and privacy | TC-072, TC-073, TC-074, TC-075, TC-076, TC-077 | FR-15, FR-22, FR-23, NFR-01, NFR-02, NFR-03, NFR-04, NFR-06, NFR-08 |
| SC-14 | Text submissions and future verified adapters | TC-078, TC-079, TC-080, TC-081 | FR-03, FR-17, FR-24, FR-25, FR-26, NFR-01, NFR-02, NFR-03 |
| SC-15 | Audit, retention and data minimization | TC-082, TC-083, TC-084, TC-085 | FR-09, FR-10, FR-14, FR-15, FR-21, FR-26, NFR-01, NFR-03, NFR-08 |
| SC-16 | Performance and accessibility | TC-086, TC-087, TC-088, TC-089, TC-090 | FR-13, FR-15, FR-16, FR-17, FR-18, NFR-02, NFR-04, NFR-05 |
| SC-17 | Recovery, incidents and release environment | TC-091, TC-092, TC-093, TC-094, TC-095 | FR-03, FR-04, NFR-01, NFR-02, NFR-03, NFR-07, NFR-08, NFR-09 |
| SC-18 | Business UAT and change traceability | TC-096, TC-097, TC-098, TC-099, TC-100, TC-101 | FR-03, FR-05, FR-06, FR-07, FR-08, FR-09, FR-10, FR-11, FR-12, FR-13, FR-14, FR-15, FR-16, FR-17, FR-18, FR-19, FR-20, FR-21, NFR-01, NFR-05, NFR-06, NFR-07, NFR-09 |

| SC-19 | Reviewed profile login binding and legacy repair | TC-102, TC-103, TC-104, TC-105, TC-106, TC-107, TC-108, TC-109 | FR-02, FR-03, FR-04, FR-06, FR-26, NFR-01, NFR-02, NFR-03, NFR-05, NFR-09 |
| SC-20 | Academic actual-write integrity and legacy pair preservation | TC-110, TC-111, TC-112, TC-113, TC-114, TC-115, TC-116, TC-117 | FR-03, FR-08, FR-09, FR-10, FR-26, NFR-01, NFR-02, NFR-03, NFR-09 |
| SC-21 | Normalized local reading draft review and consumed-result receipts | TC-118, TC-119, TC-120, TC-121, TC-122, TC-123, TC-124, TC-125 | FR-03, FR-20, FR-21, FR-25, FR-26, NFR-01, NFR-02, NFR-03, NFR-05, NFR-06, NFR-09 |
| SC-22 | Reviewed submission windows, retries and preserved attempts | TC-126, TC-127, TC-128, TC-129, TC-130, TC-131, TC-132, TC-133 | FR-03, FR-17, FR-24, FR-26, NFR-01, NFR-02, NFR-03, NFR-05, NFR-09 |

| SC-23 | Current actor and structure reference authority | TC-134, TC-135, TC-136, TC-137, TC-138, TC-139, TC-140, TC-141 | FR-03, FR-05, FR-06, FR-07, NFR-01, NFR-02, NFR-03, NFR-05, NFR-09 |
| SC-24 | Atomic report publication winner and safe recovery | TC-142, TC-143, TC-144, TC-145, TC-146, TC-147, TC-148, TC-149 | FR-03, FR-06, FR-11, FR-12, FR-26, NFR-01, NFR-02, NFR-03, NFR-05, NFR-09 |
| SC-25 | Current notice relation, personal history and acknowledgement | TC-150, TC-151, TC-152, TC-153, TC-154, TC-155, TC-156, TC-157 | FR-03, FR-06, FR-11, FR-12, NFR-01, NFR-02, NFR-03, NFR-05, NFR-06, NFR-09 |

| SC-26 | Current-authority coherent role dashboards | TC-158, TC-159, TC-160, TC-161, TC-162, TC-163, TC-164, TC-165 | FR-02, FR-03, FR-05, FR-06, FR-07, FR-08, FR-10, NFR-01, NFR-02, NFR-03, NFR-04, NFR-05 |
| SC-27 | Truthful current-roster result coverage and retained ambiguity | TC-166, TC-167, TC-168, TC-169, TC-170, TC-171, TC-172, TC-173 | FR-03, FR-07, FR-08, FR-10, FR-26, NFR-02, NFR-03, NFR-04 |
| SC-28 | Family observed attendance, publication privacy and bounded display | TC-174, TC-175, TC-176, TC-177, TC-178, TC-179, TC-180, TC-181 | FR-03, FR-06, FR-08, FR-09, FR-10, FR-11, NFR-03, NFR-04, NFR-05, NFR-06, NFR-09 |

| SC-29 | Current reviewed attendance snapshot and explicit evidence validation | TC-182, TC-183, TC-184, TC-185, TC-186, TC-187, TC-188, TC-189 | FR-02, FR-03, FR-08, FR-09, FR-26, NFR-01, NFR-02, NFR-03, NFR-04 |
| SC-30 | Atomic full-evidence attendance review, exact retries and immutable history | TC-190, TC-191, TC-192, TC-193, TC-194, TC-195, TC-196, TC-197 | FR-03, FR-08, FR-09, FR-26, NFR-01, NFR-02, NFR-03, NFR-04 |
| SC-31 | Coherent raw attendance summaries, accessible recovery and policy boundaries | TC-198, TC-199, TC-200, TC-201, TC-202, TC-203, TC-204, TC-205 | FR-03, FR-06, FR-08, FR-09, FR-26, NFR-01, NFR-02, NFR-03, NFR-04, NFR-05, NFR-06, NFR-07, NFR-08, NFR-09 |

## Execution boundaries

Current positive/negative resource/session/reading cases can be implemented against the candidate with synthetic data. Reviewed identity, manual curriculum versions/copies, text submissions/feedback and reading corrections now have concrete current endpoints. Related runnable suites are mapped without executing the designed cases. Verified AI/vendor adapters, licensed-content verification, existing account role/identity/school remapping, full academic audit and hosted recovery still require their pending contracts/policies. Live provider/browser callback and external-app availability require independently verified configuration.

Do not convert grouped historical assertions to case passes. A tester must execute the specified steps, compare each expected result and record revision/environment/fixture/defect evidence. Cases can be failed or blocked while the containing suite passes a narrower check.

## SC-01: OIDC sign-in and provider boundaries

Cases: TC-001, TC-002, TC-003, TC-004, TC-005, TC-006, TC-007, TC-008, TC-009, TC-010. See the case register for each explicit fixture, procedure and expected outcome.

- TC-001 — Provider unset fails closed (smoke, existing).
- TC-002 — Real signed synthetic code flow (integration, existing).
- TC-003 — Wrong issuer, audience or authorized party (security, existing).
- TC-004 — Expired token and missing required claims (security, planned).
- TC-005 — Wrong nonce or browser binding (security, existing).
- TC-006 — One-time transaction replay and expiry (integration, existing).
- TC-007 — Email match cannot provision an account (security, planned).
- TC-008 — Shared login rate limit (integration, planned).
- TC-009 — Provider timeout and error response (integration, planned).
- TC-010 — Live synthetic provider/browser callback (uat, manual).

## SC-02: Session lifecycle and live account authority

Cases: TC-011, TC-012, TC-013, TC-014, TC-015. See the case register for each explicit fixture, procedure and expected outcome.

- TC-011 — Session token digest and cookie properties (unit, existing).
- TC-012 — Expired, malformed and duplicate cookies (security, existing).
- TC-013 — Logout revocation and double logout (integration, planned).
- TC-014 — Disabled user and live role/school changes (integration, planned).
- TC-015 — Disable/re-enable lifecycle revokes prior sessions (integration, existing).

## SC-03: Record and origin authorization

Cases: TC-016, TC-017, TC-018, TC-019, TC-020. See the case register for each explicit fixture, procedure and expected outcome.

- TC-016 — Demo cookies and public identity headers rejected (smoke, existing).
- TC-017 — Cross-school and unassigned-class matrix (security, planned).
- TC-018 — Guardian/student profile ownership (security, planned).
- TC-019 — Mutation Origin and no-store contract (security, existing).
- TC-020 — Safe errors and hostile text (security, planned).

## SC-04: School, user and family administration

Cases: TC-021, TC-022, TC-023, TC-024, TC-025. See the case register for each explicit fixture, procedure and expected outcome.

- TC-021 — Operator school bootstrap and school updates (integration, planned).
- TC-022 — Reviewed provisioning and identity uniqueness (integration, planned).
- TC-023 — Student required fields and duplicate policy (integration, planned).
- TC-024 — Guardian relationship linking retries (integration, planned).
- TC-025 — Roster reconciliation after withdrawals (uat, manual).

## SC-05: Academic structure and recording

Cases: TC-026, TC-027, TC-028, TC-029, TC-030, TC-031, TC-032. See the case register for each explicit fixture, procedure and expected outcome.

- TC-026 — Same-school course and eligible class teacher (integration, planned).
- TC-027 — Enrolment duplicate race and status history (integration, planned).
- TC-028 — Attendance valid save and class membership (integration, planned).
- TC-029 — Attendance whole-batch invalid input and failure (integration, planned).
- TC-030 — Attendance date and attributable corrections (uat, manual).
- TC-031 — Assessment scores and family privacy (integration, planned).
- TC-032 — Result retry race and correction trail (integration, planned).

## SC-06: Report publication and recipient notices

Cases: TC-033, TC-034, TC-035, TC-036. See the case register for each explicit fixture, procedure and expected outcome.

- TC-033 — Report drafts private across all entry points (security, existing).
- TC-034 — Report publication and notice atomic retry (integration, planned).
- TC-035 — Notification recipient ownership (integration, existing).
- TC-036 — External notifications remain disabled (regression, planned).

## SC-07: Original resource authoring

Cases: TC-037, TC-038, TC-039, TC-040, TC-041, TC-042. See the case register for each explicit fixture, procedure and expected outcome.

- TC-037 — Four original resource types persist (integration, planned).
- TC-038 — Strict authoring field and authority validation (integration, existing).
- TC-039 — Repeat-safe creation after lost response (integration, existing).
- TC-040 — Concurrent creation and actor UUID collision (integration, existing).
- TC-041 — Author workspace scoping (security, existing).
- TC-042 — Template switch and failed save preserve editing (regression, planned).

## SC-08: Concurrent revisions and exact-version review

Cases: TC-043, TC-044, TC-045, TC-046, TC-047, TC-048, TC-049. See the case register for each explicit fixture, procedure and expected outcome.

- TC-043 — Revision appends and retains prior content (integration, existing).
- TC-044 — Competing version edits reject stale winner (integration, existing).
- TC-045 — Multi-actor revision authorization (integration, planned).
- TC-046 — Explicit exact-version approval (integration, existing).
- TC-047 — Concurrent approval retains first reviewer/time (integration, existing).
- TC-048 — Conflict UI retains unsaved edits (regression, planned).
- TC-049 — Approval requires explicit self-review confirmation (uat, manual).

## SC-09: Assignment, learner privacy and printing

Cases: TC-050, TC-051, TC-052, TC-053, TC-054, TC-055, TC-056. See the case register for each explicit fixture, procedure and expected outcome.

- TC-050 — Draft assignment denied and exact approved version pinned (integration, existing).
- TC-051 — Assignment retry and scoped class checks (integration, planned).
- TC-052 — Assignment authority rechecked during race (integration, planned).
- TC-053 — Learner/server response excludes private fields (security, existing).
- TC-054 — Withdrawal and unrelated learner assignment visibility (integration, existing).
- TC-055 — Print exact approved student edition (regression, planned).
- TC-056 — Teacher print edition explicitly opted in (uat, manual).

## SC-10: External application launch

Cases: TC-057, TC-058, TC-059, TC-060. See the case register for each explicit fixture, procedure and expected outcome.

- TC-057 — Unconfigured/unsafe external app fails closed (smoke, existing).
- TC-058 — Trusted launch sends no learner/session context (integration, existing).
- TC-059 — External launch family and foreign student denial (security, existing).
- TC-060 — Confirmed app availability and separate sign-in (uat, manual).

## SC-11: Reviewed numeric ORF and correction history

Cases: TC-061, TC-062, TC-063, TC-064, TC-065, TC-066, TC-067. See the case register for each explicit fixture, procedure and expected outcome.

- TC-061 — Reviewed numeric counts and derived measures (integration, existing).
- TC-062 — Invalid ORF numeric/date/language input (unit, existing).
- TC-063 — ORF immutable retries and actor collisions (integration, existing).
- TC-064 — Manual provenance cannot be forged (security, existing).
- TC-065 — ORF assigned roster and family visibility (integration, existing).
- TC-066 — Attributable ORF corrections and preserved original (integration, existing).
- TC-067 — Comparable-task trends and non-diagnostic language (uat, manual).

## SC-12: Curriculum sources and language suitability

Cases: TC-068, TC-069, TC-070, TC-071. See the case register for each explicit fixture, procedure and expected outcome.

- TC-068 — Versioned original/licensed curriculum sources (integration, existing).
- TC-069 — Missing/withdrawn source and unsupported alignment (integration, planned).
- TC-070 — English/Hindi content and locale completeness (uat, manual).
- TC-071 — Language-specific assessment interpretation (uat, manual).

## SC-13: Future AI drafting: failure, review and privacy

Cases: TC-072, TC-073, TC-074, TC-075, TC-076, TC-077. See the case register for each explicit fixture, procedure and expected outcome.

- TC-072 — Future AI structured provisional draft (integration, planned).
- TC-073 — AI timeout/rate limit/outage preserves teacher work (integration, planned).
- TC-074 — AI malformed/truncated/unsafe response rejection (security, planned).
- TC-075 — AI request privacy and source prompt injection (security, planned).
- TC-076 — AI budget and repeat-request controls (integration, planned).
- TC-077 — Educator AI content review and disclosure (uat, manual).

## SC-14: Text submissions and future verified adapters

Cases: TC-078, TC-079, TC-080, TC-081. See the case register for each explicit fixture, procedure and expected outcome.

- TC-078 — Authorized text submission and reviewed formative feedback (integration, existing).
- TC-079 — Submission retries, corrections and late policy (integration, planned).
- TC-080 — Verified external result mapping and schema (integration, planned).
- TC-081 — Adapter replay, outage and revoked authorization (integration, planned).

## SC-15: Audit, retention and data minimization

Cases: TC-082, TC-083, TC-084, TC-085. See the case register for each explicit fixture, procedure and expected outcome.

- TC-082 — Attributable academic/resource/reading corrections (integration, planned).
- TC-083 — Retention/export/deletion enforcement (integration, planned).
- TC-084 — Credential and learner data absent from logs (security, planned).
- TC-085 — Approval audit reproducibility after later edits (regression, existing).

## SC-16: Performance and accessibility

Cases: TC-086, TC-087, TC-088, TC-089, TC-090. See the case register for each explicit fixture, procedure and expected outcome.

- TC-086 — Representative list/query performance baseline (performance, manual).
- TC-087 — Contention and retry performance envelope (performance, manual).
- TC-088 — Keyboard/focus and validation announcements (accessibility, manual).
- TC-089 — Screen-reader learner and print accessibility (accessibility, manual).
- TC-090 — Mobile and long-content editing recovery (regression, planned).

## SC-17: Recovery, incidents and release environment

Cases: TC-091, TC-092, TC-093, TC-094, TC-095. See the case register for each explicit fixture, procedure and expected outcome.

- TC-091 — Local encrypted snapshot/restore verification (recovery, manual).
- TC-092 — Wrong key/tampered backup and destination refusal (recovery, planned).
- TC-093 — Hosted restore and compatible rollback drill (recovery, manual).
- TC-094 — Correlated failure and incident ownership (integration, planned).
- TC-095 — Fresh migration and legacy fail-closed upgrade (regression, planned).

## SC-18: Business UAT and change traceability

Cases: TC-096, TC-097, TC-098, TC-099, TC-100, TC-101. See the case register for each explicit fixture, procedure and expected outcome.

- TC-096 — School and academic administrator UAT (uat, manual).
- TC-097 — Teacher manual preparation and exact-version UAT (uat, manual).
- TC-098 — Student approved learning and guardian boundary UAT (uat, manual).
- TC-099 — Reviewed ORF interpretation UAT (uat, manual).
- TC-100 — Canonical requirement/case/business traceability (regression, manual).
- TC-101 — Risk-based release acceptance and defect disposition (uat, manual).

## SC-19: Reviewed profile login binding and legacy repair

Cases: TC-102, TC-103, TC-104, TC-105, TC-106, TC-107, TC-108, TC-109. Full procedures, fixtures and expected results are in the authoritative JSON/CSV. All remain unrun.

- TC-102 — Reviewed profile-link surface and legacy version zero (smoke, existing).
- TC-103 — Typed same-school login link and explicit unlink (integration, existing).
- TC-104 — Profile decision replay returns current ownership (integration, existing).
- TC-105 — Profile CAS and affected-session atomicity (integration, existing).
- TC-106 — Legacy profile writes cannot bypass reviewed binding (security, existing).
- TC-107 — Profile history and retry live authority/privacy (security, existing).
- TC-108 — Legacy guardian duplicates retained and new occupancy blocked (regression, existing).
- TC-109 — Profile ownership review usability and policy acceptance (uat, manual).

## SC-20: Academic actual-write integrity and legacy pair preservation

Cases: TC-110, TC-111, TC-112, TC-113, TC-114, TC-115, TC-116, TC-117. Full procedures, fixtures and expected results are in the authoritative JSON/CSV. All remain unrun.

- TC-110 — Academic guard migration preserves legacy duplicate evidence (regression, existing).
- TC-111 — Enrolment duplicate race and live current-school write (integration, existing).
- TC-112 — Atomic attendance current membership recheck (integration, existing).
- TC-113 — Assessment results use actual current score maximum (integration, existing).
- TC-114 — Ambiguous legacy result pair cannot choose arbitrary winner (integration, existing).
- TC-115 — Academic role-before-body and downstream privacy (security, existing).
- TC-116 — Academic batch fault and maximum bounded transport (integration, existing).
- TC-117 — Academic duplicate and correction policy review (uat, manual).

## SC-21: Normalized local reading draft review and consumed-result receipts

Cases: TC-118, TC-119, TC-120, TC-121, TC-122, TC-123, TC-124, TC-125. Full procedures, fixtures and expected results are in the authoritative JSON/CSV. All remain unrun.

- TC-118 — Normalized reading draft boot and zero observations (smoke, existing).
- TC-119 — Strict reading JSON validation and explicit mapping (unit, existing).
- TC-120 — Reviewed import confirmation and durable declared provenance (integration, existing).
- TC-121 — Import duplicate consumption across draft UUIDs (integration, existing).
- TC-122 — Import confirmation fault CAS and exact retry (integration, existing).
- TC-123 — Import stage/confirm actual authority and historical rejection (security, existing).
- TC-124 — Rejected draft never appears as a reading (regression, existing).
- TC-125 — Import preview educator review and accessible uncertainty (uat, manual).

## SC-22: Reviewed submission windows, retries and preserved attempts

Cases: TC-126, TC-127, TC-128, TC-129, TC-130, TC-131, TC-132, TC-133. Full procedures, fixtures and expected results are in the authoritative JSON/CSV. All remain unrun.

- TC-126 — Default submission access and safe current view (smoke, existing).
- TC-127 — Strict window review schema and calendar UTC bounds (integration, existing).
- TC-128 — Submission window current role and history privacy (security, existing).
- TC-129 — Window CAS history and current-state old UUID replay (integration, existing).
- TC-130 — Close or expire after prevalidation prevents actual attempt write (integration, existing).
- TC-131 — Committed submission replay and feedback survive closure (regression, existing).
- TC-132 — Timed cutoff boundary and deterministic reopening (integration, existing).
- TC-133 — Submission window review usability and educator policy (uat, manual).

## SC-23 — Current structure authority

Cases: TC-134, TC-135, TC-136, TC-137, TC-138, TC-139, TC-140, TC-141. Inject actor and selected reference changes at actual statement boundaries, compare nested roster/privacy and every retained original field, then separately review role-appropriate admin/family screen behavior. All procedures remain unrun.

- TC-134 — Original structure and account feeds deny late actor changes (security, existing).
- TC-135 — Structure mutation SQL denies stale administrator authority (integration, existing).
- TC-136 — Class persistence rechecks selected course school (integration, existing).
- TC-137 — Class persistence rechecks enabled trusted teacher eligibility (integration, existing).
- TC-138 — Final joined class detail scopes current roster members (security, existing).
- TC-139 — Structure role and origin denial precedes body parsing (security, existing).
- TC-140 — Structure D1 returns and server fields remain compatible (regression, existing).
- TC-141 — Role-appropriate structure administration usability (uat, manual).

## SC-24 — Atomic report publication

Cases: TC-142, TC-143, TC-144, TC-145, TC-146, TC-147, TC-148, TC-149. Coordinate winner/loser receipts, actual reviewed guardian unlink, zero-row authority and late trigger faults. Inspect receipt/report/all notice rows, no legacy backfill and no invented draft-create retry guarantee. All procedures remain unrun.

- TC-142 — Report draft insertion rechecks actor and learner school (integration, existing).
- TC-143 — Report publication role parsing and draft privacy (security, existing).
- TC-144 — Concurrent publication has one receipt and notice winner (integration, existing).
- TC-145 — Zero-row or revoked publication creates no notice (security, existing).
- TC-146 — Publication derives current eligible guardian accounts (integration, existing).
- TC-147 — Trigger failure rolls back every publication member (integration, existing).
- TC-148 — Migration preserves legacy evidence and immutable receipts (regression, existing).
- TC-149 — Saved-report review and uncertain draft recovery usability (uat, manual).

## SC-25 — Notice current scope and historical ownership

Cases: TC-150, TC-151, TC-152, TC-153, TC-154, TC-155, TC-156, TC-157. Inject final actor/teacher/recipient changes, compare personal history after reviewed unlink separately from current learner/report rights, and distinguish same-notice first-timestamp-preserving acknowledgement from uncertain UI/UAT recovery. All procedures remain unrun.

- TC-150 — Notice reads and acknowledgements reject stale actors (security, existing).
- TC-151 — Teacher notice INSERT rechecks class and active pupil relation (integration, existing).
- TC-152 — Manual notice INSERT rechecks recipient school and account (integration, existing).
- TC-153 — Notice auth origin body and channel boundaries (security, existing).
- TC-154 — Personal notices survive unlink without learner access (regression, existing).
- TC-155 — Acknowledgement retry preserves content and row identity (regression, existing).
- TC-156 — Inbox uncertainty retains rows and recovery action (regression, planned).
- TC-157 — Inbox accessibility and retention wording review (uat, manual).

## SC-26: Current-authority coherent role dashboards

Cases: TC-158, TC-159, TC-160, TC-161, TC-162, TC-163, TC-164, TC-165. All remain unrun for this specification.

- TC-158 — Role snapshots expose only current scoped projections (security, existing).
- TC-159 — SQL-time actor revocation returns denied snapshot (security, existing).
- TC-160 — Reviewed profile unlink removes family snapshot atomically (security, existing).
- TC-161 — Teacher snapshot follows current class and roster relationships (security, existing).
- TC-162 — One prepared SELECT produces coherent nested role views (integration, existing).
- TC-163 — Administrator exact counts exclude ineligible teacher accounts (integration, existing).
- TC-164 — Current SQL cutoff prevents assembled snapshot mixing (regression, existing).
- TC-165 — Literal dashboard text and private fields stay separated (security, existing).

## SC-27: Truthful current-roster result coverage and retained ambiguity

Cases: TC-166, TC-167, TC-168, TC-169, TC-170, TC-171, TC-172, TC-173. All remain unrun for this specification.

- TC-166 — Saved zero and zero maximum count as actual results (integration, existing).
- TC-167 — Partial and fully recorded current roster coverage (integration, existing).
- TC-168 — No current roster preserves historical result evidence (regression, existing).
- TC-169 — Legacy duplicate results require review without arbitrary selection (regression, existing).
- TC-170 — Legacy whole enrolment pairs remain visibly ambiguous (regression, existing).
- TC-171 — Invalid legacy scores and maxima remain reviewable (integration, existing).
- TC-172 — Foreign and out-of-roster results cannot inflate coverage (security, existing).
- TC-173 — Teacher lists use exact totals with bounded deterministic display (integration, existing).

## SC-28: Family observed attendance, publication privacy and bounded display

Cases: TC-174, TC-175, TC-176, TC-177, TC-178, TC-179, TC-180, TC-181. All remain unrun for this specification.

- TC-174 — Family missing-profile and absent-evidence states are distinct (integration, existing).
- TC-175 — Attendance shows actual statuses including excused-only evidence (integration, existing).
- TC-176 — Attendance dates and current class eligibility remain explicit (integration, existing).
- TC-177 — Family published reports retain supplied grade and exclude drafts (security, existing).
- TC-178 — Family profile and report caps preserve exact totals (integration, existing).
- TC-179 — Representative dashboard capacity remains a measured gate (performance, planned).
- TC-180 — Role dashboard keyboard mobile and language review (accessibility, manual).
- TC-181 — Educator review of dashboard meaning and historical limits (uat, manual).

## SC-29: Current reviewed attendance snapshot and explicit evidence validation

Cases: TC-182, TC-183, TC-184, TC-185, TC-186, TC-187, TC-188, TC-189. All remain unrun for this specification.

- TC-182 — Reviewed attendance authentication role origin and bounded body (security, existing).
- TC-183 — One current editor snapshot has no default present mark (integration, existing).
- TC-184 — Exact real attendance date without invented calendar restrictions (integration, existing).
- TC-185 — Strict full saved-record and explicit note contract (integration, existing).
- TC-186 — Dirty-only review preserves null empty and untouched notes (integration, existing).
- TC-187 — Bounded roster and preserved global legacy ambiguity (regression, existing).
- TC-188 — Unicode reason and preserved long legacy note bounds (regression, existing).
- TC-189 — SQL-time staff class and roster authority on editor reads (security, existing).

## SC-30: Atomic full-evidence attendance review, exact retries and immutable history

Cases: TC-190, TC-191, TC-192, TC-193, TC-194, TC-195, TC-196, TC-197. All remain unrun for this specification.

- TC-190 — Full-evidence CAS and late active-membership write guards (security, existing).
- TC-191 — Mid-audit fault rolls back full reviewed attendance batch (integration, existing).
- TC-192 — Concurrent different reviewed UUIDs have one CAS winner (integration, existing).
- TC-193 — Concurrent exact UUID and reordered entries replay once (integration, existing).
- TC-194 — Original UUID replay survives legacy edits and withdrawal (regression, existing).
- TC-195 — Committed result readback denies late authority loss (security, existing).
- TC-196 — Immutable reviewed history and unchanged legacy replacements (regression, existing).
- TC-197 — Current whole-batch history privacy exact filtering and cap (security, existing).

## SC-31: Coherent raw attendance summaries, accessible recovery and policy boundaries

Cases: TC-198, TC-199, TC-200, TC-201, TC-202, TC-203, TC-204, TC-205. All remain unrun for this specification.

- TC-198 — Coherent named attendance summary under current record scope (integration, existing).
- TC-199 — Raw summary status and real-date coverage without percentages (integration, existing).
- TC-200 — Exact summary totals and family roster minimization (security, existing).
- TC-201 — Actual summary SELECT follows late actor and profile relationships (security, existing).
- TC-202 — Attendance viewer selection cancellation and explicit refresh (integration, existing).
- TC-203 — Reviewed recorder uncertainty conflict and accessible evidence (accessibility, manual).
- TC-204 — Reviewed attendance capacity recovery and support gates (performance, planned).
- TC-205 — Educator attendance meaning and correction governance acceptance (uat, manual).
