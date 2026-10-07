# School setup and student/guardian records: demonstration record (6 October 2026)

Agent A2 of the overnight demonstration run, branch `demo/school-records`. This record covers **FR-05 School setup** and **FR-06 Student and guardian records**, both previously `partial`. Everything here uses synthetic data: no real identity provider, ORF sync, paid AI or real recipient is involved and the applications and tests make no external network call. **No designed case is accepted, no approval flag is changed and nothing here is business, legal, privacy or school acceptance.** Executable checks are not acceptance. Earlier source-specific records, `sources/`, the original migrations `0000`-`0016`, `tests/regression-baseline.json`, the designed-case files and the hosting blocker are unchanged.

## 1. Specification gap list (written before any code)

Read: [FSD](../specification/FSD.md), [requirements.json](../specification/requirements.json), [data dictionary](../specification/DATA-DICTIONARY.md), [API contracts](../specification/API-CONTRACTS.md), the existing registry (migration `0015`), profile links (`0008`) and the pages and routes under `app/schools`, `app/students`, `app/guardians`, `app/api/schools`, `app/api/students`, `app/api/guardians`.

| # | Finding | State in the repository | Decision in this work |
| --- | --- | --- | --- |
| G1 | FR-05 defines an existing-school edit (name, address) with current-actor SQL checks and deliberate dirty-field intent. It defines **no academic year, no terms, no current term, no contact details**. A text search of the specification and education documents finds none before this work. | Only `schools.name/address`. | Added as a clearly labelled **candidate extension** (tables `school_setup_settings`, `school_setup_terms`). Not an approved requirement. |
| G2 | The FR-05 text says "no ... CAS is added" and "bootstrap remains operator provisioned". | `PATCH /api/schools/[id]` is last-write-wins. `POST /api/schools` always denies administrators. | The demonstration brief requires stale-edit protection, so the **new** setup route is exact-version compare-and-set. The original route is unchanged (still last-write-wins, still compatible); a legacy edit moves `updated_at`, so any older setup token becomes stale. Bootstrap stays operator-only and is asserted. This departs from the FR-05 wording ("no CAS") and is recorded here for the sponsor to decide. |
| G3 | FR-06 has no deactivate/reactivate concept. Enrolments have `withdrawn`; students have no status. The brief forbids hard delete. | No student status. | Added `student_record_status` plus an immutable event log. Deactivation withdraws active enrolments in the same atomic batch; reactivation does **not** restore them. |
| G4 | The data dictionary states the linking service does not implement primary-contact selection, relationship is a profile-level field and there is no unlink. | `student_guardians(student_id, guardian_id, is_primary)`; `guardians.relationship`. Legacy `POST /api/students/[id]/guardians` ignores a supplied primary flag. | Added link-level relationship (`student_guardian_details`), reviewed link/update/unlink with reason and immutable history (`student_guardian_events`), one primary contact per student. The original endpoint still works and now records history. |
| G5 | Duplicate admission policy is unapproved. | `students.admission_number` is globally unique at the database. | Behaviour unchanged. A taken number is refused with the same answer inside and across schools (no cross-school disclosure). Per-school uniqueness is **not** adopted; it needs a decision. |
| G6 | Public DTOs: `GET /api/students/[id]/guardians` returns `{id,name,relationship,userId}` and omits `isPrimary`. | As stated. | Preserved. The administrator link-management route returns `isPrimary`; a guardian or other non-admin never gets it. The public `relationship` is now link-aware (`coalesce(link relationship, profile relationship)`), same shape. |
| G7 | Deactivating a student has no stated effect on sign-in, family report visibility or class rosters beyond enrolment status. | `studentScope` ignores any status. | Deactivation hides the student from the default directory and withdraws active enrolments. It does **not** disable the student's login or change what families can already see. Recorded as a policy gap, not decided. |
| G8 | No spec assigns class-level settings to FR-05 (classes belong to FR-07). | n/a | Out of scope; nothing added. |
| G9 | Deleting is not specified for terms or records. | n/a | No DELETE route exists for any new resource. |

## 2. What was built

- **Migration** `drizzle/0017_school_records.sql` (journal `idx` 17, `when` 1792000017000): six tables, one statement per breakpoint piece, immutability triggers one per piece. Additive only; no existing row is rewritten.
- **Services** `lib/education/{school-setup,student-records,guardian-records,guardian-links,record-support}.ts`; the original `linkGuardian` and `listGuardiansForStudent` in `students.ts` gain history/link-level relationship without changing their response shapes.
- **Nine routes** under `app/api/schools/[id]/{setup,terms,terms/[termId]}` and `app/api/records/{students,students/[id],students/[id]/status,students/[id]/guardian-links,guardians,guardians/[id]}`. None exports DELETE.
- **Pages** `/schools/setup`, `/records`, `/records/guardians`, `/records/students/[id]`, `/records/guardians/[id]`, plus two additive navigation entries (School setup, Records). The pinned pages `/schools`, `/students`, `/students/[id]`, `/guardians` are untouched.
- **Safety pattern.** Server session decides everything; every mutation checks the live administrator inside the SQL statement. Edits carry the exact saved `updatedAt` or version. Status and link changes carry a client UUID that is the event id: an exact retry returns the original result, a reused UUID with different content is refused, concurrent saves are arbitrated by a unique `(entity, resulting_version)` index, and later statements of one batch run only when that attempt's own event row exists.
- **Plain-language states.** Loading, empty, error and stale-conflict messages; a stale save keeps the person's draft, and "Load latest and keep my edits" keeps only the fields the person changed and takes the latest saved value for the rest. Uncertain delivery says the outcome is unknown and keeps the same request id so a retry is an exact replay.

