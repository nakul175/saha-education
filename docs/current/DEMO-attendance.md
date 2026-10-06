# Demo attendance workflow (A4, 6 October 2026)

Synthetic data only. This is an execution record for the FR-09 attendance workflow on branch `demo/attendance`. It records what ran and what the result was. No designed case is marked accepted, and no business approval is implied. Machine-readable counts: [DEMO-attendance-EXECUTION.json](DEMO-attendance-EXECUTION.json).

## Gap list (found before changing anything)

| # | Gap in the existing attendance workflow | Outcome |
|---|---|---|
| G1 | The legacy `POST /api/attendance` replaces a saved mark (status, note, recorder) with no reason, no receipt and no trace of what was there before. | Still possible, because existing tests pin its 200/200 replacement behaviour. Closed as far as visibility: database triggers write every replacement or deletion to the new immutable `attendance_changes` table, and the recorder lists them under "Changes made without a review". |
| G2 | "Today" was whatever the browser clock said. Nothing recorded which timezone defines the school day, so a teacher whose device is on another side of midnight saved to the wrong date. | Fixed. Per-school IANA timezone (administrator setting, default UTC); the server computes the school date; the recorder opens on it and shows it. |
| G3 | No way for a school to refuse attendance for dates that have not happened. | Added as an opt-in administrator policy (default unchanged: future dates allowed, so TC-184 and existing tests hold). Exact retries are never blocked by it. |
| G4 | No staff view of a class across a date range. Only a single day editor and a raw all-dates summary existed. | Added: class report with from/to range, per-date counts, per-learner counts, current learners with no mark, caps disclosed. |
| G5 | No day-by-day record for one learner, and none for a guardian or learner beyond a count. | Added: learner page and `GET /api/students/{id}/attendance`, same scope as the existing family list (parity tested). Notes and recorder names are staff-only. |
| G6 | History showed raw account ids for who recorded a change. | Fixed: names, resolved only within the school. |
| G7 | A teacher could not see, before saving, the list of what will change (new mark or correction of a saved mark). | Added "Changes to be saved" list in the recorder. |
| G8 | No deliberate quick action for a mostly-present class, and the first-roll-call reason had to be typed each time. | Added "Mark all unrecorded learners present" (only unrecorded, only on click, never a default) and a one-click standard reason for first roll calls. |
| G9 | Marking was already blocked for an unassigned teacher at the API; no explicit test covered a teacher reassigned between opening and saving. | Test added (workflow contract and mounted check); behaviour already correct. |
| G10 | No percentage or school-day denominator is possible: the system has no school calendar, terms or timetable, and a "session" is class plus date because the unique key has no period. | Not fixed, by design. Reports count saved rows only and say so. Needs a school decision. |

## What changed

- Migration `drizzle/0019_attendance_workflow.sql` (additive, 8 one-statement pieces, journal idx 19): `school_attendance_settings`, `attendance_changes`, two indexes, four triggers (log update, log delete, block update and delete of the log). No original migration touched.
- `lib/education/attendance-calendar.ts`: school-local date from an IANA zone (tested across zones, DST changes, a half-hour offset, leap day and year rollover), admin-only settings, optional future-date policy applied only to NEW reviewed saves.
- `lib/education/attendance-changes.ts`, `attendance-reports.ts`, `attendance-client.ts` and four routes: calendar (GET any member, PUT admin), class report, change log, learner attendance. The only edit to the existing reviewed-save service is one policy check after the exact-replay lookup.
- Recorder page: opens on the school date, blocks a policy-forbidden future date, lists intended changes, names instead of ids, and shows unreviewed changes. All existing labels and texts used by existing tests are kept.
- `/attendance` shows the school calendar control (admin), report and day-by-day links. New pages `/attendance/classes/{id}` and `/attendance/learners/{id}`.
- Specification inventories updated so `check-specification` passes: data dictionary (two tables, 14 columns) and API contracts (4 routes).
- Tests: `tests/integration/attendance-workflow-contract.mjs` (new), `tests/worker-attendance-demo-check.mjs` (new mounted procedure), and the two existing mounted UI procedures now honour `SAHA_TEST_OUTPUT_DIR` (default unchanged). No existing assertion was changed or removed.

