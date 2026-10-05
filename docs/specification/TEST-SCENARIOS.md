# Platform test scenarios

Version 2.10 draft, 6 October 2026. Historical v2.0 source candidate: `5488bc0d20412a3d4be0c031c99c259c56834d5e`. Case design only; no per-case execution or business acceptance is recorded for this specification. Existing-suite verification is recorded separately. Business requirements and approval state are defined in [BRD](BRD.md) and [requirements register](requirements.json).

The v2.10 candidate is prepared on `feat/specification-delivery` from published parent `a418ee4132bfc05d24748ad1d25c5fa5b91b7d69`. `source_commit` identifies that parent, not the containing implementation/documentation commit. The [eight-hour development record](../current/EIGHT-HOUR-DEVELOPMENT.md) and root-maintained dated execution/release evidence identify actual frozen source, publication, merge and deployment independently. The v2.0 baseline `5488bc0d20412a3d4be0c031c99c259c56834d5e` and published v2.1–v2.8 history remain retained. All requirements are unapproved and all designed cases are `not-run-for-this-specification`.

The [case JSON](TEST-CASES.json) is authoritative for procedures/data/expected results; [case CSV](TEST-CASES.csv) mirrors every field with full steps and expectations. [Traceability](TRACEABILITY.csv) maps each canonical requirement to cases and its BR. `automation=existing` means a related runnable suite exists; it does not declare exact-case execution or business acceptance. `planned` means automation/interface work is needed; `manual` requires intentional human execution.

This draft contains **329 cases in 46 scenarios**, covers all **35 functional/nonfunctional requirements and 12 business requirements**, and leaves every case `not-run-for-this-specification`.

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
| SC-32 | Current reviewed result snapshot, raw evidence and deliberate validation | TC-206, TC-207, TC-208, TC-209, TC-210, TC-211, TC-212, TC-213 | FR-01, FR-02, FR-03, FR-06, FR-08, FR-10, FR-26, NFR-01, NFR-02, NFR-05 |
| SC-33 | Atomic full result/metadata review, concurrency and current authority | TC-214, TC-215, TC-216, TC-217, TC-218, TC-219, TC-220, TC-221 | FR-03, FR-08, FR-10, FR-26, NFR-01, NFR-02, NFR-05 |
| SC-34 | Immutable result history, accessible recovery and policy boundaries | TC-222, TC-223, TC-224, TC-225, TC-226, TC-227, TC-228, TC-229 | FR-10, FR-26, NFR-01, NFR-02, NFR-03, NFR-04, NFR-05, NFR-06, NFR-07, NFR-08, NFR-09 |
| SC-35 | Original learner response feedback and window recovery | TC-230, TC-231, TC-232, TC-233, TC-234, TC-235, TC-236, TC-237 | FR-03, FR-17, FR-24, FR-26, NFR-01, NFR-03, NFR-04 |
| SC-36 | Current learner privacy and mounted recovery boundaries | TC-238, TC-239, TC-240, TC-241, TC-242, TC-243, TC-244, TC-245 | FR-03, FR-17, FR-24, NFR-01, NFR-03, NFR-04, NFR-05, NFR-06, NFR-07, NFR-09 |
| SC-37 | Current registry privacy local search and reviewed create recovery | TC-246, TC-247, TC-248, TC-249, TC-250, TC-251, TC-252, TC-253 | FR-03, FR-06, NFR-01, NFR-03, NFR-04, NFR-05, NFR-06, NFR-07, NFR-09 |
| SC-38 | Original verified session and identity authority at actual SQL | TC-254, TC-255, TC-256, TC-257, TC-258, TC-259, TC-260, TC-261 | FR-02, FR-03, FR-04, FR-06, FR-09, FR-10, FR-13, FR-24, FR-26, NFR-01, NFR-02, NFR-03, NFR-09 |
| SC-39 | Reviewed registry atomic creation and exact original arbitration | TC-262, TC-263, TC-264, TC-265, TC-266, TC-267, TC-268, TC-269 | FR-02, FR-03, FR-06, FR-26, NFR-01, NFR-02 |
| SC-40 | Immutable registry receipts current privacy and client recovery | TC-270, TC-271, TC-272, TC-273, TC-274, TC-275, TC-276, TC-277 | FR-03, FR-06, FR-26, NFR-01, NFR-02, NFR-03, NFR-05, NFR-06, NFR-07, NFR-09 |
| SC-41 | Default-off isolated synthetic demo and release boundaries | TC-278, TC-279, TC-280, TC-281, TC-282, TC-283, TC-284, TC-285 | FR-01, FR-02, FR-03, FR-05, FR-06, FR-17, FR-19, FR-23, NFR-01, NFR-02, NFR-03, NFR-04, NFR-05, NFR-07, NFR-08, NFR-09 |
| SC-42 | Current academic selections, mutation privacy and recovery | TC-286, TC-287, TC-288, TC-289, TC-290, TC-291, TC-292, TC-293 | FR-02, FR-03, FR-06, FR-07, FR-08, FR-11, FR-12, FR-26, NFR-01, NFR-02, NFR-03, NFR-05, NFR-06, NFR-07, NFR-09 |
| SC-43 | Current owned inbox saved read status and exact original recovery | TC-294, TC-295, TC-296, TC-297, TC-298, TC-299, TC-300, TC-301, TC-302, TC-303, TC-304, TC-305 | FR-02, FR-03, FR-12, NFR-01, NFR-02, NFR-03, NFR-05, NFR-06, NFR-09 |
| SC-44 | Current family class snapshot navigation and honest availability | TC-306, TC-307, TC-308, TC-309, TC-310, TC-311, TC-312, TC-313 | FR-02, FR-03, FR-07, FR-08, FR-09, FR-12, FR-26, NFR-01, NFR-03, NFR-05, NFR-06, NFR-09 |
| SC-45 | Manual reading evidence source selection and suitability | TC-314, TC-315, TC-316, TC-317, TC-318, TC-319, TC-320, TC-321 | FR-02, FR-03, FR-13, FR-15, FR-16, FR-17, FR-20, FR-21, FR-22, FR-26, NFR-01, NFR-02, NFR-03, NFR-05, NFR-06, NFR-09 |
| SC-46 | Original copied draft recovery privacy and editor handoff | TC-322, TC-323, TC-324, TC-325, TC-326, TC-327, TC-328, TC-329 | FR-02, FR-03, FR-13, FR-14, FR-15, FR-16, FR-18, FR-20, FR-21, FR-22, FR-26, NFR-01, NFR-02, NFR-03, NFR-05, NFR-06, NFR-07, NFR-09 |

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

