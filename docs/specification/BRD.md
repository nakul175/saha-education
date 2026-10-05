# Saha business requirements document

Version 2.7 draft, 5 October 2026. Sponsor: repository owner; named business approvers and pilot schools remain to be nominated. This is the first document in the BRD → FSD → HLD → LLD sequence. It supersedes the older business scope for forward planning; the historical `docs/education` baseline is retained. The current candidate is identified by its parent below; source presence does not establish deployment or acceptance.

The v2.7 implementation candidate was prepared on `feat/specification-delivery`. `source_commit` records `61f0751b5c38384783f56823a07964421a18c0bf`, the parent of this documented sixth learner-recovery batch, rather than the commit containing its changes. Dated publication and execution records are maintained separately. The v2.0 application baseline remains `5488bc0d20412a3d4be0c031c99c259c56834d5e`; v2.1 evidence and published v2.2 at `82f20ce`, v2.3 at `88205cd`, v2.4 at `85e85d0`, v2.5 at `f312881` and v2.6 at `61f0751` remain historical. Every requirement is unapproved and every designed case is `not-run-for-this-specification`.

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

**Current implementation candidate:** provider-neutral authentication/session foundation, server-enforced school/class/student scope, school/academic APIs, published report handling, manual teaching-resource drafts/revisions/review/assignment/printing, and disabled external ORF launch plus manual reviewed numeric checks. The historical v2.1 extension added reviewed accounts, manual curriculum versions/copies, text/formative evidence and reading corrections. The published v2.2 batch added reviewed student/guardian login link/unlink decisions, live academic batch/duplicate-pair guards, local normalized reading JSON staging/review/receipts, and reviewed open/closed/timed submission windows. The published v2.3 batch rechecks current authority and class references at persistence and makes new report publication plus eligible guardian notices one atomic winner operation, with role-appropriate administration and uncertainty handling. Code presence does not establish deployment, operational readiness, educator acceptance or complete administration journeys.

**Next business slice:** agree pilot school context, curriculum/grades/languages and reviewer policies; validate the manual workspace; configure and test the chosen identity provider with synthetic users; confirm the ORF destination.

**Later proposed scope:** pilot-approved curricula/licensing, AI draft assistance, existing account role/identity/school remapping, complete academic correction/audit and retention beyond the reviewed attendance slice, agreed grade/late/guardian-publication policy, verified external adapters and document-file exports. The new manual library, reading corrections reviewed attendance and text/formative workflows are partial deliveries; they do not resolve these wider policies. Each extension requires the corresponding functional/design/test revision.

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
11. Learner attempts remain plain text against the assigned approved version; staff feedback remains formative. Due dates remain informational. A separately reviewed submission window controls new attempts; no policy row means unrestricted. Reading history uses exact task/language/duration keys and descriptive metrics, with no scoring norms or diagnoses.

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

## v2.2 business control additions

Trace: BR-01, BR-02, BR-05, BR-07, BR-09, BR-10; FR-04, FR-06, FR-08–FR-10, FR-20, FR-24–FR-26; NFR-01–NFR-03, NFR-05, NFR-09. These are implemented candidate choices, not approved school policies.

12. Login profile ownership changes require an attributable current-school administrator review, expected version, reason and explicit confirmation. Old/new account sessions are revoked atomically, excluding the reviewing administrator so malformed legacy relationships can be repaired. This does not validate parenthood, consent or account role/identity changes.
13. New academic duplicate pairs are blocked without deleting historical duplicates. Attendance and result batches recheck every current member and actor in the actual write; ambiguous legacy result pairs block the whole batch. General academic correction history remains incomplete: the v2.5 reviewed attendance flow has immutable before/after evidence, while legacy attendance and assessment replacements retain their existing semantics.
14. A staff-supplied normalized JSON reading draft is a local manual workflow: stage immutable original values, review every item, then confirm all observations with durable declared-source receipts or reject with no observations. Source labels/references do not authenticate a vendor. A result is consumed once per school and exact declared namespace/reference, even across different draft IDs.
15. Staff may append a reviewed open, closed or timed window for new learner text attempts. Closure does not delete attempts, prevent current authorized feedback, or undo exact committed UUID replay. Due date remains informational; grading, late penalties, attachments, guardian publication and real-use deadline policy remain open.

The wider requirements stay partial/planned as registered. No educator, vendor, identity provider, real learner or business acceptance is inferred. Proposed success evidence must separately reconcile profile ownership, observed duplicate prevention, source-receipt provenance, deliberate rejection, closure/reopening and preserved historical work with the pilot's named reviewers.

## v2.3 current authority and publication controls

Trace: BR-01, BR-02, BR-10, BR-11; FR-03, FR-05–FR-07, FR-11, FR-12, FR-26; NFR-01–NFR-03, NFR-05, NFR-09.

16. Permission must still hold when a record is read or saved. Disabling, demoting or moving an account, removing its trusted mapping, changing a teacher assignment or transferring a referenced course/learner must not preserve stale request authority. Rejected writes preserve existing records; this is enforcement of existing scope, not a new transfer or repair policy.
17. Only a current school administrator creates and publishes reports. One new publication winner records its actor, student, school and time and publishes with current eligible guardian-account notices atomically. An unpublished/denied/failed operation creates no notice; retry preserves the winning publication. Historical reports/notices remain and are not backfilled with fabricated review evidence.
18. Role-appropriate screens show current verified-school controls. An uncertain draft-create response requires reloading and checking stored reports before creating again; the current API does not promise draft-create idempotency. Publication reviews the saved report and acknowledgement recovery retains the inbox. School bootstrap, provider activation and external delivery remain unavailable.

