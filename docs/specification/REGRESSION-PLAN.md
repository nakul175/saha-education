# Risk-based regression plan

Version 2.0 draft, 5 October 2026. Source candidate: `5488bc0d20412a3d4be0c031c99c259c56834d5e`. Case design only; no per-case execution or business acceptance is recorded for this specification. Existing-suite verification is recorded separately. Business requirements and approval state are defined in [BRD](BRD.md) and [requirements register](requirements.json).

## Historical reference, not acceptance baseline

[VALIDATION](../../VALIDATION.md) records the earlier workspace's 482 counted checks (75 unit, 407 integration), 23 served resource scenarios and 14 browser checks. Those different counts reflect suite assertions/scenarios/browser observations, not a one-to-one mapping to this case pack. Those historical records do not constitute execution of the designed case pack. Preserve known scope and reasons for count changes; never treat a count increase as improvement or an unchanged count as absence of regression.

`node scripts/test.mjs --check-catalogue` checks classification; `--list --json` inventories suites. `regression`/`full` aliases and guard baseline support exist in the runner, but absent/placeholder layers or inherited health references must not become education acceptance evidence. The [initial assertion-count baseline](../../tests/regression-baseline.json) was initialized on 5 October 2026 from an actual `node scripts/test.mjs static unit integration --fast --update-baseline` run: 482 counted assertions (75 unit, 407 integration), eleven meaningful suites and three static steps. It covers only those eleven unit/integration suites; vacuous smoke, manual served/browser checks and future specification cases are excluded. `tests/quarantine.json` remains absent. The guarded recheck passed on 5 October 2026: eleven baselined suites, zero quarantined suites, 482 assertions (75 unit, 407 integration) and three static steps. [Execution record](TEST-EXECUTION.md) and [machine-readable summary](EXECUTION-SUMMARY.json) record that existing-suite run; the count guard is not semantic completeness or business acceptance. The runner explicitly fails guarded execution with no baseline; test that failure using a disposable repository copy without the baseline, rather than treating the current repository as baseline-free. The count guard checks minimum counts and missing suites, not semantic completeness or business acceptance. Do not automatically update a baseline to conceal missing checks. Review the actual catalogue and available suites before scheduling tiers.

## Tiers and triggers

| Tier | Trigger | Required selection | Exit |
|---|---|---|---|
| R0: document consistency | Requirement/design/case/export changes only | Canonical IDs, links, case JSON/CSV and traceability review | Consistent draft exports; no application pass claim |
| R1: deterministic changed area | Validator, normalizer, identity helper or UI form change | Applicable unit/integration suite plus negative/boundary case subset | Actual changed-rule and persistence evidence |
| R2: authority/data integrity | Session/scope/schema/revision/review/assignment/batch change | All current auth/API/resource/reading/launch contracts; targeted race/fault cases; fresh build | No security/integrity regression; unresolved planned critical gaps explicit |
| R3: served candidate | Runtime/config/router/client or publish/print change | R2 plus local served access/literacy/resource and actual browser workflows | Runtime cookies/scope/version/private-field/navigation verified |
| R4: pilot/release | Provider/environment/backup/adapter/AI/curriculum addition or release decision | Applicable R3 plus real synthetic provider, approved NFR drills and named UAT | Documented owners/targets/defects/business decision; blocked dependencies are not passes |

## Impact selection

Identity changes require forged/expired/disabled/claim/replay/origin cases and every protected page/API family. Role/profile/enrolment changes require linked/unrelated/cross-school and active/historical cases. Resource schema changes require private-field stripping in raw API, author conflicts, immutable review metadata, pinned assignment and exact print versions. Adapter/AI changes add failure/privacy/budget/replay and educator review. Recovery migrations require old unmapped data fail-closed behavior and restored pinned/versioned content.

The observed vinext beta client navigation failure is a specific regression risk: verify resource/learning/print links use usable full-page navigation and that the detail route actually requests data. A successful static build cannot prove navigation. Browser tests must also verify conflict text preserves user edits, print defaults exclude staff fields, and learner DOM never contains hidden answer markers.

## Failure and baseline control

Record first failure and actual fix/retest rather than overwrite it with final success. Classify implementation defect, harness defect, fixture failure or unresolved policy separately. Quarantine only with a named owner, reason, scope and expiry; critical unauthorized access/data loss cannot be accepted through count-baseline edits. Restore disposable state before retest where necessary. Any semantic requirement change updates BRD→FSD→HLD→LLD and case/traceability before release review.
