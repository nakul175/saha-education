# Saha functional specification document

Version 2.3 draft, 5 October 2026. Derived from [BRD](BRD.md) and [requirement register](requirements.json); technical design follows in [HLD](HLD.md) and [LLD](LLD.md). Historical v2.0 source candidate: `5488bc0d20412a3d4be0c031c99c259c56834d5e`. All acceptance remains unapproved. An “implemented” entry describes candidate behavior, not a deployed service or approved business outcome.

The v2.3 implementation candidate was prepared on `feat/specification-delivery`. `source_commit` records `82f20ce9ae023bdb78d53aecc229331b57bce5eb`, the parent of this documented second batch, rather than the commit containing its changes. The changes were uncommitted when this specification was assembled; dated publication and execution records are maintained separately. The v2.0 application baseline remains `5488bc0d20412a3d4be0c031c99c259c56834d5e`; v2.1 evidence and the published v2.2 batch at `82f20ce` remain historical. Every requirement is unapproved and every designed case is `not-run-for-this-specification`.

## Product modules and navigation

| Module | Intended user | Current entry | Boundary |
|---|---|---|---|
| Identity and session | All provisioned roles | `/login`, `/api/auth/*`, `/api/session` | Real provider/tenant still pending; no public self-registration |
| School and roster | Administrator; scoped teacher/family reads | `/schools`, `/students`, `/guardians`, `/courses`, `/classes`, `/enrolments` | Operator school bootstrap; explicit profile links; historical/role-remapping policy pending |
| Reviewed accounts and profile links | School administrator | `/admin/users`, `/admin/profile-links` | Provision/status plus versioned student/guardian login link/unlink; existing role/issuer/school immutable; no relationship verification |
| Academic records | Administrator/assigned teacher; scoped published family reads | `/attendance`, `/assessments`, `/report-cards`, `/notifications` | Grade/calendar/correction policies and complete UAT pending |
| Teaching resources | Administrator/authoring teacher | `/resources`, `/resources/{id}`, `/resources/{id}/print` | Manual original templates, revision/review/assignment; no AI generation |
| Assigned learning | Active-class student; staff preview | `/learning`, `/assignments/{id}` | Approved pinned content, text attempts and formative feedback; guardian view/grades/late policy pending; reviewed submission windows current |
| External reading | School staff | `/external-apps` | Trusted launch disabled until URL confirmed; manual reviewed numeric records |
| Reading imports | Current school administrator / creator teacher still assigned to class | `/reading-imports` | Stage strict local JSON, review original values, confirm atomically or reject; user-declared source, no vendor sync |
| Reading review | Current assigned teacher / administrator | `/reading-review` | Preserved originals, append-only corrections and exact-task descriptive history; norms/interpretation pending |
| Manual curriculum references | School staff | `/curriculum`, `/curriculum/{id}` | Original manual source versions, declared rights, exact review and unapproved copies; pilot/licensing unverified |
| Optional AI | Proposed school staff | No current route | Grounded drafting/provider/budget/review contracts remain planned |

## Functional requirements and candidate status