- TC-016 — Forged role cookies and public identity headers rejected (smoke, existing).
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

TC-156 retains its historical v2.3 unrun inbox-retention procedure and planned mapping. The current v2.10 UI hides unconfirmed private rows and requires fresh original-owner reload; SC-43 / TC-294–TC-305 specify that replacement client behavior. Retaining the old case object preserves design history and does not require restoring obsolete private-content retention.


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

## SC-32: Current reviewed result snapshot, raw evidence and deliberate validation

Cases: TC-206, TC-207, TC-208, TC-209, TC-210, TC-211, TC-212, TC-213. All remain unrun for this specification.

- TC-206 — Reviewed result authentication role origin and body bounds (security, existing).
- TC-207 — One coherent minimal result editor snapshot (integration, existing).
- TC-208 — Saved zero null empty and unrecorded results stay distinct (regression, existing).
- TC-209 — Literal assessment calendar disclosure avoids shifts and crashes (regression, existing).
- TC-210 — Strict full metadata and saved result evidence contract (integration, existing).
- TC-211 — Unicode limits and unchanged long saved grade feedback (regression, existing).
- TC-212 — Current roster cap and ambiguity preserve historical duplicates (regression, existing).
- TC-213 — Raw numeric evidence repair and unrepresentable read-only gates (regression, existing).

## SC-33: Atomic full result/metadata review, concurrency and current authority

Cases: TC-214, TC-215, TC-216, TC-217, TC-218, TC-219, TC-220, TC-221. All remain unrun for this specification.

- TC-214 — Actual query actor class assessment and pupil cutoff (security, existing).
- TC-215 — Full metadata and original result CAS rejects every stale field (integration, existing).
- TC-216 — Reviewed feedback edit cannot repeat legacy stale overwrite (regression, existing).
- TC-217 — Mixed new existing results and forced audit fault roll back atomically (integration, existing).
- TC-218 — Concurrent distinct reviewed UUIDs have one CAS winner (integration, existing).
- TC-219 — Concurrent exact and reordered UUID replay arbitrates once (integration, existing).
- TC-220 — Original result replay survives later legacy metadata edits and withdrawal (regression, existing).
- TC-221 — Whole-batch history transfer privacy and denied committed readback (security, existing).

