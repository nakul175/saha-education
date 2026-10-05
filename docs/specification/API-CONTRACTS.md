# Implemented API contracts

Version 2.9 draft, 6 October 2026. Current working sources: [app/api](../../app/api), [HTTP wrapper](../../lib/education/http.ts), [validation](../../lib/education/validation.ts), and corresponding record services. This is the current contract, not a promise of deployment, school acceptance or future integrations. The inventory below covers all **60 route files and 96 exported method handlers**; historical v2.0 covered 31 routes/55 handlers and v2.1 covered 44/74. Only implemented methods are included.

The v2.9 candidate is prepared on `feat/specification-delivery` from published parent `053ab13af9dcd6fbb81e436769aefa6e29f00a20`. `source_commit` identifies that parent, not the containing implementation/documentation commit. The [eight-hour development record](../current/EIGHT-HOUR-DEVELOPMENT.md) and root-maintained dated execution/release evidence identify actual frozen source, publication, merge and deployment independently. The v2.0 baseline `5488bc0d20412a3d4be0c031c99c259c56834d5e` and published v2.1–v2.8 history remain retained. All requirements are unapproved and all designed cases are `not-run-for-this-specification`.

Traceability: FR-01–FR-12 identity/academic routes; FR-13–FR-18 resources; FR-19 external launch; FR-20–FR-21 manual reading/corrections/history; FR-22 manual curriculum; FR-24 submissions/feedback; FR-26 domain evidence; NFR-01/NFR-02 access, errors and concurrency. See [canonical requirements](requirements.json), [BRD](BRD.md), [data dictionary](DATA-DICTIONARY.md) and [integration contracts](INTEGRATION-CONTRACTS.md).

## Authentication, access and errors

All record endpoints use the opaque `__Host-saha_session` cookie. Token digests are persisted; expiry and the account's current role/school/disabled and provisioned identity state are checked on lookup. Cookies are HttpOnly, Secure, SameSite=Lax, Path=/; legacy role cookies or caller identity headers grant no access. Missing, ambiguous, expired or disabled sessions return 401. An `admin` is a **school administrator**, not a global administrator. A missing school fails closed.

Every record mutation also requires `Origin` to match the request URL origin and an entry in `SAHA_ALLOWED_ORIGINS`; cross-site fetch metadata is rejected. This applies even when cookies are valid. JSON mutations use the body schema shown below; response caching is disabled with `Cache-Control: no-store`.

Record error responses are `{ "error": "..." }`: 400 invalid request, 401 authentication required, 403 forbidden, 404 inaccessible/missing object, 500 internal server error, or 503 service unavailable. Domain handlers explicitly return 409 for retry/revision conflicts: `Reading check conflict`, `Resource conflict`, `Identity administration conflict`, `Profile link conflict`, `Curriculum reference conflict`, `Submission conflict`, `Reading import conflict`, `Reading correction conflict`, `Attendance review conflict`, or generic `Conflict`. New closed/elapsed submission attempts return 409 `{error:"Submission window closed",code:"submission-window-closed"}`. SQL, stack traces, credentials and supplied record contents are not returned by the common error handler. Login/session handlers use their separate safe authentication error handling; login can return 429. Callback errors redirect rather than expose JSON details.

The common `body` helper streams and bounds JSON at 128 KiB before parsing, rejects invalid/oversized declared lengths and malformed UTF-8/JSON as 400, and validates the endpoint schema. This applies to endpoints using that helper, not unparsed auth bodies or an assumed universal transport policy. New identity, profile-link, curriculum, submission/feedback/window, reading-import, attendance-review and correction request objects are strict. Their mutation statements and downstream evidence/retry SELECTs recheck current account/school/role and record authority.

Collection reads normally return 200 with an array, including `[]` when a valid filter selects no visible rows. Detail routes using `found()` return 404 for an inaccessible object. Most legacy lists have no total-count envelope; reviewed attendance history/editor and raw attendance summary expose exact scoped totals/limits/truncation. Identity administration caps 500 accounts/200 events; profile links cap 500 each student/guardian/accounts and 200 events; imports cap 100 drafts; window history caps 100 reviews. These are bounded views, not full archives. There is no public registration, global administrator API, audio upload, AI drafting endpoint or external-result synchronization endpoint.

Role/scope shorthand:

- **A**: admin, current school only.
- **T**: teacher. Academic records use assigned classes and currently active enrolled students. Private resource drafts/history/review use original author ownership; admin has school authority.
- **G**: guardian, explicit `guardians.user_id` and student-guardian links in the same school.
- **S**: student, explicit `students.user_id`; own records and currently active classes.
- **Scoped read**: all four roles where allowed, intersected with the record's school/student/class scope. Catalogue schools/courses are current-school data. `schoolId` filters cannot widen school authority and a foreign school filter is 403.

## Complete route inventory

A success status in this table is the actual handler status. All record routes additionally have the common 400/401/403/404/500 failures when applicable; important route-specific failures/replay behavior are named separately.

