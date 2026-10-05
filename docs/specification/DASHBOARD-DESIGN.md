# Current role dashboard design

Version 2.5 draft, 5 October 2026. Trace: BR-01, BR-02, BR-11, BR-12; FR-03, FR-08–FR-11; NFR-01–NFR-05, NFR-09. Read [BRD](BRD.md), [FSD](FSD.md), [HLD](HLD.md) and [LLD](LLD.md) for the canonical sequence. All approvals remain false; [SC-26–SC-28 cases](TEST-CASES.json) remain not-run-for-this-specification.

The implementation candidate was prepared on `feat/specification-delivery`; `source_commit` records parent `85e85d054afe039d6c633aa215d900b5881eb911` for the current fourth attendance batch, rather than its containing commit. The dashboard implementation was published in the historical v2.4 third batch; prior dated evidence remains separate. No browser, hosted, educator or provider acceptance is inferred by this design.

## Read and authorization contract

The existing four role server pages resolve `getServerPrincipal()`, verify their role and call [getRoleDashboard](../../lib/education/dashboard.ts) exactly once. The service accepts the verified server `Principal`, checks its shape and runs one SELECT FROM users with exact current actor ID plus `livePrincipalScope` and current school existence. There is no `/api/dashboard`, mutation or schema/migration. The dashboard slice added no schema/route; its published v2.4 inventory was 35 tables/294 fields and 51 API route files/84 handlers. Current v2.5 attendance inventory is 37/309 and 54/88.

The scalar SQL JSON payload uses role-specific independently aggregated CTEs/subqueries under that same statement snapshot. One canonical database UTC `asOf` accompanies all displayed records. JSON is parsed once without additional reads. Denied actor authority produces no outer row and returns `null`; an authorized actor without records receives explicit zero totals/empty arrays. The pages redirect through `/` for null/wrong-role data, rather than showing a denied actor zero-valued cards.

Principal contains ID, role and school, without its session digest. Current account/relationship checks do not establish session-only revocation after Principal resolution. Current identity means nonempty stored issuer/subject, not detecting arbitrary replacement by another nonempty pair. A later write can make a delivered snapshot old; Refresh dashboard resolves and reads again. These are limits of the stated snapshot contract, not new session or historical policies.

## Exact minimal derived fields

These are service DTO fields, not persisted SQL columns; they are intentionally excluded from the field CSV inventory. All counts are exact authorized records before display caps. Lists contain objects, including empty `[]`, rather than serialized JSON strings.

| DTO | Fields | Meaning |
|---|---|---|
| Common role view | `role`, `schoolId`, `asOf` | Discriminator, current authorized school and common SQL UTC read cutoff |
| `DashboardList<T>` | `items`, `total`, `limit`, `truncated` | Bounded displayed objects, exact uncapped count, bound and boolean total > limit |
| `AdminDashboard` | Common; `school:{id,name}`; `counts:{students,courses,classes,enabledMappedTeachers}` | Exact current-school aggregates; teacher accounts enabled with nonempty trusted mapping |
| `TeacherDashboard` | Common; `classes:DashboardList<DashboardClass>`; `assessments:DashboardList<DashboardAssessment>` | Current assigned class/assessment sets |
| `DashboardClass` | `id`, `name`, `courseId`, `courseTitle:string|null`, `term`, `activeStudents` | Stored class context; course title only if still in class school; distinct active same-school pupils |
| `DashboardAssessment` | `id`, `classId`, `title`, `kind`, `date`, `maxScore:number|null`, `coverage` | Stored assessment context; raw stored date; valid representable maximum or unavailable |
| `DashboardCoverage` | `state`, `activeStudents`, `recordedStudents`, `missingStudents`, `ambiguousEnrolmentStudents`, `ambiguousResultStudents`, `invalidResultStudents`, `invalidMaximum` | Descriptive current-roster recording evidence and explicit ambiguity/invalidity |
| `FamilyDashboard` | Common with role student/guardian; `profiles:DashboardList<DashboardProfile>` | Current explicit linked profiles; no inferred enrolment/parenthood |
| `DashboardProfile` | `id`, `firstName`, `lastName`, `admissionNumber`, `attendance`, `reports:DashboardList<DashboardReport>` | Minimal displayed learner context plus permitted observed/published data |
| `DashboardAttendance` | `recordedRows`, `counts:{present,absent,late,excused,other}`, `firstDate:string|null`, `lastDate:string|null`, `invalidDateRows` | Observed class/student rows and raw statuses; only valid calendar dates form coverage |
| `DashboardReport` | `id`, `term`, `overallGrade`, `publishedAt` | Nonnull published report metadata; supplied grade remains text, with no computed value |