| ID | Business link | Functional requirement | Candidate status | Source |
|---|---|---|---|---|
| FR-01 | BR-02 | Configure chosen OIDC provider; verify issuer/subject and callback before creating a session. | partial | `lib/education/oidc.ts` |
| FR-02 | BR-02 | Opaque hashed sessions, expiry, logout and live disabled/role/school checks. | implemented | `lib/education/session.ts` |
| FR-03 | BR-02 | Scope domain reads/writes to current school, role, class assignment and explicit profile links; coherent dashboard snapshot enforcement remains the next slice. | partial | `lib/education/access.ts` |
| FR-04 | BR-01 | Reviewed provisioning, status and versioned student/guardian login link/unlink workflows; no public registration or existing identity/role/school remapping. | partial | `lib/education/identity-admin.ts` |
| FR-05 | BR-01 | School-scoped administration; school bootstrap remains operator provisioned. | partial | `lib/education/schools.ts` |
| FR-06 | BR-01 | Maintain student and guardian links with explicit role-matched school identity ownership. | partial | `lib/education/students.ts` |
| FR-07 | BR-01 | Maintain courses/classes and eligible school teachers. | partial | `lib/education/classes.ts` |
| FR-08 | BR-01 | Record active/withdrawn/completed enrolment, guard new duplicate pairs without deleting legacy evidence, and preserve agreed history. | partial | `lib/education/enrolments.ts` |
| FR-09 | BR-01 | Record authorized class/student attendance with atomic current-eligibility batches; agree academic dates and correction policy. | partial | `lib/education/attendance.ts` |
| FR-10 | BR-01 | Manage assigned-class assessments/results with current score/membership and duplicate-pair guards; family result publication remains deferred. | partial | `lib/education/assessments.ts` |
| FR-11 | BR-01 | Keep drafts private and publish scoped term reports with repeat-safe notices. | partial | `lib/education/report-cards.ts` |
| FR-12 | BR-01 | Show recipient-owned in-app notices; external delivery remains disabled. | partial | `lib/education/notifications.ts` |
| FR-13 | BR-03 | Create original lesson/worksheet/quiz/activity drafts with curriculum context and private staff fields. | implemented | `lib/education/resources.ts` |
| FR-14 | BR-04 | Append immutable content versions and reject stale concurrent edits. | implemented | `lib/education/resources.ts` |
| FR-15 | BR-04 | Explicitly approve a saved version with one-time reviewer/time; later versions need review. | implemented | `lib/education/resources.ts` |
| FR-16 | BR-05 | Assign exact approved version to an authorized class with repeat-safe writes. | implemented | `lib/education/resources.ts` |
| FR-17 | BR-05 | Show active-class approved assignments; omit staff notes/answer keys in server output. | implemented | `app/learning/page.tsx` |
| FR-18 | BR-05 | Print exact approved student edition; staff explicitly choose teacher edition. | implemented | `app/resources/[id]/print/page.tsx` |
| FR-19 | BR-06 | Launch confirmed trusted HTTPS app with separate sign-in and no learner/session forwarding. | partial | `lib/education/external-apps.ts` |
| FR-20 | BR-07 | Record manual reviewed counts/duration/provenance; derive rate/accuracy and protect retries. | implemented | `lib/education/reading-checks.ts` |
| FR-21 | BR-07 | Add attributable corrections and comparable-task history after educator scoring policy. | partial | `lib/education/reading-review.ts` |
| FR-22 | BR-03 | Use versioned original/licensed reference sources for selected curricula and languages. | partial | `lib/education/curriculum.ts` |
| FR-23 | BR-08 | Produce structured provisional teacher drafts with references, review, provenance and budget controls. | planned | `docs/current/AMPLIFY-LITERACY-PLAN.md` |
| FR-24 | BR-05 | Collect immutable authorized text attempts and reviewed feedback; append reviewed open/closed/timed submission windows independently of informational due dates. | partial | `lib/education/submissions.ts` |
| FR-25 | BR-09 | Verify external contracts before automatic mapped import/export; local normalized JSON drafts require explicit educator review and do not authenticate a vendor. | planned | `docs/current/EXTERNAL-READING.md` |
| FR-26 | BR-10 | Preserve attributable correction/review evidence and agree retention before real records. | partial | `docs/current/SPECIFICATION-DELIVERY.md` |

## Roles and authority