| Route | Exported method / input | Role and record scope | Success response / status | Additional behavior and requirement |
|---|---|---|---|---|
| `/api/auth/login` | POST; body is not parsed | No prior session required; matching allowed origin | 200 `{url}` plus browser transaction cookie | Provider/config discovery; 403 origin, 429 throttling, 503 unconfigured/unavailable. FR-01 |
| `/api/auth/callback` | GET `state`, `code` or provider `error`; browser transaction cookie | Matching one-use browser-bound transaction; provisioned issuer/subject | 303 `/` plus session cookie | Any failure: 303 `/login?error=signin_failed`, transaction cookie cleared; no provider details. FR-01 |
| `/api/session` | GET; POST; DELETE | GET session lookup; POST/DELETE matching origin, no session prerequisite | GET 200 Principal or 401 error; DELETE 200 `{message:"Logged out"}` | POST is deliberately **400**: role selection disabled. DELETE revokes supplied valid session and clears cookies even when none exists. FR-02 |
| `/api/schools` | GET; POST SchoolInput | GET all roles, own school; valid POST denied even for A | GET 200 School[] | POST A role checked before body; valid school provisioning remains 403. GET rechecks live actor in SQL. FR-05 |
| `/api/schools/[id]` | GET; PATCH SchoolInput | GET own school; PATCH A own school | 200 School | Actual own-school/live actor read and UPDATE; zero-row changed authority 409; no tenant switch/bootstrap. FR-05 |
| `/api/users` | GET optional `role` enum | A; active users in same school | 200 `{id,name,role}[]` | Actual live administrator feed; only id/name/role, no email, issuer/subject or credentials. Enabled nonempty trusted issuer/subject mappings only. No account mutations. FR-04 |
| `/api/students` | GET optional `schoolId`; POST StudentInput | GET scoped; POST A school | GET 200 Student[]; POST 201 Student | Creates unlinked profile; nonnull userId is 400 with direction to reviewed link workflow. FR-06 |
| `/api/students/[id]` | GET; PATCH StudentInput | GET scoped; PATCH A school | 200 Student | Update keeps ID/creation time/current binding; changed userId is 400 with reviewed-workflow direction, ordinary update uses SQL binding equality. FR-06 |
| `/api/students/[id]/guardians` | GET; POST `{guardianId,isPrimary?}` | GET visible student plus scoped guardians; POST A | GET 200 `{id,name,relationship,userId}[]`; POST 200 `{message:"Guardian linked successfully"}` | Path fixes student; duplicate link is safe; current service always sets isPrimary=0, ignoring supplied primary flag. FR-06 |
| `/api/guardians` | GET; POST GuardianInput | GET scoped; POST A | GET 200 Guardian[]; POST 201 Guardian | Creates unlinked guardian; nonnull userId is 400 with reviewed-workflow direction; foreign school rejected and null-school legacy profiles excluded. FR-06 |
| `/api/courses` | GET optional `schoolId`; POST CourseInput | GET same-school catalogue; POST A | GET 200 Course[]; POST 201 Course | POST A role before body; actual live actor INSERT SELECT; changed authority 409 with zero rows. Global code uniqueness remains. FR-07 |
| `/api/courses/[id]` | GET; PATCH CourseInput | GET own-school course; PATCH A | 200 Course | Full required fields; school cannot change; current own-school/live actor SELECT and UPDATE; changed authority 409. FR-07 |
| `/api/classes` | GET optional `schoolId`; POST ClassInput | GET class scope; POST A | GET 200 Class[]; POST 201 Class | POST A role before body; actual INSERT rechecks live actor/current same-school course/enabled trusted teacher; changed reference 409. FR-07 |
| `/api/classes/[id]` | GET; PATCH ClassInput | GET class scope; PATCH A | GET 200 Class plus scoped `enrolledStudents`; PATCH 200 Class | One final scoped class/roster join; unrelated pupils omitted. PATCH A before body; actual current course/teacher/live actor guards; changed reference 409. FR-07 |
| `/api/enrolments` | GET `studentId?`,`classId?`; POST `{studentId,classId}`; PATCH `{id,status}` | GET class/student scope; writes A | GET 200 Enrolment[]; POST 201 Enrolment; PATCH 200 Enrolment | POST generates active status/time; duplicate/race or changed current authority 409. Migration 0009 pair guards preserve legacy duplicates. FR-08 |
| `/api/attendance` | GET `classId?`,`studentId?`,`date?`; POST `{classId,date,entries:[{studentId,status,note?}]}` | GET intersected class/student scope; POST A or assigned T | GET/POST 200 Attendance[] | Whole batch prevalidated; one guarded JSON INSERT SELECT atomically upserts class/student/date, rechecking every live member; actor server-fixed; changed eligibility 409. FR-09 |
| `/api/classes/[id]/attendance-editor` | GET required `date`; POST strict AttendanceReviewInput | A school or current assigned T; G/S 403 before date/body parsing | GET 200 AttendanceEditorSnapshot; POST 201 `{review,replayed:false}` or 200 exact replay | One current active snapshot; no default marks; roster cap 100/legacy ambiguity blocks new review. Actual atomic full-evidence CAS and eligibility guards; failed new mutation 409, unavailable initial class/readback 404. FR-09/FR-26 |
| `/api/classes/[id]/attendance-editor/history` | GET required `date`, optional exact `studentId` | A school or current assigned T; whole original batch currently same-school pupils | 200 `{items,total,limit:100,truncated}` | Latest 100 immutable reviews by time/UUID; withdrawn same-school history retained, transferred batch fully hidden. Private hash/envelope excluded; G/S 403. FR-09/FR-26 |
| `/api/classes/[id]/attendance-summary` | GET; path fixes class | Current class and student scope for A/T/G/S | 200 AttendanceSummary | One current-scoped named-pupil/raw-status/date snapshot, exact visible total/cap 100/truncation. No individual notes/identity/percentage; unavailable class 404. FR-03/FR-09 |
| `/api/assessments` | GET optional `classId`; POST AssessmentInput | GET class scope; POST A or assigned T | GET 200 Assessment[]; POST 201 Assessment | Metadata may be visible to own active-class families; result publication is separate and absent. FR-10 |
| `/api/assessments/[id]` | GET only | Class scope | 200 Assessment | No PATCH/DELETE route exported. FR-10 |
| `/api/assessments/[id]/results` | GET; POST `{results:[{studentId,score,grade?,feedback?}]}` | GET staff scoped; POST A or assigned T | GET 200 `{studentId,studentName,score,grade,feedback}[]`; POST 200 `{message:"Results recorded successfully"}` | G/S GET 403; full batch rechecks active membership/current maximum in actual atomic statements; new-pair trigger guards; ambiguous legacy pair/changed eligibility 409. FR-10 |
| `/api/assessments/[id]/result-editor` | GET; POST strict AssessmentResultReviewInput | A current school or currently assigned T; G/S 403 before body | GET 200 AssessmentResultEditorSnapshot; POST 201 `{review,replayed:false}` or 200 original exact replay | One current active snapshot, raw score/type, metadata/full-result CAS, roster cap 100 and record preview 10; explicit review/reason. New conflict 409; unavailable read/readback 404. Legacy results remain compatible. FR-10/FR-26 |
| `/api/assessments/[id]/result-editor/history` | GET optional `studentId` | Current A/assigned T and whole original batch same-school; G/S 403 | 200 `{items,total,limit:100,truncated}` | Immutable original full metadata/before/after/reviewer/reason/time; latest 100 deterministic; withdrawal retained, school transfer hides whole receipt. No legacy backfill or family publication. FR-10/FR-26 |
| `/api/report-cards` | GET optional `studentId`; POST ReportInput | GET scoped; G/S published only; POST A | GET 200 ReportCard[]; POST 201 draft ReportCard | POST A before body; server UUID/time and null publishedAt. Actual student/live actor INSERT guard; changed authority 409. No draft creation UUID replay guarantee. FR-11 |
| `/api/report-cards/[id]` | GET; PATCH `{publish:true}` | GET scoped; G/S published only; PATCH A | 200 ReportCard | PATCH A before body. Unique private receipt atomically publishes and derives current eligible guardian notices; losing/repeated publish reads winner, no duplicate notices. Changed authority 409 or scoped 404. FR-11 |
| `/api/notifications` | GET; POST NotificationInput; PATCH query `id` | GET/PATCH recipient only; POST A or T with permitted same-school recipient | GET 200 Notification[]; POST 201 Notification; PATCH 200 `{success:true}` | POST staff role before body; current actor/recipient/teacher relation checked at INSERT; zero-row 409. GET/PATCH require live recipient; hidden read ack 404. PATCH no JSON; retries preserve first read/update times. Stored channel is not delivery. FR-12 |
| `/api/external-apps` | GET only | All signed-in roles; metadata availability staff-only | 200 ExternalAppMetadata[] | Registry does not reveal URL; launch-only/separate sign-in/resultSync false. FR-19 |
| `/api/external-apps/[id]/launch` | POST empty body, `{}`, or strict `{studentId?}` | A/T; optional visible student checked locally | 200 `{url,signIn:"separate",resultSync:false}` | Unknown app/inaccessible student 404; unconfigured/unsafe destination 503; context never forwarded. FR-19 |
| `/api/reading-checks` | GET `studentId?`,`classId?`; POST strict ReadingInput | A/T; T assigned class and active student | GET 200 ReadingCheck[]; POST 201 ReadingCheck | G/S 403; UUID exact actor/payload replay returns same record; conflict 409; no edit/delete. FR-20 |
| `/api/resources` | GET; POST strict `{content,clientResourceId?}` | A school; T original author | GET 200 TeachingResource[]; POST 201 TeachingResource | G/S 403; create UUID replay actor+canonical initial content only, otherwise 409. FR-13 |
| `/api/resources/[id]` | GET; PATCH strict `{expectedVersion,content}` | A school; T author | 200 TeachingResource with latest version | New immutable unapproved version; stale/concurrent successor 409. FR-14 |
| `/api/resources/[id]/versions` | GET only | A school; T author | 200 ResourceVersion[] newest first | Includes private staff fields; G/S 403. FR-14 |
| `/api/resources/[id]/approve` | POST strict `{versionId}` | A school; T author; self-review allowed | 200 ResourceVersion | Exact version must belong to resource; repeat preserves first reviewer/time. FR-15 |
| `/api/resources/[id]/assign` | POST strict `{versionId,classId,dueDate?}` | Resource authority plus A/assigned T class | 201 ResourceAssignment | Unapproved exact version 400; version/resource mismatch 404; conflicting repeated assignment 409. Live class authority rechecked in INSERT. FR-16 |
| `/api/resource-assignments` | GET optional `classId` | A school; T assigned class; S own active class; G denied | 200 ResourceAssignment[] | Exact approved content, never latest draft; notes/key omitted for **all roles**. FR-17 |
| `/api/admin/users` | GET; POST strict ProvisionIdentityInput | A; enabled current-school actor rechecked | GET 200 AdminUser[]; POST 201 `{user,event}` | Up to 500 accounts; reviewed explicit issuer/subject, fixed actor school; immutable existing role/pair/school; retry UUID and duplicates 409. FR-04 |
| `/api/admin/users/[id]` | PATCH strict ChangeIdentityStatusInput | A; same-school target | 200 `{user,event}` | Expected account revision, explicit review/reason; self-disable and final-enabled-admin loss 409; disable/session deletion/event/revision atomic; exact replay returns current user and original event. FR-04/FR-02 |
| `/api/admin/users/events` | GET only | A current school | 200 IdentityAdminEvent[] | Up to 200 latest decisions; actor/target/reason/time/version, private request hash/attempt marker omitted. FR-26 partial |
| `/api/curriculum` | GET; POST strict `{content,clientReferenceId?}` | A school; T author drafts plus school-approved versions | GET 200 CurriculumReference[]; POST 201 CurriculumReference | Manual source/rights statements; no fetched content or verified license; exact create retry 409 on changed actor/payload. FR-22 |
| `/api/curriculum/[id]` | GET; PATCH strict `{expectedVersion,content}` | GET A/author or school peer approved source; PATCH A/author | 200 CurriculumReference | Manager sees latest draft; peer sees latest approved version; immutable next revision/stale 409. FR-22 |
| `/api/curriculum/[id]/versions` | GET only | A/author all own-school versions; peer approved versions only | 200 CurriculumVersion[] newest first | No approved visible source 404; G/S403. FR-22 |
| `/api/curriculum/[id]/approve` | POST strict `{versionId,confirmReview:true}` | A school or T original author | 200 CurriculumVersion | Exact saved version; first reviewer/time preserved; self-review permitted; no license certification. FR-22 |
| `/api/curriculum/[id]/snapshot` | GET exactly one `versionId` query | A/T same-school exact approved version | 200 `{referenceId,versionId,version,content,suggestedDraft}` | Missing/duplicate/extra query 400; unapproved/inaccessible version 404; no copying side effect. FR-22 |
| `/api/curriculum/[id]/draft` | POST strict `{versionId,type,clientResourceId?}` | A/T same-school exact approved source | 201 `{resource,provenance}` | Atomic resource/version/binding; source approval does not approve copied draft; stable UUID and canonical source/type guard retries 409. FR-22/FR-13 |
| `/api/assignments/[id]/submissions` | GET; POST strict `{response,expectedAttempt,clientSubmissionId}` | GET A/assigned T or S own active class; POST S own linked active enrolment; G denied | GET 200 SubmissionAttempt[]; POST 201 SubmissionAttempt | Server pins assigned approved version/student/actor; immutable text attempts, revision/retry 409; due date informational. FR-24 |
| `/api/assignments/[id]/submissions/[submissionId]/feedback` | GET; POST strict `{feedback,reviewed:true,expectedRevision,clientFeedbackId}` | GET scoped staff or submitting S; POST A/assigned T; G denied | GET 200 SubmissionFeedback[]; POST 201 SubmissionFeedback | Immutable explicitly reviewed formative text; staff retain current-class history while student remains in school; no grades/family publication. FR-24 |
| `/api/reading-checks/[id]/corrections` | GET; POST strict ReadingCorrectionInput | A school or current assigned T; student remains in school | GET 200 ReadingCorrection[] oldest first; POST 201 ReadingCorrection | Preserves original, expected revision, explicit review/reason, stable UUID; immutable DB triggers; stale/changed retry 409. FR-21/FR-26 |
| `/api/reading-review` | GET optional `studentId`,`classId` | A own school or current assigned T; family denied | 200 `{observations,series}` | Original/effective/correction history; exact student/class/language/passage/duration grouping; withdrawal does not erase staff history. FR-21 |

