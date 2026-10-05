# Unit and integration design

Version 2.1 draft, 5 October 2026. Historical v2.0 source candidate: `5488bc0d20412a3d4be0c031c99c259c56834d5e`. Case design only; no per-case execution or business acceptance is recorded for this specification. Existing-suite verification is recorded separately. Business requirements and approval state are defined in [BRD](BRD.md) and [requirements register](requirements.json).

The v2.1 extensions describe the current working candidate on `feat/specification-delivery`, based on documentation commit `d53adcf`. The original v2.0 application baseline remains `5488bc0d20412a3d4be0c031c99c259c56834d5e`. New behavior is not attributed to that historical SHA; actual execution is recorded separately and all business acceptance remains unapproved.

## Existing runnable mappings

| Existing path | Catalogue layer | Scope and important limit |
|---|---|---|
| `tests/unit/auth-contract.mjs` | unit | Six grouped auth cases using real signed synthetic tokens, mocked discovery/token/JWKS and disposable SQLite; also exercises persistence rather than purely isolated rules |
| `tests/unit/roles-contract.mjs` | unit | Coarse role policy; object authorization needs service/DB/served cases |
| `tests/unit/validation-contract.mjs` | unit | Field validation boundaries; do not infer whole workflow completeness |
| `tests/unit/request-body-contract.mjs` | unit | Parsing/controlled invalid-body behavior |
| `tests/unit/schools-courses-contract.mjs` | unit | Existing school/course contracts; accepted pilot administration remains separate |
| `tests/unit/i18n-contract.mjs` | unit | Locale contract keys/fallback; not content suitability or full language validation |
| `tests/integration/api-auth-guards.mjs` | integration | Isolated API identity/origin guards; cannot replace real DB object scope |
| `tests/integration/api-contract.mjs` | integration | Real SQLite persistence/service/handler academic/profile scope cases |
| `tests/integration/resources-contract.mjs` | integration | Draft/revision/review/assignment/private-field/concurrency cases with actual sessions and SQLite |
| `tests/integration/reading-checks-contract.mjs` | integration | Manual provenance, normalization, scoped histories, strict validation and retries |
| `tests/integration/external-apps-contract.mjs` | integration | Fixed trusted launch URL, separate sign-in, no network forwarding and scoped context |
| `tests/unit/catalogue-contract.mjs` | unit | Canonical 35-requirement catalogue, distinct evidence-link counts, missing-file handling and preservation of draft execution/approval states; no requirement acceptance |
| `tests/unit/http-body-contract.mjs` | unit | Actual shared streamed 128 KiB parser, malformed UTF-8/JSON and declared-length rejection; no general SLA |
| `tests/integration/identity-admin-contract.mjs` | integration | Reviewed explicit provisioning/status, fixed school, strict/spoofed input, retry/revision/admin races, session revocation, atomic rollback; production Drizzle D1 prepared batch through local SQLite adapter |
| `tests/integration/curriculum-contract.mjs` | integration | Manual source/rights declarations, approved peer visibility, immutable versions, first review, exact-source unapproved copies/provenance, rollback and live authority races; no verified licensing |
| `tests/integration/submissions-contract.mjs` | integration | Exact assignment/student binding, text attempt/reviewed-feedback histories, privacy, strict input, retry/sequence races and live authority changes; due dates informational |
| `tests/integration/reading-review-contract.mjs` | integration | Preserved originals/corrections, numeric/revision limits, database immutable-row triggers, current staff history and exact-task grouping; no validated norms |
| `tests/integration/resource-access-contract.mjs` | integration | Injects account/role/identity or parent-author changes before resource creation, version reads/retry, revision/approval/assignment statements and staff/learner assignment feeds; inspects safe denial/private-field omission and unchanged records with actual sessions/routes/SQLite |
| `tests/integration/evidence-access-contract.mjs` | integration | Injects account disablement, role changes, source-author changes and class/enrolment revocation immediately before identity retry, curriculum version/copy and submission-feedback SELECTs; checks safe denial, private-content omission and preserved records with real SQLite/sessions |
| `tests/worker-specification-check.mjs` | manual served check | Built localhost Worker/local D1, reviewed identity status/session replay, source approval/copy provenance, exact-version attempts/feedback, corrections and withdrawn-history scope; not automatically selected by the runner |
| `tests/worker-specification-ui-check.mjs` | manual browser check | Real built localhost journeys for reviewed accounts/source-copy/attempt-feedback/corrections, same-key retry after lost response, confirmed-save refresh failure, labels/mobile width and role denials; not full screen-reader/accessibility acceptance |
| `tests/smoke/basic-smoke.mjs` | smoke, offline | Executed migrated-table/route/session boot and selected denials; replaces historical placeholder, does not exercise served Worker/browser |
| `tests/support/security-db.mjs` | support, not suite | Transpilation/hooks, corrected raw-array SQLite proxy and synthetic relationships |
| `tests/support/write-worker-fixture.mjs` | support, not suite | Dependency-ordered local fixture generation; not provider authentication |

