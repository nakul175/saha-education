# Product requirements

> Documentation version 1.0 · 5 October 2026 · Draft for sponsor review.
> Describes the Next.js rebuild at `b4cbfc5f6855479ed523b5bf4c0aed0d2b6f6e3d`, not the legacy application on `main`.
> Requirements are proposed targets; code presence does not establish acceptance or production readiness.

## Product boundary

This is a school administration and academic record product. It is not currently a complete learning-content delivery platform. Proposed release scope follows the BRD; implementation status follows CURRENT-STATE.md.

## Personas and journeys

### Administrator: prepare a school term

Create the school, provision approved users, register students, create guardians and link them to students, define courses and classes, assign teachers, then enrol students. Each step must validate referenced records and school scope. Duplicate or invalid submissions must explain what to correct without creating extra records. User provisioning is a missing capability in the rebuild.

### Teacher: run daily and term work

Open assigned classes, choose a valid local attendance date, review the roster, mark present/absent/late/excused and save. Reload the roster to confirm persistence. Create assessments, enter results against their maximum score, review a student's term summary and submit/publish according to the approved school policy. Partial save failures must identify affected entries and preserve a recoverable state.

### Guardian: review a child's progress

Sign in with a verified account, choose a linked child, see only authorized attendance and published reports, open a publication notification and mark it read. A guardian with multiple children must never gain access through an arbitrary student ID. Linking requires an approved school process, not a self-asserted relationship.

### Student: review personal records

Sign in, see personal classes and published progress, and read personal notifications. Students cannot create or alter school, enrolment, attendance or assessment records. A dedicated student dashboard is not present in the reviewed routes.

## Proposed permission matrix

| Action | Admin | Teacher | Guardian | Student |
|---|---|---|---|---|
| Manage schools/users/courses | Own school | No | No | No |
| Manage student/guardian links | Own school | Only if explicitly delegated | No | No |
| Create classes/enrolments | Own school | Only if explicitly delegated | No | No |
| Read attendance/results | Own school | Assigned classes | Linked children, approved visibility | Self, approved visibility |
| Write attendance/results | Own school | Assigned classes | No | No |
| Create report drafts | Own school | Assigned students | No | No |
| Publish report | Approved publisher | Only if delegated | No | No |
| Read/mark notification | Own recipient records | Own recipient records | Own recipient records | Own recipient records |

This is a target policy, not a description of current roles.ts. The current helper allows guardians to write and does not implement object scope.

## UX requirements

Show field-level errors and a clear save result; preserve user input after validation failure; prevent accidental double submission; show empty/loading/error states separately; support keyboard navigation and usable mobile layouts; use understandable labels for course versus class and draft versus published report. Resolve unavailable links and API mismatches before calling a journey complete.

## Priority and release boundary

P0: real identity, object authorization, removal of public sensitive reads, valid user/teacher administration and reliable persistence. P1: end-to-end setup, enrolment, attendance, assessment and report publication with in-app notifications and approved family/student views. P2: search, pagination and accessibility verification. External messaging and additional education features require a later product decision.

## Product acceptance

A synthetic administrator, assigned teacher, linked guardian and student must each complete their authorized journeys against the served Worker. Repeat every journey with a second school and an unrelated student; unauthorized reads/writes must be rejected. Success must survive reload, and draft reports must stay private. See TESTING-UAT.md for the case IDs and evidence format.
