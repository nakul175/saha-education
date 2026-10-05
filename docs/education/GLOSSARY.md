# Glossary

> Documentation version 1.0 · 5 October 2026 · Draft for sponsor review.
> Describes the Next.js rebuild at `b4cbfc5f6855479ed523b5bf4c0aed0d2b6f6e3d`, not the legacy application on `main`.
> Requirements are proposed targets; code presence does not establish acceptance or production readiness.

| Term | Meaning in this baseline |
|---|---|
| School | Organizational scope to which academic records belong |
| User / principal | Stored account / identity used by the server for access decisions |
| Student | Academic record; currently not explicitly linked to a user account |
| Guardian | Family/contact record optionally linked to a user, then related to students |
| Course | Catalog subject/offering, identified by code and grade level |
| Class | A term-specific course group with an assigned teacher |
| Enrolment | Student membership in a class, active/withdrawn/completed |
| Attendance | One present/absent/late/excused status per student/class/date |
| Assessment | Exam, quiz, assignment or project associated with a class |
| Result | Student score/grade/feedback for an assessment |
| Report card | Student term summary with a supplied overall grade and optional publication timestamp |
| Publication | Approved transition from private draft to permitted reader visibility |
| In-app notification | Stored notice for a user; distinct from confirmed external delivery |
| D1 | Cloudflare database accessed by the rebuild through the DB binding |
| Rebuild | Next.js/TypeScript application on rebuild/nextjs |
| Legacy | Express/Mongoose application on main |
| Acceptance | Demonstrated requirement behavior with recorded environment/evidence and an approval decision |
| RPO / RTO | Maximum acceptable data loss / target recovery time; values remain unapproved |