The runner catalogue in `scripts/test-catalogue.mjs` classifies suites and derives its requirement report from the canonical 35-requirement register and designed-case `evidenceFiles`. It deduplicates existing runnable links. The current mapping connects 32 requirement IDs to at least one runnable file; this counts evidence context, not completed requirements, case execution or acceptance. `tests/unit/catalogue-contract.mjs` checks that distinction and missing-file behavior. Existing served/browser checkers are manual entries and are not automatically exercised by default static/unit/integration selection.

## Concrete design principles

Use boundary partitions for counts, dates, score limits, string lengths, language syntax and duplicate cookies. Check normalized data and server-computed metrics, not only status codes. Validate referenced records and foreign school/role ownership with real relationships. Isolate each negative test so failed writes demonstrably leave row counts/content unchanged.

For persistence tests, use all current migrations and enforce referential constraints. Preserve joined query column order as raw arrays in the proxy; converting joined rows to object values previously lost duplicate columns and invalidated evidence. Use a fresh DB/fixture revision and close it after tests. Any SQLite-only feature/behavior assumption requires served workerd/D1 confirmation.

For concurrency, coordinate separate requests at the relevant insert/update boundary: create retry identity; competing expectedVersion; two reviewers; teacher-class revocation before assignment; academic pair races; ORF immutable retries. Assert one stable record/version, original review metadata and explicit conflict/denial; successful HTTP response count alone is insufficient.

For OIDC, cryptographically sign synthetic ID tokens and verify actual JWKS handling; change issuer/audience/azp/nonce/expiry and browser/state independently. Mock provider faults without paid/network activation. A forged unsigned payload or injected session cannot substitute for a signed-token or real browser callback case.

Current reviewed identities, manual curriculum, text attempts/formative feedback and reading corrections use actual implemented interfaces. Future AI/adapters, full identity/profile remapping, complete academic audit, verified licensing and deadline/grade/publication policy still require concrete contracts. Do not stub an invented endpoint and declare a broader requirement complete. Existing suite mapping does not execute or accept the designed cases.

## Intended commands and entry limits

```sh
node scripts/test.mjs --check-catalogue
node scripts/test.mjs --list --json
node scripts/run-framework.mjs build
node scripts/test.mjs static unit integration --fast
```

These are reproducibility instructions, not commands executed for this specification. `--fast` requires the separately built matching revision. Inspect current toolchain/environment notes in [VALIDATION](../../VALIDATION.md); historical bundled and declared package-manager versions differ. Dependencies, build output, local fixture DBs and credential files must remain outside tracked acceptance evidence.

## Exit

Capture suite results plus per-case actual expected comparisons, persisted invariants, faults and defect references. Broaden testing after failures/new changes or unresolved risks, not simply to repeat passing counts. Planned cases may remain unautomated, but release gates require explicit disposition; business acceptance is never implied by the runner.
