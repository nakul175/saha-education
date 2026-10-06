# Demonstration: curriculum reference library and learner submissions

Recorded 6 to 7 October 2026 on branch `demo/curriculum-submissions` (agent A8 of the overnight demonstration run). This note covers FR-22 (Curriculum reference library) and FR-24 (Learner submission and feedback). Everything here ran on synthetic, fictional data in isolated local databases. No real identity provider, ORF sync, paid AI or real-recipient delivery was used or enabled, and no check made an external network call. Executable checks are evidence, not business acceptance: no designed case is marked accepted and no approval flag was changed.

## Gap list (written before the changes)

Found by reading the application at `origin/main` against FR-22, FR-24 and the designed cases TC-068, TC-069, TC-078 and TC-079.

FR-22, curriculum reference library:

1. A reference could not be withdrawn. TC-069 expects a missing or withdrawn source to be handled, but the only states were "private draft" and "reviewed". An out-of-date reference stayed copyable forever.
2. The library list had no search or filter, so staff could only scroll a flat list.
3. A reference did not show where it had been used. The resource page did not show which reference a teaching draft came from, so exact source attribution was only visible inside the copy API response.
4. Raw user identifiers were shown where a person was meant ("Reviewed by" and author fields).
5. Declared rights were only visible on the detail page, and nothing on the screen said the statement is the author's declaration rather than a checked licence.

FR-24, learner submission and feedback:

1. A learner had no overview of their submissions: which items are still to do, which are waiting for feedback and which have reviewed feedback.
2. Staff had no per-assignment view of who has and has not responded.
3. Internal identifiers appeared in screens ("Staff ID" in the window history and a raw student identifier as the fallback label).
4. Nothing said that file attachments are not supported.
5. The due date was informational, but staff could not see which responses arrived after it.
6. Guardian visibility is not defined by the specification. The application denies guardians; that stays as is.

## What changed

Additive migration `0023_curriculum_status.sql` (table `curriculum_reference_status_events`, journal index 23): an append-only, immutable record of retire and reinstate events with a reason (10 to 500 characters), the staff member and the time. A reference with no event is in use. The latest event wins. Original migrations `0000` to `0016` are untouched.

FR-22:

- Retire and reinstate (`POST /api/curriculum/[id]/status`, history at `GET`). Only the author or a school administrator may change it. The request carries an expected revision and a client UUID: an exact retry returns the original event, a changed body with the same UUID is a conflict, and a stale revision is a conflict.
- A retired reference is hidden from other staff, cannot be revised, approved or copied, and the same holds for snapshots. An exact replay of a copy that already committed still returns the original. Existing copies, assignments and saved versions are not changed or deleted.
- Search and filters on `GET /api/curriculum` (text, framework, level, area of study, language, review state, availability), school-scoped, with a result count on the page.
- Usage (`GET /api/curriculum/[id]/usage`): teachers see their own copies, administrators the school's, with class assignments. Other teachers' copies are not visible.
- Resource source (`GET /api/resources/[id]/source`): the teaching draft page now shows the exact reference version it was copied from, who reviewed it, the rights statement as declared, and whether the reference has since been retired or has a newer version.
- Names replace identifiers. Rights are shown as "declared by the author (not independently verified)". The school's curriculum and pilot rights position remains an open business question; nothing here asserts it.

FR-24:

- `GET /api/assignment-progress`: a learner sees only their own status per assignment (to do, waiting for feedback, feedback received) and the window state. Staff see per-assignment tallies for classes they can see.
- `GET /api/assignments/[id]/progress`: the staff roster for one assignment: each currently enrolled learner's status, response count and latest response, plus learners who responded and later left the class, flagged as no longer in the class. Guardians and other-school or other-class staff are denied.
- New pages: Submissions and feedback (`/submissions`) and Learner progress (`/assignments/[id]/progress`), with navigation entries. The assignment page states that file attachments are not supported, labels learners by name, and no longer shows staff identifiers.
- No new write path. Attempts, feedback and window policy keep their existing rules (immutable attempts, reviewed feedback, append-only windows, exact retry, informational due date). No AI call was added.

