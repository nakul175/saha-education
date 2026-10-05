# Saha functional specification document

Version 2.9 draft, 6 October 2026. Derived from [BRD](BRD.md) and [requirement register](requirements.json); technical design follows in [HLD](HLD.md) and [LLD](LLD.md). Historical v2.0 source candidate: `5488bc0d20412a3d4be0c031c99c259c56834d5e`. All acceptance remains unapproved. An “implemented” entry describes candidate behavior, not a deployed service or approved business outcome.

The v2.9 candidate is prepared on `feat/specification-delivery` from published parent `053ab13af9dcd6fbb81e436769aefa6e29f00a20`. `source_commit` identifies that parent, not the containing implementation/documentation commit. The [eight-hour development record](../current/EIGHT-HOUR-DEVELOPMENT.md) and root-maintained dated execution/release evidence identify actual frozen source, publication, merge and deployment independently. The v2.0 baseline `5488bc0d20412a3d4be0c031c99c259c56834d5e` and published v2.1–v2.8 history remain retained. All requirements are unapproved and all designed cases are `not-run-for-this-specification`.

## Product modules and navigation

| Module | Intended user | Current entry | Boundary |
|---|---|---|---|
| Identity and session | All provisioned roles | `/login`, `/api/auth/*`, `/api/session` | Real provider/tenant still pending; no public self-registration |
| Role dashboards | Current enabled mapped role | `/dashboard/admin`, `/dashboard/teacher`, `/dashboard/guardian`, `/dashboard/student` | One current snapshot; exact totals and bounded displayed lists; observed records, no calculated learning outcome |
| School and roster | Administrator; scoped teacher/family reads | `/schools`, `/students`, `/guardians`, `/courses`, `/classes`, `/enrolments` | Operator school bootstrap; explicit profile links; historical/role-remapping policy pending |
| Reviewed accounts and profile links | School administrator | `/admin/users`, `/admin/profile-links` | Provision/status plus versioned student/guardian login link/unlink; existing role/issuer/school immutable; no relationship verification |
| Academic records | Administrator/assigned teacher; scoped published family reads | `/attendance`, `/classes/{id}/attendance`, `/assessments`, `/report-cards`, `/notifications` | Reviewed attendance and raw summaries current; grade/calendar/correction governance and complete UAT pending |
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
| FR-03 | BR-02 | Scope domain reads/writes to current school, enabled mapped actor role, class assignment and explicit profile links; assemble each role dashboard in one coherent current-scoped SQL snapshot. | implemented | `lib/education/access.ts`, `lib/education/dashboard.ts` |
| FR-04 | BR-01 | Reviewed provisioning, status and versioned student/guardian login link/unlink workflows; no public registration or existing identity/role/school remapping. | partial | `lib/education/identity-admin.ts` |
| FR-05 | BR-01 | School-scoped administration; school bootstrap remains operator provisioned. | partial | `lib/education/schools.ts` |
| FR-06 | BR-01 | Maintain student and guardian links with explicit role-matched school identity ownership. | partial | `lib/education/students.ts` |
| FR-07 | BR-01 | Maintain courses/classes and eligible school teachers. | partial | `lib/education/classes.ts` |
| FR-08 | BR-01 | Record active/withdrawn/completed enrolment, guard new duplicate pairs without deleting legacy evidence, and preserve agreed history. | partial | `lib/education/enrolments.ts` |
| FR-09 | BR-01 | Record authorized attendance; use current-scoped observed summaries and reviewed dirty-only full-evidence CAS with immutable before/after receipts, preserving legacy replacement semantics; school calendar, correction governance and historical entitlement remain unapproved. | partial | `lib/education/attendance.ts` |
| FR-10 | BR-01 | Manage current assigned-class assessments/results; use coherent active-roster snapshots and reviewed dirty-only full result/metadata CAS with immutable before/after receipts and exact original retries, preserving legacy replacement semantics; grades, correction governance and family result publication remain unapproved. | partial | `lib/education/assessments.ts` |
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
| FR-26 | BR-10 | Preserve attributable domain correction/review evidence including reviewed attendance and assessment results; complete unified audit, legacy-write governance and agreed retention before real records. | partial | `lib/education/assessment-reviews.ts` |

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