| `/api/admin/profile-links` | GET; POST strict ReviewedProfileLinkInput | A enabled mapped current-school actor; same-school exact student/guardian profile and eligible matching-role account | GET 200 `{profiles,accounts}`; POST 200 `{profile,event}` | Inventory caps 500 each student/guardian/accounts; reviewed link/unlink CAS; actor-bound UUID replay returns original event and CURRENT profile; sessions/evidence/version atomic; reviewer session excluded. FR-04/FR-06/FR-26 |
| `/api/admin/profile-links/history` | GET optional exact paired `profileType`,`profileId` | A live school scope plus profile still in same school | 200 ProfileLinkEvent[] newest first, latest 200 | Unknown/duplicate/unpaired query 400; private hash/attempt/concrete-target fields omitted. No guardian relationship verification. FR-04/FR-26 |
| `/api/reading-imports` | GET; POST strict `{clientImportId,envelope}` | A current school/class; T creator plus CURRENT assigned class; every learner remains in school | GET 200 ReadingImportDraft[] latest 100; POST 201 `{draft,items}` | Stage 1–25 normalized local rows; active enrollment mandatory stage; no reading check/receipt created; exact payload/actor UUID replay returns current draft. FR-20/FR-25 local boundary |
| `/api/reading-imports/[id]` | GET only | Current import scope; family denied; same-school learner history retained after withdrawal | 200 `{draft,items}` | Original normalized preview/current eligibility/receipts; hashes and server rowsJson omitted; scoped downstream read repeated. FR-20/FR-26 |
| `/api/reading-imports/[id]/decision` | POST strict ReadingImportDecisionInput | Current import scope; all active learners mandatory confirm; reject permits withdrawn same-school history | 200 `{draft,items}` | One reviewed confirm/reject at revision 0; whole-confirm checks/receipts atomic; school+declared namespace+stable result reference dedup across import IDs; conflict 409 leaves staged. FR-20/FR-25/FR-26 |
| `/api/assignments/[id]/submission-window` | GET; POST strict SubmissionWindowInput | GET A/current T/own active S; G 403; POST current A/T only | GET 200 SubmissionWindow; POST 201 `{review,window}` | Reviewed immutable CAS revision; exact original UUID replay returns original review plus CURRENT latest window; no row means unrestricted; due date separate. FR-24/FR-26 |
| `/api/assignments/[id]/submission-window/history` | GET only | Current A/T staff assignment scope; S/G 403 | 200 SubmissionWindowReview[] latest 100 | Newest revision first; requestHash omitted; current actor/class/approved-version predicates in actual query. FR-24/FR-26 |
| `/api/registry/students` | POST strict StudentCreationInput | A current school; exact verified request session and original actor | 201 `{receipt,replayed:false}`;200 exact `{receipt,replayed:true}` | UUID/reason/review/unlinked picked profile; atomic immutable original receipt+student; actor/kind/payload/admission conflict409; legacy POST unchanged. FR-02/FR-03/FR-06/FR-26 |
| `/api/registry/guardians` | POST strict GuardianCreationInput | A current school; exact verified request session and original actor | 201 `{receipt,replayed:false}`;200 exact `{receipt,replayed:true}` | Same reviewed atomic original contract; optional phone/email canonical null; no guardian entity dedup/family verification/account link; conflict409. FR-02/FR-03/FR-06/FR-26 |
| `/api/registry/creations/[requestId]` | GET exact UUID path | Current same-school original A only | 200 RegistryCreationReceipt | Other actor/school/unavailable 404; invalidUUID 400 after auth; original snapshot never current mutable profile; hash/session/identity omitted; no enumerate. FR-02/FR-03/FR-06/FR-26 |
| `/api/demo` | GET; POST strict `{role,syntheticAcknowledged:true}` | GET configuration metadata; POST matching Origin and default-off isolated synthetic runtime | GET200 `{available,synthetic:true}`;POST200 `{destination:"/",synthetic:true}` plus secure opaque cookie | Disabled404;origin403;strict body 400;nonpristine503;unavailable fixed account/isolation403;rate 429; no real provider/identity chosen or forwarded. FR-01/FR-02/FR-03 |

