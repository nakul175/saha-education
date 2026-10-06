# Reading review and external ORF launch: demonstration record (6 October 2026)

Workstream A7 of the overnight demonstration run. Requirements: **FR-19** External ORF launch and **FR-21** Reading review and trends. **FR-20** Reviewed ORF records was already implemented and was exercised, not changed. Everything here uses synthetic data. The real ORF destination, sign-in and result-sync settings were not provided and nothing was connected to one; no real external site, provider or recipient was contacted, and no case is marked accepted. Executable checks are not business acceptance. All runs: Node 24.19.0, one locked hold per heavy step on a shared 2-CPU machine.

Machine-readable counts: [DEMO-reading-review-EXECUTION.json](DEMO-reading-review-EXECUTION.json).

## 1. Specification gap list (written before coding)

Compared against `docs/specification/FSD.md`, `LLD.md`, `API-CONTRACTS.md`, `TRACEABILITY.csv`, the designed cases that name FR-19 or FR-21, and the code on `origin/main` (cadd2eb).

| # | Requirement | Gap found | Status after this work |
|---|---|---|---|
| G1 | FR-19 | The launch route already failed closed, but no test proved what a trusted launch sends and does not send against a destination that actually receives requests. The existing contract only checked the returned URL. | Closed: loopback fake destination, 106-check handoff contract and a real browser navigation. |
| G2 | FR-19 | The External apps page said nothing plain about the "not connected" state, what opening the app does, or how reviewed results come back. | Closed: explicit not-connected and connected states, a "What opening the app does" panel and a "How reviewed results come back to Saha" panel with links. |
| G3 | FR-19 | Families and learners reached a bare refusal on the External apps page. | Closed: plain privacy explanation; the API still returns 403. |
| G4 | FR-21 | No chart or text-alternative trend view; trends were tables only, placed after the observation list. | Closed: accessible SVG charts with a table for every chart, placed before observations. |
| G5 | FR-21 | Nothing stated honestly how few, zero, uneven or same-day readings should read. | Closed: pure helper `lib/education/reading-trends.ts` (43 unit checks) and a statement on every series. |
| G6 | FR-21 | No per-learner overview of a class; staff had to select each learner. | Closed: "Reading overview by learner" table with counts, latest date, exact tasks and tasks with two or more readings; learners with no readings are listed as such. |
| G7 | FR-21 | Learner and staff identifiers were shown as raw IDs on Reading review, Reading imports and External apps. | Closed: names are resolved server-side (same school only, no contact details). Exact roster IDs remain on Reading imports, by design, because staff author source envelopes from them. |
| G8 | FR-21 / D-07 | Family and learner access to raw ORF data must stay restricted (specification decision D-07). Pages gave only a refusal sentence. | Closed: plain privacy explanation and a link to report cards; every reading API still returns 403 (checked in the mounted run). |
| G9 | FR-21 | Imported readings showed an internal consumption receipt only. | Closed: receipt line still present, plus who reviewed it, when, and a link to Reading review; the imported reading appears in the overview (mounted run). |
| G10 | FR-21 | The "Dates" basis was not stated. | Closed: the page states that dates are the calendar dates staff entered (UTC) and that no school-date policy has been set. |

Not closable here, and stated rather than hidden:

* **TC-060 (confirmed app availability and separate sign-in)** needs the real app URL, owner and a synthetic external account. Blocked.
* **TC-067, TC-071, TC-099 (educator review of comparability, language interpretation and ORF interpretation)** are user acceptance cases that need educators and an approved scoring/comparability policy. Not performed. The charts therefore make no norm, benchmark, ranking, average, diagnosis or language comparison claim.
* The school-date policy is not decided; the pages say so.

## 2. What changed

Server authority is unchanged: no write route, no schema and no authorization rule changed. No migration was added (the reserved number 0022 is unused; the names are looked up at read time).