## Evidence

All commands ran with Node 24 from the worktree. Heavy steps ran under the shared machine lock.

| Check | Command | Result |
| --- | --- | --- |
| Library contract (new) | `node tests/integration/curriculum-library-contract.mjs` | 140 passed, 0 failed |
| Submission progress contract (new) | `node tests/integration/submission-progress-contract.mjs` | 61 passed, 0 failed |
| Existing curriculum contract | `node tests/integration/curriculum-contract.mjs` | 131 passed (unchanged assertions) |
| Existing submissions and windows | `submissions-contract` 137, `submission-windows-contract` 191, `learner-recovery-ui-contract` 635, `development-recovery-contract` 253, `evidence-access-contract` 58, `reading-practice-ui-contract` 445, `demo-login-ui-contract` 249, `session-revocation-contract` 411 | all passed, 0 failed |
| Full guarded run | `node scripts/test.mjs static unit integration smoke --fast --guard` | 55 suites, 22,637 assertions (unit 119, integration 22,341, smoke 177), 0 failed; static layer passed (type check included); regression guard passed for 53 baselined suites. Two new suites are not in `tests/regression-baseline.json` yet (the baseline file is not edited here); add them with `--update-baseline` at integration. |
| Whole-repo type check | `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` | exit 0 |
| Build | `node scripts/run-framework.mjs build` | exit 0 |
| Mounted procedure (new) | `tests/worker-curriculum-submissions-demo-check.mjs` over `tests/support/write-curriculum-submissions-fixture.mjs`, built Worker, local D1, port 8808 | 23 passed, 0 failed, run twice in a row; 0 external requests (all non-local requests are aborted and counted), 0 page errors, 0 unexpected console errors |
| Specification, requirements, documentation checks | `node scripts/check-specification.mjs`, `node scripts/audit-requirements.mjs --check`, `python3 scripts/check-documentation.py` | all passed (42 tables, 345 fields; 371 designed cases, none run or accepted by these scripts) |
| Catalogue | `node scripts/test.mjs --check-catalogue` | passed (the mounted procedure is classified) |

What the mounted procedure covers, in the order it runs: create two reference drafts; search, area-of-study filter, no-match message and clear; reviewer approves the exact saved version (rights shown as declared, not verified); copy to a worksheet draft and see the Curriculum source panel; approve and assign the copy to a class, then see the usage list on the reference; retire the reference (peer sees 0 references and a 404, the copy keeps its source panel with a retired note); reinstate it (history shows the reason, peer sees it again and sees only their own copies); learner sees To do, submits text (attachments stated as unsupported); exact retry returns the original attempt, a changed retry is 409, a stale attempt number is 409, and nothing duplicates; Waiting for feedback; a peer learner, a guardian, an other-class teacher and another school's teacher cannot read the response, the roster or the overview; teacher saves reviewed feedback; learner sees it and the status Feedback received; learner resubmits (attempt 2, earlier attempt and feedback kept); staff roster shows each learner and filters to learners with no response; separate feedback revision on attempt 2; close the window (peer sees Closed without a response and the API answers 409 submission-window-closed, a committed attempt can still be replayed); reopen it and the peer submits; guardian denial on every submission and progress endpoint; 375 pixel width on eight pages with no horizontal overflow and every form control named; no external request and no page error.

Mutation checks (each change was applied, the named suite was run, and the file was restored):

- Library and progress contracts, 17 of 17 detected: snapshot ignores retirement; copy ignores retirement; usage shows other teachers' copies; peers can open retired references; retired reference not hidden from peer lists; revise allowed while retired; retry accepts a changed reason; text search ignores the body; subject filter matches partial words; resource source open to other teachers; tallies count withdrawn learners; roster scope removed; student sees others' attempts; status ignores feedback; guardian allowed; window summary ignores an elapsed closing time; status compare-and-set removed. The last one first survived because the unique index also rejected the stale write. A check that claims a revision the reference has not reached was added and the mutation is now detected.
- Browser procedure, 1 of 1 detected: with the retired notice on the resource source panel removed and the Worker rebuilt, the journey failed at the retire step after 6 checks passed; the source was restored and rebuilt, and the next run passed.

