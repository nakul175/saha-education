# Implemented API contracts

Version 2.0 draft, 5 October 2026. Source: implementation candidate `5488bc0d20412a3d4be0c031c99c259c56834d5e`, [app/api](../../app/api), [HTTP wrapper](../../lib/education/http.ts), [validation](../../lib/education/validation.ts), and corresponding record services. This is the current contract, not a promise of deployment, school acceptance or future integrations. The inventory below covers all **31 route files and 55 exported method handlers**; only implemented methods are included.

Traceability: FR-01–FR-12 identity/academic routes; FR-13–FR-18 resource routes; FR-19 external launch; FR-20 manual reading; NFR-01/NFR-02 access, errors and concurrency. See [canonical requirements](requirements.json), [BRD](BRD.md), [data dictionary](DATA-DICTIONARY.md) and [integration contracts](INTEGRATION-CONTRACTS.md).

## Authentication, access and errors

All record endpoints use the opaque `__Host-saha_session` cookie. Token digests are persisted; expiry and the account's current role/school/disabled and provisioned identity state are checked on lookup. Cookies are HttpOnly, Secure, SameSite=Lax, Path=/; legacy role cookies or caller identity headers grant no access. Missing, ambiguous, expired or disabled sessions return 401. An `admin` is a **school administrator**, not a global administrator. A missing school fails closed.

Every record mutation also requires `Origin` to match the request URL origin and an entry in `SAHA_ALLOWED_ORIGINS`; cross-site fetch metadata is rejected. This applies even when cookies are valid. JSON mutations use the body schema shown below; response caching is disabled with `Cache-Control: no-store`.

Record error responses are `{ "error": "..." }`: 400 invalid request, 401 authentication required, 403 forbidden, 404 inaccessible/missing object, 500 internal server error, or 503 service unavailable. Reading/resource conflicts explicitly return 409 with `Reading check conflict` or `Resource conflict`. SQL, stack traces, credentials and supplied record contents are not returned by the common error handler. Login/session handlers use their separate safe authentication error handling; login can return 429. Callback errors redirect rather than expose JSON details.

