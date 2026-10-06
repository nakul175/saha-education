# Reviewed attendance and current-scoped summaries

Fourth implementation batch in the [four-hour continuation](FOUR-HOUR-DEVELOPMENT.md), based on published third-batch commit `85e85d054afe039d6c633aa215d900b5881eb911`. Execution evidence is recorded separately after final verification. This boundary does not constitute business acceptance.

## Explicit reviewed marks

The separate staff-only attendance editor loads actual saved marks and notes for an exact calendar date and the distinct currently active roster. Unrecorded pupils have no default mark. Retained duplicate enrolments and rosters beyond the 100-pupil review limit block saving and disclose the reason. Existing oversized notes can be preserved unchanged; changing one requires the documented limit.

Reviewed saves require explicit confirmation, an explanation, a unique request identifier and exact original snapshots for each changed pupil. One guarded database statement rechecks current authority, roster and every original mark, then atomically saves the whole batch and immutable before/after evidence. Conflicts preserve the saved data and offer comparison/reload. Exact committed retries return the original receipt without reapplying the marks. Lost or denied replies retain the same pending request identifier; unavailable records are hidden pending a current authorized reload.

The original attendance API retains its established replacement behavior for compatibility. No historical review evidence is invented, and no automatic duplicate repair is performed. The review history remains subject to current staff/class access and same-school eligibility of every pupil in the original batch.

## Honest attendance summaries

The attendance viewer uses one current-authority database snapshot for the selected class, authorized pupils, counts and calendar-date coverage. It preserves the existing historical-access rules. Families see only their currently linked records. Unrecorded rows, unknown legacy statuses, invalid dates and omitted pupils beyond the display limit are explicit. No percentage, school-day denominator, absent-by-default inference or grade/proficiency claim is introduced.

Class changes and failed refreshes clear old records. Obsolete responses cannot replace a newer selection. Calendar dates retain their exact stored day across browser time zones. Native controls, wrapping cards and current-role navigation support narrow screens.

## Verification boundary

Synthetic SQLite/session checks exercise the production D1 query mapping, late access changes, exact comparisons, atomic rollback, concurrent retries, retained legacy records and immutable evidence. Populated encrypted recovery verifies both saved marks and review history after restoration. Built local Worker API and browser procedures are separate from designed cases, formal accessibility, educator/UAT acceptance and hosted release. See the [attendance design](../specification/ATTENDANCE-DESIGN.md) for exact contracts and limits.

The final fresh build and guarded regression passed 8,768 checks across 34 meaningful suites plus three static steps: 94 unit, 8,532 integration and 142 smoke. New local served checks passed 326 across 116 requests; staff editor/viewer browser procedures passed 29/23 and automated resting-page WCAG samples passed 78. Prior served checks passed 172/146/104. Encrypted recovery contributes 226 within integration. See the [actual execution record](DEVELOPMENT-BATCH-4-EXECUTION.json) for timestamps, observations and limits.

Canonical v2.5 contains 37 tables/309 fields, 54 route files/88 handlers and 205 designed cases across 31 scenarios. All designed cases remain unrun and all approvals remain false. Live identity/reading providers, real learner records, paid AI, external messages, main merge and hosted deployment remain pending.
