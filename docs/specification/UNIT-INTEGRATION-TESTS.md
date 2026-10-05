# Unit and integration design

Version 2.0 draft, 5 October 2026. Source candidate: `5488bc0d20412a3d4be0c031c99c259c56834d5e`. Case design only; no per-case execution or business acceptance is recorded for this specification. Existing-suite verification is recorded separately. Business requirements and approval state are defined in [BRD](BRD.md) and [requirements register](requirements.json).

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
| `tests/support/security-db.mjs` | support, not suite | Transpilation/hooks, corrected raw-array SQLite proxy and synthetic relationships |
| `tests/support/write-worker-fixture.mjs` | support, not suite | Dependency-ordered local fixture generation; not provider authentication |

The runner catalogue in `scripts/test-catalogue.mjs` classifies suites; it does not assert design coverage or execution. Existing served/browser checkers are manual entries and are not automatically exercised by default static/unit/integration selection.

## Concrete design principles

Use boundary partitions for counts, dates, score limits, string lengths, language syntax and duplicate cookies. Check normalized data and server-computed metrics, not only status codes. Validate referenced records and foreign school/role ownership with real relationships. Isolate each negative test so failed writes demonstrably leave row counts/content unchanged.

For persistence tests, use all current migrations and enforce referential constraints. Preserve joined query column order as raw arrays in the proxy; converting joined rows to object values previously lost duplicate columns and invalidated evidence. Use a fresh DB/fixture revision and close it after tests. Any SQLite-only feature/behavior assumption requires served workerd/D1 confirmation.

For concurrency, coordinate separate requests at the relevant insert/update boundary: create retry identity; competing expectedVersion; two reviewers; teacher-class revocation before assignment; academic pair races; ORF immutable retries. Assert one stable record/version, original review metadata and explicit conflict/denial; successful HTTP response count alone is insufficient.

For OIDC, cryptographically sign synthetic ID tokens and verify actual JWKS handling; change issuer/audience/azp/nonce/expiry and browser/state independently. Mock provider faults without paid/network activation. A forged unsigned payload or injected session cannot substitute for a signed-token or real browser callback case.

Future AI/adapters/submissions/audit tests first require an approved contract and implemented interface. Do not stub an invented endpoint and declare the requirement implemented. Exercise schema/failure/privacy/budget/retry behaviors once concrete contracts exist.

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