## Evidence

All numbers are from runs in this worktree at the commit named in the JSON record. Node 24 was used.

| Check | Command | Result |
|---|---|---|
| Provisional | `pending` | pending |

### Mutation checks

Each mutation was applied to the source, the named suite run, and the source restored (`git status` clean afterwards). Every mutant was detected.

| Mutation | Detected by |
|---|---|
| schoolLocalDate uses the UTC date instead of the school zone | workflow contract: "Africa/Kigali 2026-10-05T22:30:00Z: UTC+2 crosses midnight before UTC does" |
| future-date policy never blocks | workflow contract: "A date after the school calendar date is rejected" |
| change log marks every change as reviewed | workflow contract: "Replacement and its cleared note are visible and flagged as not reviewed" |
| learner view returns teacher notes to families | workflow contract: "Learner and family never see teacher notes or recorder names" |
| learner view ignores current class assignment | workflow contract: "The teacher sees only rows from their own class" |
| recorder name shown to families | workflow contract: "Learner and family never see teacher notes or recorder names" |
| change-log update-immutability trigger disabled | workflow contract: "Missing expected exception" |
| replacement not logged (update trigger never fires) | workflow contract: "The correction produced one change-log row" |
| deletion not logged | workflow contract: TypeError reading the missing delete-log row (fails, but less specifically than the others) |

## Designed-case execution

40 designed cases were in scope. Result of this run: 31 pass, 0 fail, 9 blocked, 0 accepted. "pass" means every automated suite named as evidence ran and passed in this tree; it does not mean the case was walked step by step by a reviewer, and the suite-to-case mapping is the case file's own, not re-derived here. "blocked" means the case needs a human reviewer, an agreed policy or an environment that does not exist yet; the automated parts that did run are listed.