The source path for each route is `app` plus the route shown above plus `/route.ts`, preserving bracketed dynamic segments; for example [resource assignment handler](../../app/api/resources/[id]/assign/route.ts). Internal services without exported route handlers do not constitute additional APIs.

## Legacy academic request shapes

These schemas are in [validation.ts](../../lib/education/validation.ts). Required fields below are not optionalized by PATCH. Legacy schemas generally strip unknown object keys rather than reject them; they lack the comprehensive length/calendar restrictions used by new reading/resource inputs. Optional `id`, `createdAt` and `updatedAt` occur in legacy schemas, but services generate creation ownership/IDs/timestamps and omit immutable fields from updates. They are not client-controlled write authority.

| Input | Required application fields | Optional application fields |
|---|---|---|
| SchoolInput | `name` nonempty | `address` |
| StudentInput | `schoolId,firstName,lastName,dateOfBirth,admissionNumber,gradeLevel` nonempty | `userId` |
| GuardianInput | `name,relationship` nonempty | `schoolId,userId,phone,email`; email validated if supplied |
| CourseInput | `schoolId,code,title,gradeLevel` nonempty | `description` |
| ClassInput | `schoolId,courseId,teacherId,name,term` nonempty | `schedule` |
| AssessmentInput | `classId,title,date` nonempty; `kind` exam/quiz/assignment/project; `maxScore` integer ≥0 | none beyond legacy metadata |
| ReportInput | `studentId,term,overallGrade` nonempty | `summary,publishedAt`; actual creation forces draft |
| NotificationInput | `userId,title,body` nonempty; `channel` in_app/email/sms | `readAt`; actual creation forces unread |

