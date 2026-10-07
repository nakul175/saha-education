# Language pass 2: student wording and plain words on the merged pages (7 October 2026)

Branch `demo/language-pass`, workstream A10b of the overnight demo run, started from `main` at `8132db9`. It finishes the follow-up that [DEMO-experience.md](DEMO-experience.md) left open: pages merged after the first language pass still said "learner", "snapshot", "immutable", "staged", "UUID" and "issuer" to teachers, families and students. The numbers behind this record are in [DEMO-language-pass-EXECUTION.json](DEMO-language-pass-EXECUTION.json).

This is a wording change only. No API field name, route path, stored value or rule changed. Nothing here is a language-reviewer judgement; the check is a wording-pattern scan and a reading-grade measure.

## What was wrong

1. **172 wording hits** across 25 pages in `app/` (counted by `SAHA_LANGUAGE_REPORT=1 node tests/integration/language-suitability-contract.mjs`). Most were "learner" where the product says "student". The rest were "snapshot" (2), "immutable" (2), "staged" and "staging" (3), "UUID" (3), "enrollment" (1) and "issuer" wording in sentences that did not need it (3).
2. **Hits the scan could not see.** The sentence scanner skips single words, so it missed "learner" in a plural switch (`'learner' : 'learners'`), in a label (`Learner:`), in role-name maps (`student: 'Learner'` on the account page and the administrator accounts list) and in seat-count sentences built from templates (`${n} active learners, no capacity limit`). About 10 such places were found by reading every string, not by the old scan.
3. **A raw status shown as a word.** The reading import page printed the stored status, so a teacher saw "Saved import preview · staged".
4. **Visible wording outside `app/` and `components/`.** Server messages and labels that pages show also said "learner": the enrolment error messages, two report messages, the audit trail "Learner feedback" source name, "and the learner" in an audit line, the notice audience label ("guardians and learners"), the account directory ("Learner, grade 8"), the enrolment history fallback name and the demo student account name ("Demo learner").
5. **A silent-pass risk in the checks.** `assessment-detail-ui-contract` asserts that "No active learners" is absent after a failed read. After rewording that assertion would pass for the wrong reason, so it was changed with the text, not left behind.

## What changed

- **Student.** "learner(s)" became "student(s)" in every sentence, heading, label, `aria-label`, table caption, message and role name in the 21 pages that had hits, plus the single-word cases in point 2 and the server wording in point 4. Identifiers, route paths (`/attendance/learners/...`), `data-` hooks, element ids and API values such as the notice audience value `learners` are unchanged.
- **Plain words.**

  | Was | Now |
  | --- | --- |
  | Loaded snapshot: | Records loaded at: |
  | This is the immutable original save receipt. It does not assert that these marks remain current. | This is the receipt of the original save and it cannot be changed. It does not say that these marks are still current. |
  | Immutable before-and-after evidence for (date). | Before-and-after record of each save for (date); saved records cannot be changed. |
  | They are a snapshot and do not change. (report card) | They are a fixed copy and do not change. |
  | its saved expectations and UUID have not changed / The exact original request and UUID are retained / its original expectations or UUID | The original request is still pending and has not changed / Your original request is kept exactly as it was / the original request |
  | Preview staged. / Stage local normalized JSON ... Staging creates a private preview. / staged (date) | Preview saved. / Add a local results file for educator review. Adding it creates a private preview. / added (date) |
  | Saved import preview · staged (heading and decision line) | Saved import preview · waiting for review (a small label map; `confirmed` and `rejected` are unchanged) |
  | Could not load class IDs. | Could not load the class list. |
  | I reviewed the original normalized values, learner IDs ... | I reviewed the original values, student IDs ... |
  | Active enrollment currently confirmed. | Active enrolment currently confirmed. |
  | already uses that exact issuer and subject / accepts only the synthetic demo issuer | already uses that sign-in identity / accepts only the synthetic demo sign-in provider |

- **Server wording that pages show** (`lib/education`): enrolment error messages, report messages, audit source and line, notice audience label (now "guardians and students"; the label for the students-only audience now reads "students" instead of printing the stored value), account directory text, enrolment history fallback name and the demo account name.
- **Kept on purpose, as reasoned entries.** Administrator-only and school-IT screens where the exact value is the data: the identity issuer and subject fields on `/admin/users` (8), the Profile, Linked account and Decision labels on `/admin/profile-links` (3), the stored Course and Teacher labels on the class page (2), the Observation label (1), the import file format on the reading import page (JSON, envelope, field names, format identifier, student IDs: 21) and the HTTPS rule for source links (5). 40 hits remain in 12 entries.