| Operation | School administrator | Teacher | Student | Guardian |
|---|---|---|---|---|
| School/roster administration | Own school within permitted services | Scoped reads and permitted academic operations | Own linked records | Explicitly linked students |
| Academic write | Own school | Assigned class and eligible student | Denied | Denied |
| Raw assessment results | Staff scope | Assigned class scope | Denied pending publication policy | Denied pending publication policy |
| Published term report | Own school | Permitted student scope | Own published report | Linked student published report |
| Resource draft/history/edit/review | Own school | Own authored resources | Denied | Denied |
| Resource assignment | Approved school resource to own-school class | Own resource to assigned class | Denied | Denied |
| Assigned learner material | School preview | Assigned-class preview | Active enrolled class only | Denied pending publication policy |
| External ORF launch/record/history | Own-school staff scope | Assigned class/student scope | Denied | Denied |
| In-app notification | Own recipient records | Own recipient records | Own recipient records | Own recipient records |
| Reviewed account provisioning/status/evidence | Own school; cannot self-disable | Denied | Denied | Denied |
| Curriculum reference author/revise/review | Own school | Own references; peer approved read/copy only | Denied | Denied |
| Learner text attempts | Scoped school/class read | Assigned-class read | Own active-class submit/read | Denied |
| Formative feedback | Scoped school review/read | Assigned-class review/read | Own permitted attempt read | Denied |
| Reading correction/history | Own school while student remains there | Current original-class assignment while student remains in school | Denied | Denied |

This matrix summarizes current candidate choices; exact endpoint rules are in [API contracts](API-CONTRACTS.md). A screen label, local role value or externally supplied school/student ID does not grant authority. Missing school, invalid sessions, disabled accounts and unmatched profile links fail closed. Original new-reading entry still requires active enrolment; correction/history retains evidence for the current original-class staff while the student remains in school. This is a specific proposed policy choice, not a complete historical-entitlement model.

## Identity and academic journeys

**Sign in (FR-01–03):** a provisioned user starts provider sign-in; the application binds a one-use transaction to the browser and verifies the provider response before mapping issuer/subject to an enabled account. Success issues an opaque session and opens the role dashboard. Missing configuration shows an unavailable state. Failed/mismatched/expired callbacks grant no session. Logout invalidates the session. Provider account changes do not automatically grant Saha roles.

**Roster and academic setup (FR-04–08):** an operator bootstraps school/first-administrator relationships; a school administrator maintains student/guardian/course/class relationships and now provisions reviewed exact identities in their school. Teachers must belong to the class’s school with the appropriate enabled role. Enrolment links the student and class in the same permitted school. Changes preserve identifiers and omitted explicit identity links. Withdrawal/completion preserves records; new duplicate pairs are guarded while legacy evidence is preserved. Existing identity role/school/pair remapping remains outside account administration; profile login links use the separate reviewed screen.

**Reviewed account administration (FR-04/FR-26):** an enabled school administrator checks name/email, exact HTTPS provider issuer/subject and role, then confirms the review with a one-line reason. School/actor/time come from the server; duplicate email or identity is a conflict. The screen lists up to 500 accounts and 200 latest events, not totals/full archive. Enable/disable reviews use the expected administration version, stable request UUID and explicit reason. A stale conflict keeps text and asks the administrator to refresh/reopen the account. Disablement, deletion of all sessions, revision and event commit together. Self-disable/final-enabled-administrator loss is denied. Restoring access does not resurrect sessions or activate the provider; explicit profile links stay separate.

**Attendance and assessment (FR-09–10):** staff choose an authorized class and eligible student, submit a validated academic record, and retrieve it through the same scope. Foreign identifiers and unassigned teachers are rejected. Actual attendance/result statements recheck live actor/class/active membership for the whole batch. New enrolment/result duplicate pairs are guarded without erasing legacy duplicates; ambiguous existing result pairs conflict. Date/grade rules and attributable academic corrections still need approval/design. Current family assessment-result access is denied, not inferred from enrolment alone.

**Term publication and notices (FR-11–12):** school administrators prepare a private report and explicitly publish it; teachers have scoped report reads. Linked family/student views receive only permitted published reports. New publication and current eligible user-mapped in-app notices commit through one immutable winner receipt; historical receipts are not backfilled. Publication retry retains the winner, while draft creation has no UUID retry contract; external email/SMS delivery is not implied. Notices remain visible only to their recipient.

## Teacher resource journey

**Create (FR-13):** staff choose lesson, worksheet, quiz or activity; enter title, curriculum context, grade, subject, language, objectives and student material; optionally add private notes/answer key. Templates are structural writing prompts, not generated lessons or certified curriculum alignment. Save persists the resource and version 1 together. A matching client UUID retry returns the same original resource; a different payload or actor using that ID conflicts.