Enrolment status is active/withdrawn/completed; attendance status is present/absent/late/excused. Dates in these legacy academic inputs are mostly nonempty text; they do **not** share the stronger ReadingInput date rule. The common parser now bounds request bytes; legacy array/calendar/term vocabulary and grading still need policy; the reviewed attendance slice separately has exact dates, 100-entry/roster bounds and immutable before/after evidence. Notice APIs persist notices; email/SMS send adapters are not configured.

## Reviewed reading contract and synthetic example

ReadingInput accepts exactly these fields:

| Field | Rule |
|---|---|
| `clientCheckId` | Optional UUID; reuse across uncertain retries of the same observation |
| `classId`, `studentId` | Trimmed nonempty text, max 120; same-school active membership and staff authority |
| `language` | Trimmed max 35, simple tag pattern `^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$` |
| `passageReference` | Trimmed 1–200; no control characters or `<`/`>`; label/reference only |
| `readingDate` | Valid YYYY-MM-DD, no later than the current **UTC** date |
| `durationSeconds` | Finite numeric 1–3600; normalized to rounded integer milliseconds |
| `wordsAttempted` | Integer 1–500 |
| `wordsCorrect` | Integer 0–wordsAttempted |

Synthetic request to POST `/api/reading-checks` (IDs denote isolated test fixtures, never a real learner):

```json
{
  "clientCheckId": "7f6b82c8-8b21-41e0-9fd0-f7f36b782851",
  "classId": "class-a",
  "studentId": "student-a",
  "language": "en-IN",
  "passageReference": "Synthetic passage A / level 2",
  "readingDate": "2026-10-05",
  "durationSeconds": 45,
  "wordsAttempted": 40,
  "wordsCorrect": 36
}
```

A successful 201 includes `id,schoolId,classId,studentId,recordedBy,sourceAppId,provenance,language,passageReference,readingDate,durationMs,wordsAttempted,wordsCorrect,createdAt,durationSeconds,wcpm,accuracy`. The example yields `durationMs:45000`, `wcpm:48` and `accuracy:90`. Server values are `sourceAppId:"oral-reading-fluency"` and `provenance:"manual-reviewed-external"`; these identify a manual workflow, not a verified external provider result.

`wcpm = round(wordsCorrect × 60000 / durationMs)` and `accuracy = round(wordsCorrect × 100 / wordsAttempted)`. Existing same-ID/same-actor **normalized** payload returns the original row/time with 201. Changed data, another actor or foreign-school UUID collision returns 409 without replacing the row. No client key means a fresh server UUID, so a second POST can create a separate observation; the UI retains its key while retrying.

Additional fields such as `schoolId`, `recordedBy`, `createdAt`, `sourceAppId`, `provenance`, `wcpm`, `accuracy`, `studentName`, `audio` and `transcript` are **400**, not accepted or forwarded. The original reading entry remains immutable; corrections and exact-task history use the separate contracts below. Family publication, scoring norms and educator interpretation remain pending (FR-21).

## Resource contract and synthetic examples

ResourceContent is a strict plain-string object:

| Field | Constraint |
|---|---|
| `title` | Trimmed 1–160 |
| `type` | lesson / worksheet / quiz / activity |
| `curriculum`, `gradeLevel`, `subject` | Trimmed nonempty, max 120 / 40 / 80 |
| `language` | Trimmed max 35; same simple language-tag pattern as above |
| `objectives`, `body` | Trimmed nonempty, max 4000 / 20000 |
| `teacherNotes`, `answerKey` | Required strings, may be empty, max 8000 each |

Text is stored as text; no HTML execution or automated generation is part of this contract. Unknown fields at content or envelope level are rejected. Synthetic POST `/api/resources`:

```json
{
  "clientResourceId": "f8fb5d8d-7ff5-4a59-b1c2-3f37dd958641",
  "content": {
    "title": "Synthetic fraction worksheet",
    "type": "worksheet",
    "curriculum": "Original pilot context",
    "gradeLevel": "8",
    "subject": "Mathematics",
    "language": "en-IN",
    "objectives": "Compare two fractions.",
    "body": "Compare 1/2 and 1/4. Explain your reasoning.",
    "teacherNotes": "Staff-only facilitation note.",
    "answerKey": "Staff-only reviewed answer."
  }
}
```

Resource creation uses atomic guarded INSERT SELECTs and returns actual inserted rows or a scoped original retry. Resource draft/version/history and retry reads repeat current account/role/school/identity and parent authority. Revision INSERTs also check the current expected maximum version; approval UPDATEs and winner rereads retain current scope. Assignment replay/feed repeats live actor and existing class/enrolment/approved-version authority. These checks preserve the request/response shapes and private-field stripping described below.

201 TeachingResource is `{id,schoolId,authorId,createdAt,latest}`. `latest` is ResourceVersion: the content plus `id,resourceId,version,createdBy,createdAt,approvedBy,approvedAt`. Creation produces version 1 with null approval, in the same D1 transaction as its resource header. Same actor/initial canonical content and UUID retry returns original version 1 even after later revisions; a different actor/content is 409. The original author remains unchanged after an admin revision.

PATCH `/api/resources/{resourceId}` takes `{expectedVersion:1,content:{...complete content...}}` and returns 200 with a new unapproved version 2. `expectedVersion` is integer 1–1,000,000. Concurrent attempts at the same successor yield one insertion and a 409 loser through unique `(resource_id,version)`; previous content and approval stay intact.

POST `/api/resources/{resourceId}/approve` takes `{versionId:"saved-version-id"}`. It records explicit staff review of that exact version; repeated review preserves first reviewer/time. Self-review is allowed by current code and awaits pilot policy confirmation. Approval does not transfer to a revision.

POST `/api/resources/{resourceId}/assign` takes `{versionId:"approved-version-id",classId:"class-a",dueDate:"2026-12-01"}`; `dueDate` is optional valid YYYY-MM-DD. Resource and class authority, resource/version match and exact approval are required. The insert rechecks live class authority. Same actor, version/class and due date retry returns the original assignment; changed due date or actor colliding with that pair is 409, not an update. A revised version is a different assignment key and requires its own approval.

ResourceAssignment is `{id,resourceId,versionId,classId,assignedBy,createdAt,dueDate,resource}`. `resource` is the pinned approved ResourceVersion **without `teacherNotes` and `answerKey`**. The fields are removed before server serialization for staff and student assignment responses, not hidden merely by the UI. Staff-owned version history remains the private edition source. Students cannot use the draft/detail/version/approval/assignment-write APIs; guardians cannot list assignments yet.