## The ratchet

`tests/integration/language-suitability-contract.mjs`:

- `KNOWN` now holds only the 12 entries above, each with its exact cap and reason. The `FOLLOW_UP` and `LOWERED` tables are removed because every entry in them was either fixed or moved into `KNOWN` at its real count. Caps equal the real counts; the suite still fails if a cap is higher or lower than the real count.
- New `CLEARED` list: 29 page and rule pairs this pass emptied (including two other workstreams had already emptied). Each is asserted at zero and must have no `KNOWN` entry. It also keeps the suite's assertion count at 133, above the 127 in `tests/regression-baseline.json`; the baseline file was not edited.
- New whole-text scan (`wordLiterals` in `tests/support/ui-strings.mjs`, with a self-test on a sample source): every JSX text, string and template piece in `app/` and `components/` must not say "learner", except route paths. This closes the single-word gap in point 2.
- Reading grade (Flesch-Kincaid, rough guide): guide 3.61, family pages 5.88, all 6.11 (before 3.61, 5.88, 6.13).

| | Before | After |
| --- | --- | --- |
| Pattern hits | 172 | 40 |
| Known entries | 39 | 12 |
| Contract assertions | 127 | 133 |

## Checks that pinned the old wording

Each change follows the reworded text and is exactly as strict as before (same locator, same `exact`, same count, same negation).

1. **Exact text assertions in mounted browser procedures** (`getByText`, `getByRole` name, `getByLabel`, `toContainText`): "learner(s)" to "student(s)" in `worker-attendance-ui-check`, `worker-assessment-review-ui-check`, `worker-courses-enrolment-demo-check`, `worker-curriculum-submissions-demo-check`, `worker-attendance-demo-check`, `worker-attendance-summary-ui-check`, `worker-reading-review-demo-check`, `worker-assessment-lifecycle-ui-check`, `worker-reading-practice-ui-check` and `worker-identity-demo-check`.
2. **Negative assertions** in `assessment-detail-ui-contract` ("No active learners" must be absent): same text, new word, so they still bite.
3. **Role label and demo name** in `identity-ui-contract`, `demo-session-lifecycle-contract`, `notices-contract` and `worker-identity-demo-check` ("Learner" to "Student", "Demo learner" to "Demo student", "guardians and learners" to "guardians and students"). The demo run of the identity procedure also had a label that was already stale (`Explore as learner`, while the sign-in page said "student"); it now matches.
4. **Technical wording replaced** in `worker-specification-ui-check` ("exact original request and UUID are retained"), `identity-ui-contract` and `worker-identity-demo-check` (issuer sentences), `worker-reading-review-demo-check` and `worker-development-ui-check` (import heading "· staged" to "· waiting for review"; the review checkbox pattern `/I reviewed the original normalized values/` to `/I reviewed the original values/`).
5. **A locator that became ambiguous.** `getByLabel('Student', { exact: false })` in `worker-specification-ui-check` and `worker-reading-review-demo-check` also matched the new region name "Reading overview by student". It was found by a failed run, not by reading, and now targets the control directly: `getByRole('combobox', { name: /^Student/ })`. The option text and selected value asserted are unchanged.

## Evidence

Node 24.19.0, 2 CPUs, every heavy step through the shared lock. All data synthetic; every mounted run recorded 0 external requests and 0 page errors where the procedure reports them.

| Step | Result |
| --- | --- |
| `node tests/integration/language-suitability-contract.mjs` | 133 passed, 0 failed; 40 hits, 12 known entries |
| All 63 integration and 10 unit suites, run one by one before the final fix-up | the only failures were the three that pinned changed wording (assessment-detail-ui, identity-ui, language contract); fixed, all pass |
| `tsc --noEmit` (whole repo) | exit 0 |
| `eslint` on the 48 changed files | no output, exit 0 |
| `node scripts/run-framework.mjs build` | complete |
| Full guarded run `static unit integration smoke --fast --guard` | static 3 suites passed; unit 10 suites, 162 assertions; integration 63 suites, 25,932 assertions; smoke 1 suite, 177 assertions; the guard first failed on the contract's assertion count (75 against 127); after the `CLEARED` list the final run passed: 74 suites, 26,329 assertions (unit 162, integration 25,990, smoke 177), 0 failed, regression guard passed |