* `lib/education/reading-trends.ts` (new, pure): describes a series (none, single, pair, short, series), date spacing (even, uneven), same-day readings, corrected-value counts, a latest-minus-earliest difference only for two different dates, and the chart geometry (path only for two or more readings, x scaled by real dates, rate axis from zero, accuracy axis fixed 0 to 100, non-colliding date labels).
* `components/reading-trend-chart.tsx` (new): inline SVG with `role="img"`, title and description, circle markers, a diamond for a reviewed correction (a shape cue, not colour alone), one measure per chart, no benchmark or norm line, figure caption.
* `lib/education/reading-review.ts` (additive): the review response gains `names: { students, staff }`, resolved for the principal's own school only (students by school, staff by school), in chunks of 40 ids per query because of the D1 bound-parameter limit. Staff who now belong to another school are not named. The field is additive; the API contract document should list it (see Limits).
* `app/reading-review/page.tsx`: overview table, per-series statements, two charts and a table per series, names instead of IDs, plain source line, muted "Observation ID" support reference, honesty note.
* `app/reading-review/layout.tsx`: family and learner privacy explanation (keeps the sentence "Reading review is available to school staff.").
* `app/external-apps/page.tsx`: not-connected and connected states, handoff and return-path panels, family explanation. The launch request body is still `{}` and the link keeps `target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"`.
* `app/reading-imports/page.tsx`: class and learner names, reviewer and time on the receipt, link to Reading review.
* `app/reading-practice/page.tsx`: only the empty fallback gained `names` so it still type-checks.
* Tests: `tests/unit/reading-trends-contract.mjs` (new), `tests/integration/external-reading-handoff-contract.mjs` (new), `tests/integration/reading-review-contract.mjs` (extended), `tests/support/fake-orf-destination.mjs` and `tests/support/write-reading-fixture.mjs` (new), `tests/worker-reading-review-demo-check.mjs` (new mounted procedure), `scripts/test-catalogue.mjs` (one manual entry for the new mounted test).

## 3. How the launch handoff is proved without a real site

`tests/support/fake-orf-destination.mjs` starts an HTTPS server on 127.0.0.1 with a throwaway self-signed certificate generated by `openssl` at run time, and records every request it receives. It also serves a results export that the reviewed return path consumes.

* What is sent: a fixed destination URL is returned and opened in a new tab. The destination sees one GET for its own path and nothing else.
* What is not sent: no cookie, no referer, no query string and no learner, class, school or session information. The launch with and without a `studentId` returns byte-for-byte the same body (the learner context changes nothing).
* Nothing changes in Saha: table row counts are identical before and after a launch.
* Fail-closed: a blank value and nine unsafe values (http, query, fragment, credentials, interior space, ftp, javascript:, scheme-relative and backslash) return 503 with no configuration detail, and the destination receives zero requests.
* Return path: the fake exports reviewed results; they enter Saha only through the existing staged, reviewed import (stage, explicit review, confirm creates one reading and one receipt, exact replay is 409, reject creates nothing). Forged writes from the destination return 401. After the whole path the destination has seen two requests, both initiated by a person.

## 4. Evidence (commands and actual results)

Node 24.19.0, synthetic data, local Worker and D1 only.

| Evidence | Command | Result |
|---|---|---|
| Trend helpers | `node tests/unit/reading-trends-contract.mjs` | 43 passed, 0 failed |
| Handoff and return path | `node tests/integration/external-reading-handoff-contract.mjs` | 106 passed, 0 failed |
| Reading review (existing plus 17 new) | `node tests/integration/reading-review-contract.mjs` | 194 passed, 0 failed |
| External apps (existing) | `node tests/integration/external-apps-contract.mjs` | 70 passed |
| Reading imports (existing) | `node tests/integration/reading-imports-contract.mjs` | 86 passed |
| Reading checks (existing) | `node tests/integration/reading-checks-contract.mjs` | 102 passed |
| Reading practice client (existing) | `node tests/integration/reading-practice-ui-contract.mjs` | 445 passed, 1063 handler requests, 0 external |
| Build | `node scripts/run-framework.mjs build` | exit 0 (fresh, inside the locked hold) |
| Mounted, destination not configured | `tests/worker-reading-review-demo-check.mjs` with `SAHA_ORF_PHASE=unconfigured` | 18 passed, 0 failed, 0 external requests, 0 page errors, 1 axe sample |
| Mounted, destination set to the loopback fake | same with `SAHA_ORF_PHASE=configured` | 33 passed, 0 failed, 0 external requests, 0 page errors, 3 axe samples |
| Whole-repository type check | `node node_modules/typescript/bin/tsc --noEmit` | exit 0, no output |
| Regression suites on one shared default worker fixture, in the documented order | `worker-specification-ui-check`, `worker-literacy-check`, `worker-reading-practice-ui-check`, `worker-development-ui-check`, `worker-accessibility-check` | spec-ui 38/0, literacy 23/0, reading-practice-ui 32/0, accessibility 100/0 (0 external requests, 0 page errors); development-ui 32 passed, 1 failed (pre-existing, section 6) |
| Full guarded run | `node scripts/test.mjs static unit integration smoke --fast --guard` | exit 0: 55 suites, 22594 assertions passed, 0 failed, 0 skipped; regression guard passed (53 baselined suites). The two new suites are not in the baseline yet |
| Documentation check | `python3 scripts/check-documentation.py` | passed (78 Markdown files, local links and baseline references) |