**Revise (FR-14):** staff open an authorized resource, edit its latest content and save with the expected version number. Success appends the next version and preserves earlier content. A stale/concurrent save returns conflict; the screen keeps unsaved text and offers history refresh or deliberate reload. A failed network response must not be presented as proof of failure to persist. There is no deletion or rollback endpoint.

**Review (FR-15):** select an exact saved version, inspect student material, notes and answers, and explicitly confirm suitability. Approval stores the first reviewer/time against that version. Repeat approval preserves that evidence. Self-review is currently permitted. A revised version begins unapproved and never inherits approval. Unsaved edits cannot be silently approved.

**Assign (FR-16):** select an approved saved version, an authorized class and optional due date. The server validates resource ownership/school, exact-version approval and live class authority at insertion. Matching assignment retries return the established assignment; conflicting due date/actor reuse does not overwrite it. No automatic notification is sent.

**Read and print (FR-17–18):** students open active-class approved assignments. Server responses exclude private notes and answer keys; later revisions leave the assigned version unchanged. Staff print an exact approved version, defaulting to student edition; teacher edition is an explicit staff choice. Print views are browser printing, not Word/PPT/PDF-file generation.

### Resource validation

| Field | Rule |
|---|---|
| type | `lesson`, `worksheet`, `quiz`, `activity` |
| title / curriculum / grade / subject | Required trimmed text, max 160 / 120 / 40 / 80 characters |
| language | Required simple language tag such as `en-IN` or `hi-IN`, max 35; not a complete language-registry validator |
| objectives / body | Required trimmed text, max 4,000 / 20,000 characters |
| teacher notes / answer key | Required string values may be empty, max 8,000 each; always private in assignment responses |
| revision | Integer expected version 1–1,000,000; server derives next version |
| due date | Optional real `YYYY-MM-DD` date; scheduling/timezone reminders are not implemented |
| client create ID | Optional UUID for safe create retry; cannot confer authorship or school |

New resource request objects are strict. Author, school, IDs of versions, timestamps, reviewer and approval state are server-controlled. Plain text rendering does not execute embedded markup.

## Oral reading journey

**External launch (FR-19):** signed-in staff prepare the fixed configured HTTPS destination. The client opens it separately without referrer, student identifiers or Saha credentials. The external app may require separate sign-in. Missing/invalid configuration is unavailable; clients cannot override the URL. This is launch-only, not SSO or automatic result synchronization. Language Studio remains the candidate app pending sponsor confirmation.

**Reviewed entry (FR-20):** staff select an authorized class and actively enrolled student, then enter reviewed counts, duration, language, passage reference and reading date. Persist append-only manual provenance and derive metrics. A matching UUID/actor/canonical payload retry returns the same record; conflicting reuse fails. No recording, transcript or full passage is collected.

The original-entry insertion now rechecks current class authority, active enrolment, student school and the actor's live role/school/enabled/identity state in the database statement. Separate earlier validation cannot authorize a stale write. Read/retry scope also requires the live actor; current assigned staff cannot use this entry path to create a new check for a withdrawn student.

| Input / output | Rule |
|---|---|
| Reading date | Real `YYYY-MM-DD`, no later than today in UTC; school-timezone policy pending |
| Duration | Finite seconds 1–3,600; stored as rounded integer milliseconds |
| Attempted words | Integer 1–500 |
| Correct words | Integer 0–attempted |
| Passage reference | Required plain reference, max 200; not full passage content |
| Language | Simple tag max 35 |
| Correct words/minute | `round(correct × 60000 / stored durationMs)` |
| Accuracy | `round(correct × 100 / attempted)` |

Externally supplied derived scores, school, authorship and provenance are rejected. Results are not authenticated external exports. The new review screen retains each original alongside an effective latest correction and its full attributable history. Staff replace reviewed metrics with an expected revision, stable UUID, confirmation and plain reason; original rows never change. Series group only exact student/class/language/passage/duration matches. Educator scoring/comparability, passage difficulty, norms and family publication remain pending. No diagnosis or normative grade cutoff is supplied.

