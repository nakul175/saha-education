# Overnight demo integration record (6 to 7 October 2026)

Evidence only. Nothing here accepts a requirement, approves a policy or marks a designed case as passed by a business owner. The 371 designed cases in the v2.12 pack are still unrun against a named acceptance process; the per-area records below list what each executable check did and did not show.

## What was done

Ten parallel workstreams each took a group of the 19 partially built requirements, closed the gaps between the specification and the code, added tests and a mounted browser procedure, and opened a pull request. Every pull request was merged into `main` by the orchestrator only after a fresh build, the full guarded run, the documentation checks, `tsc`, ESLint and the browser procedures of that workstream plus the ones its changes could affect had been re-run on the merged tree. Two follow-up pull requests came from integration (#21 a corrected assertion of mine, #22 the wording pass).

| PR | Workstream | Record |
| --- | --- | --- |
| #12 | Identity, sessions, account administration | [DEMO-identity](DEMO-identity.md) |
| #14 | School setup, student and guardian records | [DEMO-school-records](DEMO-school-records.md) |
| #15 | Courses, classes and enrolment lifecycle | [DEMO-courses-enrolment](DEMO-courses-enrolment.md) |
| #13 | Attendance workflow, calendar, reports | [DEMO-attendance](DEMO-attendance.md) |
| #11 | Assessment lifecycle, report cards | [DEMO-assessments-reports](DEMO-assessments-reports.md) |
| #16 | Reading review, external reading hand-off | [DEMO-reading-review](DEMO-reading-review.md) |
| #18 | Curriculum library, submission progress | [DEMO-curriculum-submissions](DEMO-curriculum-submissions.md) |
| #19 | Notices and audit trail | [DEMO-notices-audit](DEMO-notices-audit.md) |
| #20 | Guided demo, rich synthetic school, accessibility and wording baseline | [DEMO-experience](DEMO-experience.md) |
| #17 | Security, change control, migration governance | [DEMO-security-change-control](DEMO-security-change-control.md) |
| #21 | Corrected stale assertion from the earlier assessment detail work | this record |
| #22 | Student wording and plain-language pass over pages merged after #20 | [DEMO-language-pass](DEMO-language-pass.md) |

## Results on the final tree

Run on 7 October 2026 on a fresh build of `main`.

| Check | Result |
| --- | --- |
| Guarded run (`node scripts/test.mjs static unit integration smoke --fast --guard`) | 78 suites, 62,583 assertions, 0 failed (unit 162, integration 62,244, smoke 177, three static steps); regression guard 78 baselined suites, 0 excused |
| `tsc --noEmit`, ESLint | 0 errors; 12 warnings (all pre-existing kinds) |
| Documentation, requirements audit, specification, catalogue checks | pass; 103 route files, 371 designed cases counted, no execution or acceptance inferred |
| GitHub Actions `verify` (first ever run of `.github/workflows/ci.yml`, on PR #22) | success, about 3.5 minutes |
| `pnpm demo` from an empty state | builds, applies every migration, loads the invented school, starts the Worker and serves the sign-in page |

Mounted browser procedures (real Chromium, local Worker and local D1, 0 external requests and 0 page errors in each):

| Procedure | Result |
| --- | --- |
| `worker-demo-experience-check` (4 roles, 114 pages at 375px and 1280px, axe) | 1,127 checks, 0 failed, 0 axe violations |
| `worker-demo-journey-check` (new: notice, attendance and report sharing across administrator, guardian and student) | 19/19; mutation (guardian notices routed to students) makes it fail |
| `worker-demo-ui-check` (demo sign-in, role menus) | 26/26 after the expected menus were updated to the pages now in navigation |
| `worker-courses-enrolment-demo-check` | 26/26 |
| `worker-attendance-demo-check` | 25/25 |
| `worker-assessment-lifecycle-ui-check` | 33/33 |
| `worker-assessment-review-ui-check` | 43/43 |
| `worker-development-ui-check` | 60/60 |
| `worker-profile-assessment-ui-check` | 36/36 |
| `worker-family-ui-check` | 36/36 |
| `worker-notices-audit-demo-check` | 23/23 (one run used its built-in retry once) |
| `worker-curriculum-submissions-demo-check` | 23/23 |
| `worker-reading-review-demo-check` | 18/18 not connected, 33/33 connected to the local fake destination |

## Defects found and fixed during integration

- **Duplicate page frame.** The report card detail and compile pages wrapped themselves in the page shell inside a layout that already supplies it, giving two main landmarks. Found by the 114-page audit, fixed.
- **Duplicate database triggers.** Migration 0025 re-created six immutability triggers that 0021 already creates; a second `CREATE TRIGGER` of the same name fails. The six were removed from 0025 (still unreleased); the trigger inventory now counts 114 triggers.
- **Out-of-order migration timestamp.** 0021 carried a later timestamp than 0023 and 0024; normalised to the numbering convention before release so order and time agree.
- **Stale assertions.** `worker-development-ui-check` (a 409 that the finished feature no longer returns, mine, from #9), `worker-profile-assessment-ui-check` (counted every `/assessments/…` link, and #11 correctly adds one to `/assessments/manage`), `worker-demo-ui-check` (expected menus). Each was changed only to follow behaviour the specification now describes, and each still fails if the thing it protects breaks.
- **Wording.** Pages merged after the language pass said "learner" and used internal words. #22 reduced hits from 172 to 40, each remaining one a reasoned exception (administrator-only identifier fields, the reading import file format, the HTTPS source rule).

## Known limits and open items (do not read past these)

1. **No live deployment.** No Cloudflare credentials were available. `scripts/deploy-cloudflare.mjs --dry-run` passes (Worker packages at about 5.1 MiB, 1.2 MiB gzip) but the live steps have never met an account; see [DEPLOY-CLOUDFLARE](../DEPLOY-CLOUDFLARE.md). The earlier private hosted failure (`incomplete input: SQLITE_ERROR`) is still unexplained; six original migrations (0005, 0010, 0012 to 0015) put several statements in one piece and cannot be edited.
2. **Local Worker flake.** After a request is refused before its body is read, the next request on that connection can get `503 Your worker restarted mid-request`. The school-records procedure failed on it in about half of runs and passed on rerun (16/16); newer procedures retry exact, identifier-carrying writes once and count it. Not reproduced or ruled out on hosted Cloudflare.
3. **Procedures not rerun alone.** `worker-reading-practice-ui-check` needs a reading created by `worker-specification-ui-check` on the same Worker; `worker-attendance-check`, `worker-literacy-check`, `worker-structure-ui-check` and `worker-registry-ui-check` had earlier stalls or flakes and were not part of the final battery.
4. **Policies awaiting a named approver.** Role and identity changes to existing accounts, global course-code uniqueness, no unassigning a teacher without a replacement, the other working rules listed in the identity and courses records. No cross-school move exists. The legacy attendance `POST` can still overwrite a mark without a reason (the change is logged in `attendance_changes`).
5. **Security findings still open** ([record](DEMO-security-change-control.md)): F3, F5, F6, F10 from the first pass; F11 (`POST /api/curriculum/[id]/status` parses the body before its role check; the contract is silent on order); M1 (above). One mutation went undetected: removing the staff gate from `GET /api/notices/audience` changes nothing because the service repeats the check.
6. **Real provider, ORF and identity settings are unprovided.** Sign-in outside demo mode, the reading-app connection and delivery to real people remain disabled and untested against any real service.
7. **Accessibility and language.** Automated axe and layout measures only; no assistive-technology review, no named language or locale reviewer, English labels only.
8. **Still not accepted:** all 371 designed cases, every requirement, every policy. `TEST-CASES`, `TRACEABILITY` and the acceptance rows were deliberately not edited.
