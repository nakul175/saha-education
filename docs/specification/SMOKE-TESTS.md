# Current candidate smoke plan

Version 2.2 draft, 5 October 2026. Historical v2.0 source candidate: `5488bc0d20412a3d4be0c031c99c259c56834d5e`. Case design only; no per-case execution or business acceptance is recorded for this specification. Existing-suite verification is recorded separately. Business requirements and approval state are defined in [BRD](BRD.md) and [requirements register](requirements.json).

The v2.2 implementation candidate was prepared on `feat/specification-delivery`. `source_commit` records `398df9c8bf57659a5fd97718f76fe962011cf7d2`, the parent of this documented batch, rather than the commit containing its changes. The changes were uncommitted when this specification was assembled; dated publication and execution records are maintained separately. The v2.0 application baseline remains `5488bc0d20412a3d4be0c031c99c259c56834d5e`, and v2.1 evidence remains historical. Every requirement is unapproved and every designed case is `not-run-for-this-specification`.

## Scope and entry

Smoke has two distinct execution layers. Offline boot/access smoke imports actual handlers with migrated isolated SQLite and real synthetic sessions. Served smoke exercises a freshly built local Worker: authentication denial, scoped records/origins, report privacy, exact versions, learner-field stripping and manual reading. Neither establishes a live provider, external availability, AI or recovery. Served entry requires fresh build, disposable local D1/session fixtures, approved localhost origin and a running Worker.

The historical v2.0 `tests/smoke/basic-smoke.mjs` was an uninvoked always-true placeholder and provided no acceptance evidence. The current file uses real-route/migration/session assertions: all 14 extension tables,20 extension route imports/anonymous 401, no-store, selected role/origin denials, bounded school profile inventory, empty import collection, denied family policy history, staff library response, pending-provider 503 and zero provider calls. Historical v2.1 covered its eight tables/thirteen routes; actual counts remain in dated evidence. This is meaningful offline boot/access coverage; it is not a served/browser smoke or an execution of the 133 designed cases. Actual run counts belong in dated execution evidence.

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

## P 0 exit gate

Anonymous/demo/foreign-origin access denied; school/class/family isolation maintained; no draft report or staff-note/key disclosure; confirmed writes survive retry; assignment remains pinned to its approved version; ORF validates counts and retains manual provenance; unsafe external destination disabled. Wrong actor/object authority, privacy leaks, wrong-version assignment or silent partial persistence block candidate smoke acceptance.

New manual-domain smoke additionally checks administrator-only reviewed accounts, unchanged profile ownership, declared-source approval/copy distinction, pinned active-learner text attempts, scoped formative feedback, preserved reading originals/correction history and protected latest-revision conflicts. Offline boot import tests cover only a subset; use the dedicated integration and served/browser procedures for persistence/journey evidence.

Actual provider callback is **blocked** until the chosen provider/tenant/client/HTTPS origin is supplied and verified; injected synthetic sessions cannot satisfy that gate. Confirmed ORF destination availability is similarly blocked. Controlled “not configured” responses are expected current smoke behavior, not completion of those dependencies.

All case statuses remain not-run for this specification. Historical served/browser observations belong to [VALIDATION](../../VALIDATION.md).

## v2.2 boot and safety additions

Designed smoke TC-102/TC-118/TC-126 covers role-first profile links, staged preview with zero observations, and default unrestricted safe window summary. Related suites also cover all-member academic actual writes. Fresh served/browser procedures are [worker development checks](../../tests/worker-development-check.mjs) and [worker development UI checks](../../tests/worker-development-ui-check.mjs); registry/manual status does not mean they ran as part of an offline smoke command.

P 0 additions: no unreviewed profile binding bypass; no partial academic/import batch; rejected draft absent from reading checks; declared-source result consumed once per school/namespace/reference; new closed/elapsed attempts denied in actual INSERT while saved UUIDs/feedback survive; all downstream review/current/retry reads remain scoped. Observed smoke results are in root-owned batch evidence, not designed-case statuses.
