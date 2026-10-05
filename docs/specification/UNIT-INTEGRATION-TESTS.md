# Unit and integration design

Version 2.7 draft, 5 October 2026. Historical v2.0 source candidate: `5488bc0d20412a3d4be0c031c99c259c56834d5e`. Case design only; no per-case execution or business acceptance is recorded for this specification. Existing-suite verification is recorded separately. Business requirements and approval state are defined in [BRD](BRD.md) and [requirements register](requirements.json).

The v2.7 implementation candidate was prepared on `feat/specification-delivery`. `source_commit` records `61f0751b5c38384783f56823a07964421a18c0bf`, the parent of this documented sixth learner-recovery batch, rather than the commit containing its changes. Dated publication and execution records are maintained separately. The v2.0 application baseline remains `5488bc0d20412a3d4be0c031c99c259c56834d5e`; v2.1 evidence and published v2.2 at `82f20ce`, v2.3 at `88205cd`, v2.4 at `85e85d0`, v2.5 at `f312881` and v2.6 at `61f0751` remain historical. Every requirement is unapproved and every designed case is `not-run-for-this-specification`.

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

The runner catalogue in `scripts/test-catalogue.mjs` classifies suites and derives its requirement report from the canonical 35-requirement register and designed-case `evidenceFiles`. It deduplicates existing runnable links. The current mapping connects 35 requirement IDs to at least one runnable file; this counts evidence context, not completed requirements, case execution or acceptance. `tests/unit/catalogue-contract.mjs` checks that distinction and missing-file behavior. Existing served/browser checkers are manual entries and are not automatically exercised by default static/unit/integration selection.

## Concrete design principles

Use boundary partitions for counts, dates, score limits, string lengths, language syntax and duplicate cookies. Check normalized data and server-computed metrics, not only status codes. Validate referenced records and foreign school/role ownership with real relationships. Isolate each negative test so failed writes demonstrably leave row counts/content unchanged.

For persistence tests, use all current migrations and enforce referential constraints. Preserve joined query column order as raw arrays in the proxy; converting joined rows to object values previously lost duplicate columns and invalidated evidence. Use a fresh DB/fixture revision and close it after tests. Any SQLite-only feature/behavior assumption requires served workerd/D1 confirmation.

For concurrency, coordinate separate requests at the relevant insert/update boundary: create retry identity; competing expectedVersion; two reviewers; teacher-class revocation before assignment; academic pair races; ORF immutable retries. Assert one stable record/version, original review metadata and explicit conflict/denial; successful HTTP response count alone is insufficient.

For OIDC, cryptographically sign synthetic ID tokens and verify actual JWKS handling; change issuer/audience/azp/nonce/expiry and browser/state independently. Mock provider faults without paid/network activation. A forged unsigned payload or injected session cannot substitute for a signed-token or real browser callback case.

Current reviewed identities, manual curriculum, text attempts/formative feedback and reading corrections use actual implemented interfaces. Future AI/adapters, existing account role/identity/school remapping, complete academic audit, verified licensing and educator grade/late/publication policy still require concrete contracts. Do not stub an invented endpoint and declare a broader requirement complete. Existing suite mapping does not execute or accept the designed cases.

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

## v2.2 candidate mappings

| Designed case group | Related runnable/source evidence | Persistence boundary |
|---|---|---|
| TC-102–TC-109 profile login review | [profile-links-contract](../../tests/integration/profile-links-contract.mjs), profile-links service/migration 0008 | Event/binding/version/session atomicity; current exact replay, legacy guard/repair and profile-transfer privacy |
| TC-110–TC-117 academic integrity | [academic-integrity-contract](../../tests/integration/academic-integrity-contract.mjs), migration 0009 | Preserved legacy pairs; actual all-member/current maximum authority; ambiguous-pair denial and atomic rollback |
| TC-118–TC-125 local reading imports | [reading-imports-contract](../../tests/integration/reading-imports-contract.mjs), migration 0010 | Stage 0 observations; reviewed all-row terminal CAS/receipt transaction; consumed-result dedup and live current scope |
| TC-126–TC-133 reviewed windows | [submission-windows-contract](../../tests/integration/submission-windows-contract.mjs), existing submissions suite/migration 0011 | Latest/database-clock actual attempt gate; preserved committed replay/feedback; immutable policy/current-state replay |
| TC-109/TC-117/TC-125/TC-133 prototype review context | [offline wireframe checker](../../tests/worker-wireframes-check.mjs) | Local synthetic 12-screen labels/focus/responsiveness and selected review interactions; no application workflow or educator acceptance |
| TC-091/TC-092 related local recovery scope | [development-recovery-contract](../../tests/integration/development-recovery-contract.mjs), existing recovery utility | Exact populated local encrypted roundtrip and rechecked privacy/retry/triggers, not hosted cutover/key custody/schedule |

Tests use actual isolated SQLite/sessions/routes, inspect persisted counts/values and inject authority changes immediately before actual statements. Browser/served implementation uses separate manual checkers; no test count, evidence link or local restored row promotes a requirement or designed case to acceptance. Array/transport caps are implementation limits, not performance guarantees.

## v2.3 statement-boundary mappings

| Designed group | Related runnable/source | Observable boundary |
|---|---|---|
| TC-134–TC-141 current structure | [structure-authority contract](../../tests/integration/school-structure-authority-contract.mjs), [independent live-domain contract](../../tests/integration/live-domain-authority-contract.mjs) | Current SQL actor/reference guards, final joined roster, role-before-body, D1 RETURNING and retained originals; final UI acceptance separate |
| TC-142–TC-149 publication | [report-publication contract](../../tests/integration/report-publication-contract.mjs), independent live-domain contract, migration 0012 | One receipt winner, report/notices atomic rollback, reviewed unlink before commit, DISTINCT guardian login IDs, no legacy backfill and no draft-create UUID guarantee |
| TC-150–TC-157 notices | Independent live-domain contract and current notice/UI source | Final recipient/teacher relationship, acknowledgement live scope, personal historical retention, no external delivery; planned browser recovery/manual UAT separate |