## SC-34: Immutable result history, accessible recovery and policy boundaries

Cases: TC-222, TC-223, TC-224, TC-225, TC-226, TC-227, TC-228, TC-229. All remain unrun for this specification.

- TC-222 — Immutable latest100 reviewed result history and exact totals (regression, existing).
- TC-223 — Legacy accepted replacements and omitted text semantics stay compatible (regression, existing).
- TC-224 — Explicit dirty review preserves supplied grade and resets confirmation (accessibility, manual).
- TC-225 — Conflict comparison uncertain original retry and truthful refresh failure (regression, manual).
- TC-226 — Result editor keyboard mobile plain text and literal date review (accessibility, manual).
- TC-227 — Encrypted local recovery retains reviewed result receipt and exact replay (recovery, existing).
- TC-228 — Representative result capacity recovery and support gates (performance, planned).
- TC-229 — Educator result correction meaning grade and publication acceptance (uat, manual).

## SC-35: Immutable client recovery for learner responses reviewed feedback and policies

Cases: TC-230, TC-231, TC-232, TC-233, TC-234, TC-235, TC-236, TC-237. All remain unrun for this specification. Actual callback tests use substituted hooks/native event values with real routes/session/D1; mounted-browser and educator acceptance remain separate.

- TC-230 — Original pending response survives later attempt and closed window (regression, existing).
- TC-231 — Original pending feedback does not create a duplicate reviewed revision (regression, existing).
- TC-232 — Original pending window close cannot override a later reopening (regression, existing).
- TC-233 — Repeated network malformed and server-error recovery keeps original request (integration, existing).
- TC-234 — Known assignment denial hides private evidence while retaining pending recovery (security, existing).
- TC-235 — Pending recovery is bound to original actor and authorized reload (security, existing).
- TC-236 — Confirmed save and failed follow-up read remain distinct outcomes (regression, existing).
- TC-237 — Same-frame learner feedback and policy controls submit once (integration, existing).

## SC-36: Current learning privacy stale reads and accessible recovery limits

Cases: TC-238, TC-239, TC-240, TC-241, TC-242, TC-243, TC-244, TC-245. All remain unrun for this specification. Actual callback tests use substituted hooks/native event values with real routes/session/D1; mounted-browser and educator acceptance remain separate.

- TC-238 — Learning reload resolves fresh role and clears old learner cards (security, existing).
- TC-239 — Obsolete learning responses cannot restore revoked material (integration, existing).
- TC-240 — Current policy success followed by history denial clears partial view (security, existing).
- TC-241 — Every consumed callback response is drained and safely reported (integration, existing).
- TC-242 — Temporary history failure retains valid current policy availability (regression, existing).
- TC-243 — Learner recovery keyboard mobile plain-text and focus review (accessibility, manual).
- TC-244 — Page-memory recovery lifetime and refresh policy acceptance (uat, manual).
- TC-245 — Representative recovery and history performance remains measured gate (performance, planned).

## SC-37: Current registry privacy local search and reviewed create recovery

Cases: TC-246, TC-247, TC-248, TC-249, TC-250, TC-251, TC-252, TC-253. All remain unrun for this specification. SC-37 keeps original IDs while adapting current procedures from v2.8; old manual comparison is retained history, not the reviewed UI contract. Related synthetic suite/source evidence does not populate outcomes or approvals.

- TC-246 — Current registry loads reject changed actor and obsolete privileged replies (security, existing).
- TC-247 — Registry failure clears private rows and successful reload clears sticky error (integration, existing).
- TC-248 — Student local search and bounded matches truthfully describe loaded scope (integration, existing).
- TC-249 — Synchronous registry create lock preserves one actual request (integration, existing).
- TC-250 — Unknown reviewed creation retains exact original actor-bound retry (regression, existing).
- TC-251 — Fresh create preflight denies stale administrator without POST (security, existing).
- TC-252 — Acknowledged registry creation stays saved when list refresh fails (regression, existing).
- TC-253 — Registry mounted form search privacy and recovery acceptance review (accessibility, manual).

## SC-38: Original verified session and identity authority at actual SQL

Cases: TC-254, TC-255, TC-256, TC-257, TC-258, TC-259, TC-260, TC-261. All remain unrun for this specification. Related synthetic suite/source evidence does not populate outcomes or approvals.