**Attendance and assessment (FR-09–10):** staff choose an authorized class and eligible student, submit a validated academic record, and retrieve it through the same scope. Foreign identifiers and unassigned teachers are rejected. Actual attendance/result statements recheck live actor/class/active membership for the whole batch. New enrolment/result duplicate pairs are guarded without erasing legacy duplicates; ambiguous existing result pairs conflict. The new reviewed attendance editor adds explicit real dates and immutable before/after evidence; school calendar/grade/correction governance and assessment correction remain unapproved. Current family assessment-result access is denied, not inferred from enrolment alone.

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

**Audit/corrections (FR-26):** account decisions, curriculum versions/source-copy bindings, attempts/reviewed feedback, reviewed attendance and reading corrections now preserve domain-specific attributable evidence. They complement resource versions/publication receipts. Complete legacy attendance/result corrections, a unified audit/export reader and approved retention/deletion remain future scope; this slice is not a complete platform audit system.

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

**Manual normalized reading import (FR-20; FR-25 boundary):** staff select their class, obtain explicit Saha learner IDs, and paste a normalized local JSON envelope. No external files/URLs are fetched and no names/emails are linked. The form documents exact format, declared namespace/batch reference and stable distinct result references, bounded to 25 rows and128 KiB server body. Stage persists immutable preview with normalized original counts, duration, dates and derived descriptive metrics; it creates zero observations. Review reason plus explicit confirmation allows all-row confirm or safe reject. Edits clear review; withdrawn learners prevent confirm but may retain scoped preview/rejection. Creator teachers must still own the current class; own-school admins retain current authorized access. A source-receipt collision across different drafts rolls back the whole confirmation and leaves the draft staged. Confirmed outcomes show authenticated reviewer/time, original values and receipt provenance; subsequent reading corrections preserve originals. User-supplied source labels are never presented as authenticated vendor results.

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

## v2.4 role dashboard journey and limits

After resolving a real server Principal, each role page calls `getRoleDashboard` exactly once. A wrong role, missing principal or null/role-mismatched view redirects through `/`; the page never presents denied authority as authorized zero totals. The service rechecks current ID, school, role, enabled status and nonempty trusted identity mapping in the actual SELECT. A common SQL UTC `asOf` identifies the snapshot; Refresh dashboard performs a full-page read. The public Principal contains no session hash; v2.9 privately pins the original token/exact trusted identity and rechecks them in actual SQL. Revocation after resolution therefore denies the held verified request; already delivered content cannot be retracted.

| View | Displayed data | Exact total and cap |
|---|---|---|
| Administrator | Verified current school name; current-school students, courses/classes and enabled mapped teacher accounts | Exact aggregate counts; no capped list substituted for a total |
| Teacher | Assigned class name, same-school course title/nullable unavailable state, term and distinct active learner count | Up to 100 classes, exact authorized total and explicit truncation |
| Teacher assessment | Stored title/kind/date/nullable valid maximum; current active roster recording counts and review flags | Up to 100 assessments, exact total and explicit truncation |
| Student/guardian | Current linked profile name/admission number, observed attendance status/date counts and published reports | Up to 50 profiles, exact linked total and explicit truncation |
| Each linked profile report list | Stored term and school-supplied grade, publication time and scoped report link | Up to 20 published reports per profile, exact published total and explicit truncation |

Teacher labels are `no-current-roster`, `missing-results`, `recorded-for-current-roster` or `needs-review`. Unique valid score pairs in `0..maxScore` count as recorded, including existing maximum 0/score 0. Missing means no saved pair; duplicate or invalid existing pairs are separate evidence. Whole enrolment-pair duplicates are flagged for an active pupil, including active+withdrawn legacy rows; no arbitrary result selection, inferred grade or record repair occurs. Invalid negative/fractional/text/unrepresentable maxima are unavailable and flagged. All counts concern today's active roster, not historical assessment completion.

