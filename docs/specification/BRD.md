# Saha business requirements document

Version 2.1 draft, 5 October 2026. Sponsor: repository owner; named business approvers and pilot schools remain to be nominated. This is the first document in the BRD → FSD → HLD → LLD sequence. It supersedes the older business scope for forward planning; the historical `docs/education` baseline is retained. Source evidence is the implementation candidate at commit `5488bc0d20412a3d4be0c031c99c259c56834d5e`, not a deployed or accepted production system.

The v2.1 extensions describe the current working candidate on `feat/specification-delivery`, based on documentation commit `d53adcf`. The original v2.0 application baseline remains `5488bc0d20412a3d4be0c031c99c259c56834d5e`. New behavior is not attributed to that historical SHA; actual execution is recorded separately and all business acceptance remains unapproved.

## Business purpose

Saha brings school records, teacher preparation and published learning resources into one controlled workspace. Administrators maintain rosters and academic structures; teachers prepare, review and distribute resources; students and guardians receive only information they are entitled to see. A separate oral reading application can support reading checks, while Saha retains roster authority and reviewed numeric observations.

The sponsor confirmed AmplifiU as the reference for teacher tools. The goal is an original Saha workflow for curriculum context, lesson/worksheet/quiz/activity drafts, teacher review and class assignment, with optional later AI assistance. A licensed AmplifiU integration or reproduction of its proprietary content is not part of the agreed build. The actual ORF application, identity provider and pilot curriculum remain unresolved.

The business problems are proposed from the sponsor’s request and existing scope: fragmented records, repeated teacher preparation, uncontrolled content versions and disconnected reading evidence. They have not been validated by school interviews or a measured baseline.

## Stakeholders and proposed responsibilities

| Role | Business need | Responsibility |
|---|---|---|
| Sponsor / school leadership | Agree outcomes and pilot readiness | Own scope, policy decisions, acceptance and release authorization |
| School administrator | Maintain correct school records | Manage school rosters and school-level resource review |
| Teacher | Prepare appropriate teaching and track assigned learners | Author, review, assign resources and enter reviewed academic/reading records |
| Student | Receive understandable assigned material | View own published records and active-class learning |
| Guardian | Understand linked child progress | Read permitted linked records and published reports; resource publication policy is pending |
| Operator | Keep service usable and recoverable | Provision environments/identities, protect configuration, test recovery and support incidents |
| Educator reviewer / QA | Validate suitability and behavior | Review curriculum/content, define acceptance evidence and record test execution |

These are role responsibilities, not assignments to named individuals.

## Business requirements

| ID | Requirement | Proposed success evidence |
|---|---|---|
| BR-01 | Keep coherent school, student, family and academic records. | Pilot roster reconciles with an approved synthetic reference without unauthorized cross-school changes. |
| BR-02 | Give each user trusted identity and appropriate record access. | Verified provider journey and role/school/class/student negative checks; real provider still pending. |
| BR-03 | Reduce repeated teacher preparation through reusable structured resources. | Teachers complete original lesson/worksheet/quiz/activity workflows; time baseline and improvement target to be agreed. |
| BR-04 | Preserve reviewed content and attributable revisions. | Assigned versions remain reproducible after edits; review evidence is retained. |
| BR-05 | Deliver approved learning material to authorized classes. | Learners see their assignments and receive no staff notes/answer keys; guardian policy pending. |
| BR-06 | Connect the confirmed external ORF application without silently sharing learner data. | Confirmed destination, clear separate sign-in and agreed result contract; current launch is disabled. |
| BR-07 | Retain reviewed reading evidence that teachers can interpret responsibly. | Numeric counts, duration and source provenance persist; scoring/content suitability reviewed by educators. |
| BR-08 | Add teacher-controlled AI drafting only after provider and curriculum grounding are agreed. | Draft review, provenance, failure handling and budget controls; no current AI service. |
| BR-09 | Exchange data with external systems only through verified contracts. | Authorized mappings, repeat-safe imports and external-provider test evidence; adapters deferred. |
| BR-10 | Operate safely with observable failures and recoverable records. | Release checklist, recovery drill and incident ownership; production wiring is not established. |
| BR-11 | Support the selected languages and accessible learner/staff journeys. | Pilot language/content and accessibility review; supported target matrix to be approved. |
| BR-12 | Measure adoption, preparation effort and service quality without unsupported claims. | Agreed baseline, measurement method, owners and periodic pilot review. |

## Scope and release slices