Caller fields `schoolId`, `authorId`, content `createdBy`, `approvedBy`, `approvedAt`, `id`, `version`, or supplied approval booleans are rejected by strict request schemas. No DELETE method exists for resources, versions, readings or assignments. Browser printing is a page workflow, not a PDF-generation API (FR-18).

## Retry and operational limits

| Operation | Implemented retry boundary | Limit needing agreement |
|---|---|---|
| OIDC callback | One-use DELETE RETURNING transaction; reused callback fails | Real provider/tenant/browser verification pending |
| Guardian link | Composite PK and conflict-ignore | Primary contact changes absent |
| Attendance | Unique class/student/date upsert in atomic batch | Edits overwrite observation values; audit/correction history pending |
| Assessment results | Guarded atomic JSON batch plus new-pair duplicate triggers | Legacy duplicate pairs block whole result batch; general correction trail pending |
| Report publication | Original publishedAt retained; deterministic guardian-user notice IDs | No unpublish/correction workflow |
| Reading/resource create | Optional UUID + actor + normalized/canonical payload | Clients must retain keys after uncertain responses |
| Resource revision | Expected latest number and unique successor | Stale retry needs reload/reconciliation, not silent merge |
| Review/assignment | Exact version; first approval and pair uniqueness | No revoke/correction/removal APIs |
| Enrolment creation | Live guarded pair insert and INSERT/changed-pair duplicate triggers | Existing duplicates preserved; temporal/audit policy pending |

No normative latency, SLA or maximum school volume is established by this inventory. The common 128 KiB parser limit and provider-call deadlines/bounds are implementation constraints, not a general API SLA. Operational validation belongs to the [test strategy](TEST-STRATEGY.md) and nonfunctional requirements, not to success-status presence alone.

## Working delivery request and response details

**Identity (FR-04/FR-26):** ProvisionIdentityInput is `{clientRequestId,name,email,role,identityIssuer,identitySubject,reviewConfirmed:true,reason}`. UUID is mandatory; name trimmed 1–120; valid email max 254; role admin/teacher/guardian/student; exact HTTPS issuer max 2048 without credentials/query/fragment/surrounding whitespace; exact nonempty subject max 255 without control/surrounding whitespace; one-line reason trimmed 10–500 without controls. ChangeIdentityStatusInput is `{clientRequestId,expectedVersion,enabled,reviewConfirmed:true,reason}`, expectedVersion integer 0–1000000. School, actor and server times cannot be supplied. AdminUser includes identity mappings, disabledAt and current administration version; legacy version is 0, newly provisioned version 1. IdentityAdminEvent includes id/school/actor/target/action/reason/time/previous and next flags/expected and resulting version. These account endpoints do not remap existing role/school/issuer/subject; profile login binding is the separate reviewed API below. Exact request replay preserves its original event and returns current account state, so a later restoration is not undone by an old disable retry.

**Curriculum (FR-22):** Strict content is `{title,curriculum,gradeLevel,subject,language,objectives,body,rightsStatement,sourceReference?,sourceUrl?}`. Title/context/grade/subject/language/objectives/body share resource bounds 160/120/40/80/35/4000/20000; rightsStatement trimmed 1–2000; sourceReference trimmed 0–300 defaults empty; sourceUrl optional/null HTTPS max 2000 without credentials/fragment defaults null. Source URLs are retained as text, never fetched. Revision expectedVersion is 1–999999. Reference responses include stable id/school/author/createdAt, `canManage` and visible latest version. Version responses add source/rights fields, referenceId, integer version, author/time and paired approval. Copy type is lesson/worksheet/quiz/activity; content plus blank private notes/answer key becomes resource version 1 with null approval. Provenance records resource/version and exact reference/version selection; later source revisions do not rewrite it. Declared rights need educator/legal review; there is no imported curriculum, verified license lifecycle or alignment certificate.

**Submissions (FR-24):** Required response is trimmed plain text 1–20000; expectedAttempt integer 0–1000000; clientSubmissionId UUID. The server derives assignment/version/profile/account/time and next attempt. Feedback requires trimmed formative text 1–8000, reviewed:true, expectedRevision integer 0–1000000 and clientFeedbackId UUID. Both reject unsupported controls and unknown fields. Attempt objects contain id/assignmentId/versionId/studentId/submittedBy/attempt/response/createdAt and newest-first feedback; feedback contains id/submissionId/revision/feedback/reviewedBy/reviewedAt. Whole-list attempts are newest-first. Exact actor/payload/expected-number retries preserve original records; changed/stale UUID/number conflicts 409. Students can read only their linked active-class attempts; current assigned staff can review preserved attempts while the student remains in school. No attachments, automatic grades or guardian publication are added. Reviewed submission windows below enforce new-attempt access independently of due dates.

**Reading correction/history (FR-21):** ReadingCorrectionInput replaces numeric reading fields(`language,passageReference,readingDate,durationSeconds,wordsAttempted,wordsCorrect`) under the same bounds as original entry, plus clientCorrectionId UUID, expectedRevision integer 0–999999, confirmReviewed:true and plain reason 1–1000 (no controls or angle brackets). Class/student/original source remain fixed. The new correction stores normalized metrics and actor/time/reason; the original stays intact. Observation responses expose `{original,effective,revision,corrections}`. Each series groups the exact student/class/language/passageReference/durationMs and sorts points by date/checkId. Rate/accuracy remain descriptive, with no class averaging, cross-language ranking, grade norms or diagnoses. Staff historical access follows current class assignment and same-school student rather than active enrolment; teacher reassignment/student school transfer removes that authority. Original-entry active-enrolment rules remain unchanged.

## v2.2 exact local contracts

### Reviewed login profile binding (FR-04/FR-06/FR-26)

`ReviewedProfileLinkInput` is strict `{profileType:"student" or "guardian",profileId,userId,expectedVersion,clientRequestId,reviewConfirmed:true,reason}`. `userId` is an explicit matching-role enabled mapped same-school account ID or null for unlink; IDs are exact trimmed 1–120 text without controls. `expectedVersion` is integer 0–999999; UUID is mandatory; reason is trimmed single-line 10–500 characters, at least 10 Unicode code points, no controls/angle brackets. Same binding is a conflict rather than an invented review. Legacy binding version is 0 with no review backfill. Response profile includes type/ID/name/userId/current version/updatedAt; event includes prior/new account IDs, actor, reason, time and expected/resulting versions, never requestHash/attemptId or redundant concrete target FK fields.

