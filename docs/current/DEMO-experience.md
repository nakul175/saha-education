# Demo experience, language and mobile baseline (6 October 2026)

Branch `demo/experience`, workstream A10 of the overnight demo run. It covers the demo a first-time visitor sees, a plain-language review of the interface wording (NFR-06) and a mobile and accessibility baseline (NFR-05). Everything uses invented data. The real identity provider, reading-app (ORF) data, paid AI and real recipients stay off. Nothing here is a business, educator or accessibility acceptance; see [the limits](#limits).

The user guide for running the demo is [DEMO.md](../DEMO.md). The numbers behind this record are in [DEMO-experience-EXECUTION.json](DEMO-experience-EXECUTION.json).

## Gaps found first

These were true on `main` (`cadd2eb`) before any change.

1. **No realistic school.** The only synthetic data was the small fixed set that demo mode creates. There was no school with a term of attendance, assessments, reports, reading checks, resources and notices, so most pages were empty on first view.
2. **No guided start.** Each role's home page said nothing about what that role could do or where to begin. The sign-in page listed four buttons with no explanation.
3. **No one-command demo and no demo guide.** Running the demo needed a build, a database seeded by hand and several environment settings spread over scripts.
4. **Developer wording in the interface.** Measured with the rules in the new language contract, `app/` and `components/` had 91 uses of words such as UUID, JSON, snapshot, immutable, token, issuer, raw ID labels, "learner" (the product says student elsewhere) and the US spelling "enrollment", across 35 file-and-rule groups.
5. **Five routes without the shared frame.** `/guardians`, `/enrolments`, `/notifications`, `/report-cards` (list and detail) and `/classes` had no navigation, no skip link and no main landmark. In the first mounted run 32 of 114 audits failed this.
6. **Nested interactive controls.** The student list put a button inside every link: 40 on the staff view, 2 on the guardian view.
7. **Two level-one headings** on 48 of the 114 audits: the shell's title and the page's title.
8. **A skipped heading level** on `/enrolments`.
9. **The interface is English only.** `lib/education/i18n.ts` and its unit test exist, but no page imports it.
10. **Raw stored ids shown to people.** Class pages print Course ID and Teacher ID; the report card prints Student ID; the assignment page printed `Learner <id>` when a name was missing (fixed).

## What was built

| Item | Where |
| --- | --- |
| Deterministic, fictional, re-runnable school: 1 administrator, 4 teachers, 3 courses, 6 classes, 40 students, 37 guardian profiles, 120 enrolments (1 withdrawn), 2,596 attendance records over 36 school days, 19 assessments with 357 results, 40 report cards (20 shared through the real publication receipt, so the database trigger creates the family notices), 256 reading checks in English and Hindi, 5 resources with 6 versions, 5 assignments, 3 curriculum references, 1 submission with feedback, notices | `scripts/seed-demo.mjs` |
| One-command local demo (`pnpm demo`): builds if needed, creates the local database, starts the Worker, prints the address | `scripts/demo.mjs`, `package.json` |
| Role guide on every home page: what the role can do, plus (demo mode only) a labelled five-minute path | `components/role-guide.tsx`, `app/dashboard/*/page.tsx` |
| Sign-in page explains each role in a sentence; "Learner" is "Student"; the notice says real student details must not be entered | `app/login/page.tsx` |
| Shared frame for the five routes above; one h1 per page; no button nested in a link | layouts, `app/classes/page.tsx`, `app/students/page.tsx`, `components/app-shell.tsx`, `app/enrolments/page.tsx` |
| Wording fixes in strings no test asserts | listed in [language findings](#language-findings) |
| Language contract with a ratcheting known list and a reading-grade bound | `tests/integration/language-suitability-contract.mjs`, `tests/support/ui-strings.mjs` |
| Seed contract | `tests/integration/demo-seed-contract.mjs` |
| Mounted procedure: real first-visit flow, guided paths, seeded content, 375px and 1280px baseline | `tests/worker-demo-experience-check.mjs`, `tests/support/write-demo-fixture.mjs` (registered in the manual list of `scripts/test-catalogue.mjs`) |

No migration was added. The seed only inserts rows into existing tables. The shell now shows `Signed in as <role>` and the account id on a second line, because `demo-login-ui-contract` asserts that the account id is shown. Hiding it is a decision for the owner of that contract.

## Evidence

All commands ran on this branch with Node 24.19.0, synthetic data only, an isolated local Worker on 127.0.0.1:8810 and local D1.

| Check | Result |
| --- | --- |
| `node scripts/test.mjs static unit integration smoke --fast --guard` after a fresh build | 55 suites, 22,590 assertions (119 unit, 22,294 integration, 177 smoke), 0 failed, regression guard passed with 53 baselined suites. The two new suites are not in the baseline yet (a note, not a failure); the baseline file was not touched |
| `tests/integration/demo-seed-contract.mjs` | 67 checks |
| `tests/integration/language-suitability-contract.mjs` | 95 checks over 1,841 strings; 67 known remaining hits in 23 file-and-rule groups, each with a reason |
| Whole-repo `tsc --noEmit` | exit 0 |
| `python3 scripts/check-documentation.py` | passed |
| `node scripts/test.mjs --check-catalogue` | passed |
| Scoped eslint on every new or edited source file | 0 errors, 0 warnings |
| Mounted `tests/worker-demo-experience-check.mjs` (Chromium), run before the fixes | 1,117 checks, 39 failed (32 audits with no main landmark, 6 audits of the student list with nested controls, 1 wrong guardian sibling name in the seed) |
| Same procedure after the fixes | 1,127 checks (1,117 on the real pages and flows plus 10 canary checks), 0 failed; 114 page audits, 0 axe violations at any impact level, 0 pages with more than one h1, 0 skipped heading levels, 0 external requests, 0 page errors, 0 server errors. The 1,117-check version of the procedure also passed on the same build before the canary was added |
| `node scripts/demo.mjs` end to end (first run, then a second launch that reuses the database) | started in 5 s after the build existed; login page 200; each of the four roles signed in through `/api/demo` and its home page held the guide and the demo path; the second launch reported "Using the existing demo database" |

The mounted procedure audits 31 distinct routes: 22 for the administrator, 18 for the teacher, 9 for the guardian and 8 for the student (57 role and route pairs), each at 375px and 1280px, so 114 page audits. Each audit checks: the page is served and not redirected, no horizontal scroll, every form control has a name, every button and link has a name, exactly one main landmark, no button inside a link, a page language, and axe-core (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`) serious or critical violations. It also checks the first Tab stop is the skip link and the next control shows a focus indicator on each role's home page at both widths, and reports one h1 and skipped heading levels. A canary page with deliberate defects is measured first with the same function, so a clean result on the real pages cannot come from a measurement that sees nothing. The procedure asserts 0 requests outside 127.0.0.1, 0 page errors and 0 server errors.

### Mutation checks

| Check | Mutant | Result |
| --- | --- | --- |
| Language contract | add "JSON payload" to a login description | first survived because the extractor did not read strings inside arrays; extractor fixed, then killed |
| Language contract | a known-list cap one above the real count | killed (the list must be tight) |
| Seed contract | change a guardian email domain to a real one | killed |
| Seed contract | link the demo guardian to a different profile | killed |
| Seed contract | stamp rows with the current time | killed (determinism) |
| Mounted procedure | the real defects in the first run (no main, nested button, double h1) | detected, 39 failures in the first run; all fixed |

## Language findings

Method: a TypeScript parse of `app/` and `components/` (not `components/ui` or `app/api`) extracts every string a person can read: page text, readable attributes, messages handed to state setters or errors, and sentence-like strings in arrays. It reads source only, so text built from data at run time is not seen. 1,841 strings were found (1,780 on `main` under the same extractor). Words flagged: UUID, JSON, payload, idempotent, CAS, snapshot, immutable, normalized, envelope, issuer or identity subject, token, staged, null/undefined/NaN, HTTP/API/SQL/D1/OIDC/CSRF, code identifiers, dotted format ids, raw ID labels, "learner" and "enrollment".

**Fixed** (strings no existing test asserts): "snapshot", "immutable" and "UUID" wording on the assessment, attendance, class and assignment pages ("Loaded snapshot" is now "Page loaded at"); "tokens" is now "access codes" on two admin pages; "learner" is now "student" in six sentences; "enrollments" is now "enrolments"; the assignment page no longer prints `Learner <id>`; resource and curriculum pages say "adds a new revision; earlier ones are kept". The sign-in page, the guide and the shell use "student" throughout.

**Kept, with a reason in the contract** (67 hits in 23 groups):

- Pinned by an existing contract or mounted test: "No active learners are available", "Multiple saved results exist for a learner", the attendance summary sentences, "exact original request and UUID are retained", the curriculum "HTTPS source URL" label, "Observation ID", feedback and window "revision" labels. Changing them is a decision for the owner of those tests.
- Administrator-only identity fields: issuer, subject, Profile ID, Linked account ID, Decision ID. They are the exact data being entered and quoted.
- The reading-import page (JSON file format, field names, ID labels, "staged"): it is a file format for school IT staff. The wording around it can still be simplified by the reading workstream.
- Raw stored ids shown to people: Course ID and Teacher ID on the class page, Student ID on the report card, Staff ID in the submission window. These are product defects, not just wording; each needs the name loaded.

**Softer signals** the contract does not fail on, for the owners to review: "stored" (33 strings), "retained" (33), "verified" (35), "receipt" (21), "evidence" (14) and "rows" (17) appear mostly on staff pages for assessments, attendance and reading. The longest sentences run 36 to 44 words (assignment recovery, school update comparison, profile-link conflict). Of 23 literal server error messages (`error: '...'` forms only), 3 name a next step; the rest say what went wrong but not what to do, and one ("Invalid request body") is developer wording. The reading-grade measure is per string and rough: all strings of four or more words average Flesch-Kincaid grade 7.1; family-facing pages 6.2 (7.6 on `main`); the guide strings measure lower because they are short labels. The contract bounds family-facing text at grade 8 and all text at grade 9. This is not a review of tone, respect or translation.

## Per-case results for NFR-05 and NFR-06

48 designed cases reference NFR-05 or NFR-06. This workstream executed **none** of them as written. Every UAT and accessibility case needs a named human reviewer, and the other regression cases belong to other workstreams. "automated-baseline-partial" means the layout and axe measurements in this record cover the pages the case names, and nothing else. No case is marked accepted.

Totals: 23 automated-baseline-partial, 24 not-executed, 1 not-executable-locally (TC-284 needs the hosted demo, which is blocked).

| Case | Layer | Requirement | Result here | Evidence from this branch | Still needed |
| --- | --- | --- | --- | --- | --- |
| TC-042 | regression | NFR-05 | not-executed | not executed here: behaviour is owned by another workstream (template switch and failed save in the resource editor) | Run the case against the merged resource editor. |
| TC-048 | regression | NFR-05 | not-executed | not executed here: behaviour is owned by another workstream (conflict handling) | Run the case against the merged editors. |
| TC-056 | uat | NFR-05 | not-executed | The print view /resources/[id]/print was not in the audited route list | blocked: needs named human reviewer; manual print layout |
| TC-067 | uat | NFR-06 | not-executed | No trend display was exercised | blocked: needs named human reviewer |
| TC-070 | uat | NFR-06 | not-executed | Observation only: the interface text is English only and lib/education/i18n.ts is not used by any page; the seed holds one Hindi worksheet and Hindi reading checks. No locale completeness claim is made | blocked: needs named human reviewer; locale coverage must be recorded per language |
| TC-071 | uat | NFR-06 | not-executed | Not applicable to a wording or layout check | blocked: needs named human reviewer |
| TC-077 | uat | NFR-06 | not-executed | AI planning is switched off in the demo | blocked: needs named human reviewer |
| TC-088 | accessibility | NFR-05 | automated-baseline-partial | On each role dashboard at both widths the first Tab stop is the skip link and the next control shows a focus indicator (8 checks). Every audited control has a name and nothing nests a button in a link (57 role and route pairs at 375 and 1280). Validation and conflict announcements were not exercised | blocked: needs named human reviewer; the case says an automated scan alone cannot pass it |
| TC-089 | accessibility | NFR-05 | automated-baseline-partial | One h1 and one main landmark on every audited page, zero axe serious or critical findings. No screen reader, zoom or print output was tried | blocked: needs named human reviewer |
| TC-090 | regression | NFR-05 | automated-baseline-partial | No horizontal scroll at 375px on any audited page (reading pages only). Editing, failure and retry were not exercised | Run the editing and retry steps; blocked: needs named human reviewer |
| TC-098 | uat | NFR-05 | automated-baseline-partial | Student and guardian paths open and are clean at both widths. The cross-class and draft denial steps were not run here | blocked: needs named human reviewer |
| TC-099 | uat | NFR-06 | not-executed | Reading checks are seeded but no interpretation was reviewed | blocked: needs named human reviewer |
| TC-109 | uat | NFR-05 | automated-baseline-partial | /admin/profile-links audited at 375 and 1280 (admin): no overflow, named controls, zero axe findings. The page still prints Profile ID, Linked account ID and Decision ID (language contract known list, reason recorded) | blocked: needs named human reviewer; keyboard, screen reader and uncertain-save steps not run |
| TC-125 | uat | NFR-05, NFR-06 | automated-baseline-partial | /reading-imports audited (teacher) at both widths. The page still shows JSON and ID wording for IT staff (known list, reason recorded) | blocked: needs named human reviewer; preview, review and recovery steps not run |
| TC-133 | uat | NFR-05 | automated-baseline-partial | The assignment page with the submission window controls was audited (teacher) at both widths | blocked: needs named human reviewer; time zone, 409 and uncertain-save steps not run |
| TC-141 | uat | NFR-05 | automated-baseline-partial | /schools, /courses, /classes, /enrolments (admin) and /classes (teacher) audited; /classes and /enrolments gained the shared navigation and main landmark in this branch | blocked: needs named human reviewer; role mutation controls were not exercised |
| TC-149 | uat | NFR-05 | automated-baseline-partial | /report-cards list and detail audited for admin and guardian; draft hidden from the guardian is asserted on the dashboard | blocked: needs named human reviewer; draft creation and lost-response recovery not run |
| TC-156 | regression | NFR-05 | not-executed | not executed here: behaviour is owned by another workstream (uncertain read acknowledgement) | Run against the merged inbox. |
| TC-157 | uat | NFR-05, NFR-06 | automated-baseline-partial | /notifications audited for all four roles at both widths; the page now sits in the shared shell with a main landmark | blocked: needs named human reviewer; wording and retention policy review |
| TC-165 | security | NFR-05 | not-executed | Not a wording or layout check | Run the case against the merged dashboards. |
| TC-180 | accessibility | NFR-05, NFR-06 | automated-baseline-partial | Four role dashboards at 375 and 1280: one h1, one main, no overflow, zero axe findings, no nested button inside a link anywhere in the audited set. Labels and focus order beyond the skip link were not reviewed | blocked: needs named human reviewer; locale review |
| TC-202 | integration | NFR-05 | not-executed | not executed here: behaviour is owned by another workstream (viewer selection cancellation) | Run against the merged attendance viewer. |
| TC-203 | accessibility | NFR-05 | automated-baseline-partial | /classes/[id]/attendance audited (admin and teacher) at both widths | blocked: needs named human reviewer; conflict, uncertain acknowledgement and date edit steps not run |
| TC-205 | uat | NFR-05, NFR-06 | not-executed | A meaning and governance review | blocked: needs named human reviewer |
| TC-208 | regression | NFR-05 | not-executed | not executed here: behaviour is owned by another workstream | Run against the merged assessment editor. |
| TC-209 | regression | NFR-05 | not-executed | not executed here: behaviour is owned by another workstream | Run against the merged assessment pages. |
| TC-211 | regression | NFR-05 | not-executed | not executed here: behaviour is owned by another workstream | Run against the merged assessment editor. |
| TC-213 | regression | NFR-05 | not-executed | not executed here: behaviour is owned by another workstream | Run against the merged assessment editor. |
| TC-216 | regression | NFR-05 | not-executed | not executed here: behaviour is owned by another workstream | Run against the merged assessment editor. |
| TC-224 | accessibility | NFR-05, NFR-06 | not-executed | not executed here: behaviour is owned by another workstream; page-level baseline only for /assessments/[id] | blocked: needs named human reviewer |
| TC-225 | regression | NFR-05 | not-executed | not executed here: behaviour is owned by another workstream | Run against the merged assessment editor. |
| TC-226 | accessibility | NFR-05, NFR-06 | automated-baseline-partial | /assessments and /assessments/[id] audited (admin, teacher, guardian, student) at both widths | blocked: needs named human reviewer; long text, history and assistive-technology review |
| TC-229 | uat | NFR-05, NFR-06 | not-executed | A meaning and governance review | blocked: needs named human reviewer |
| TC-243 | accessibility | NFR-05, NFR-06 | automated-baseline-partial | The assignment page was audited (teacher and student) at both widths. Save, lock, denied view and retry steps were not run | blocked: needs named human reviewer |
| TC-253 | accessibility | NFR-05, NFR-06 | automated-baseline-partial | /students, /guardians and /enrolments (admin) audited at both widths. /students no longer nests a button inside a link | blocked: needs named human reviewer; registry create and retry steps not run |
| TC-276 | accessibility | NFR-05, NFR-06 | automated-baseline-partial | Same pages as TC-253 | blocked: needs named human reviewer; review retry and receipt sequences not run |
| TC-284 | uat | NFR-05 | not-executable-locally | A hosted demo is needed and the private hosted deployment is blocked. Locally, each role signs in through the real first-visit flow and sees the fictional banner (mounted check) | blocked: needs named human reviewer; hosted outcome not available |
| TC-293 | uat | NFR-05, NFR-06 | not-executed | not executed here: behaviour is owned by another workstream (restored actor recovery) | blocked: needs named human reviewer |
| TC-305 | accessibility | NFR-05, NFR-06 | automated-baseline-partial | /notifications as guardian audited at 375 and 1280: no overflow, named controls, zero axe findings | blocked: needs named human reviewer; read-status recovery and screen reader matrix not run |
| TC-312 | integration | NFR-05 | not-executed | The guardian /attendance page was audited, but the staff and family link text was not asserted | Run against the merged attendance navigation. |
| TC-313 | uat | NFR-05, NFR-06 | automated-baseline-partial | Guardian /classes, /attendance and /notifications audited at both widths | blocked: needs named human reviewer |
| TC-317 | integration | NFR-06 | not-executed | not executed here: behaviour is owned by another workstream | blocked: needs named human reviewer |
| TC-321 | accessibility | NFR-05, NFR-06 | automated-baseline-partial | /reading-practice (teacher) audited at both widths | blocked: needs named human reviewer; focus, source rights and language steps not run |
| TC-329 | uat | NFR-05, NFR-06 | not-executed | An educator review of original-copy recovery | blocked: needs named human reviewer |
| TC-335 | accessibility | NFR-05, NFR-06 | automated-baseline-partial | /students and /students/[id] audited for admin and guardian at both widths. The guardian home lists only the two linked children. Profile privacy beyond that was not exercised | blocked: needs named human reviewer |
| TC-349 | uat | NFR-05, NFR-06 | automated-baseline-partial | Guardian /assessments, /report-cards and /report-cards/[id] audited at both widths | blocked: needs named human reviewer; the staff-editor handoff review not run |
| TC-360 | uat | NFR-05, NFR-06 | automated-baseline-partial | School and course pages audited (admin) at both widths; the planned 40 and 26 mounted procedures were not run here | blocked: needs named human reviewer |
| TC-371 | uat | NFR-05, NFR-06 | automated-baseline-partial | /courses audited (admin) at both widths; the course-catalog mounted procedures were not run here | blocked: needs named human reviewer |

## Limits

- The measurements come from one local Chromium, one operating system, fictional data and axe-core. They do not include a screen reader, keyboard-only journeys beyond the skip link and first control, zoom, forced colours, print, Hindi or any other language, real phones, or colour contrast beyond what axe reports.
- Reading grade and the forbidden-word list find only what they are written to find. They do not judge whether a message is respectful or useful.
- The language contract fails when new developer wording appears or when a known entry gets looser. Other agents' branches will add strings; if the merged tree fails it, either fix the wording or add a reasoned entry. A count that falls below its cap also fails so the list shrinks.
- The seed was loaded on a schema that also holds the pushed migrations `0018` (course, class and enrolment lifecycle) and `0025` (immutable evidence guards): 0 foreign key problems. It does not create lifecycle rows for courses, classes or enrolments; pages from the course workstream should treat missing rows as the legacy state.
- The demo guide's steps name pages that other workstreams are changing. The mounted procedure checks each step's link opens; if a step stops matching its screen, update `components/role-guide.tsx` and [DEMO.md](../DEMO.md).
- A hosted demo (TC-284) is not covered. The private hosted deployment failure is unchanged.
- The mounted procedure was run with seeded sessions, as the other procedures are. The home redirect and the real demo sign-in were exercised separately by the first-visit part of the same procedure at 375px.