**Current implementation candidate:** provider-neutral authentication/session foundation, server-enforced school/class/student scope, school/academic APIs, published report handling, manual teaching-resource drafts/revisions/review/assignment/printing, and disabled external ORF launch plus manual reviewed numeric checks. The v2.1 working extension adds reviewed account provisioning/status administration, manual versioned curriculum references and unapproved copies, plain-text learner attempts/reviewed formative feedback, and attributable reading corrections with exact-task history. Code presence does not establish deployment, operational readiness, educator acceptance or complete administration journeys.

**Next business slice:** agree pilot school context, curriculum/grades/languages and reviewer policies; validate the manual workspace; configure and test the chosen identity provider with synthetic users; confirm the ORF destination.

**Later proposed scope:** pilot-approved curricula/licensing, AI draft assistance, role/identity/profile remapping, complete academic correction/audit and retention, enforceable submission-window/grade/guardian-publication policy, verified external adapters and document-file exports. The new manual library, reading corrections and text/formative workflows are partial deliveries; they do not resolve these wider policies. Each extension requires the corresponding functional/design/test revision.

**Outside present scope:** fees/payments, payroll, transport, admissions campaigns, examination proctoring, native mobile apps, offline synchronization, medical diagnosis, automatic learner risk classification, automatic paid provider activation, and licensed AmplifiU integration. Email/SMS and collection of audio/transcripts remain deferred.

## Business rules

1. School, role, class and profile relationships grant authority; a supplied identifier or external app does not.
2. Teachers manage their own resource drafts; school administrators act within their school. Students receive only approved active-class assignments.
3. A content change creates a new version. Approval applies to an exact saved version; assignment pins that version. Self-review is currently allowed and requires explicit policy confirmation for the pilot.
4. Student views exclude private staff fields on the server. Draft reports/results remain private until the applicable publication rule permits access.
5. Opening an external app is distinct from shared sign-in or result synchronization. Manual reading records retain their manual provenance.
6. ORF rate/accuracy alone does not establish comprehension, diagnostic risk or grade-level norms. Teacher interpretation and comparable-task policy are required.
7. Real provider activation, notifications, deployment and data migration require their own verified environment/policy decisions.
8. Withdrawals and corrections must preserve appropriate history; current historical-access/correction gaps must be resolved before real records are used.
9. A school administrator explicitly reviews provisioning/status changes with an attributable reason. This slice fixes school to the actor, keeps existing role/issuer/subject immutable and protects self/final-administrator access. Disablement revokes current sessions; restoration requires a new sign-in.
10. Curriculum permissions are manually declared, not verified automatically. Source approval never approves its copied teaching draft; that draft keeps the exact source-version provenance and requires its own review.
11. Learner attempts remain plain text against the assigned approved version; staff feedback remains formative. Due dates are informational pending an agreed deadline policy. Reading history uses exact task/language/duration keys and descriptive metrics, with no scoring norms or diagnoses.

## Outcomes and measurement plan

| Measure | Baseline method | Target / owner status |
|---|---|---|
| Teacher preparation effort | Time a representative manually authored resource task with consenting pilot teachers | Target and educator owner pending |
| Workflow completion | Observe draft → review → assignment → learner-view journeys | Pilot sample and completion target pending |
| Record correctness | Reconcile approved synthetic roster/academic fixtures and reviewed corrections | Tolerance and school data owner pending |
| Access isolation | Execute mandatory negative school/class/family/learner cases | Unauthorized disclosure is release-blocking; case set in test pack |
| Availability and performance | Measure agreed representative journeys in the intended environment | Scale, latency and availability targets pending; no invented SLA |
| Content suitability | Educator reviews selected curriculum, language, difficulty and answer keys | Review rubric and reviewer nomination pending |

No learning-outcome improvement, compliance certification or cost saving is claimed.

## Dependencies, risks and acceptance

Critical dependencies are the existing sign-in provider/tenant, identity/profile mappings, confirmed ORF app, pilot curriculum, reviewer/publication/correction rules, retention, actual hosting/database wiring and operational ownership. Unverified AI/provider/result contracts must not be treated as available services.

Business acceptance requires sponsor-reviewed BRD scope, educator-reviewed functional flows/content, applicable security and role tests, agreed nonfunctional evidence and a documented pilot/release decision. The documents can be produced in order while testing/data/design work proceeds in parallel; drafting does not imply approval. See [decisions and risks](DECISIONS-RISKS.md), [functional specification](FSD.md) and [test strategy](TEST-STRATEGY.md).