| Case | Title | Result | Evidence executed | Notes |
|---|---|---|---|---|
| TC-028 | Attendance valid save and class membership | pass | api-contract 26; attendance-workflow-contract 362; mounted demo check | Valid present/absent/late/excused persist; outside-class pupil and an unassigned or reassigned teacher are refused with no extra rows (workflow contract scenario "reassigned teacher"; mounted check "class the teacher does not teach"). |
| TC-029 | Attendance whole-batch invalid input and failure | pass | academic-integrity-contract 218; attendance-review-contract 390, attendance-review-access-contract 3782; workflow contract rollback scenario | Invalid second item leaves no first row; injected mid-batch fault rolls back marks, receipt, entries and the new change log together. |
| TC-030 | Attendance date and attributable corrections | blocked | Automated parts: attendance-review-contract 390, attendance-review-access-contract 3782; workflow contract; mounted demo check | UAT/manual case. The exact-date and reviewed-correction parts executed and pass, and school-local date handling is now explicit. The school calendar, term and past-date policy are not agreed, and nobody has reviewed the policy, so the case as written is not complete. |
| TC-082 | Attributable academic/resource/reading corrections | blocked | identity-admin-contract 153; reading-review-contract 177; submissions-contract 137; attendance-review-contract 390, attendance-review-access-contract 3782 | The attendance, reading, identity and submission parts pass. The case also covers assessment correction and platform-wide audit/retention, which are outside this workstream and still incomplete. Legacy attendance replacements are now logged in attendance_changes, so that part of the gap is narrowed but not closed (the legacy API can still replace without a reason). |
| TC-096 | School and academic administrator UAT | blocked | api-contract 26; live-domain-authority-contract 783 | UAT with named administrator, teacher and guardian. Not performed. Automated authority checks pass but are not the UAT. |
| TC-112 | Atomic attendance current membership recheck | pass | academic-integrity-contract 218 | Integration part executed. The mounted worker-development-check listed as evidence was not run by A4. |
| TC-115 | Academic role-before-body and downstream privacy | pass | academic-integrity-contract 218 | Integration part executed. The mounted worker-development-check listed as evidence was not run by A4. The new calendar GET/PUT checks role before body, covered in the workflow contract. |
| TC-116 | Academic batch fault and maximum bounded transport | pass | academic-integrity-contract 218; attendance-review-contract 390, attendance-review-access-contract 3782; mounted API check (128 KiB oversize request returned 400) | Fault rollback and the 128 KiB bound pass. No row cap or school-calendar claim is made beyond what the new calendar setting states. |
| TC-117 | Academic duplicate and correction policy review | blocked | Automated parts only | Policy review with the school owner. Not performed. Duplicate and correction policy remain open decisions; the legacy overwrite is logged but still possible. |
| TC-174 | Family missing-profile and absent-evidence states are distinct | pass | dashboard-contract 137; dashboard-access-contract 422; family-ui-contract 307 | Existing suites unchanged and passing. The new learner attendance page states no saved marks separately from an unlinked profile and shows no percentage (mounted demo check, family views). |
| TC-175 | Attendance shows actual statuses including excused-only evidence | pass | dashboard-contract 137; dashboard-access-contract 422 | Existing suites passing. New reports show an exact count for every status including other; no percentage anywhere (workflow contract, class and learner reports). |
| TC-176 | Attendance dates and current class eligibility remain explicit | pass | dashboard-contract 137; dashboard-access-contract 422; attendance-workflow-contract (learner view parity with listAttendance) | Counts describe saved rows only; invalid stored dates are disclosed and still counted when no range is chosen. |
| TC-181 | Educator review of dashboard meaning and historical limits | blocked | Automated parts only | Educator review not performed. |
| TC-182 | Reviewed attendance authentication role origin and bounded body | pass | attendance-review-contract 390, attendance-review-access-contract 3782 |  |
| TC-183 | One current editor snapshot has no default present mark | pass | attendance-review-contract 390, attendance-review-access-contract 3782 |  |
| TC-184 | Exact real attendance date without invented calendar restrictions | pass | attendance-review-contract 390, attendance-review-access-contract 3782 | Default behaviour is unchanged: real dates accepted, past and future allowed. New: an administrator may switch on a school policy that refuses NEW reviewed saves for dates after today at the school; exact replays are never blocked. The case text "no future prohibition is invented" still holds by default, but the case should be reread now that the prohibition is an opt-in setting. |
| TC-185 | Strict full saved-record and explicit note contract | pass | attendance-review-contract 390, attendance-review-access-contract 3782 |  |
| TC-186 | Dirty-only review preserves null empty and untouched notes | pass | attendance-review-contract 390, attendance-review-access-contract 3782 |  |
| TC-187 | Bounded roster and preserved global legacy ambiguity | pass | attendance-review-contract 390, attendance-review-access-contract 3782 |  |
| TC-188 | Unicode reason and preserved long legacy note bounds | pass | attendance-review-contract 390, attendance-review-access-contract 3782 |  |
| TC-189 | SQL-time staff class and roster authority on editor reads | pass | attendance-review-contract 390, attendance-review-access-contract 3782 |  |
| TC-190 | Full-evidence CAS and late active-membership write guards | pass | attendance-review-contract 390, attendance-review-access-contract 3782 |  |
| TC-191 | Mid-audit fault rolls back full reviewed attendance batch | pass | attendance-review-contract 390, attendance-review-access-contract 3782 |  |
| TC-192 | Concurrent different reviewed UUIDs have one CAS winner | pass | attendance-review-contract 390, attendance-review-access-contract 3782 |  |
| TC-193 | Concurrent exact UUID and reordered entries replay once | pass | attendance-review-contract 390, attendance-review-access-contract 3782 |  |
| TC-194 | Original UUID replay survives legacy edits and withdrawal | pass | attendance-review-contract 390, attendance-review-access-contract 3782 | Replay after a policy flip is also covered (workflow contract). |
| TC-195 | Committed result readback denies late authority loss | pass | attendance-review-contract 390, attendance-review-access-contract 3782 |  |
| TC-196 | Immutable reviewed history and unchanged legacy replacements | pass | attendance-review-contract 390, attendance-review-access-contract 3782; academic-integrity-contract 218; attendance-workflow-contract | The legacy POST still replaces (200/200 concurrent, omitted note clears) and gains no fabricated review receipt. New: each replacement or deletion of an attendance row now writes an immutable attendance_changes row (database trigger). That is a change log, not a review receipt, and no assertion was changed. |
| TC-197 | Current whole-batch history privacy exact filtering and cap | pass | attendance-review-contract 390, attendance-review-access-contract 3782 |  |
| TC-198 | Coherent named attendance summary under current record scope | pass | attendance-summary-contract 103; attendance-summary-access-contract 279 |  |
| TC-199 | Raw summary status and real-date coverage without percentages | pass | attendance-summary-contract 103; attendance-summary-access-contract 279 |  |
| TC-200 | Exact summary totals and family roster minimization | pass | attendance-summary-contract 103; attendance-summary-access-contract 279 |  |
| TC-201 | Actual summary SELECT follows late actor and profile relationships | pass | attendance-summary-contract 103; attendance-summary-access-contract 279 |  |
| TC-202 | Attendance viewer selection cancellation and explicit refresh | pass | attendance-summary-contract 103; mounted worker-attendance-summary-ui-check 23/23 | Mounted run is against the modified /attendance page. |
| TC-203 | Reviewed recorder uncertainty conflict and accessible evidence | blocked | mounted worker-attendance-ui-check 31/31; mounted demo check 25/25 | Accessibility/manual case. Automated labels, keyboard reachability, 375px no-overflow and uncertainty/conflict recovery all pass in Chromium, but no assistive-technology or named-reviewer walkthrough was performed. |
| TC-204 | Reviewed attendance capacity recovery and support gates | blocked | None | Performance and recovery targets are not agreed and there is no hosted environment. Not run. |
| TC-205 | Educator attendance meaning and correction governance acceptance | blocked | Automated parts only | Educator acceptance not performed. Open decisions: calendar/term, absence meaning, retention, family visibility of notes. |
| TC-259 | Revoked reviewed writes and receipt replay reveal no private evidence | pass | session-revocation-contract 411 |  |
| TC-312 | Family attendance navigation uses the existing scoped viewer | pass | family-ui-contract 307; d1-attendance-portability-contract 186 | Existing family navigation is unchanged; per-learner day-by-day links were added additively. |
| TC-313 | Family current class and inbox usability acceptance | blocked | Automated parts only | Usability acceptance with named reviewers not performed. |

