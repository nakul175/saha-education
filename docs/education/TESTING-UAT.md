# Testing and user acceptance plan

> Documentation version 1.0 · 5 October 2026 · Draft for sponsor review.
> Describes the Next.js rebuild at `b4cbfc5f6855479ed523b5bf4c0aed0d2b6f6e3d`, not the legacy application on `main`.
> Requirements are proposed targets; code presence does not establish acceptance or production readiness.

## Evidence boundary

Existing tests include auth, roles, validation, request-body, schools/courses and i18n contract files plus one API contract file. Their presence is not passing evidence. The integration source uses TypeScript imports and a global test DB hook, but the inspected production adapter reads Cloudflare env.DB directly; verify the harness before trusting it. The smoke module only asserts true and exports a function; running the file may not invoke a real workflow. The inherited catalogue classifier needs verification for nested unit/integration paths.

No application tests were run as part of this documentation-only change. Documentation check results are in VALIDATION.md.

## Test environments and data

Create two synthetic schools, an administrator per school, assigned and unassigned teachers, two students per school, a linked guardian and an unrelated guardian. Provision valid database relationships. Record commit, Node/package-manager versions, Worker/configuration, migration state and synthetic dataset revision. Never use real records or provider recipients.

## Acceptance cases

| Case | Procedure | Pass criteria |
|---|---|---|
| UAT-01 | Valid login/logout; forged/expired/disabled account attempts | Valid account works, others denied; logout revokes access |
| UAT-02 | Substitute another school, class, student and notification ID across all reads/writes | No unauthorized data or mutation; stable denial response |
| UAT-03 | Configure school, provision/disable user, assign teacher | Same-school records persist; invalid/disabled teacher rejected |
| UAT-04 | Register/update student, duplicate admission, link guardian twice and attempt unrelated link | Valid save persists, duplicate policy holds, links authorized and retry safe |
| UAT-05 | Create course/class, enrol twice, withdraw, complete and reload | Valid roster, no duplicate enrolment, historical status retained |
| UAT-06 | Save attendance, reload, correct, inject mid-batch failure and concurrent write | Defined unique record behavior, correction attribution and recoverable outcome |
| UAT-07 | Create assessment; scores below zero, above max, invalid student and repeated result submission | Valid enrolled result persists; invalid/unauthorized inputs rejected |
| UAT-08 | Draft report, unauthorized read/publish, valid publish and retry, inspect guardian notices | Draft private; approved publication; correct user recipients; no duplicate notices |
| UAT-09 | Role journeys, search/filter/pagination, phone viewport and keyboard/screen-reader review | No dead required links; matching scoped results; approved accessibility outcome |
| UAT-10 | Correct records, inspect logs/audit, exercise approved retention/export policy | Actor/history preserved; no sensitive payload logs; policy verified |
| UAT-11 | Deploy synthetic staging, migrate, backup, isolated restore and compatible rollback | Integrity preserved, approved RPO/RTO met, revision/migration state recorded |
| UAT-12 | Malformed input, wrong role, missing record, duplicates, load and DB failure | Stable contract; bounded performance; no silent data corruption |

Every case is pending. A case is accepted only with the served application evidence and sponsor/QA decision, not a corresponding unit test alone.

## Verification layers

Use unit tests for validation/calculation rules, D1 integration tests for constraints and persistence, served HTTP tests for session/access contracts, browser tests for complete journeys and operational drills for recovery. Test adversarial object IDs in addition to positive happy paths. Assess accessibility manually as well as with automated tooling.

## Evidence template

For each case record: case and requirement IDs; tested commit/environment/migrations; fixture IDs; steps and expected outcome; actual result; redacted screenshot or request/response evidence; persisted-state assertions; pass/fail/blocked; tester/date; defect reference; approver/date. Blocked or unrun cases are not passes.

## Release decision

Require P0 acceptance and all agreed P1 journeys, disposition of remaining defects, approved policies, operational ownership and a rehearsed restore. Performance/accessibility thresholds remain sponsor decisions. Historical test counts and copied test-runner references to health requirements must not be used as acceptance evidence.