The mounted procedure records 0 external requests and 0 page errors in both phases; axe (WCAG 2 A/AA rules) found no violations on the samples taken (unconfigured: 1 page; configured: 3 pages). It reports one "incomplete" (needs manual review) item on each of the two Reading review samples; I did not identify it. This is an automated check, not a formal accessibility review.

### Mutation checks (important new checks were broken on purpose)

Each mutation was applied, the named suite run, and the file restored (working tree clean afterwards).

| Mutation | Result |
|---|---|
| M1 learner id appended to launch URL | caught (handoff contract) |
| M2 plain http accepted | caught |
| M3 query string accepted | NOT caught: equivalent mutant, the same value is already rejected by the `[?#\\\s]` test on the next line |
| M4 families may launch | caught |
| M5 link without `noreferrer` | caught |
| M6 launch request sends a learner | caught |
| U1 one reading draws a line | caught |
| U2 x positions by index rather than date | caught |
| U3 two readings called a trend | caught |
| U4 uneven spacing never reported | caught (after the test data was strengthened; the first version survived) |
| U5 accuracy axis not fixed to 100 | caught (after the test data was strengthened; the first version survived) |
| U6 change reported for same-date readings | caught |
| U7 corrected value not flagged | caught |
| U8 three readings called a series | caught |
| R1 staff names not limited to the school | caught (after adding a moved-staff test; the first version survived) |
| R2 students not limited to the school | NOT caught: equivalent for reachable states, because the ids come from observations the principal is already scoped to; the clause is retained as defence in depth |
| L1 scrolling table regions not positioned (page widens on a phone) | caught (mounted phone-width check, after the check was made strict; the first version of that check passed the mutant) |

## 5. Designed-case record

Status words: **pass** means the case's expected results were observed in the named automated evidence on synthetic data; it does not mean accepted. No case is marked accepted.

| Case | Result | Evidence and note |
|---|---|---|
| TC-057 Unconfigured/unsafe app fails closed | pass | External apps contract (70) and handoff contract (106): blank plus nine unsafe values give 503, no leak; mounted unconfigured phase shows the plain not-connected state. |
| TC-058 Trusted launch sends no learner/session context | pass | Handoff contract; mounted configured phase (one destination request, no cookie, referer, query or learner data; no education table change). |
| TC-059 Family and foreign student denial | pass | Handoff contract and external apps contract; mounted guardian and learner pages. |
| TC-060 Confirmed app availability and separate sign-in | blocked | No real app URL, owner or external account provided. Not performed. |
| TC-061 to TC-065 ORF counts, validation, retries, provenance, roster and family visibility | pass (re-run, not changed) | reading-checks (102) and reading-imports (86) contracts and worker-literacy-check on the default fixture (see section 6). |
| TC-066 Attributable corrections and preserved original | pass | Reading review contract (194); mounted correction shows the original, the effective value and a diamond marker. |
| TC-067 Comparable-task trends, non-diagnostic language | not performed | UAT with educators. Mechanically, series are exact-task only and no norm, ranking or average is drawn. |
| TC-071 Language-specific interpretation | not performed | UAT. Mechanically, languages and passages never pool (mounted check). |
| TC-082 Attributable corrections (reading part) | partly | Reading correction history is covered; the attendance and resource parts belong to other workstreams. |
| TC-099 Reviewed ORF interpretation UAT | not performed | Needs educator-approved passages and policy. |
| TC-124 Rejected draft never appears as a reading | pass | Reading imports contract and the handoff return path (reject creates nothing). |
| TC-285 Synthetic demonstration policy cannot authorize real activation | not executed | Outside this workstream. |
| TC-316 and TC-326 Effective reading and later correction | pass | Reading practice client contract (445) and the mounted reading-practice check (32 passed, 0 failed). |