One D1 batch inserts guarded decision evidence, changes the binding, advances its version and revokes old/new account sessions, with the reviewing administrator explicitly excluded so malformed legacy links can be repaired without terminating the reviewer. Actual enabled actor, profile school, candidate account role/school/identity, occupancy and expected version are checked in SQL. New/changed guardian bindings cannot duplicate an account; existing duplicates are not deleted. Old UUID replay returns original event plus CURRENT profile; stale/changed/actor collisions 409. Legacy profile creation remains unlinked; changed binding through ordinary student POST/PATCH or guardian POST returns 400 `Use reviewed profile link administration at /admin/profile-links`; unchanged/omitted bindings remain. Guardian update is a service, not an exported PATCH endpoint.

### Normalized local reading JSON draft (FR-20; FR-25 boundary)

Stage POST requires `{clientImportId:UUID,envelope}`. Envelope is strict `{format:"saha.reading-results.v1",classId,sourceLabel,sourceReference,rows}`. `classId` is one explicit Saha class. Exact plain sourceLabel 1–120 and batch sourceReference 1–200 preserve the user-declared namespace; whitespace/control/angle brackets fail. `rows` contains 1–25 strict `{externalReference,studentId,language,passageReference,readingDate,durationSeconds,wordsAttempted,wordsCorrect}` objects. Stable externalReference 1–200 must be distinct within the draft. Other row bounds equal ReadingInput, including real nonfuture UTC date and normalized rounded milliseconds. Names/emails/vendor learner IDs, scores/provenance, URLs/audio/transcripts and unknown fields are rejected; no supplied URL is fetched and no name/ID is automatically linked.

Stage creates immutable normalized preview items and zero observations. GET response is `{draft,items}`: draft omits rowsJson/requestHash/decisionHash; item exposes normalized original values, derived descriptive rate/accuracy, current `eligible` active-enrollment flag and nullable receipt. List returns up to 100 safe drafts. Teacher scope requires original creator AND current class assignment; admin retains own-school current-class scope. Every learner must still belong to the school for list/detail/decision/retry; current live actor is repeated at actual reads/writes. Withdrawal permits preview/rejection but prevents confirmation; transfer/reassignment/revocation denies current access.

Decision POST strictly requires `{clientDecisionId:UUID,expectedRevision:0,action:"confirm" or "reject",confirmReviewed:true,reason}` with exact plain 1–1000 reason. Original values cannot change at review. One CAS transition sets confirmed/rejected and revision 1; terminal decisions remain immutable. Confirm creates all original reading checks and source receipts inside one database UPDATE/trigger transaction. Checks preserve `sourceAppId:"oral-reading-fluency"`, `provenance:"manual-reviewed-external"`; receipts retain declared source, stable result reference, item/check link and authenticated reviewer/time. Unique `(schoolId,sourceLabel,externalReference)` consumes a result once across different import UUIDs. Collision 409 rolls back EVERY reading/receipt/decision and leaves draft staged, available for rejection. Pending duplicate drafts may coexist; different schools cannot see one another's metadata. Same pending payload UUID is retained after uncertainty; exact actor/payload decision replay returns current terminal evidence. No verified vendor integration, automatic sync, family publication or original-reading deletion is implied.

### Reviewed submission windows (FR-24/FR-26)

`SubmissionWindowInput` is strict `{clientPolicyId:UUID,expectedRevision,state,closesAt,reviewConfirmed:true,reason}`. Expected revision integer 0–999999; state open/closed; `closesAt` is explicitly null or exact canonical UTC ISO `YYYY-MM-DDTHH:mm:ss.sssZ` with 3 milliseconds and a real date. Closed requires null; open may use null, future or elapsed cutoff. Reason is trimmed single-line 10–500 without controls. School/actor/review time cannot be supplied. CAS appends expectedRevision+1 with unique assignment/revision and immutable review triggers; duplicate/stale/changed actor/payload 409. Exact UUID replay preserves original review while returning CURRENT latest window, so an old closing retry cannot undo a later opening.

GET summary is exactly `{assignmentId,revision,state,closesAt,configured,acceptingSubmissions,asOf}` for scoped staff or own active-class student. No policy means revision 0/open/unconfigured/accepting. Students receive no reviewer/reason/hash; history is staff-only latest 100 newest-first safe review rows. Current class/resource school, enabled role/identity and exact assigned approval are rechecked in actual statements. `dueDate` remains informational. New attempt INSERT checks latest policy and database clock; closed/elapsed new attempts 409 with `submission-window-closed` code, zero attempt persisted. A prior committed exact UUID remains replayable under current learner authority and can receive/read reviewed feedback after closure. Withdrawal/revocation still denies access. No late penalties, grades, attachments or guardian publication are implemented.

## v2.3 unchanged routes and live persistence

School/course/class mutation handlers assert administrator role before JSON; report POST/publication PATCH do likewise, and notice POST asserts academic staff. Authentication and same-origin mutation checks remain first. Common 128 KiB body bounds, safe errors and no-store responses apply. Actual SQL rechecks matching enabled mapped actor and record/relationship scope. Zero-row changed-authority writes are 409, hidden details/acknowledgements are 404, and late-revoked collections may safely return empty arrays.

Report POST returns the existing ReportCard shape with server-owned UUID/time and null publishedAt. It does not accept a retry UUID contract; an uncertain create must be reconciled by scoped reload. PATCH remains `{publish:true}`; the UI review checkbox is local and no API reason/confirmation UUID was added. One unique private report receipt atomically stamps the report and inserts DISTINCT deterministic notices for current same-school enabled trusted guardian accounts. Rollback includes all receipt/report/notice writes; repeated/concurrent publication returns the winning report without creating more notices. Historical published rows keep their time and receive no backfilled receipt. There is no receipt endpoint.

Class detail still returns class fields plus scoped enrolledStudents, now from one statement. Users remains `{id,name,role}[]`. Notice GET/PATCH remain recipient-only with live actor SQL, PATCH uses query id and returns `{success:true}`; repeated acknowledgement preserves first server read/update times. Historical notices remain after unlink, while new recipients and report reads use current relationships. Email/SMS channel labels represent stored rows only, not configured delivery.