Real-use publication, family notice retention, corrections, grade meaning, accessibility, provider/ORF setup and operations still require named policy and acceptance decisions. Fixing these reproduced races does not certify every source path or production readiness.

## v2.4 truthful role dashboard scope

Trace: BR-01, BR-02, BR-11, BR-12; FR-03, FR-08–FR-11; NFR-01–NFR-05, NFR-09.

Administrators see exact current-school record counts and enabled mapped teacher accounts. Teachers see current assigned classes and actual recording coverage against the current active same-school roster. A zero score is a recorded value; partial recording, no current roster and ambiguous/invalid legacy evidence have distinct labels. Neither recording coverage nor stored grades establish educational progress, grading approval or learning efficacy.

Students/guardians see current explicit linked profiles, observed attendance statuses/date coverage and published school-supplied report grades. No attendance data is identified as missing evidence, rather than 0% attendance. Excused and unrecognized statuses remain visible without inventing weighting, a school-calendar denominator or expected days. Existing family class eligibility is preserved; this batch creates no new historical access right.

One current-authority database snapshot supplies each role dashboard. Display caps and exact totals are distinct and visible; refresh obtains a new snapshot. This closes the reproduced dashboard composition/count gap within FR-03's current authorization contract, while its approval remains false. Provider verification, retention, representative capacity/accessibility and educator/UAT acceptance remain separate gates.

## v2.5 reviewed attendance and observed summaries

Trace: BR-01, BR-02, BR-10–BR-12; FR-03, FR-08, FR-09, FR-26; NFR-01–NFR-05, NFR-07–NFR-09.

Staff deliberately choose a date and changes against current saved attendance. Unrecorded pupils remain unmarked; the software never chooses present by default. A current assigned teacher or school administrator reviews dirty entries with full saved evidence, reason and explicit confirmation. One atomic decision records before/after values and attribution; stale evidence, changed authority, active membership, oversized roster or legacy pair ambiguity prevents the whole reviewed save.

A confirmed decision is immutable. An uncertain request retains its UUID and exact payload; later exact replay returns the original decision without reapplying marks changed by a subsequent legacy save. Withdrawal alone preserves current original-class staff evidence for same-school pupils. Transfer ends access to the entire original batch. These are narrow current contracts, not an approved temporal entitlement or correction governance model.

The attendance viewer joins current pupil identity and observed raw status/date counts in one authorized snapshot. Counts describe saved rows, with no school-day denominator, percentage, excused weighting, grade or progress inference. Existing legacy attendance replacements remain available and receive no fabricated historical receipts. FR-09 and FR-26 stay partial because school calendar, correction governance, legacy/result audit, retention/export and educator acceptance remain unresolved.

## Fifth-batch reviewed assessment outcome

Trace: BR-01, BR-02, BR-10–BR-12; FR-03, FR-08, FR-10, FR-26; NFR-01–NFR-09. Staff must see actual saved results without fabricated zero/grade, review deliberate changes and preserve attributable originals when records or access change. The fifth candidate adds coherent active-roster results and separate dirty-only full result/metadata review with durable original UUID recovery. A reviewed feedback edit cannot silently restore a peer's newer score/grade.

The existing legacy result endpoint remains accepted mutable replacement behavior; it is not retrospectively reclassified as reviewed or UUID-idempotent. Every old result/duplicate survives migration. New receipts record explicit current staff review, not retrospective educator approval. Current roster bounds and raw malformed/opaque/unsafe evidence are visible and can block this reviewed path without inventing norms or deleting evidence.

School-supplied grades remain literal text. Scoring meaning, grade policy, result publication to families, correction governance, historical entitlement, ambiguous legacy repair, legacy write bypass and unified retention remain open. FR-10/FR-26 stay partial/unapproved. [Assessment design](ASSESSMENT-DESIGN.md), [diagnostic/remediation](../current/ASSESSMENT-REVIEW.md) and SC-32–SC-34 describe the candidate; source/tests do not authorize real learner usage or establish business acceptance.

## Sixth-batch learner recovery and visible privacy

Trace: BR-02, BR-05, BR-10–BR-12; FR-03, FR-17, FR-24, FR-26; NFR-01, NFR-03–NFR-07, NFR-09. A lost saved response, reviewed feedback or window reply must be recovered with the original actor-bound UUID/request, rather than creating a new record from stale text after Refresh. Current access denial must hide assignment material, attempts/feedback and policy/history and stop protected actions. A later valid reload restores only current authorized evidence; it does not rebase the unresolved original request.

A known saved receipt stays saved when a follow-up read fails. Pending requests are held in page memory, with sign-in in another tab where needed; no durable cross-page outbox is promised. The [focused recovery design](LEARNER-RECOVERY-DESIGN.md) adds no schema/routes or educational policy. Grade/late/guardian visibility, real identity/provider, capacity, retention and educator acceptance remain separate gates. SC-35–SC-36 procedures remain unrun.