A fresh isolated DB and real session are required per adversarial scenario; injecting a cached Principal alone cannot replace route/session checks. The D1 prepared-driver adapter verifies actual conditional INSERT/RETURNING mapping, while localhost Worker checks exercise runtime behavior separately. Source/catalogue mapping remains related evidence only. No arbitrary nonempty issuer/subject replacement is claimed detectable from a Principal that lacks that snapshot; trusted remapping stays outside implemented writes.

## v2.4 coherent dashboard mappings

| Designed scope | Related existing source/suite | Boundaries |
|---|---|---|
| TC-158–TC-165 live/coherent role snapshots | `dashboard-contract.mjs`, `dashboard-access-contract.mjs`, `lib/education/dashboard.ts` and four server pages | Actual actor/relationship SQL cutoff; one statement, null denial, minimal fields/JSON; no session-hash recheck promise |
| TC-166–TC-173 result coverage | Same focused/independent suites and academic integrity regression | Current distinct roster, actual zero/max0, partial/no roster, preserved duplicate/invalid evidence, exact limits |
| TC-174–TC-178 family data | Same suites and published-report/attendance sources | Raw observed counts/dates, other/invalid evidence, existing current class scope, private drafts/notes excluded, exact limits |
| TC-179–TC-181 capacity/accessibility/UAT | [dashboard UI script](../../tests/worker-dashboard-ui-check.mjs) as related source; planned/manual procedures | Representative targets and intentional acceptance remain unrun; browser script presence is not execution |

The new service has no writes, migration or API. Focused/independent runnable suites cover actual session/SQLite and prepared-driver behavior; observed counts belong to dated run evidence and never populate the designed case register.

## v2.5 attendance contract mappings

| Designed cases | Related runnable/source context | Scope boundary |
|---|---|---|
| TC-182–TC-189 snapshot/strict evidence | [primary reviewed contract](../../tests/integration/attendance-review-contract.mjs), [independent access contract](../../tests/integration/attendance-review-access-contract.mjs) | Actual authenticated routes/SQLite; role before parsing, no default present, exact dates, Unicode/notes, empty/cap/legacy ambiguity |
| TC-190–TC-197 CAS/history | Same reviewed suites plus [academic integrity](../../tests/integration/academic-integrity-contract.mjs) | Actual-write scope/full-record CAS, concurrent unique/exact UUID, forced rollback, immutable before/after, scoped readback, original replay after legacy change/withdrawal, no old API regression |
| TC-198–TC-202 summary | [summary contract](../../tests/integration/attendance-summary-contract.mjs), [summary service](../../lib/education/attendance-summary.ts) | One current statement, names/raw counts/date/currentActive, cap/total, linked family privacy, no notes/percentage/false no-data |
| TC-203–TC-205 UI/capacity/UAT | [recorder browser procedure](../../tests/worker-attendance-ui-check.mjs), viewer source and intentional procedures | Uncertain original request, cleared private stale evidence, reload comparison, mobile labels/status/native links; measured operational and intentional acceptance pending |

New test links do not populate designed-case outcomes. Actual built Worker/D1 execution differs from Node SQLite/prepared-driver evidence; source count/privacy and a cap do not imply capacity, accessibility or educator acceptance.

Independent summary [access contract](../../tests/integration/attendance-summary-access-contract.mjs) supplies related actual-session/SQLite/prepared-driver scope/coherence/minimal-field/legacy/cap evidence. This source mapping does not populate any TC outcome or business acceptance.

## v2.6 reviewed result unit/integration design

SC-32–SC-34 covers actual opaque sessions/routes/migrated SQLite through production Drizzle D1 prepared/batch mapping. Assert one coherent snapshot; exact minimal projections/total/caps; safe serializable legacy repair versus unsafe/blob/nonfinite read-only evidence; zero/null/empty/unchanged long text and Unicode reason parity; all metadata/result fields CAS; current SQL actor/class/roster/pupil/reference cutoff; forced mid-event rollback; immutable evidence; exact/reordered/distinct concurrent UUIDs and current whole-batch history.

[Independent access contract](../../tests/integration/assessment-review-access-contract.mjs), [primary contract](../../tests/integration/assessment-review-contract.mjs) and [academic compatibility](../../tests/integration/academic-integrity-contract.mjs) are related executable evidence. Do not fabricate grades, delete legacy rows, disable final guards or rewrite existing accepted concurrent 200/omitted-text assertions. Recovery/served/browser environment runs and all intentional designed TC procedures stay separate.

## Learner recovery callback and actual-route contracts

[SC-35–SC-36](TEST-SCENARIOS.md) cover original request bytes through later attempts/feedback/policies, repeated delivery uncertainty, actual access loss/restoration and actor continuity, partial 200/denied-history privacy, valid receipts versus failed refresh, same-frame guards and stale learning responses. [The integration suite](../../tests/integration/learner-recovery-ui-contract.mjs) runs actual opaque sessions/routes through production Drizzle D1 over fresh SQLite; React hooks/elements are substituted. It is callback-state evidence, not a mounted renderer/browser/UAT suite. No isolated implementation-mirroring unit test is invented, no external call occurs and designed cases remain unrun.