- TC-254 — Original session revocation blocks late protected read (security, existing).
- TC-255 — Database clock expires original session at execution (integration, existing).
- TC-256 — Another same-account session cannot rescue revoked original (regression, existing).
- TC-257 — Exact verified identity and session owner stay pinned (security, existing).
- TC-258 — Late session revocation prevents profile and resource commits (integration, existing).
- TC-259 — Revoked reviewed writes and receipt replay reveal no private evidence (security, existing).
- TC-260 — Private session evidence never serializes from frozen Principal (integration, existing).
- TC-261 — Current no-store safe response shapes survive session hardening (regression, existing).

## SC-39: Reviewed registry atomic creation and exact original arbitration

Cases: TC-262, TC-263, TC-264, TC-265, TC-266, TC-267, TC-268, TC-269. All remain unrun for this specification. Related synthetic suite/source evidence does not populate outcomes or approvals.

- TC-262 — Reviewed student and guardian create atomic unlinked originals (smoke, existing).
- TC-263 — Canonical exact reviewed UUID retry returns original (integration, existing).
- TC-264 — Changed kind payload reason or actor cannot consume UUID (security, existing).
- TC-265 — Concurrent reviewed creations retain one winner (integration, existing).
- TC-266 — Authentication role origin and body bounds precede creation (security, existing).
- TC-267 — Strict review shape Unicode and legacy field policy remain explicit (integration, existing).
- TC-268 — Admission trigger or receipt failure rolls back whole creation (integration, existing).
- TC-269 — Current authority at reviewed INSERT and final receipt read (security, existing).

## SC-40: Immutable registry receipts current privacy and client recovery

Cases: TC-270, TC-271, TC-272, TC-273, TC-274, TC-275, TC-276, TC-277. All remain unrun for this specification. Related synthetic suite/source evidence does not populate outcomes or approvals.

- TC-270 — Original receipt survives current profile edit and account link (regression, existing).
- TC-271 — Receipt lookup and immutability protect historical privacy (security, existing).
- TC-272 — Uncertain client retries exact original bytes after same actor reload (regression, existing).
- TC-273 — Changed actor obsolete responses and failed retry preflight cannot expose pending (security, existing).
- TC-274 — Definitive validation conflict and changed drafts require deliberate review (regression, existing).
- TC-275 — Confirmed original receipt remains separate from failed current read (regression, existing).
- TC-276 — Mounted registry review retry and receipt mobile keyboard acceptance (accessibility, manual).
- TC-277 — Page-memory recovery and legacy duplicate governance review (uat, manual).

## SC-41: Default-off isolated synthetic demo and release boundaries

Cases: TC-278, TC-279, TC-280, TC-281, TC-282, TC-283, TC-284, TC-285. All remain unrun for this specification. Related synthetic suite/source evidence does not populate outcomes or approvals.

- TC-278 — Synthetic entry defaults off and rejects spoofed public role data (smoke, existing).
- TC-279 — First demo install seeds bounded coherent fictional records (integration, existing).
- TC-280 — Four demo views use real opaque scoped sessions (security, existing).
- TC-281 — Demo role switch revokes current token without resetting edits (regression, existing).
- TC-282 — Demo runtime marker and account isolation close original SQL authority (security, existing).
- TC-283 — Demo rate and database failure boundaries are explicit (integration, planned).
- TC-284 — Private hosted demo audience role and fictional journey review (uat, manual).
- TC-285 — Synthetic demonstration policy cannot authorize real school activation (uat, manual).


## SC-42: Current academic selections, mutation privacy and recovery

Cases: TC-286, TC-287, TC-288, TC-289, TC-290, TC-291, TC-292, TC-293. All remain unrun. Actual callback suites use substituted hooks/components with real synthetic routes/session/D1; mounted review and acceptance remain distinct.

- TC-286 — Academic selected scope rejects delayed former class or learner replies (security, existing).
- TC-287 — Academic controls remain current-admin-only while scoped views work (integration, existing).
- TC-288 — Late denied publication clears private reports fields choices and review (security, existing).
- TC-289 — Synchronous academic locks preserve one enrolment draft or publication action (regression, existing).
- TC-290 — Obsolete captured academic controls and unmounted reads do not act (security, existing).
- TC-291 — Unknown non-idempotent academic saves require original-account comparison (regression, existing).
- TC-292 — Original report publication retry preserves receipt time and guardian notice (integration, existing).
- TC-293 — Restored current actor academic privacy and mounted recovery review (uat, manual).

## SC-43: Current owned inbox saved read status and exact original recovery