## Manual extensions and remaining proposed behavior

**Curriculum references (FR-22):** staff manually enter bounded source text, context/objectives and rights/source statements. Authors/admins manage drafts; school peers see approved versions only. Append immutable revisions, explicitly review an exact saved version, then copy it into a new unapproved teaching resource with a durable source-version binding. Copy never inherits approval and never fetches the source URL. Selected framework/grades/languages, actual rights and suitability remain unverified until pilot review.

**Optional AI drafting (FR-23):** staff request a structured provisional resource against approved references. Validate model output, show assumptions/source provenance, allow edits, and require the existing exact-version review before assignment. Provider/timeouts/refusals/schema failures preserve user input and grant no publication. No provider is activated or learner data transmitted by the current application.

**Submissions/feedback (FR-24):** a linked active-class student opens an assignment and submits plain text using an expected attempt number and stable UUID. The server pins the assigned approved version/profile/actor; another attempt appends rather than overwrites. Current assigned staff read attempts and append explicitly reviewed formative feedback with their own expected revision/UUID. Students see only their permitted attempt feedback; guardians are denied. Due dates remain informational. Reviewed submission windows govern new attempts; attachments, scores/grades, automatic late penalties and guardian publication remain open. Current staff retain historical attempts while the student remains in school; withdrawn students lose their active-class view.

**External adapters (FR-25):** accept only verified provider contracts with school-scoped mappings, event IDs and repeat-safe authorization. No API, roster SSO or result export is assumed from product marketing.

**Audit/corrections (FR-26):** account decisions, curriculum versions/source-copy bindings, attempts/reviewed feedback and reading corrections now preserve domain-specific attributable evidence. They complement resource versions/publication receipts. Complete attendance/result corrections, a unified audit/export reader and approved retention/deletion remain future scope; this slice is not a complete platform audit system.

All new strict input schemas and the streamed 128 KiB common JSON parser reject unknown/spoofed authority, malformed text and oversized bodies. Domain-specific field limits/revision keys are detailed in [API contracts](API-CONTRACTS.md). Mutation SQL rechecks live scope; uncertain saves retain their request reference and confirmed success remains visible even if a subsequent refresh fails. UI controls alone confer no authority.

## Nonfunctional requirements

| ID | Requirement | Candidate / target boundary |
|---|---|---|
| NFR-01 | Trusted identity, same-origin mutations, scope, strict new schemas and safe errors; broader review pending. | partial; acceptance unapproved |
| NFR-02 | Preserve confirmed records through repeat-safe writes, atomic batches and conflict handling. | partial; acceptance unapproved |
| NFR-03 | Minimize data; approve retention, deletion, access and export policies without claiming legal certification. | planned; acceptance unapproved |
| NFR-04 | Measure agreed workload and approve latency/availability targets before pilot. | planned; acceptance unapproved |
| NFR-05 | Validate keyboard, screen-reader, contrast, focus, errors and print at agreed target. | planned; acceptance unapproved |
| NFR-06 | Confirm locale coverage, language-specific content and separate reading interpretation. | partial; acceptance unapproved |
| NFR-07 | Agree RPO/RTO and demonstrate authorized environment restore with verification. | planned; acceptance unapproved |
| NFR-08 | Correlate failures without credentials/learner data and assign incident ownership. | planned; acceptance unapproved |
| NFR-09 | Keep requirements/design/case/evidence links and review impact without promoting coverage to acceptance. | partial; acceptance unapproved |

For NFR-09, the runner catalogue reads the canonical requirement register and deduplicates runnable files linked from designed cases. A requirement with an evidence link is not a completed requirement or an executed case. The catalogue contract tests preserve that distinction; current per-case execution and acceptance remain unapproved.

Security-negative cases are release-blocking. Performance/availability, recovery objectives, accessibility target/browser matrix, supported locales and retention schedules must be set in the pilot decisions before their test gates can be measured. No numeric SLA or compliance certification is implied.

## Functional acceptance and change control

