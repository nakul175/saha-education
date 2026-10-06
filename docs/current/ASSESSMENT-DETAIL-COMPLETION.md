# Assessment detail completion (6 October 2026)

This record completes the work preserved in [the WIP record](ASSESSMENT-DETAIL-WIP.md). That record is retained unchanged as the historical hand-off; where it says the work is unfinished, this record supersedes it.

## What was done

- The focused WIP commit `e1283e78d7d19f6637c0821304e5a4a5cbd438d6` was cherry-picked onto current `main` (`0dc55a4`) rather than replacing main with the older branch tree. The page `app/assessments/[id]/page.tsx` is byte-for-byte the preserved candidate; no application source was changed in this continuation.
- The preserved callback suite `tests/integration/assessment-detail-ui-contract.mjs` keeps all 1,476 checks, 101 scenarios and 1,538 synthetic requests. Only its fixed-turn wait was replaced by the quiescence helper described in [VALIDATION](../../VALIDATION.md); it is now registered in `tests/regression-baseline.json` at 1,476.
- The retained mounted procedure `tests/worker-assessment-review-ui-check.mjs` was adapted to the new page. Six checks that asserted the old notices now assert the recovery behaviour (legacy-feedback CAS, comparison reload, stale metadata, rejected delivery, lost acknowledgement, failed refresh). Every earlier meaningful positive check, raw-value, CAS, replay and history assertion was kept. Exact original POST bytes and UUID are asserted from the browser request.
- Two checks are new. Explicit discard of an unconfirmed started save sends **zero POST requests**, shows the exact notice (it does not cancel or confirm the started save) and does not erase saved history. Pending recovery is bound to the original actor: a different account never sees the original request, reason, learner values or the Retry and Discard controls, and the original actor sees them again only after a fresh current read.
- The procedure's output directory is configurable with `SAHA_TEST_OUTPUT_DIR` (default unchanged).

## Evidence

All runs used a fresh `node scripts/run-framework.mjs build`, synthetic data only, an isolated local Worker on 127.0.0.1 and local D1.

| Check | Result |
| --- | --- |
| Guarded static/unit/integration/smoke run, Node 24.19.0 and Node 22.22.0 | 53 suites, 22,428 assertions (119 unit, 22,132 integration, 177 smoke), all baselined minima met, no failures or exemptions |
| Mounted procedure `worker-assessment-review-ui-check` (Chromium) | 43 passed, 0 failed, 0 external requests, 0 page errors; repeated twice on fresh state at the branch tip |
| Mounted API check `worker-assessment-review-check` | 249 passed, 102 requests, 0 external |
| Documentation, requirements and specification checks | all exit 0 (75 Markdown files; 20 draft requirements; 41 tables/338 fields, 12 BR, 35 FR/NFR, 371 designed cases, 60 route files) |
| ESLint on changed test files; `tsc --noEmit` | clean |

Mutation checks show the new assertions can fail. Each mutant was built into the Worker and run against the mounted procedure, then the page was restored from a saved copy. Mutant 1 replaced the discard notice's "This does not cancel or confirm a started save." with "The started save was cancelled."; the mounted procedure detected it. Mutant 2 widened the actor scope to `originalScope = Boolean(authorized && pendingView)`, so a different account would see the original actor's pending request; it first survived because the actor-binding check read generic text during the other account's loading state. The check was strengthened to wait for the other account's header, the end of loading and three rows, after which mutant 2 failed (19 passed, 1 failed) and the restored page passed 43/43.

## Limits

- The mounted procedure is one browser (local Chromium), one viewport family and fictional data. It is not cross-browser, assistive-technology, performance, accessibility acceptance or educator UAT evidence.
- Callback suites substitute React hooks and elements and are not mounted evidence.
- The 371 designed cases remain unrun and no business approval is recorded. This work was **not** linked to or promoted in the designed test pack; TC-225/TC-226 still describe educator-side outcomes that need their own execution.
- A started save can still persist after the page is left; pending state is held in the page only and is not durable.
- This does not touch the hosted SQL migration blocker in [HOSTED-DEPLOYMENT-FAILURE](HOSTED-DEPLOYMENT-FAILURE.md).

Machine-readable record: [ASSESSMENT-DETAIL-COMPLETION-EXECUTION.json](ASSESSMENT-DETAIL-COMPLETION-EXECUTION.json).