Collection reads normally return 200 with an array, including `[]` when a valid filter selects no visible rows. Detail routes using `found()` return 404 for an inaccessible object. Lists have no documented pagination or total-count envelope. There is no public registration, global administrator API, audio upload, AI drafting endpoint or external-result synchronization endpoint.

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
| `/api/schools` | GET; POST SchoolInput | GET all roles, own school; valid POST denied even for A | GET 200 School[] | POST parses input then school provisioning fails closed **403**; no reachable created-school success. FR-05 |
| `/api/schools/[id]` | GET; PATCH SchoolInput | GET own school; PATCH A own school | 200 School | No tenant switch/global school edit. FR-05 |
| `/api/users` | GET optional `role` enum | A; active users in same school | 200 `{id,name,role}[]` | No email, identity claims or credentials; no create/disable/link method. FR-04 partial supporting lookup |
| `/api/students` | GET optional `schoolId`; POST StudentInput | GET scoped; POST A school | GET 200 Student[]; POST 201 Student | Optional role-matched same-school user link validated. FR-06 |
| `/api/students/[id]` | GET; PATCH StudentInput | GET scoped; PATCH A school | 200 Student | Update keeps ID/creation timestamp and omitted user mapping; required form fields remain required despite PATCH name. FR-06 |
| `/api/students/[id]/guardians` | GET; POST `{guardianId,isPrimary?}` | GET visible student plus scoped guardians; POST A | GET 200 `{id,name,relationship,userId}[]`; POST 200 `{message:"Guardian linked successfully"}` | Path fixes student; duplicate link is safe; current service always sets isPrimary=0, ignoring supplied primary flag. FR-06 |
| `/api/guardians` | GET; POST GuardianInput | GET scoped; POST A | GET 200 Guardian[]; POST 201 Guardian | Missing school inferred from principal; explicit foreign school rejected; null-school legacy profiles excluded. FR-06 |
| `/api/courses` | GET optional `schoolId`; POST CourseInput | GET same-school catalogue; POST A | GET 200 Course[]; POST 201 Course | Global course code uniqueness may surface a generic DB failure on collision. FR-07 |
| `/api/courses/[id]` | GET; PATCH CourseInput | GET own-school course; PATCH A | 200 Course | Full required fields; school cannot change. FR-07 |
| `/api/classes` | GET optional `schoolId`; POST ClassInput | GET class scope; POST A | GET 200 Class[]; POST 201 Class | Same-school course and eligible active teacher required. FR-07 |
| `/api/classes/[id]` | GET; PATCH ClassInput | GET class scope; PATCH A | GET 200 Class plus scoped `enrolledStudents`; PATCH 200 Class | Student/family views do not receive unrelated student roster entries. FR-07 |
| `/api/enrolments` | GET `studentId?`,`classId?`; POST `{studentId,classId}`; PATCH `{id,status}` | GET class/student scope; writes A | GET 200 Enrolment[]; POST 201 Enrolment; PATCH 200 Enrolment | POST generates active status/time; existing pair rejected 400; pair lacks DB uniqueness. FR-08 |
| `/api/attendance` | GET `classId?`,`studentId?`,`date?`; POST `{classId,date,entries:[{studentId,status,note?}]}` | GET intersected class/student scope; POST A or assigned T | GET/POST 200 Attendance[] | Whole batch prevalidated, then D1 transaction upsert by class/student/date; actor server-fixed. FR-09 |
| `/api/assessments` | GET optional `classId`; POST AssessmentInput | GET class scope; POST A or assigned T | GET 200 Assessment[]; POST 201 Assessment | Metadata may be visible to own active-class families; result publication is separate and absent. FR-10 |
| `/api/assessments/[id]` | GET only | Class scope | 200 Assessment | No PATCH/DELETE route exported. FR-10 |
| `/api/assessments/[id]/results` | GET; POST `{results:[{studentId,score,grade?,feedback?}]}` | GET staff scoped; POST A or assigned T | GET 200 `{studentId,studentName,score,grade,feedback}[]`; POST 200 `{message:"Results recorded successfully"}` | G/S GET 403; full batch validates active membership/maximum score then writes transactionally. Pair lacks DB uniqueness. FR-10 |
| `/api/report-cards` | GET optional `studentId`; POST ReportInput | GET scoped; G/S published only; POST A | GET 200 ReportCard[]; POST 201 draft ReportCard | Caller publication timestamp does not publish; server sets null. FR-11 |
| `/api/report-cards/[id]` | GET; PATCH `{publish:true}` | GET scoped; G/S published only; PATCH A | 200 ReportCard | Publish/guardian-account notices commit together; repeated publish retains original time and avoids duplicate notices. FR-11 |
| `/api/notifications` | GET; POST NotificationInput; PATCH query `id` | GET/PATCH recipient only; POST A or T with permitted same-school recipient | GET 200 Notification[]; POST 201 Notification; PATCH 200 `{success:true}` | PATCH requires no JSON body; repeat read acknowledgment updates time. Stored channel is not external delivery. FR-12 |
| `/api/external-apps` | GET only | All signed-in roles; metadata availability staff-only | 200 ExternalAppMetadata[] | Registry does not reveal URL; launch-only/separate sign-in/resultSync false. FR-19 |
| `/api/external-apps/[id]/launch` | POST empty body, `{}`, or strict `{studentId?}` | A/T; optional visible student checked locally | 200 `{url,signIn:"separate",resultSync:false}` | Unknown app/inaccessible student 404; unconfigured/unsafe destination 503; context never forwarded. FR-19 |
| `/api/reading-checks` | GET `studentId?`,`classId?`; POST strict ReadingInput | A/T; T assigned class and active student | GET 200 ReadingCheck[]; POST 201 ReadingCheck | G/S 403; UUID exact actor/payload replay returns same record; conflict 409; no edit/delete. FR-20 |
| `/api/resources` | GET; POST strict `{content,clientResourceId?}` | A school; T original author | GET 200 TeachingResource[]; POST 201 TeachingResource | G/S 403; create UUID replay actor+canonical initial content only, otherwise 409. FR-13 |
| `/api/resources/[id]` | GET; PATCH strict `{expectedVersion,content}` | A school; T author | 200 TeachingResource with latest version | New immutable unapproved version; stale/concurrent successor 409. FR-14 |
| `/api/resources/[id]/versions` | GET only | A school; T author | 200 ResourceVersion[] newest first | Includes private staff fields; G/S 403. FR-14 |
| `/api/resources/[id]/approve` | POST strict `{versionId}` | A school; T author; self-review allowed | 200 ResourceVersion | Exact version must belong to resource; repeat preserves first reviewer/time. FR-15 |
| `/api/resources/[id]/assign` | POST strict `{versionId,classId,dueDate?}` | Resource authority plus A/assigned T class | 201 ResourceAssignment | Unapproved exact version 400; version/resource mismatch 404; conflicting repeated assignment 409. Live class authority rechecked in INSERT. FR-16 |
| `/api/resource-assignments` | GET optional `classId` | A school; T assigned class; S own active class; G denied | 200 ResourceAssignment[] | Exact approved content, never latest draft; notes/key omitted for **all roles**. FR-17 |

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

Enrolment status is active/withdrawn/completed; attendance status is present/absent/late/excused. Dates in these legacy academic inputs are mostly nonempty text; they do **not** share the stronger ReadingInput date rule. Array lengths, request-byte budgets, academic calendar/term vocabulary, grade normalization and correction workflows need further specification. Notice APIs persist notices; email/SMS send adapters are not configured.

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

Additional fields such as `schoolId`, `recordedBy`, `createdAt`, `sourceAppId`, `provenance`, `wcpm`, `accuracy`, `studentName`, `audio` and `transcript` are **400**, not accepted or forwarded. Family visibility/publication, comparable passages, corrections and reading norms remain outside this contract (FR-21).

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
| Assessment results | Pair lookup and atomic batch | Pair lacks DB unique constraint; concurrent inserts can duplicate |
| Report publication | Original publishedAt retained; deterministic guardian-user notice IDs | No unpublish/correction workflow |
| Reading/resource create | Optional UUID + actor + normalized/canonical payload | Clients must retain keys after uncertain responses |
| Resource revision | Expected latest number and unique successor | Stale retry needs reload/reconciliation, not silent merge |
| Review/assignment | Exact version; first approval and pair uniqueness | No revoke/correction/removal APIs |
| Enrolment creation | Existing pair check, reject duplicate | No DB pair uniqueness; race remains |

No normative latency, SLA, maximum school volume or full request-body resource budget is established by this inventory. The authentication provider calls have implemented deadlines/bounds; these do not constitute a general API SLA. Operational validation belongs to the [test strategy](TEST-STRATEGY.md) and nonfunctional requirements, not to success-status presence alone.