Mounted procedures (built Worker on port 8810, Chromium, isolated D1 per run):

| Procedure | Fixture writer | Result |
| --- | --- | --- |
| worker-assessment-lifecycle-ui-check | lifecycle | 33 passed, 0 failed |
| worker-attendance-demo-check | attendance | 25 passed, 0 failed |
| worker-courses-enrolment-demo-check | courses-enrolment | 26 passed, 0 failed |
| worker-curriculum-submissions-demo-check | curriculum-submissions | 23 passed, 0 failed |
| worker-notices-audit-demo-check | notices-audit | 23 passed, 0 failed |
| worker-profile-assessment-ui-check | worker | 36 passed, 0 failed |
| worker-family-ui-check | worker | 36 passed, 0 failed |
| worker-development-ui-check | worker | 60 passed, 0 failed |
| worker-reading-review-demo-check, destination not configured | reading | 18 passed, 0 failed |
| worker-reading-review-demo-check, destination set to the loopback fake | reading | 33 passed, 0 failed |
| worker-specification-ui-check, then worker-reading-practice-ui-check on the same Worker | worker | 38 and 32 passed, 0 failed |
| worker-identity-demo-check, school sign-in mode | worker | 16 passed, 0 failed |
| worker-identity-demo-check, demo mode (demo variables set) | pristine | 14 passed, 0 failed |
| worker-assessment-review-ui-check | assessment | 43 passed, 0 failed |
| worker-attendance-ui-check | attendance | 31 passed, 0 failed |
| worker-attendance-summary-ui-check | attendance | 23 passed, 0 failed |
| worker-learner-recovery-ui-check (regression run) | worker | 30 passed, 0 failed |
| worker-domain-ui-check (regression run) | worker | 39 passed, 0 failed |
| worker-dashboard-ui-check (regression run) | dashboard | 31 passed, 0 failed |
| worker-resources-ui-check (regression run) | worker | 14 passed, 0 failed |
| worker-school-records-demo-check (regression run) | records | 16 passed, 0 failed |
| worker-demo-experience-check (demo variables set) | demo | 1,127 checks, 0 failed, 114 pages audited |

Mutations (each reverted afterwards): putting `'learner'` back into the one-word plural switch on the class attendance report failed the whole-text scan and named the file; putting "Learner progress" back into a page heading failed the ratchet ("new or additional forbidden wording"); the first run of the ratchet after the rewording failed on slack caps (`normalized` 2 against 1, `rawIdLabel` 6 against 5), which proves the caps cannot sit above the real count.

## Found on the way, not fixed here

- `worker-demo-ui-check` fails 1 of 26 at "administrator: synthetic banner and native role navigation are clear" (4 passed, 21 not run). Its expected administrator menu does not list `/admin/audit` and `/notices`, which the notices and audit workstream added to the menu in `components/app-shell.tsx`. This is not caused by the wording change; the expected list needs the two links. Not edited, because it is not a wording pin.
- `worker-reading-practice-ui-check` needs `worker-specification-ui-check` to have run first on the same Worker (it reads a reading that procedure creates). Run alone it fails at "Existing fictional fixture and source setup". This is how the procedure is written, not a new fault.
- `worker-profile-assessment-ui-check` and `worker-demo-ui-check` write their result files to `/private/tmp` regardless of `SAHA_TEST_OUTPUT_DIR`.

## Limits

- Wording only. No translation, tone or named-reviewer judgement; the grade is a rough guide.
- Strings built from data at run time (a name, a count) are seen only as far as their fixed pieces; the whole-text scan reads those pieces.
- Stored text already written in earlier synthetic runs (for example a notice saved with the old audience label) keeps the words it was saved with.
- The 40 remaining hits are administrator and school-IT screens kept for exact values, not an acceptance of that wording for family or student pages. Most of the 40 are on staff-only pages; the class page still prints the stored Course and Teacher labels, a known finding that needs the page to load their names.
