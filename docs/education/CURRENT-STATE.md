# Current implementation and gaps

> Documentation version 1.0 · 5 October 2026 · Draft for sponsor review.
> Describes the Next.js rebuild at `b4cbfc5f6855479ed523b5bf4c0aed0d2b6f6e3d`, not the legacy application on `main`.
> Requirements are proposed targets; code presence does not establish acceptance or production readiness.

## Method and limits

This assessment comes from reading routes, business modules, schema, validation, pages, test files and build configuration at the baseline commit. No dependencies were installed and no served rebuild, deployment, production database or existing test results were verified. Historical “all tests pass” statements are not current evidence.

## Implemented structure

App Router pages and handlers exist for school, student, guardian, course, class, enrolment, attendance, assessment, report card and notification domains. Thirteen Drizzle tables and an initial SQLite migration are present. D1 is accessed through the `DB` Worker binding. The Worker exports a fetch handler; its comment mentions scheduling, but no scheduled export exists. Dashboard routes exist for admin, teacher and guardian; no dedicated student dashboard, teacher-management page or user API is present.

## Confirmed source gaps

| Finding | Evidence | Impact / required next step |
|---|---|---|
| Demo role cookie selects a fixed principal | lib/education/auth.ts, app/api/session/route.ts | A client can assert a role; replace before real data |
| Many handlers call getPrincipal() without a request | attendance, enrolments, notifications and student POST handlers | Helper returns null; valid cookie cannot reach the intended workflow |
| Coarse roles allow guardian writes | lib/education/roles.ts | Replace with server object authorization |
| Sensitive reads lack authentication | report-card GET handlers, assessment-results GET, course detail GET | Protect reads and prove negative access cases |
| Student list scopes only admin; search is unused | app/api/students/route.ts | Other roles may reach an unfiltered list; implement scope/search |
| /api/assessments collection handler expects params.id | app/api/assessments/route.ts | Collection contract is inconsistent; creation/listing need repair |
| _assessments is in a private App Router folder | app/api/_assessments/route.ts | Do not assume this duplicate source becomes a public route |
| Teacher selector calls absent user API | app/classes/page.tsx | Class setup cannot rely on /api/users?role=teacher |
| Enrolment status page calls absent item endpoint | app/enrolments/page.tsx | UI calls /api/enrolments/:id but handler is collection PATCH |
| Notification recipient uses guardian.id | report-card PATCH handler | notifications.userId references users.id; map guardian.userId |
| Notification ownership check is explicitly omitted | app/api/notifications/route.ts | Scope read-state updates before enabling the handler |
| Attendance writes sequentially overwrite rows | lib/education/attendance.ts | Failure can leave partial changes; no revision/audit history |
| No enrolment/result pair unique constraints | db/schema.ts | Define duplicate handling and safe concurrent mutations |
| Email/SMS only log a stub including content | lib/education/notification-channel.ts | No delivery; remove sensitive message content from logs |
| D1 configuration contains placeholder ID | vite.config.ts | No configured deployment is established by source |
| Auth environment names are unused by the demo helper | .env.example, lib/education/auth.ts | Setting a provider variable does not enable real authentication |

## Documentation inconsistencies

The old architecture document describes `lib/education/identity.ts` and `teachers.ts`, neither present in the reviewed tree. HANDOVER.md says the rebuild is not pushed even though it is available remotely, and carries historical build/test counts. AGENTS.md references absent requirements/documentation checks and staging documents copied from the health project. The old main README describes an Express/Mongoose application and is not a rebuild setup guide.

## Release boundary

Treat the rebuild as an incomplete synthetic prototype. Code presence supports further development, not production readiness. Fix identity/access first, then workflow defects, then demonstrate persistence, recovery and role-specific acceptance. No providers, real recipients or student data are enabled by this documentation work.