Family attendance reports recorded rows and present/absent/late/excused/other counts. Two class rows on one date remain two observations. Only real `YYYY-MM-DD` values form first/last date coverage; invalid-date rows still count and are flagged. No percentage, expected-day denominator or absence policy is added. Existing family `studentScope` and `classScope` apply together; a fully withdrawn linked learner may retain published reports while losing class attendance eligibility. Empty profile, empty attendance and empty publication each have their own message. Drafts, raw results/feedback, reading evidence and attendance notes are excluded.

Native full-page anchors open classes, attendance, saved assessment results and published reports. Text wraps on mobile and stored text remains escaped. A failed refresh does not prove that records are empty; a delivered snapshot may become outdated after its SQL cutoff. Exact fields/ordering are in [dashboard design](DASHBOARD-DESIGN.md); designed SC-26–SC-28 cases remain unrun and all approvals remain false.

## v2.5 attendance viewer and reviewed recorder

Trace: FR-03, FR-08, FR-09, FR-26; NFR-01–NFR-05, NFR-09. See exact [attendance design](ATTENDANCE-DESIGN.md). FR-09/FR-26 remain partial and unapproved.

At `/attendance`, all roles choose a current accessible class. A named-pupil summary shows current-active status, observed present/absent/late/excused/other row counts, real first/last recorded date and invalid-date count. No rows means no recorded evidence, with null date coverage. Existing class/student eligibility intersects family links; class access never grants a family the full roster. Up to 100 visible pupils are displayed with exact total and truncation. Refresh reloads class inventory and the selected summary; previous content clears before selection/load, and obsolete requests cannot replace a newer selection. Individual notes and recorder/account identities are absent from this summary.

Staff follow the native `Review attendance marks` link to `/classes/{id}/attendance`. The date initially uses the device-local calendar date; changing date clears edits/reason/review/history and fetches exact date evidence without timezone conversion. GET supplies a coherent current active same-school roster and full saved record or null. Unrecorded status stays blank. Empty or truncated (>100) roster and any preserved whole-pair enrolment ambiguity block a new reviewed save; the UI explains the limit rather than selecting a partial roster as complete.

Only changed entries are submitted. Every entry has deliberate present/absent/late/excused status, explicit nullable note and exact loaded expected record or null. Reason is trimmed 10–500 Unicode code points without controls; new/replacement notes are at most 2,000 code points, while an exactly unchanged longer legacy note may be preserved within bounded transport. The API distinguishes null from empty; the form preserves unchanged stored null/empty notes and treats clearing a changed note as null. Any mark/note/reason/date/loaded-evidence change clears explicit review confirmation. Dirty no-op entries are rejected, not logged as changes.

POST atomically rechecks current staff/class, all changed active same-school pupils, whole-roster cap/ambiguity and full before evidence. Any conflict rejects the whole decision with 409. Reload compares current stored marks with retained intended dirty edits; a new review is required. Network/500 or unavailable acknowledgement may leave a committed outcome: original UUID/payload is retained and date/edit controls remain locked. A 401/403/404 outcome clears visible private evidence and requires current access verification before exact retry; sign-in recovery uses a separate tab when needed. A confirmed receipt survives a failed current/history refresh, with truthful saved-versus-refresh messages and further saves blocked until reload.

History is latest 100 immutable reviews for exact date, with optional exact pupil filter, total/truncation, reviewer/reason/time and full before/after evidence. Withdrawn same-school pupil evidence remains available to current original-class staff. If any original pupil transfers out of school, the entire batch is hidden from history/replay. The legacy `/api/attendance` POST remains mutable replacement behavior, including concurrent accepted 200 responses and omitted-note clearing; no historical receipts are backfilled.

## Fifth-batch reviewed result journey

Trace: FR-03, FR-08, FR-10, FR-26; NFR-01–NFR-09. Current school administrator/assigned teacher opens `/assessments/{id}` and receives one current active-roster snapshot plus original reviewed history. Missing scores are blank; saved zero/null/empty and school-supplied grade/feedback remain exact. Class/assessment/pupil names, raw maximum/date/type warnings and explicit caps are part of the displayed evidence. Families cannot read/editor/review unpublished results.

