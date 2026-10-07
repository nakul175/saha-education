# Courses, classes and enrolment lifecycle demo (6 October 2026)

Workstream A3 of the overnight demo run: FR-07 (courses and classes) and FR-08 (enrolment lifecycle), both previously "partial". Everything here uses synthetic data only. Nothing in this record is business acceptance: the designed cases are executed as far as automated or mounted checks allow, and every case that needs a school administrator or educator stays **blocked** for them.

Machine-readable record: [DEMO-courses-enrolment-EXECUTION.json](DEMO-courses-enrolment-EXECUTION.json).

## Gaps found before any code was written

Compared with the FSD, LLD, API contracts and the designed cases for FR-07 and FR-08, the code at `main` (`cadd2eb`) had:

1. **Courses** could be created and listed only. There was no edit, retire or reinstate, and no course lifecycle state.
2. **Classes** could be created with a single teacher id. There was no way to change or end a teacher assignment, set capacity or start/end dates, or close and reopen a class. A retired course could still receive new classes through the legacy route.
3. **Enrolment** was "create a row" and "patch a status". There was no withdraw with an effective date, no transfer between classes, no re-enrolment, no completion, no capacity rule and no closed-class rule.
4. **No history.** Status changes overwrote the row; there was no append-only record of who changed what, when and why, and no receipt a person could be shown or re-fetched.
5. **No retry safety.** A repeated or half-delivered request could duplicate or contradict itself; there was no client request id, no exact replay, no distinction between "the same request again" and "a different request reusing the id".
6. **No atomic batch.** Enrolling a group of learners (or a transfer, which is a withdrawal plus an enrolment) could be left half done.
7. **No concurrency check.** Two administrators editing the same course or class could silently overwrite each other.
8. **Conflict codes.** Refusals returned a bare 409 with no stable code, so a page could not explain the reason in plain language.
9. **Visibility.** There was no roster or history view; teacher, guardian and learner scoping of enrolment history was undefined for any new view.
10. **Pages.** No page existed for course editing or retirement, class setup (teachers, capacity, dates, closing), the roster, or enrolment history.

## What changed

Additive migration `drizzle/0018_course_class_enrolment_lifecycle.sql` (journal index 18; original migrations untouched, one statement per breakpoint piece):

- New tables `course_lifecycle`, `class_settings`, `enrolment_lifecycle`, `academic_change_requests` (one row per reviewed request) and `academic_events` (one immutable row per effect). Both ledger tables reject UPDATE and DELETE.
- Every effect is applied by database triggers on the request insert, so the whole request is one atomic statement. A header guard checks that the actor is a live administrator of the school, that the id is a UUID and that the item count matches. Per-kind triggers refuse with a stable conflict code (`saha_academic_conflict:<code>`) and roll the whole request back.
- Fourteen change kinds: `course.create`, `course.edit`, `course.retire`, `course.reinstate`, `class.create`, `class.edit`, `class.teacher`, `class.close`, `class.reopen`, `enrolment.enrol`, `enrolment.withdraw`, `enrolment.complete`, `enrolment.transfer`, `enrolment.reenrol`.
- Optimistic concurrency: edits carry `expectedUpdatedAt`; a stale token is refused with `stale`.
- Legacy enforcement: the older enrol and class-create paths now also stop at closed or full classes and retired courses, and re-enrolling one of two legacy duplicate rows is refused (`ambiguous-legacy-pair`), because which row is meant cannot be known.

Service and routes:

- `lib/education/academic-lifecycle.ts`, `academic-lifecycle-types.ts` (client-safe types and the plain-language message for every conflict code) and `academic-lifecycle-client.ts` (browser helpers).
- `POST /api/academic-changes` (administrator only; the role check runs before the body is read; 201 for a new request, 200 for an exact replay) and `GET /api/academic-changes/[id]` (receipt recovery). Same actor, id and payload replays the original receipt; a different payload, or another account using the id, is refused as `request-id-reused`.
- Read routes: `/api/course-lifecycles`, `/api/courses/[id]/lifecycle`, `/api/courses/[id]/history`, `/api/classes/[id]/lifecycle`, `/api/classes/[id]/roster` (staff only), `/api/classes/[id]/history` (staff; a teacher's view omits the other class of a transfer and administrator reasons), `/api/enrolments/history?studentId=` (administrator all; teacher only learners of currently assigned classes; guardian and learner only their own, without administrator reasons or actors).
- `lib/education/http.ts` now adds the stable `code` to error bodies. It never carries record contents.

Pages (each under a server-side sign-in layout, labelled controls, no browser dialogs, no raw JSON or internal ids shown): `/academic` (hub), `/courses/new`, `/courses/[id]` (edit, retire, reinstate, history), `/classes/new`, `/classes/[id]/manage` (teachers, capacity, dates, close/reopen, history), `/classes/[id]/roster` (enrol a group, withdraw, complete, transfer, re-enrol), `/enrolments/history`. Two navigation entries and a roster link on the staff class page were added. A shared hook keeps the request id across an uncertain outcome and offers "Check whether it was saved", "Try the same request again" and "Discard this request"; a refusal always says nothing was saved.

### Working policies (not approved; chosen so the demo behaves predictably)

- Course codes are unique across the whole system, not per school.
- A class cannot lose its teacher without a replacement in the same request.
- A pre-enrolment effective date must equal the class start date; withdrawal and completion are never future-dated.
- Capacity is 1 to 500; a transfer needs room in the destination class.
- Legacy writes made through the older routes are not recorded in the new ledger (they are only guarded).
- A future-dated pre-enrolment still shows as active in older views.

These need a decision by the school administrator and the product owner; none is recorded as approved.

## Evidence

All runs used synthetic data only, an isolated local Worker on 127.0.0.1:8803 with local D1, Node 24.19.0, and a fresh `node scripts/run-framework.mjs build` of the committed tree (commit `fe01fa6` for the application code; later commits changed only the mounted test).

| Check | Command | Result |
| --- | --- | --- |
| Lifecycle contract suite (service, triggers, routes, scoping, replay, races) | `node tests/integration/academic-lifecycle-contract.mjs` | 387 checks in 9 scenarios, 0 failed, 0 network calls |
| Lifecycle UI contract (client helpers, page source rules, every conflict code has a plain message) | `node tests/integration/academic-lifecycle-ui-contract.mjs` | 113 checks, 0 failed, 0 external requests |
| Full guarded run | `node scripts/test.mjs static unit integration smoke --fast --guard --report <file>` | 55 suites, 22,943 assertions (119 unit, 22,647 integration, 177 smoke), 0 failed; static catalogue, `tsc --noEmit` and specification steps passed; regression guard passed for 53 baselined suites, 0 excused. The two new suites are not in `tests/regression-baseline.json` yet (the orchestrator updates the baseline) |
| Mounted procedure | `tests/worker-courses-enrolment-demo-check.mjs` against the built Worker, Chromium, offline | 4 consecutive final runs: 26 passed, 0 failed, 0 external requests, 0 page errors each (one run needed one repeated navigation; see limits) |
| Mutation checks | each mutant applied to source or migration, contract suite re-run, source restored | 13 of 13 detected: capacity guard, closed-class guard, future-date guard, legacy retired-course trigger, event immutability, database authority guard, stale-token guards, request-id reuse, teacher seeing both sides of a transfer, teacher learner-history scope, ambiguous legacy re-enrol, role check after body parse, missing stable code. One (stale guards) first survived; a direct-SQL stale-token test was added and it is now detected |
| ESLint on changed files; `tsc --noEmit` | `eslint app/academic app/courses app/classes app/enrolments components/academic-submission.tsx lib/education/academic-lifecycle-client.ts tests/...` | clean |
| Documentation and specification checks | `python3 scripts/check-documentation.py`; `node scripts/check-specification.mjs` | 78 Markdown files pass; 12 BR, 35 FR/NFR, 371 designed cases, 69 route files |

Defects found by running the pages and fixed: route parameters were read with `params.then(...)`, which crashes in the mounted Worker (the page showed "This page couldn't load"); card titles were not headings; class date ranges read "Not set to Not set"; a 2xx response without a receipt was reported as "nothing saved" instead of "unconfirmed"; re-enrolling one of two legacy duplicate rows was allowed; and a retired-course class could still be created through the legacy route. Each has a test that fails without the fix.

Screenshots of the roster at 375px and the class settings at desktop width are produced by the procedure (`courses-enrolment-roster-375.png`, `courses-enrolment-manage-desktop.png`, in the directory named by `SAHA_TEST_OUTPUT_DIR`).

## Designed-case execution

61 designed cases name FR-07 or FR-08 (traceability rows plus any case listing either requirement). Results: **52 pass, 0 fail, 9 blocked.**

How to read this: "pass" means every executable check named for the case passed in the full guarded run above (and, for TC-026, TC-027, TC-110, TC-111, TC-135, TC-136, TC-137 and TC-170, the new lifecycle contract suite also covers the behaviour). It does not mean the designed scenario was performed by a person or accepted by the business. Where a case also names a mounted `worker-*.mjs` check, that check was not run here (only the new mounted procedure was) and the note says so. The nine UAT cases need a school administrator or educator and are **blocked**; nothing is recorded as accepted.

| Case | Scenario | Layer | Result | Evidence or reason |
| --- | --- | --- | --- | --- |
| TC-025 | SC-04 | uat | blocked | Manual educator or administrator review; no automated check can stand in for it. |
| TC-026 | SC-05 | integration | pass | Passed: integration/api-contract (26), integration/academic-lifecycle-contract (387). |
| TC-027 | SC-05 | integration | pass | Passed: integration/academic-integrity-contract (218), integration/academic-lifecycle-contract (387). |
| TC-054 | SC-09 | integration | pass | Passed: integration/resources-contract (147). |
| TC-096 | SC-18 | uat | blocked | Manual educator or administrator review; no automated check can stand in for it. |
| TC-110 | SC-20 | regression | pass | Passed: integration/academic-integrity-contract (218), integration/development-recovery-contract (257). Mounted checks named by the case were not run in this workstream: worker-development-check.mjs. |
| TC-111 | SC-20 | integration | pass | Passed: integration/academic-integrity-contract (218), integration/academic-lifecycle-contract (387). Mounted checks named by the case were not run in this workstream: worker-development-check.mjs. |
| TC-117 | SC-20 | uat | blocked | Manual educator or administrator review; no automated check can stand in for it. |
| TC-134 | SC-23 | security | pass | Passed: integration/school-structure-authority-contract (275), integration/live-domain-authority-contract (783). |
| TC-135 | SC-23 | integration | pass | Passed: integration/school-structure-authority-contract (275), integration/live-domain-authority-contract (783), integration/academic-lifecycle-contract (387). |
| TC-136 | SC-23 | integration | pass | Passed: integration/school-structure-authority-contract (275), integration/live-domain-authority-contract (783), integration/academic-lifecycle-contract (387). |
| TC-137 | SC-23 | integration | pass | Passed: integration/school-structure-authority-contract (275), integration/live-domain-authority-contract (783), integration/academic-lifecycle-contract (387). |
| TC-138 | SC-23 | security | pass | Passed: integration/school-structure-authority-contract (275), integration/live-domain-authority-contract (783). |
| TC-139 | SC-23 | security | pass | Passed: integration/school-structure-authority-contract (275), integration/live-domain-authority-contract (783). |
| TC-140 | SC-23 | regression | pass | Passed: integration/school-structure-authority-contract (275), integration/live-domain-authority-contract (783). |
| TC-141 | SC-23 | uat | blocked | Manual educator or administrator review; no automated check can stand in for it. |
| TC-161 | SC-26 | security | pass | Passed: integration/dashboard-contract (137), integration/dashboard-access-contract (422). |
| TC-163 | SC-26 | integration | pass | Passed: integration/dashboard-contract (137), integration/dashboard-access-contract (422). |
| TC-167 | SC-27 | integration | pass | Passed: integration/dashboard-contract (137), integration/dashboard-access-contract (422). |
| TC-168 | SC-27 | regression | pass | Passed: integration/dashboard-contract (137), integration/dashboard-access-contract (422). |
| TC-170 | SC-27 | regression | pass | Passed: integration/dashboard-contract (137), integration/dashboard-access-contract (422), integration/academic-lifecycle-contract (387). |
| TC-173 | SC-27 | integration | pass | Passed: integration/dashboard-contract (137), integration/dashboard-access-contract (422). |
| TC-176 | SC-28 | integration | pass | Passed: integration/dashboard-contract (137), integration/dashboard-access-contract (422). |
| TC-181 | SC-28 | uat | blocked | Manual educator or administrator review; no automated check can stand in for it. |
| TC-183 | SC-29 | integration | pass | Passed: integration/attendance-review-contract (390), integration/attendance-review-access-contract (3782). |
| TC-187 | SC-29 | regression | pass | Passed: integration/attendance-review-contract (390), integration/attendance-review-access-contract (3782). |
| TC-190 | SC-30 | security | pass | Passed: integration/attendance-review-contract (390), integration/attendance-review-access-contract (3782). |
| TC-194 | SC-30 | regression | pass | Passed: integration/attendance-review-contract (390), integration/attendance-review-access-contract (3782). |
| TC-198 | SC-31 | integration | pass | Passed: integration/attendance-summary-contract (103), integration/attendance-summary-access-contract (279). |
| TC-200 | SC-31 | security | pass | Passed: integration/attendance-summary-contract (103), integration/attendance-summary-access-contract (279). Mounted checks named by the case were not run in this workstream: worker-attendance-summary-ui-check.mjs. |
| TC-201 | SC-31 | security | pass | Passed: integration/attendance-summary-contract (103), integration/attendance-summary-access-contract (279), integration/session-revocation-contract (411). |
| TC-205 | SC-31 | uat | blocked | Manual educator or administrator review; no automated check can stand in for it. |
| TC-207 | SC-32 | integration | pass | Passed: integration/assessment-review-contract (479), integration/assessment-review-access-contract (5232). |
| TC-212 | SC-32 | regression | pass | Passed: integration/assessment-review-contract (479), integration/assessment-review-access-contract (5232). |
| TC-214 | SC-33 | security | pass | Passed: integration/assessment-review-contract (479), integration/assessment-review-access-contract (5232). |
| TC-220 | SC-33 | regression | pass | Passed: integration/assessment-review-contract (479), integration/assessment-review-access-contract (5232). |
| TC-286 | SC-42 | security | pass | Passed: integration/academic-ui-contract (256). |
| TC-287 | SC-42 | integration | pass | Passed: integration/academic-ui-contract (256). |
| TC-289 | SC-42 | regression | pass | Passed: integration/academic-ui-contract (256). |
| TC-290 | SC-42 | security | pass | Passed: integration/academic-ui-contract (256). |
| TC-291 | SC-42 | regression | pass | Passed: integration/academic-ui-contract (256). |
| TC-293 | SC-42 | uat | blocked | Manual educator or administrator review; no automated check can stand in for it. |
| TC-306 | SC-44 | smoke | pass | Passed: integration/family-ui-contract (307), integration/demo-login-ui-contract (249). |
| TC-307 | SC-44 | security | pass | Passed: integration/family-ui-contract (307). |
| TC-308 | SC-44 | integration | pass | Passed: integration/family-ui-contract (307). |
| TC-309 | SC-44 | security | pass | Passed: integration/family-ui-contract (307). |
| TC-310 | SC-44 | integration | pass | Passed: integration/family-ui-contract (307). |
| TC-311 | SC-44 | regression | pass | Passed: integration/family-ui-contract (307). |
| TC-312 | SC-44 | integration | pass | Passed: integration/family-ui-contract (307), integration/d1-attendance-portability-contract (186). |
| TC-313 | SC-44 | uat | blocked | Manual educator or administrator review; no automated check can stand in for it. |
| TC-361 | SC-51 | smoke | pass | Passed: integration/course-catalog-ui-contract (925). |
| TC-362 | SC-51 | integration | pass | Passed: integration/course-catalog-ui-contract (925). |
| TC-363 | SC-51 | regression | pass | Passed: integration/course-catalog-ui-contract (925). |
| TC-364 | SC-51 | integration | pass | Passed: integration/course-catalog-ui-contract (925). |
| TC-365 | SC-51 | recovery | pass | Passed: integration/course-catalog-ui-contract (925). |
| TC-366 | SC-51 | integration | pass | Passed: integration/course-catalog-ui-contract (925). |
| TC-367 | SC-51 | regression | pass | Passed: integration/course-catalog-ui-contract (925). |
| TC-368 | SC-51 | recovery | pass | Passed: integration/course-catalog-ui-contract (925). |
| TC-369 | SC-51 | regression | pass | Passed: integration/course-catalog-ui-contract (925). |
| TC-370 | SC-51 | integration | pass | Passed: integration/course-catalog-ui-contract (925). |
| TC-371 | SC-51 | uat | blocked | Manual educator or administrator review; no automated check can stand in for it. |

Cases for the new pages (hub, course detail, class settings, roster, enrolment history) do not exist in the designed pack yet; the mounted procedure covers them and is not linked to a case id here.

## Limits

- One local Chromium, one viewport family, fictional data and an isolated local Worker with local D1. Not cross-browser, assistive-technology, performance or hosted evidence.
- The reviewed-request triggers are exercised on SQLite through the project's D1-compatible harness and the local D1 in the Worker, not on the hosted database, whose deployment failure is unchanged and unresolved (see [HOSTED-DEPLOYMENT-FAILURE](HOSTED-DEPLOYMENT-FAILURE.md)). The migration was written as one statement per piece for that reason but has not been run there.
- The 61 designed cases that name FR-07 or FR-08 remain designed; "pass" below means the named executable check passed on this branch, not that the business scenario is accepted. UAT cases stay blocked.
- Policies listed above are working choices only.
- Legacy duplicate rows stay ambiguous and are never merged.
- No real provider, ORF or recipient setting was touched; paid AI and real recipients stay disabled.
- Before the final runs the mounted procedure stalled intermittently (about two runs in three) when navigating from a long-idle admin page; the Worker answered a direct request in about 100 ms while the browser page waited on requests that never completed. Closing that idle page before the later checks removed the stalls (four consecutive clean runs; one still needed a single repeated navigation). The underlying browser-side cause was not established. The procedure repeats only reads and navigations, never a write, and counts the repeats in its result.