## 3. Evidence

All runs used synthetic data only. Builds were `node scripts/run-framework.mjs build`; the typecheck, guarded run and mounted run were one serialized job on the shared lock at the final tip (Node 24.19.0).

| Check | Result |
| --- | --- |
| `tests/integration/school-setup-contract.mjs` (new) | 240 checks, 11 scenarios, 89 requests, 0 external |
| `tests/integration/student-records-contract.mjs` (new) | 225 checks, 9 scenarios, 91 requests, 0 external |
| `tests/integration/guardian-records-contract.mjs` (new) | 243 checks, 11 scenarios, 102 requests, 0 external |
| Guarded run `node scripts/test.mjs static unit integration smoke --fast --guard` | passed: 56 suites, 23,162 assertions (119 unit, 22,866 integration, 177 smoke), 0 failed; guard passed with 53 baselined suites. The three new suites are not in `tests/regression-baseline.json` (not edited here); they need `--update-baseline` by the maintainer |
| Mounted procedure `tests/worker-school-records-demo-check.mjs` (Chromium, isolated Worker and D1 on 127.0.0.1:8802, fixture `tests/support/write-records-fixture.mjs`) | 16 checks passed, 0 failed, 0 skipped, 0 external page requests, 0 page errors, 0 browser dialogs, 0 failed assets; 375px width has no horizontal overflow and every control is labelled |
| `tsc --noEmit` (whole repo) and fresh build | exit 0 and exit 0 |
| ESLint on every touched file | clean |
| `check-specification` (47 tables, 392 fields, 69 route files), `audit-requirements --check`, `test.mjs --check-catalogue`, `check-documentation.py` | all pass |
| Existing suites touched by the shared edits (`students.ts`, `app-shell.tsx`, `api-auth-guards.mjs` loader) | api-contract 26, api-auth-guards 156, registry-create 876, registry-ui 463, profile-links 236, profile-assessment-ui 422, live-domain-authority 783, school-ui 840, family-ui 307 and others ran green before and inside the guarded run |

Honest history of the mounted procedure. Run 1 stopped at check 4: "Load latest and keep my edits" kept the whole old draft, so the second administrator's school name was overwritten by an old copy (a real lost-update defect in my page). Fixed: only fields the person changed are kept, untouched fields take the latest saved value (same fix on the student and guardian pages). Run 2 passed 12 checks and stopped at the teacher check because my expectation was wrong: after the deactivate/reactivate journey the teacher's roster is empty, which is the documented policy (enrolments are not restored). The check now asserts that, and uses the second teacher for a positive roster. Run 3 is the one reported above.

Files for this record: `docs/current/DEMO-school-records-EXECUTION.json`. Screenshots from the mounted run (setup conflict, inactive student, links and history, 375px pages) were written to the scratch output directory and are not committed.

## 4. Mutation checks

Each mutant was applied to a sandbox copy of the code, the named suite was run, the copy was restored and the baseline re-run green.

Backend (18 mutants, all finally detected). Four mutants first **survived**, which showed missing checks; each got a new assertion and was then detected.

| Mutant | Suite | First run | After strengthening |
| --- | --- | --- | --- |
| M01 school save ignores saved-record version | school-setup | detected | |
| M02 school save ignores settings version | school-setup | **survived** | detected by "current record token with an old settings version is also stale" |
| M03 term creation allows overlapping dates | school-setup | detected | |
| M04 term edit ignores term version | school-setup | detected | |
| M05 student directory not scoped to caller | student-records | detected | |
| M06 student edit ignores saved-record version | student-records | detected | |
| M07 deactivation leaves enrolments active | student-records | detected | |
| M08 status change ignores expected version | student-records | **survived** | detected by "a version from the future is not accepted" |
| M09 status replay not recognised | student-records | detected | |
| M10 second primary contact left in place | guardian-records | detected | |
| M11 unlink does not remove the link | guardian-records | detected | |
| M12 guardian profile lists children beyond caller scope | guardian-records | **survived** | detected by teacher-sees-only-assigned-child check |
| M13 primary flag shown to non-administrators | guardian-records | detected | |
| M14 guardian directory counts invisible children | guardian-records | **survived** | detected by teacher linked-count check |
| M15 original link endpoint records no history | guardian-records | detected | |
| M16 role check after body parsing | student-records | detected | |
| M17 status events become editable (trigger removed) | student-records | detected | |
| M18 link events become deletable (trigger removed) | guardian-records | detected | |

Mounted page (each mutant built into the Worker, run against the mounted procedure, sources restored):