## Behaviour decisions to review

- The legacy `POST /api/attendance` was deliberately not changed. Making it require a reason would break the existing tests that pin its replacement behaviour; the log makes the overwrite visible instead. Closing it needs a decision to retire or restrict that endpoint.
- Future dates stay allowed by default. Whether a school wants them refused is its decision; the setting exists but nobody has chosen it.
- Families and learners see status and date only. Teacher notes and recorder names are hidden from them. Whether families should ever see notes is an open policy question.
- The school timezone default is UTC when nothing is set, which is wrong for most schools until an administrator sets it. The settings page says so.
- Reports show counts of saved marks. They never infer an absence from a missing mark and show no percentage.

## Limits

- Local Chromium on one machine, local D1 emulation, fictional synthetic data. Not cross-browser, not assistive-technology, not performance, not hosted.
- The new triggers run in node:sqlite and the local Worker D1 emulation. They have not run on a hosted D1 database; the hosted deployment blocker from the handover is unchanged and untouched.
- No designed case is accepted. 9 of 40 are blocked because they need reviewers, agreed policy or an environment that does not exist.
- The legacy attendance POST can still overwrite without a reason (now logged, not prevented).
- No school calendar exists, so there is no percentage, no school-day denominator and no term boundary. A session is class plus date.
- Open policy decisions: calendar and terms, what an absence means, retention of the change log, family visibility of notes.
- Real identity provider, ORF, paid AI and real-recipient delivery were not touched or enabled; there were 0 external requests in every mounted run.