An educator changes only intended fields, supplies a control-free reason of 10–500 Unicode code points and explicitly confirms review. Desired score is a nonnegative safe whole number within the actual current integer maximum. Explicit grade/feedback are string or null; new/replacement text is limited to 2000 code points, while unchanged oversized legacy text may remain under full before-evidence/body limits. Any changed intended field/reason or loaded evidence clears confirmation. No score default, computed grade or efficacy/norm interpretation exists.

The strict new request includes UUID, full expected assessment metadata and complete prior result/type/timestamps or explicit null absence. New review checks current active membership and whole-roster cap/ambiguity/unrepresentable evidence again at persistence. A serializable single invalid score can be explicitly repaired; opaque/unsafe/nonfinite evidence remains visibly blocked. Unsafe INTEGER and nonfinite REAL display exact strings with original type, avoiding rounded values or false HTTP null. Historical duplicates outside editable roster remain unchanged.

409 retains intended work but requires reloading/comparing current metadata/results and reviewing a new request. A lost/denied reply retains the original request UUID/payload and locks edits. Current access is verified before exact retry; unavailable evidence is cleared for 401/403/404. Exact committed retry returns original review without reapplying older results. A confirmed receipt remains distinct from a failed later current/history refresh. Native labels/anchors, announced status and wrapping plain text support mobile/keyboard review; browser/educator acceptance is separate.

Review history is immutable original metadata/before/after/reviewer/reason/time, latest 100 with exact visible total. Withdrawal alone preserves same-school current original staff history; pupil school transfer hides the entire batch. Original legacy POST keeps concurrent 200 and omitted-text-clearing semantics with no backfill. Literal calendar dates and invalid-date warnings avoid shifts/crashes without changing creation/calendar policy. Exact fields and response statuses are in [assessment design](ASSESSMENT-DESIGN.md); FR-10/FR-26 remain partial for grade/publication/governance/legacy/retention gaps.

## Sixth-batch response feedback and policy recovery

[Recovery design](LEARNER-RECOVERY-DESIGN.md) defines the current client contract for FR-03/17/24/26. Once a POST outcome is unresolved, freeze its complete endpoint/actor/serialized body including UUID and original expected number. Lock text/reason/selection/new-save controls; Refresh updates current evidence while retaining that request. Use the separate Retry pending response, Retry pending feedback or Retry pending window review action. A later attempt/feedback/reopening must remain current when the original receipt is recovered.

Network/5xx/malformed or wrong-shape 2xx remains uncertain; only a valid original receipt resolves it. Explicit400 permits correction; explicit 409 requires reload/comparison and renewed review before a new request. Known 401/403/404 hides protected material, saved evidence/labels and policy/history; pending original requests remain private in memory. Pending401 offers separate-tab sign-in, then fresh same-actor authorized reload. Another account cannot recover that actor request. Known saved success plus failed/denied refresh remains saved plus a separate current-read failure.

The learning list re-resolves current role/session for every load, clears old cards/role-dependent links on unavailable/failed feed and ignores older responses after a newer load. Optional temporary class-label failure may use fallback labels; known class-label denial clears protected material. Native links, visible status/labels and page-memory limitations remain explicit. No durable outbox, grade/late policy, family publishing or provider acceptance is added; FR-24 remains partial.

## v2.8 current registry journeys

Registry reload uses session → list → session with exact actor ID/role/school and latest-generation guards; failed, mismatched or superseded reads clear private data/create authority. Student search is explicitly local, bounded to 200 UTF-16 code units and first 200 matching rows with exact loaded/matched/shown counts. Student View uses a native full-page link to the existing profile route. Creation verifies session again and synchronously locks submissions. Correlated 201 means saved; a failed follow-up read is separate. Any sent-POST uncertainty clears rows/principal, hides forms and privately retains original values; no safe retry is offered. Original authorized actor reload, comparison checkbox and Finish comparison and start a new draft reset blank without a POST. [Exact states and limits](REGISTRY-DESIGN.md) retain existing backend/date/profile-link policy.

## v2.9 verified session and reviewed registry journeys