Cases: TC-294, TC-295, TC-296, TC-297, TC-298, TC-299, TC-300, TC-301, TC-302, TC-303, TC-304, TC-305. All remain unrun for this specification. Actual callback suites use substituted hooks/elements with real synthetic sessions/routes/production D1 over SQLite; mounted-browser, assistive and educator review remain separate.

- TC-294 — Every current role receives only its owned inbox (smoke, existing).
- TC-295 — Inbox fresh account rejects changed owner and obsolete feed (security, existing).
- TC-296 — Read marker lock confirms the actual saved server timestamp (integration, existing).
- TC-297 — Lost committed read marker retries the exact original notice (regression, existing).
- TC-298 — Late read-status denial hides private notice content (security, existing).
- TC-299 — Pending notice belongs to the original current account (security, existing).
- TC-300 — Acknowledgement or malformed response cannot fabricate a saved read (integration, existing).
- TC-301 — Unavailable notice reminder dismissal changes no record (regression, existing).
- TC-302 — Unmounted inbox and late marker acknowledgement do not refresh private state (integration, existing).
- TC-303 — Legacy inbox dates remain exact stored evidence (integration, existing).
- TC-304 — Encoded original notice ID and stored channels preserve scope (regression, existing).
- TC-305 — Family inbox keyboard mobile and read-status recovery review (accessibility, manual).

## SC-44: Current family class snapshot navigation and honest availability

Cases: TC-306, TC-307, TC-308, TC-309, TC-310, TC-311, TC-312, TC-313. All remain unrun for this specification. Actual callback suites use substituted hooks/elements with real synthetic sessions/routes/production D1 over SQLite; mounted-browser, assistive and educator review remain separate.

- TC-306 — Class viewer consumes one coherent current scoped profile snapshot (smoke, existing).
- TC-307 — Changed account cannot retain previous school class metadata (security, existing).
- TC-308 — Class route generation hides old data and ignores late replies (integration, existing).
- TC-309 — Unavailable family class is distinct from no available profiles (security, existing).
- TC-310 — Uncorrelated or malformed class snapshot fails as a whole (integration, existing).
- TC-311 — Repeated legacy class profile presentation preserves membership evidence (regression, existing).
- TC-312 — Family attendance navigation uses the existing scoped viewer (integration, existing).
- TC-313 — Family current class and inbox usability acceptance (uat, manual).

## SC-45: Manual reading evidence source selection and suitability

Cases: TC-314, TC-315, TC-316, TC-317, TC-318, TC-319, TC-320, TC-321. All remain unrun. Related callback contracts execute actual synthetic sessions/routes/production D1 over isolated SQLite with substituted hooks/elements. Mounted accessibility and named educator/operator acceptance remain separate.

- TC-314 — Planner staff scope and current authorized context (smoke, existing).
- TC-315 — Planner account and response correlation hide obsolete evidence (security, existing).
- TC-316 — Effective reading preserves original manual provenance and revision (integration, existing).
- TC-317 — Manual focus source rights and language stay educator decisions (integration, existing).
- TC-318 — Planning edits and reload clear exact suitability review (unit, existing).
- TC-319 — Copy payload excludes private reading and planning context (integration, existing).
- TC-320 — Changed current planning evidence blocks initial copy (security, existing).
- TC-321 — Mounted reading planner accessibility and suitability review (accessibility, manual).

## SC-46: Original copied draft recovery privacy and editor handoff

Cases: TC-322, TC-323, TC-324, TC-325, TC-326, TC-327, TC-328, TC-329. All remain unrun. Related callback contracts execute actual synthetic sessions/routes/production D1 over isolated SQLite with substituted hooks/elements. Mounted accessibility and named educator/operator acceptance remain separate.

- TC-322 — Duplicate draft actions preserve one original resource UUID (integration, existing).
- TC-323 — Committed uncertain copy recovers only original UUID and bytes (regression, existing).
- TC-324 — Changed account and class cannot inspect pending copy or old receipt (security, existing).
- TC-325 — Original copy evidence remains distinct from later source and resource versions (regression, existing).
- TC-326 — Later reading correction does not rebase original uncertain copy (recovery, existing).
- TC-327 — Rejected original recovery keeps uncertainty and blocks duplicate creation (recovery, existing).
- TC-328 — Delayed and unmounted planner callbacks cannot mutate newer context (integration, existing).
- TC-329 — Educator original-copy recovery and editor handoff acceptance (uat, manual).