Each requirement maps to scenarios and explicit cases in [test cases](TEST-CASES.csv) and [traceability](TRACEABILITY.csv). Existing suite mappings are evidence context; they do not mark newly specified cases passed. The [test strategy](TEST-STRATEGY.md) defines execution/acceptance gates. See [decisions and risks](DECISIONS-RISKS.md) for policy dependencies and [change control](CHANGE-CONTROL.md) for how BRD/FSD/design/tests stay aligned.

## v2.2 reviewed local journeys

**Profile login ownership (FR-04/FR-06/FR-26):** an enabled current-school administrator opens `/admin/profile-links`, chooses the exact student or guardian profile and an eligible same-role account, or explicitly unlinks it. Review shows previous and new binding, current version, reason and confirmation. Any edit/selection clears confirmation. Save atomically records an immutable event, changes ownership, advances version and revokes affected sessions while retaining the reviewer. Inventory caps 500 each students/guardians/accounts and history 200; neither is a complete count/archive. Old retry shows the original event with the current profile; stale/collision 409 requires refresh. Ordinary profile forms cannot bypass reviewed ownership; create unlinked first, then review. No parent verification or role/issuer/subject/school remapping is provided.

**Academic integrity (FR-08–FR-10):** current admin enrollment creation rejects a preexisting student/class pair 409. Migration guards also reject a new duplicate after an earlier check while retaining existing legacy rows. Attendance uses one atomic guarded JSON upsert for every row; results use guarded atomic insert/update with current assessment maximum and whole-batch membership. Withdrawal, class reassignment, account revocation, changed school, changed maximum or ambiguous legacy result pair before persistence conflicts without partial success. Dates/calendar, grading, general correction history and duplicate-cleanup approval remain unresolved. Wrong staff roles are denied before body parsing.

**Manual normalized reading import (FR-20; FR-25 boundary):** staff select their class, obtain explicit Saha learner IDs, and paste a normalized local JSON envelope. No external files/URLs are fetched and no names/emails are linked. The form documents exact format, declared namespace/batch reference and stable distinct result references, bounded to 25 rows and128KiB server body. Stage persists immutable preview with normalized original counts, duration, dates and derived descriptive metrics; it creates zero observations. Review reason plus explicit confirmation allows all-row confirm or safe reject. Edits clear review; withdrawn learners prevent confirm but may retain scoped preview/rejection. Creator teachers must still own the current class; own-school admins retain current authorized access. A source-receipt collision across different drafts rolls back the whole confirmation and leaves the draft staged. Confirmed outcomes show authenticated reviewer/time, original values and receipt provenance; subsequent reading corrections preserve originals. User-supplied source labels are never presented as authenticated vendor results.

**Submission window review (FR-24/FR-26):** current assigned staff inspect the current summary and latest 100 immutable reviews in `/assignments/{id}`. Choose open/closed, optional device-local closing time converted to canonical UTC, reason 10–500 and explicit confirmation. Any field edit or revision change clears review. Save appends a CAS review; refresh preserves draft text and requires review again. New closed/elapsed attempts conflict 409 with `submission-window-closed`; saved attempts and reviewed feedback remain. Exact committed UUID replay stays safe after closure under current learner authority. A prior policy replay returns original review and today's window, without undoing later changes. No recorded window means unrestricted; due date remains informational.

| Additional operation | Administrator | Teacher | Student | Guardian |
|---|---|---|---|---|
| Login profile link/unlink/history | Live own-school review | Denied | Denied | Denied |
| Reading import stage/preview/decision | Own-school current class and same-school learners | Creator plus current assigned class | Denied | Denied |
| Import confirmation eligibility | Every item actively enrolled at actual write | Every item actively enrolled at actual write | Denied | Denied |
| Current submission window | Own-school assignment | Current assigned class | Own active-class approved assignment, safe summary | Denied |
| Window review/history | Current authorized assignment staff | Current assigned class | Denied | Denied |

