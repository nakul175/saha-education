# API reference and integration boundary

> Documentation version 1.0 · 5 October 2026 · Draft for sponsor review.
> Describes the Next.js rebuild at `b4cbfc5f6855479ed523b5bf4c0aed0d2b6f6e3d`, not the legacy application on `main`.
> Requirements are proposed targets; code presence does not establish acceptance or production readiness.

## Contract status

This inventory is generated from route source at the reviewed commit. It is not an OpenAPI guarantee or a successful HTTP test. Source files describe methods; routing, authorization and serialization must be verified against the served Worker. Do not integrate real records until the defects below are resolved.

Responses are commonly raw records or arrays, with `{ "error": "..." }` on failure. Some assessment errors are plain text and thrown role checks can become 500. Typical intended codes are 200 read/update, 201 create, 400 validation, 401 no identity, 403 denied, 404 missing and 500 internal failure; conflicts and error handling are not consistently defined. There is no versioned API, pagination or documented rate-limit contract.

## Source inventory

The authentication column is file-level evidence; it does not assert all methods in that file use the same check.

| Path | Exported methods | Read query keys found | Auth / caveat |
|---|---|---|---|
| `/app/api/_assessments` | GET, POST | classId | Contains request-less auth call; returns null in current helper; Private folder; not a supported public route |
| `/app/api/assessments/[id]/results` | GET, POST | — | Contains request-less auth call; returns null in current helper |
| `/app/api/assessments/[id]` | GET | — | Contains request-less auth call; returns null in current helper |
| `/app/api/assessments` | GET | — | Contains request-less auth call; returns null in current helper |
| `/app/api/attendance` | GET, POST | classId, date, studentId | Contains request-less auth call; returns null in current helper |
| `/app/api/classes/[id]` | GET, PATCH | — | Contains request-less auth call; returns null in current helper |
| `/app/api/classes` | GET, POST | schoolId, teacherId | Contains request-less auth call; returns null in current helper |
| `/app/api/courses/[id]` | GET, PATCH | — | No getPrincipal call in this handler file |
| `/app/api/courses` | GET, POST | schoolId | Contains request-less auth call; returns null in current helper; Contains request-aware demo auth; object scope still unproven |
| `/app/api/enrolments` | GET, POST, PATCH | — | Contains request-less auth call; returns null in current helper |
| `/app/api/guardians` | GET, POST | — | Contains request-less auth call; returns null in current helper |
| `/app/api/notifications` | GET, POST, PATCH | id | Contains request-less auth call; returns null in current helper |
| `/app/api/report-cards/[id]` | GET, PATCH | — | Contains request-less auth call; returns null in current helper |
| `/app/api/report-cards` | GET, POST | studentId | Contains request-less auth call; returns null in current helper |
| `/app/api/schools/[id]` | GET, PATCH | — | Contains request-less auth call; returns null in current helper |
| `/app/api/schools` | GET, POST | — | Contains request-aware demo auth; object scope still unproven |
| `/app/api/session` | POST, GET, DELETE | — | Contains request-aware demo auth; object scope still unproven |
| `/app/api/students/[id]/guardians` | GET, POST | — | Contains request-less auth call; returns null in current helper |
| `/app/api/students/[id]` | GET, PATCH | — | Contains request-less auth call; returns null in current helper |
| `/app/api/students` | GET, POST | search | Contains request-less auth call; returns null in current helper; Contains request-aware demo auth; object scope still unproven |

## Payload guide

| Operation | Body fields / shape | Important current limit |
|---|---|---|
| POST session | `{ "role": "admin" }` (or teacher/guardian/student) | Selects demo identity; not real login |
| POST/PATCH school | name; optional address | IDs/timestamps server-generated in domain create |
| POST/PATCH student | schoolId, firstName, lastName, dateOfBirth, admissionNumber, gradeLevel | Search ignored in list; POST request-less auth |
| POST guardian | name, relationship; optional userId, phone, email | User relationship requires integrity verification |
| POST student/:id/guardians | guardianId; optional isPrimary | Route provides studentId; isPrimary is parsed but ignored |
| POST/PATCH course | schoolId, code, title, gradeLevel; optional description | PATCH uses full schema rather than partial fields |
| POST/PATCH class | schoolId, courseId, teacherId, name, term; optional schedule | Teacher selector API missing |
| POST enrolments | studentId, classId, status, enrolledAt | Full validator requires status/date, but domain enrolStudent sets its own values |
| PATCH enrolments | id, status | Collection path; UI currently calls missing item path |
| POST attendance | classId, date, entries: [{studentId, status, note?}] | Sequential updates; request-less auth; exact teacher check |
| Assessment create (private duplicate source) | classId, title, kind, maxScore, date | Public collection creation is not implemented correctly |
| POST assessment/:id/results | `{ "results": [{ "studentId": "...", "score": 10, "grade": "A", "feedback": "..." }] }` | Current route makes grade and feedback required; verify enrolment, range and auth |
| POST report-cards | studentId, term, overallGrade; optional summary, publishedAt | Proposed contract must prevent creation as published by a client |
| PATCH report-cards/:id | `{ "publish": true }` | Guardian-to-user recipient mismatch; no atomic notification guarantee |
| POST notifications | userId, channel, title, body | Stores record; does not establish external delivery |
| PATCH notifications?id=... | ID in query; no body needed | Ownership check missing; request-less auth |

## Demo session example

For a local synthetic environment only:

```http
POST /api/session
Content-Type: application/json

{"role":"teacher"}
```

The handler returns the fixed demo principal and a `saha_demo_role` cookie with HttpOnly, Path=/, SameSite=Lax and one-hour Max-Age. It does not set Secure, verify a password or maintain a revocable server session. If already authenticated it returns the existing principal rather than switching roles. DELETE session expires the cookie.

## Proposed stable contract

Define explicit request/response schemas and separate partial update schemas; enforce object authority independent of query keys; validate referenced records and date/range rules; normalize errors with stable codes; bound and paginate lists; reject duplicates with a defined conflict policy; add idempotency where publication or batch retries can cause duplicate effects. Publish an OpenAPI contract after these choices and served-route tests agree.

## Unsupported endpoints and routing defects

No /api/users, /api/teachers or /api/enrolments/:id handler exists in this baseline. /api/assessments GET expects an id parameter despite being a collection handler. An underscore folder is a private App Router folder; _assessments cannot be treated as the missing supported collection endpoint. DELETE is implemented for session, not as a general academic-record deletion API.
