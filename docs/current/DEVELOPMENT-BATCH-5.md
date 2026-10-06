# Reviewed assessment results and preserved evidence

Fifth implementation batch in the [four-hour continuation](FOUR-HOUR-DEVELOPMENT.md), based on published attendance commit `f31288162e1f55ec28ad710ab990ec56ac37ce3c`. [Actual execution](DEVELOPMENT-BATCH-5-EXECUTION.json) records the final stable source checks; publication is recorded in the continuation log. This is a draft implementation boundary, not business acceptance.

## Coherent loaded records

The separate staff-only result editor loads assessment metadata, current class authority, distinct active same-school pupils and actual saved results in one SQL snapshot. A saved zero remains a result; unrecorded pupils have no default score. Exact totals and display limits are explicit. Current roster ambiguity and malformed maxima block review. Historical-only duplicates are preserved and do not prevent editing unrelated active pupils.

Raw score storage types remain visible. Repairable text or fractional legacy scores require an explicit whole-number replacement. Opaque, unsafe-integer and nonfinite evidence is read-only; exact strings prevent precision loss or silent JSON-null substitution. No legacy row is deleted or automatically normalized. School-supplied grades and educator feedback retain null, empty and unchanged oversized values.

## Explicit reviewed changes

Changed pupils require a review reason, confirmation, a unique request identifier, exact original result snapshots and the loaded assessment metadata. One guarded receipt insertion and its triggers recheck current authority, roster, maximum, metadata and every original value, then save the complete batch and immutable before/after evidence atomically. A stale feedback-only edit cannot silently restore an older score or grade.

Exact committed retries return the original receipt without reapplying marks after a later legacy edit. History has exact totals and explicit caps, no backfill, and current staff/class/all-original-pupil school checks. Conflicts preserve intended fields and offer comparison/reload. Uncertain replies retain the original payload/UUID. Known access denial hides current and historical private evidence; a pending retry needs a newly authorized reload.

The existing result replacement API and original grade/calendar validation remain available with their established semantics. No grade computation, norms, penalties, learner proficiency or family result publication is introduced.

## Calendar rendering and verification

The assessment list displays literal stored calendar days without browser time-zone conversion. Invalid legacy dates remain visible as review evidence instead of throwing a formatting error. The detail screen preserves the raw original assessment date. The list displays a numeric maximum only when it is a nonnegative safe integer; otherwise it explicitly requires review, avoiding rounded unsafe integers or blank nonfinite values. These displays do not define school-day eligibility or modify historical dates.

Focused and independent synthetic session/SQLite checks use the production D1 query mapping and cover full record/metadata conflicts, actual query-time access changes, concurrent UUID arbitration, atomic rollback and immutable evidence. Populated encrypted recovery verifies saved zero/null/empty values and review history after restoration. Built local API, browser, automated accessibility and fictional wireframe evidence remain separate from formal educator/UAT and hosted acceptance. See the [assessment review](ASSESSMENT-REVIEW.md) and canonical specification pack for diagnostics and limits.

Canonical v2.6 contains 39 tables/325 fields, 56 route files/91 handlers and 229 designed cases across 34 scenarios. Cases remain unrun and approvals remain false. Fresh build and TypeScript pass. Final guarded regression passes 14,554 checks across 37 meaningful suites plus three static steps (119 unit, 14,271 integration, 164 smoke). Final local API checks pass 249 across 102 requests; browser checks pass 41. Independent contracts and encrypted recovery are included in the executable total; offline wireframes pass 37. Accessibility results are recorded separately in the actual execution evidence. Live providers, real records/messages, paid AI, main merge and hosted deployment remain pending.