Family projections omit birth dates, account IDs, raw assessment results/feedback, attendance notes, private report summaries/drafts and reading evidence. Administrator counts expose no account identities. Teacher coverage exposes counts without unrelated learner/result content.

## Bounds and deterministic ordering

| Collection | Display limit | Ordering | Exact total |
|---|---|---|---|
| Teacher classes | 100 | Stored name then ID ascending | All currently assigned classes |
| Teacher assessments | 100 | Stored date then ID descending | All assessments of currently assigned classes |
| Family profiles | 50 | First name, last name, ID ascending | Distinct currently linked authorized student profiles |
| Each profile's published reports | 20 | Stored publication text then ID descending | All nonnull publications for that scoped profile |

The UI says how many are displayed when truncated and links to the existing scoped record screen. Those screens retain their existing pagination behavior. Legacy date/publication ordering is not an approved calendar/current-term selector. Capped output does not bound every aggregate's SQL work or prove capacity/latency.

## Teacher recording coverage

The expected roster is distinct currently active same-school student/class IDs in currently assigned classes. All enrolment rows for each expected pair are counted for legacy ambiguity, including an active plus withdrawn duplicate. Result rows are counted only for expected learners and this assessment. A valid result is exactly one saved pair with integer score in `0..maxScore`; valid maximum is integer >=0 representable safely in JavaScript. Existing maximum 0/score 0 is valid. An invalid maximum is exposed as null/flagged, without inventing a number.

`recordedStudents` counts unique valid result pairs; `missingStudents` counts expected pupils with no result rows. Multiple result rows are ambiguous, and a unique invalid row has invalidResultStudents; neither is falsely counted missing or valid. Enrolment ambiguity is a separate warning and does not erase an otherwise unique valid saved result. No historical/out-of-roster row contributes to current coverage or is deleted.

State precedence:

1. Any invalid maximum, ambiguous whole enrolment pair, ambiguous result pair or invalid result → `needs-review`.
2. Otherwise zero active pupils → `no-current-roster`.
3. Otherwise at least one absent saved pair → `missing-results`.
4. Otherwise → `recorded-for-current-roster`.

These states do not establish historical assessment completeness, attainment, an approved grade, diagnosis or efficacy. No score is chosen from duplicate evidence and no record repair/backfill occurs.

## Family attendance and publication

Current `studentScope` selects explicit own/linked profiles. Attendance additionally uses the existing family `classReferenceScope`: at least one currently linked child must be actively enrolled in that current-school class. This retains current policy rather than granting general historical same-school attendance access. Published reports use the explicit profile scope and nonnull publication independently of class attendance eligibility.

Attendance counts observed rows, including two class sessions on the same date; it does not infer expected school days. Each stored status contributes to its named count or `other`. Only real exactly formed `YYYY-MM-DD` values form first/last date endpoints; malformed/noncalendar rows remain counted in invalidDateRows. Zero observed rows have null endpoints and a no-record label. Excused-only observations have their own truthful label. No percentage, excused weighting, missing-day/grade calculation or normalized learning-progress measure is added.

Published grades are labelled school supplied. Drafts are excluded from both items and totals. Publication order is a bounded stored-record ordering with an ID tie-break, without claiming the latest approved academic term. Names/terms/grades remain escaped literal text.

## Verification mapping and remaining gates

[Focused contract](../../tests/integration/dashboard-contract.mjs) and [independent access contract](../../tests/integration/dashboard-access-contract.mjs) use actual synthetic sessions/migrated SQLite, SQL-time actor/relationship changes, original-row preservation and legacy fixtures created before 0009. The focused suite exercises the production Drizzle D1 prepared driver over isolated SQLite, nested JSON, one actual statement and bound-parameter limit. That driver check alone is not a hosted D1/browser run.

[Built dashboard UI tooling](../../tests/worker-dashboard-ui-check.mjs) is related source for local synthetic native navigation, limits/states, role/privacy and mobile checks. Actual source/build/time/results belong in separately dated root-owned third-batch evidence. None of these links promotes any designed case to passed or any business approval to true. Representative performance, intentional keyboard/screen-reader/pilot-language review, educator UAT, retention/historical/grade/calendar policy, chosen provider/ORF and hosted release remain separate gates.