- UI1 stale reload keeps an old copy of untouched fields: detected at check 4 of the mounted procedure (saved school name was the old copy, strict-equality assertion failed after 3 earlier checks passed)
- UI2 deactivation no longer needs a 10-character reason: first run is not valid evidence (the local Worker restarted mid-request in an earlier step, so the mutated check was never reached); a rerun was queued and is not part of this record
- UI3 guardians are sent to the administrator management page: detected by the guardian link assertion (Playwright received `/records/students/student-a`, expected `/students/...`); my first log scan missed Playwright's message format and reported it as survived, the log shows the failure


## 5. Designed cases

81 designed cases reference FR-05 or FR-06. The cases below were executed **in part** by automated checks of this work; the other 68 were not executed here (their existing automated evidence ran green inside the guarded run, which is evidence context, not case execution). "Pass" means only that the stated automated steps passed. Nothing is accepted and no approval flag changed.

| Case | Title | What ran | Result | Not covered |
| --- | --- | --- | --- | --- |
| TC-018 | Guardian/student profile ownership | guardian-records "a guardian sees only linked children... a student sees only themself", student-records directory scoping; mounted guardian, learner and cross-school checks | pass | unmapped legacy profiles; "supplied email is not ownership" (existing suites) |
| TC-021 | School bootstrap and school updates | school-setup: administrator save, role/origin denial, foreign denial, `POST /api/schools` denied for a school administrator; mounted edit and reload | pass | operator provisioning outside the application |
| TC-023 | Student required fields and duplicate policy | student-records edit validation and duplicate refusal; mounted duplicate admission | pass for edit; policy step blocked: no approved uniqueness policy exists (database constraint is global) | valid creation (registry, existing) |
| TC-024 | Guardian linking retries | guardian-records link, replay, original endpoint retry without a duplicate, foreign student denied | pass | wrong-role account binding (reviewed profile-link workflow, existing) |
| TC-025 | Roster reconciliation after withdrawals | student-records deactivate/reactivate withdraws enrolments, roster excludes, history kept; mounted deactivate journey | automated steps pass; UAT comparison with a school reference list blocked (no reference or reviewers) | teacher visibility of withdrawn learners remains a policy gap |
| TC-106 | Legacy profile writes cannot bypass reviewed binding | student and guardian edits never change the login binding | pass for the new routes | original write routes not re-executed beyond existing suites |
| TC-258 | Late session revocation prevents commits | all three suites: session removed at SQL time, nothing changes | pass for the new mutations | resource commits |
| TC-342 | Exact association replay preserves pair and primary | original link endpoint retry keeps stored primary evidence | pass (server) | existing association page not re-run |
| TC-350 | School viewer, administrator-only editing | mounted: teacher, guardian and learner have no edit controls, API refuses with 403 | pass for the new page | the pinned `/schools` page |
| TC-354 | Dirty field intent, null versus empty | mounted stale reload keeps only edited fields; contract: empty means null | pass for the new page | legacy page |
| TC-355 | Save rechecks current administrator and target | late authority loss, injected faults, concurrent saves with one token have one winner | pass (server) | single-flight lock in the browser not asserted |
| TC-357 | Rejected update permits deliberate correction | mounted: invalid email refused with nothing saved, then corrected | pass for the new page | |
| TC-358 | Uncertain acknowledgement | server exact replay of status, link and term requests | server pass only | browser lost-acknowledgement path was not fault-injected: **not run** in the browser |

Not run at all by this work: TC-096, TC-109, TC-141, TC-253, TC-276, TC-277, TC-285, TC-335, TC-360 (usability, accessibility and UAT reviews need human reviewers), and every other FR-05/FR-06 case. The automated 375px, label and keyboard checks are inputs to those reviews, not the reviews.

## 6. DTO decisions

- Public `GET /api/students/[id]/guardians`: unchanged shape, still no `isPrimary`; `relationship` is link-aware.
- Public `POST /api/students/[id]/guardians`: unchanged response; still ignores a supplied primary flag; a retry creates no second link and no second history event.
- `GET /api/records/students/[id]/guardian-links` (administrator only) returns `isPrimary`, link version, candidates and history. Guardian profile children carry `isPrimary` for administrators only.
- No response contains a login account id; `hasLogin` is a boolean.

## 7. Limits and policy gaps

- Synthetic data, one local Chromium, one local Worker and D1. The callback-style evidence does not include real hosting; the hosted SQL deployment failure is untouched and unresolved.
- Terms, academic year, contact details, deactivation, link-level relationship, primary contact and unlink are candidate extensions with no approved specification.
- Admission numbers remain globally unique (policy open). Deactivation does not alter sign-in, family report visibility or `studentScope` (policy open). Teachers lose roster visibility of a student once enrolments are withdrawn (existing active-class scope).
- Concurrent administrator sessions are simulated by a second browser context holding the same synthetic administrator session.
- Chromium's own background connections (not the page) were refused by the sandbox proxy while the mounted procedure ran; the procedure counts page requests only and observed none outside the local Worker.
- Machine constraint: the full guarded run, builds and mounted runs were serialized through the shared lock with other agents.
