# Business user acceptance plan

Version 2.1 draft, 5 October 2026. Historical v2.0 source candidate: `5488bc0d20412a3d4be0c031c99c259c56834d5e`. Case design only; no per-case execution or business acceptance is recorded for this specification. Existing-suite verification is recorded separately. Business requirements and approval state are defined in [BRD](BRD.md) and [requirements register](requirements.json).

The v2.1 extensions describe the current working candidate on `feat/specification-delivery`, based on documentation commit `d53adcf`. The original v2.0 application baseline remains `5488bc0d20412a3d4be0c031c99c259c56834d5e`. New behavior is not attributed to that historical SHA; actual execution is recorded separately and all business acceptance remains unapproved.

## Purpose and entry

Validate sponsor-approved pilot workflows with named school administrators, teachers, students/family representatives, educator reviewers, QA and operator. All users/content/data must remain synthetic until approved identity, privacy, correction, retention and operating policies permit real records. The pilot school/curriculum/grade/language, research baseline, review/publisher powers and named signatories are pending.

Entry requires agreed BRD/FSD scope, the relevant implementation and applicable security/integrity checks, a reproducible environment/migration/fixture revision and known defects. A planned feature or policy-dependent workflow is blocked rather than tested through a fabricated interface. Injected-session browser tests validate role journeys but cannot meet live provider sign-in acceptance.

## Acceptance journeys

| Case | Journey | Required people / dependency |
|---|---|---|
| TC-010 | Live synthetic provider/browser callback | Provider operator + mapped synthetic user; registered HTTPS callback pending |
| TC-025 | Roster reconciliation after withdrawals | Educator/sponsor/QA; stated case preconditions and policy decisions |
| TC-030 | Attendance date and attributable corrections | Educator/sponsor/QA; stated case preconditions and policy decisions |
| TC-049 | Approval requires explicit self-review confirmation | Educator/sponsor/QA; stated case preconditions and policy decisions |
| TC-056 | Teacher print edition explicitly opted in | Educator/sponsor/QA; stated case preconditions and policy decisions |
| TC-060 | Confirmed app availability and separate sign-in | Educator/sponsor/QA; stated case preconditions and policy decisions |
| TC-067 | Comparable-task trends and non-diagnostic language | Educator/sponsor/QA; stated case preconditions and policy decisions |
| TC-070 | English/Hindi content and locale completeness | Educator/sponsor/QA; stated case preconditions and policy decisions |
| TC-071 | Language-specific assessment interpretation | Educator/sponsor/QA; stated case preconditions and policy decisions |
| TC-077 | Educator AI content review and disclosure | Educator/sponsor/QA; stated case preconditions and policy decisions |
| TC-096 | School and academic administrator UAT | Educator/sponsor/QA; stated case preconditions and policy decisions |
| TC-097 | Teacher manual preparation and exact-version UAT | Educator/sponsor/QA; stated case preconditions and policy decisions |
| TC-098 | Student approved learning and guardian boundary UAT | Educator/sponsor/QA; stated case preconditions and policy decisions |
| TC-099 | Reviewed ORF interpretation UAT | Educator/sponsor/QA; stated case preconditions and policy decisions |
| TC-101 | Risk-based release acceptance and defect disposition | Educator/sponsor/QA; stated case preconditions and policy decisions |

The case register also supplies supporting security/integration/print/correction procedures. Business acceptance requires the complete chosen journey and agreed expected outcomes, not merely its automated happy path. Test student/guardian negative boundaries alongside authorized experiences. Unsupported guardian assignments must be clearly identified; family report reading does not imply assignment access.

## Business measurement

For BR-03 and BR-12, agree a representative preparation task, baseline method, sample, observer and outcome target before measuring. Record actual elapsed effort and workflow obstacles; no claimed saving without approved comparable baseline. For curriculum/language suitability, educators check correctness, age/grade fit, directions, answer keys, source rights and appropriateness. Original template scaffolds and optional future AI output are not evidence of curriculum approval or learning impact.

For reading, educators confirm the task/scoring/provenance and interpretation boundaries. Numeric ORF rate/accuracy does not demonstrate comprehension, dyslexia risk, validated norms or language equivalence. App availability, source authenticity, corrections and comparable trends are separate acceptance dependencies.

## Execution record template

Record:

- Case/scenario IDs, canonical FR/NFR and BR; pilot scope and approved policy version.
- Tested commit, environment, build, migrations, fixture revision and account role/scope (no raw cookies).
- Tester/observer/date, actual steps, expected-result comparisons and persisted-state checks.
- Redacted screenshots/HTTP evidence, manual educator comments and defects.
- Outcome: pass, fail or blocked; reason and unresolved dependencies.
- Reviewer/approver, date, scope accepted and any explicitly authorized deferral with owner, risk and expiry.

The JSON/CSV design statuses remain not-run; actual execution records are separate controlled artifacts. Approval should reference that executed revision. A future retest after code/policy/provider changes needs its own result and impact review.

## Exit and decision

No critical access/privacy/data integrity/wrong-version defect; approved pilot identity/roster/content/review/correction rules; demonstrated applicable operating/recovery/accessibility/performance evidence; all chosen current journeys executed; future/deferred scope explicit. Require named sponsor and educator sign-off with QA/operator evidence appropriate to release.

If provider, ORF destination, retention, history/correction or recovery prerequisites are missing, record blocked scope and do not label the whole product accepted. Historical 482 checks, 23 served resource cases and 14 browser observations in [VALIDATION](../../VALIDATION.md) support investigation but are not this UAT decision. The newly initialized eleven-suite count baseline records an actual 482-assertion unit/integration run plus three static steps; the guarded recheck passed on 5 October 2026 with eleven baselined suites and zero quarantine. [Execution record](TEST-EXECUTION.md) and [summary](EXECUTION-SUMMARY.json) describe these existing-suite outcomes, which do not execute these UAT cases or supply educator/sponsor approval. No new UAT execution, merge, deployment, learning efficacy or compliance acceptance is claimed.