Existing mounted checks run on an earlier build of this branch (before the final one-line type annotation fix, default assessment fixture), to see whether the changed pages broke anything: `worker-specification-ui-check` 38 passed, `worker-resources-ui-check` 14 passed, `worker-family-ui-check` 36 passed, `worker-learner-recovery-ui-check` 30 passed, all with 0 failed. `worker-development-ui-check` stopped at one failure after 32 passed, in the procedure "Assessment conflict keeps intended edits and requires current-state comparison" (an assessment editor check outside this change). The same check, run against the shared checkout's existing build from before this branch (checkout HEAD `cadd2ebd8df0d1a0d24b609a59a756c725d9012c`, build dated 6 October 06:57 UTC), failed in the same procedure with 32 passed, so it is not caused by this branch. It is reported, not fixed here.


## Designed cases

| Designed case | Status | Evidence |
| --- | --- | --- |
| TC-068 | executable checks passed | curriculum-contract 131, evidence-access-contract 58, curriculum-library-contract 140; mounted journey shows version, source and declared rights on the copy. |
| TC-069 | partly executed | Withdrawn source: retire blocks revise, approve and copy, hides the reference from peers, and the resource page shows the retired note (library contract 140, mounted journey). Unsupported alignment is an FR-23 matter that is not implemented here: not run. |
| TC-072 | not run, disabled by design | Paid AI stays disabled and no AI call was added. |
| TC-078 | executable checks passed | submissions-contract 137, evidence-access-contract 58, mounted journey (submit, reviewed feedback, learner sees it). |
| TC-079 | partly executed | Exact retry and changed retry (submissions-contract and mounted journey) and correction by resubmission (mounted journey) ran. The late policy is not defined by the specification, so only the informational due-date note and the window cutoff exist; there is nothing further to run. |
| TC-126 to TC-132 | executable checks passed | submission-windows-contract 191, submissions-contract 137, development-recovery-contract 253; mounted journey closes and reopens a window. The mounted API check `worker-development-check` was not run in this workstream. |
| TC-133 | not run | Manual usability case; not performed. |
| TC-230 to TC-237, TC-240, TC-242 | executable checks passed | learner-recovery-ui-contract 635 (callback suite with substituted hooks); worker-learner-recovery-ui-check 30 passed on the earlier build of this branch. |
| TC-243, TC-244 | not run | Manual cases; the mounted recovery check passing is supporting evidence only. |
| TC-245 | not run | Planned performance case. |
| TC-259 | executable checks passed | session-revocation-contract 411. |
| TC-314 to TC-320, TC-322 to TC-328 | executable checks passed | reading-practice-ui-contract 445 and demo-login-ui-contract 249 exercise the copy route and the curriculum source shape this branch extended. |
| TC-321, TC-329 | not run | Manual cases; not performed. |

"Executable checks passed" means the linked automated suites passed on this branch. No case is accepted, no approval flag was set, and the specification files `TEST-CASES.*` and `TRACEABILITY.*` are unchanged. Cases not listed here were not touched.

## Limits and open decisions

- The mounted journey is one local Chromium on fictional data. It is evidence that the screens work, not user acceptance.
- File upload is out of scope: responses are plain text and the page says so.
- Due dates are compared in UTC for the informational "after the due date" note. There is no late penalty, grade or lateness policy because the specification defines none. Closing time (the window) is what stops new responses.
- Guardian visibility of submissions is not defined by the specification and stays denied.
- Curriculum and pilot rights remain an open business decision. The library shows what the author declared and says it is not verified.
- Retirement is a school-level availability flag, not a legal take-down process.
- The prose counts in `docs/specification/DATA-DICTIONARY.md` (tables and columns) were not changed here to avoid conflicts between parallel branches. The table now has one more table and seven more columns, and the counts need updating when the branches are integrated.
- 23 suites have no designed-case link, the manual and UAT cases were not performed, and the 371 designed cases remain unrun as a set.
- The hosting failure is untouched and unresolved.