Trace: FR-01–FR-06, FR-26; NFR-01–NFR-09. [Registry design](REGISTRY-DESIGN.md) and [session/demo design](SESSION-DEMO-DESIGN.md) contain the current detailed contract. The earlier v2.8 client manual-comparison recovery is historical; current reviewed creation replaces it without changing legacy profile APIs.

**Session lifecycle:** the browser still receives only the public ID/role/school Principal. The server privately binds verified Principal objects to the exact resolved token and trusted issuer/subject. Protected SQL repeats that evidence and current role/school/disabled checks. Revoking only that token or changing its owner/identity denies the original request; another active session does not rescue it. Existing collections may return their scoped empty result, while object/mutation routes use their existing safe denial/conflict status. A subsequent request without a usable session is 401. These checks cannot retract content already delivered and do not poll the identity provider's external account state.

**Create student/guardian:** a currently authorized administrator loads the registry, enters the same accepted profile fields, provides a trimmed 10–500-code-point reason with no NUL and confirms creation of an unlinked profile. Editing values/reason clears confirmation. A fresh session preflight must match original actor ID/role/school, and a synchronous lock prevents concurrent same-frame submission. The screen sends a strict reviewed envelope with one generated UUID; school, creator, profile ID and timestamps are server-owned. First creation returns 201/`replayed:false`; exact original replay returns 200/`replayed:true`. No account or family relationship is implicitly created.

**Uncertain delivery:** network/5xx, invalid/mismatched success or sent-request access denial hides protected rows, forms and receipt details, while retaining the exact original UUID/serialized body privately in page memory. No automatic retry occurs. Reload must resolve the same current administrator scope before pending identifiers or Retry pending creation appear; retry checks the session again and sends original bytes. A different administrator/family account cannot see or recover that private reminder. Hard reload/navigation loses in-page pending bytes: durable server evidence is available through its known UUID, but the product does not yet persist a cross-device client recovery queue.

**Definitive response:** 400 releases retained fields for correction and clears confirmation. 409 requires authorized reload and deliberate fresh review of retained fields; it must not mint a new UUID automatically or be described as an uncertain committed save. A correlated original receipt is shown separately from the latest registry. Failed post-save list refresh preserves the known acknowledgement but hides stale/unauthorized receipt details; recovery is a current read, not another unchecked create. Legacy `/api/students` and `/api/guardians` POST do not acquire UUID idempotency from these reviewed screens.

**Isolated demo:** GET `/api/demo` advertises only runtime configuration availability and synthetic labeling; it is not proof that the database passed installation isolation. On enabled isolated installation, `/login` asks the viewer to acknowledge fictional records before choosing Administrator, Teacher, Guardian or Learner. Same-origin POST validates a strict role/acknowledgement body, checks pristine installation/current synthetic account, rate-limits, inserts/confirms a new session with exact selected-account/role/identity/isolation guards, then revokes the previous token and delivers an ordinary secure cookie. Four fixed accounts share one fictional school. The admin view can review sample records, the teacher uses assigned-class resources, the learner sees their approved work and the guardian sees linked published information. No live provider, ORF, AI, external delivery or real-school authority is implied. Disabled/mismatched installed accounts cannot be silently repaired by sign-in.

## v2.9 current enrolment and report controls

Trace:FR-02,FR-03,FR-06–FR-08,FR-11,FR-12,FR-26;NFR-01–NFR-03,NFR-05–NFR-09. [Academic UI design](ACADEMIC-UI-DESIGN.md) specifies current session/list/session and selected class/learner guards, synchronous action locks, role-appropriate controls, private denied/uncertain hiding and correlated save status. Old replies/captured controls/unmount cannot restore wrong-class or wrong-learner actions. Same current administrator can restore an in-page typed draft; another actor/selection cannot inherit it.

Uncertain enrolment/status or report-draft creation is manually compared under the original current account; finishing sends no mutation and report draft starts blank. Uncertain publication deliberately retries the exact original report endpoint/body after fresh original-actor reload/preflight, retaining its established receipt/time/notice or creating the one permitted winner if not previously committed. No automatic retry or new UUID/CAS/policy is introduced; pending memory is lost on navigation. Mounted/accessibility/educator acceptance stays separate and all SC-42 cases remain unrun.