## 6. Regressions

All runs are on the final committed tree except where stated. The five existing browser and served suites that touch these pages were run against one default worker fixture in order, because `worker-reading-practice-ui-check` needs the approved curriculum reference that `worker-specification-ui-check` creates (on a fresh fixture it stops at its first checkpoint).

* **Defect found in my own change by an existing check, then fixed.** `worker-specification-ui-check` failed ("Viewport has no horizontal page overflow") on Reading review at 390 px. Cause: the new overview table scrolls sideways inside its own region on a phone, but the region was not positioned, so the screen-reader-only text inside the table (absolutely positioned) escaped the scroller and widened the whole page. Fix: the two scrolling regions on that page are now `relative`. A probe of the page at 360, 375 and 390 px located the offender (an `sr-only` span at about 434 px) before the fix. The suite then passed (38/0) in two separate runs.
* **A hole in my own new check, found and closed.** My mounted phone-width check ignored overflow whose elements sat inside a scroll region, so it passed while the page was wider than the screen. It now asserts the page measurement itself. Mutation: with the `relative` removed and the app rebuilt, the configured mounted run fails at "Phone width: /reading-review has labelled controls and no page-level horizontal overflow" (20 passed, 1 failed); restored and rebuilt, 33 passed.
* **`worker-development-ui-check` fails one check, "Assessment conflict keeps intended edits and requires current-state comparison", on both origin/main and this branch.** The identical failure (32 passed, 1 failed) was recorded against an unmodified build of origin/main (an export of commit cadd2eb, built and run in the same locked hold) and against this branch in four separate runs. It is in the assessment result editor, outside this workstream, and was not changed. Reported as a defect in another area.
* **`worker-literacy-check` is intermittently unreliable in this environment.** Against the unmodified origin/main build it failed 2 of 23 ("Anonymous app launch denied" and "Family reading history denied student-user-a: fetch failed"); against this branch it failed 1 or 3 checks in two earlier runs (a 503 returned in 1 ms on a POST; one "fetch failed") and passed 23 of 23 in the last two. The Worker log of one failing run shows a single request that took 300,777 ms, which points to the machine stalling rather than application behaviour; no code path in these routes was changed. I did not identify the 503 further.
* `tests/regression-baseline.json` was not edited. The two new suites should be added with `--update-baseline` when the maintainers choose to.

## 7. Changed existing assertion (spec-correct behaviour change)

`tests/worker-specification-ui-check.mjs`, check "Withdrawn learner remains selectable in authorized reading history": the expected option name changed from `Student ID student-a (retained reading history)` to `student-a Synthetic (not currently enrolled; retained reading history)`. Reason: the page now shows learner names instead of raw identifiers (gap G7). The check still verifies that the withdrawn learner is selectable, that the option is labelled as not currently enrolled and that selecting it shows the retained observation. No other assertion was weakened or removed.

## 8. Limits and follow-ups

* The real ORF destination, sign-in and result sync are not configured; the fake destination is not the ORF app and nothing about the real app's behaviour was tested.
* Dates are shown as entered (UTC calendar dates); the school-date policy is undecided.
* The trend text is descriptive only. Educator policy on comparability, scoring, language and interpretation is not approved; TC-067, TC-071 and TC-099 remain open.
* The review response now carries an additive `names` field. `docs/specification/API-CONTRACTS.md` was not edited (outside this workstream's edit rights) and should list it.
* `scripts/test-catalogue.mjs` has one new manual entry for the mounted test; other workstreams edit the same list, so a mechanical merge conflict is expected.
* The two axe "incomplete" items on Reading review were not investigated.
* Migration 0022 was reserved but not needed.
