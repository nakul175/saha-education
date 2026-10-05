# Current candidate smoke plan

Version 2.1 draft, 5 October 2026. Historical v2.0 source candidate: `5488bc0d20412a3d4be0c031c99c259c56834d5e`. Case design only; no per-case execution or business acceptance is recorded for this specification. Existing-suite verification is recorded separately. Business requirements and approval state are defined in [BRD](BRD.md) and [requirements register](requirements.json).

The v2.1 extensions describe the current working candidate on `feat/specification-delivery`, based on documentation commit `d53adcf`. The original v2.0 application baseline remains `5488bc0d20412a3d4be0c031c99c259c56834d5e`. New behavior is not attributed to that historical SHA; actual execution is recorded separately and all business acceptance remains unapproved.

## Scope and entry

Smoke has two distinct execution layers. Offline boot/access smoke imports actual handlers with migrated isolated SQLite and real synthetic sessions. Served smoke exercises a freshly built local Worker: authentication denial, scoped records/origins, report privacy, exact versions, learner-field stripping and manual reading. Neither establishes a live provider, external availability, AI or recovery. Served entry requires fresh build, disposable local D1/session fixtures, approved localhost origin and a running Worker.

The historical v2.0 `tests/smoke/basic-smoke.mjs` was an uninvoked always-true placeholder and provided no acceptance evidence. The current working file replaces it with executed real-route/migration/session assertions: all eight new tables, thirteen new route imports/anonymous 401, no-store, selected role/origin denials, staff empty-library response, pending-provider 503 and zero provider calls. This is meaningful offline boot/access coverage; it is not a served/browser smoke or an execution of the 101 designed cases. Actual run counts belong in dated execution evidence.

| Case | Mandatory check | Existing mapped tooling / limitation |
|---|---|---|
| TC-001 | Provider unset fails closed | `tests/unit/auth-contract.mjs`, `tests/worker-access-check.mjs` |
| TC-016 | Demo cookies and public identity headers rejected | `tests/unit/auth-contract.mjs`, `tests/integration/api-auth-guards.mjs`, `tests/worker-access-check.mjs` |
| TC-017 | Cross-school and unassigned-class matrix | `tests/integration/api-contract.mjs`, `tests/integration/api-auth-guards.mjs`, `tests/integration/resources-contract.mjs`, `tests/integration/reading-checks-contract.mjs` |
| TC-019 | Mutation Origin and no-store contract | `tests/integration/api-auth-guards.mjs`, `tests/integration/resources-contract.mjs`, `tests/integration/external-apps-contract.mjs`, `tests/integration/reading-checks-contract.mjs` |
| TC-033 | Report drafts private across all entry points | `tests/integration/api-contract.mjs`, `tests/worker-access-check.mjs` |
| TC-034 | Report publication and notice atomic retry | `tests/integration/api-contract.mjs`, `tests/worker-access-check.mjs`; full designed fault/race procedure still planned |
| TC-039 | Repeat-safe creation after lost response | `tests/integration/resources-contract.mjs`, `tests/worker-resources-check.mjs` |
| TC-050 | Draft assignment denied and exact approved version pinned | `tests/integration/resources-contract.mjs`, `tests/worker-resources-check.mjs`, `tests/worker-resources-ui-check.mjs` |
| TC-053 | Learner/server response excludes private fields | `tests/integration/resources-contract.mjs`, `tests/worker-resources-check.mjs`, `tests/worker-resources-ui-check.mjs` |
| TC-055 | Print exact approved student edition | `tests/worker-resources-ui-check.mjs` |
| TC-057 | Unconfigured/unsafe external app fails closed | `tests/integration/external-apps-contract.mjs`, `tests/worker-literacy-check.mjs` |
| TC-061 | Reviewed numeric counts and derived measures | `tests/integration/reading-checks-contract.mjs`, `tests/worker-literacy-check.mjs` |
| TC-063 | ORF immutable retries and actor collisions | `tests/integration/reading-checks-contract.mjs`, `tests/worker-literacy-check.mjs` |

Existing tools in the table provide related current coverage. New identity/curriculum/submission/reading-review suites and offline smoke add domain boot/negative coverage. The manually invoked `tests/worker-specification-check.mjs` exercises those actual routes against the built localhost Worker and migrated local D1, including exact retries, stale conflicts, private fields and withdrawal/history policy. Where automation remains planned, broader matrix, fault, policy or print procedures need dedicated execution; source existence is not full smoke coverage.

## Intended execution sequence

1. Record revision, Node/package-manager versions, migration/fixture revision and isolated-state path; check no production/remote target.
2. Build using `node scripts/run-framework.mjs build` after executable changes. Static/unit/integration `--fast` runs may reuse only a separately verified matching build.
3. Run `node scripts/test.mjs smoke --fast` only against a separately verified matching build for the offline current boot/access suite. For served checks, use `tests/support/write-worker-fixture.mjs` to prepare synthetic local SQL/session data, initialize new local D1 and start the built Worker with its matching local origin. Do not log bearer cookies.
4. Intentionally run applicable `tests/worker-access-check.mjs`, `tests/worker-literacy-check.mjs` and `tests/worker-resources-check.mjs` with `SAHA_WORKER_TEST_URL` and `SAHA_WORKER_SESSION_FIXTURE`. These checkers refuse non-local targets. Run the new `tests/worker-specification-check.mjs` with the same isolated Worker/session settings for identity, curriculum, attempt/feedback and reading-correction persistence checks. Run `tests/worker-specification-ui-check.mjs` and `tests/worker-resources-ui-check.mjs` separately with its required browser configuration for print/navigation/learner checks.
5. Execute missing designed fault cases separately; review persisted state and actual output. Record per-case pass/fail/blocked; suite success alone cannot fill the case register.
6. Stop local server/browser and dispose isolated fixture state under the operator policy. Keep redacted evidence and defect references.

## P0 exit gate

Anonymous/demo/foreign-origin access denied; school/class/family isolation maintained; no draft report or staff-note/key disclosure; confirmed writes survive retry; assignment remains pinned to its approved version; ORF validates counts and retains manual provenance; unsafe external destination disabled. Wrong actor/object authority, privacy leaks, wrong-version assignment or silent partial persistence block candidate smoke acceptance.

New manual-domain smoke additionally checks administrator-only reviewed accounts, unchanged profile ownership, declared-source approval/copy distinction, pinned active-learner text attempts, scoped formative feedback, preserved reading originals/correction history and protected latest-revision conflicts. Offline boot import tests cover only a subset; use the dedicated integration and served/browser procedures for persistence/journey evidence.

Actual provider callback is **blocked** until the chosen provider/tenant/client/HTTPS origin is supplied and verified; injected synthetic sessions cannot satisfy that gate. Confirmed ORF destination availability is similarly blocked. Controlled “not configured” responses are expected current smoke behavior, not completion of those dependencies.

All case statuses remain not-run for this specification. Historical served/browser observations belong to [VALIDATION](../../VALIDATION.md).
