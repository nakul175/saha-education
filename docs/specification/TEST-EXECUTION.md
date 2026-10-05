# Saha specification validation and execution record

5 October 2026. Scope: specification consistency and existing executable unit/integration suites in the working tree of `docs/platform-specification`, based on application candidate `5488bc0`. Newly designed TC cases remain unrun; no business acceptance or live-provider/deployment evidence is inferred.

This is the preserved v2.0 execution record. The later v2.1 implementation on `feat/specification-delivery` has separate [dated validation](../../VALIDATION.md), [delivery notes](../current/SPECIFICATION-DELIVERY.md) and [sanitized execution evidence](../current/SPECIFICATION-EXECUTION.json). Its new counts and meaningful executed smoke suite do not replace the historical results below or promote the 101 designed case procedures.

## Evidence categories

Specification checks validate IDs, JSON/CSV exports, traceability, migrated schema parity and route/source inventory. Existing executable suites test current application behaviors with synthetic data. Newly designed cases are future execution procedures, even when mapped to an existing suite. Historical served/browser evidence remains in [root validation](../../VALIDATION.md); it is not a new run of this specification’s 101 cases.

## Current validation

| Check | Observed result | Limits |
|---|---|---|
| Documentation/link checks | 43 Markdown files passed at this stage | Offline consistency, not content/acceptance certification |
| Historical requirement audit | 20 historical requirements mapped | Preserves the earlier source baseline |
| New specification check | 12 BR, 35 FR/NFR, 101 cases, 20 tables/156 fields, 31 route files checked | Exact IDs/exports/schema/source consistency; no runtime case status |
| Existing static/unit/integration suites | 482 counted checks passed: 75 unit, 407 integration; 3 static steps passed | Synthetic current implementation only; no live provider/AI/adapter |
| Regression counter baseline | 11 meaningful existing suites recorded; guarded rerun passed, no quarantine exemptions | Assertion counts detect dropped checks, not semantic completeness or learning outcomes |
| Wireframe browser review | 20 prototype checks passed; desktop/mobile inspected; zero network calls | Prototype only, not application behavior or formal accessibility audit |
| Affected-script lint | 0 errors, 1 pre-existing unused-variable warning in test runner | No claim of a clean whole-repository lint run |

The [committed execution summary](EXECUTION-SUMMARY.json) records actual per-suite counts and guard result. Baseline setup command: `node scripts/test.mjs static unit integration --fast --update-baseline --reason 'Initialize reviewed executable education unit/integration count baseline alongside the specification; exclude placeholder smoke and unrun planned cases.'`. Verification: `node scripts/test.mjs static unit integration --fast --guard`. Fast mode reused the independently verified application build from the unchanged source candidate; this stage changed documentation/consistency tooling, not application behavior.

The placeholder `tests/smoke/basic-smoke.mjs` is excluded from meaningful smoke evidence and from the baseline. Hosted smoke, new case procedures, recovery/load/accessibility/UAT and proposed features still need their own configured runs. No case status is changed automatically. No paid provider, real learner record, external message, database migration or deployment was activated by this stage.

## Later v2.2 implementation evidence

The preserved results above describe v2.0. The first tested four-hour continuation batch has a separate [actual execution summary](../current/DEVELOPMENT-BATCH-1-EXECUTION.json) and [dated validation](../../VALIDATION.md): 2,302 guarded executable checks, 172 new served checks and 57 new browser checks, plus rerun prior journeys and separate offline prototype evidence. The populated disposable encrypted local recovery checks are included in the executable total. The v2.2 design pack now contains 133 procedures across 22 scenarios; every one remains unrun for this specification, and all requirements remain unapproved. Existing-suite evidence is not execution or acceptance of those procedures. Newly reproduced original-domain defects and their next-batch remediation are identified in the [remaining-domain review](../current/REMAINING-DOMAIN-REVIEW.md).

## Later v2.3 implementation evidence

The second continuation batch has separate [dated validation](../../VALIDATION.md) and [actual execution evidence](../current/DEVELOPMENT-BATCH-2-EXECUTION.json): 3,619 guarded executable checks, 104 new served checks, 36 report/notice and 26 structure browser checks, and 54 automated resting-page accessibility samples. Prior journeys and the offline prototype were rerun separately. The populated encrypted local recovery contains actual publication receipt/notice evidence and is included in integration. All 157 designed procedures across 25 scenarios remain unrun for this specification; no business approval, formal accessibility certification, provider callback or hosted deployment follows from these results. Earlier execution records above remain historical.

## Eight-hour first-batch evidence

The preserved sections above remain historical. Canonical v2.9 has293 designed cases/42 scenarios, all unrun as TC procedures and all approvalsfalse. The separate [eight-hour execution](../current/EIGHT-HOUR-BATCH-1-EXECUTION.json) records the actual fresh local build,17,783 executable assertions/46 suites, retained prior regression thresholds,30 reviewed-registry browser procedures and37 offline prototype checks. Actual demo26/report38/development59 mounted procedures pass separately; hosted verification remains pending; no acceptance case is promoted by mapped-suite success.

## Eight-hour second-batch evidence

The[separate actual v2.10 execution](../current/EIGHT-HOUR-BATCH-2-EXECUTION.json) records fresh isolated build,18,765 assertions49 suites and26 demo/36 family/32 planner/38 prerequisite/39 report-inbox mounted procedures. Historical records and failed-attempt boundaries remain. All329 TC cases/46 scenarios remain unrun and all approvalsfalse; mapped suite/browser success is not acceptance. The final corrected native return-link/four-role review passes20 checks/51 menus/two staff backlinks; hosting and final-hour merge are pending.

## Eight-hour third-batch evidence

The[separate actual v2.11 execution](../current/EIGHT-HOUR-BATCH-3-EXECUTION.json) records fresh isolated build,19,187 assertions50 suites and36 mounted profile/index procedures. Previous49 minima and329 case objects remain; all349 TC cases/49 scenarios are unrun and approvalsfalse. Original failed manual attempts are excluded and their transport-only repair documented. Public association readback omits primary status; actual SQLite contract provides that evidence. Private hosted version1 failed with incomplete SQL input and no URL; source publication/local evidence do not establish a hosted release.