## v2.4 server dashboard boundary

No `/api/dashboard` endpoint is added. The four existing role server pages call `getRoleDashboard(principal)` directly once after real session resolution. Its [minimal DTO](DASHBOARD-DESIGN.md) is an internal read contract, not a new HTTP handler. Null/role mismatch redirects through `/`; invalid Principal is denied. The published v2.4 dashboard slice retained 51 route files/84 handlers; published v2.5 attendance inventory was 54/88; historical v2.8 was 56/91;current v2.9 is 60/96 with identical CSV/Markdown route rows. No mutation/body, JSON import, provider API, new schema or external call is introduced.

## Reviewed attendance and raw summary payloads

[Attendance design](ATTENDANCE-DESIGN.md) is the exact DTO reference. `AttendanceReviewInput` is strict `{date,clientRequestId,reviewConfirmed:true,reason,entries:[{studentId,status,note,expectedRecord}]}` with 1–100 distinct dirty entries. Date is real exact YYYY-MM-DD; reason trimmed 10–500 Unicode code points/no controls. Note is required explicit null/string; new/replacement max 2,000 code points, exactly unchanged longer legacy note permitted within 100000 UTF-16-unit full-record cap and 128 KiB total body. `expectedRecord` is null or strict full `{id,status,note,recordedBy,createdAt,updatedAt}`. Identity/time are server derived. No arbitrary expected revision replaces full before evidence.

Editor GET returns class/date/SQL asOf, roster `{items,total,limit:100,truncated}` and canReview. No saved tuple is record=null, never a default present. POST returns original immutable review plus replayed, 201 new or 200 exact retry. New failures after preview are 409; unavailable initial class or committed evidence no longer visible is 404. A failed readback can follow a durable commit, so retain the original UUID/payload.

History returns immutable reviewer/reason/time and exact before/after snapshots, latest 100, exact date and optional pupil filter, uncapped authorized total/truncation. All original pupils must remain current same-school; withdrawal alone does not remove staff evidence. Private request hash/envelope/school storage fields are excluded. Summary GET returns role/class/asOf and up to 100 named current-visible pupil raw-status/date aggregates with exact total/truncation and no individual note/account/percentage field. No legacy attendance API behavior or general school-calendar restriction changes.

## v2.6 exact reviewed result contracts

`AssessmentResultReviewInput` is strict UUID/reviewConfirmed:true/trimmed 10–500-code-point reason/full expected metadata and 1–100 distinct dirty entries. Every entry explicitly includes score, grade, feedback and complete original record/type/timestamps or null. Desired safe integer score includes0 and is bounded by current valid maximum; grade/feedback are nullable literal text with changed 2000-code-point and unchanged-legacy100000-unit/whole128 KiB limits. Safe errors and no-store responses apply; family 403 precedes body parsing, origin enforcement precedes mutation.

`AssessmentResultEditorSnapshot` includes current metadata/class/asOf/invalidMaximum/invalidDate/canReview and active roster exact total/list 100; each pupil carries minimal identity, unique record or null, raw records preview 10, exact counts/truncation and ambiguity/invalid flags. Unsafe INTEGER and nonfinite REAL retain exact string/type; BLOB is safe null/type; unrepresentable current evidence blocks review. Full result/metadata CAS and single-statement receipt/trigger commit are separate from legacy replacement semantics.

New result review is 201; original exact actor/payload UUID replay 200 never reapplies later results or metadata. New conflicting stale/full evidence or unavailable original retry 409; unavailable initial/current readback 404. History is latest 100 with exact total and whole original batch current-school scope, retaining withdrawal but hiding transfer. Optional studentId uses the existing first-value query helper; strict unknown/duplicate query rejection is not claimed. Full public DTOs, function names, bounds and raw evidence semantics are in [assessment design](ASSESSMENT-DESIGN.md). No calculated grade/family publication/history backfill is added.

## v2.7 client recovery without new endpoints

[Recovery design](LEARNER-RECOVERY-DESIGN.md) uses the existing session, approved assignments, submissions, exact-attempt feedback and submission-window/current-history routes. The v2.7 recovery slice added no routes;its inventory was 56/91. Current v2.9 is 60/96. Pending retry sends the original serialized UUID/CAS body; refresh cannot turn an original retry into a new sequence. Known 401/403/404 clears protected client state;400 and409 remain explicit rejected requests;5xx/network/invalid2xx remains uncertain. This adds no API method, server-side outbox or new historical entitlement.

## Historical v2.8 registry client use of existing APIs

No API inventory change: 56 route files/91 handlers. The registry clients use existing GET /api/session, GET/POST /api/students and GET/POST /api/guardians. Only a correlated 201 create response is acknowledged; client locks/comparison provide no UUID idempotency contract. Unknown delivery must not be retried blindly. Existing role-before-body, origin, live scope and validation rules remain server-owned. [Registry design](REGISTRY-DESIGN.md) specifies client behavior.

## v2.9 reviewed registry and session execution boundary

Current inventory: 60 route files/96 handlers; the CSV and Markdown rows match. [Registry design](REGISTRY-DESIGN.md) specifies strict full input/receipt/replay/privacy/400409500 handling and client exact recovery. The reviewed UI uses three new route files, while legacy GET/POST profile endpoints retain their original contracts. Original current-admin UUID receipts survive later profile edits/account links; replay does not restore an old current profile. A final authorized receipt read can fail after commit, so failed delivery is not proof of non-commit.

For trusted resolved request Principals, protected SQL rechecks the original session token/expiry/owner and exact original issuer/subject alongside live account/record scope. Public `/api/session` GET still returns only ID/role/school; no sessionhash/private evidence is added. Collection empty versus object/mutation denial conventions remain compatible. [Session/demo design](SESSION-DEMO-DESIGN.md) documents trusted internal service compatibility, original-object lifetime and no continuous retraction guarantee.

Demo availability GET is configuration metadata rather than seeded-database health. Enabled POST accepts only four fixed synthetic roles with explicit fictional acknowledgement, validates configured same-origin mutation and uses actual opaque sessions in a separately provisioned pristine synthetic installation. The outer private-hosting audience is independent from these app scopes. School OIDC unset still fails closed; configuring any provider setting closes synthetic entry and existing synthetic authority. No external ORF/AI/message/provider call, arbitrary identity selection or reset endpoint is added.