Every network response is checked;401 prompts sign-in, scope denial clears unavailable evidence,409 requests reconciliation while retaining input, and an acknowledged save remains distinct from a later refresh failure. Stable UUIDs are retained for the same uncertain payload; new payloads require a new key. These are candidate behaviors; intentional keyboard, screen-reader, browser and educator acceptance remains separate.

## v2.3 current authority, reports and inbox journeys

Trace: FR-03, FR-05–FR-07, FR-11, FR-12, FR-26; NFR-01–NFR-03, NFR-05, NFR-09.

**Live record authority:** actual school/course/account and shared student/class/guardian queries require the authenticated actor's current matching ID, role and school, enabled state and nonempty trusted issuer/subject. A stale principal is insufficient. Course/class creation and school/course/class updates check this in the actual mutation. Class persistence also rechecks the selected current-school course and enabled, trusted, same-school teacher. Changed authority/reference yields a safe 409 with no successful save; unavailable scoped details are 404 and collection queries may return an empty list. Class detail loads the class and permitted roster in one scoped SQL query. Families never receive unrelated class members.

**Role-appropriate structure screens:** only administrators receive class/course create and existing-school update controls; school ownership derives from the verified session rather than a typed school ID. Other roles receive their permitted lists. Administrator teacher choices use the private-field-safe account lookup; family/teacher lists do not depend on administrator-only account inventory. School creation remains unavailable. Loading, validation, denied save, uncertain save and reload errors must remain visible without representing a failure as a confirmed save. Exact final UI source governs labels and interaction limits; this does not introduce new backend transfers, deletion or repair.

**Report draft:** a current administrator selects a scoped learner and supplies nonempty term/overall grade plus optional summary. These are school-supplied values, not computed grades. The server owns UUID/time and forces unpublished state even when a client supplies a publication timestamp. The INSERT rechecks current learner school and actor. The UI retains entered text after an uncertain result, blocks another creation and requires a successful reload/check for an existing draft before another create. Report ID/student-term uniqueness is not an idempotent creation contract.

**Saved-report publication:** the administrator reviews the displayed saved report and checks an explicit publication acknowledgement before the UI sends `{publish:true}`. This checkbox is a local UI gate; the API has no additional review reason/confirmation UUID and no general report correction log. A private immutable receipt records the winning actor/time/student/school. Within the same SQL statement it stamps the report and derives DISTINCT current eligible guardian login recipients from explicit relationships, guardian profiles and enabled trusted guardian accounts in the same school. No eligible guardian is a valid publication with zero notices. A recipient unlink/remap/disable before commit prevents a new notice to that former/ineligible account. Losing/repeated publication reads the established winner and never sends more notices or changes its time. Receipt, publication and notices all roll back on failure; changed current authority is safely denied.

**Inbox and recovery:** only the live recipient reads or acknowledges stored notices. A teacher may create a stored notice only for their own account or a currently related learner/guardian; current class, active pupil relationship, recipient school and enabled trusted account are checked in the INSERT. Administrators retain existing same-school recipient scope. A first acknowledgement receives server time; repeating it preserves the first readAt and its original updatedAt. On failed/uncertain acknowledgement the UI retains the inbox and offers the same notice action; it does not silently remove content. Historical personal notices remain after family unlink, while access to the student's report is independently scoped. No notice deletion/retention policy or email/SMS delivery is added.

The report and notice pages are authenticated; create/publish controls are administrator-only and server routes independently deny unauthorized roles before parsing mutation JSON. Browser/educator acceptance, publication policy and historical retention remain unrun/unapproved.

The final structure forms use native required fields: class course/teacher choices, name/term and optional schedule; course code/title/grade level and optional description; existing-school name and optional address. An unchanged blank address preserves an existing SQL null. Nonadmin class lists use the stored course ID when an admin-only choice catalogue is unavailable, rather than inventing a name. Rejected input/permission responses retain entries; conflicts require inventory reload. Network/500 uncertainty blocks another creation until explicit reload/check of saved records; confirmed success followed by refresh failure says saved and blocks repeat until reload. School update recovery reloads saved details separately from retained edits for comparison. No class/course creation UUID guarantee or new field/grade/date policy is added.
