# Current candidate smoke plan

Version 2.0 draft, 5 October 2026. Source candidate: `5488bc0d20412a3d4be0c031c99c259c56834d5e`. Case design only; no per-case execution or business acceptance is recorded for this specification. Existing-suite verification is recorded separately. Business requirements and approval state are defined in [BRD](BRD.md) and [requirements register](requirements.json).

## Scope and entry

Smoke exercises current served behavior only: authentication denial, scoped records, controlled origins, report privacy, exact resource versions, learner-field stripping and manually reviewed readings. It does not establish provider login, external availability, AI or recovery. Entry requires a fresh relevant build, migrated disposable local D1, synthetic fixture accounts/sessions, approved localhost origin and a running built Worker.

`tests/smoke/basic-smoke.mjs` exports a function containing an always-true assertion. Running that file does not invoke a useful workflow; it is not a release gate or evidence of any case below.

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

Existing tools in the table provide related current coverage. Where the case register marks automation planned, the expanded matrix, fault, race or negative-print procedure still needs dedicated execution/automation; source existence is not full smoke coverage.

## Intended execution sequence

1. Record revision, Node/package-manager versions, migration/fixture revision and isolated-state path; check no production/remote target.
2. Build using `node scripts/run-framework.mjs build` after executable changes. Static/unit/integration `--fast` runs may reuse only a separately verified matching build.
3. Use `tests/support/write-worker-fixture.mjs` to prepare synthetic local fixture SQL/session data; initialize a new local D1 state according to its current instructions. Start the built Worker with the matching local origin. Do not log bearer cookies.
4. Intentionally run applicable `tests/worker-access-check.mjs`, `tests/worker-literacy-check.mjs` and `tests/worker-resources-check.mjs` with `SAHA_WORKER_TEST_URL` and `SAHA_WORKER_SESSION_FIXTURE`. These checkers refuse non-local targets. Run `tests/worker-resources-ui-check.mjs` separately with its required browser configuration for print/navigation/learner checks.
5. Execute missing designed fault cases separately; review persisted state and actual output. Record per-case pass/fail/blocked; suite success alone cannot fill the case register.
6. Stop local server/browser and dispose isolated fixture state under the operator policy. Keep redacted evidence and defect references.

## P0 exit gate

Anonymous/demo/foreign-origin access denied; school/class/family isolation maintained; no draft report or staff-note/key disclosure; confirmed writes survive retry; assignment remains pinned to its approved version; ORF validates counts and retains manual provenance; unsafe external destination disabled. Wrong actor/object authority, privacy leaks, wrong-version assignment or silent partial persistence block candidate smoke acceptance.

Actual provider callback is **blocked** until the chosen provider/tenant/client/HTTPS origin is supplied and verified; injected synthetic sessions cannot satisfy that gate. Confirmed ORF destination availability is similarly blocked. Controlled “not configured” responses are expected current smoke behavior, not completion of those dependencies.

All case statuses remain not-run for this specification. Historical served/browser observations belong to [VALIDATION](../../VALIDATION.md).
