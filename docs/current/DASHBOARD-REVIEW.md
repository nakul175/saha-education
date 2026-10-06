# Role-dashboard diagnostic and remediation

The third continuation batch began from `88205cdce71840066d37ebc3a08d317cea7e3f37`. A synthetic service/server-component diagnostic reproduced eight unsafe or misleading outcomes with 21 diagnostic assertions and zero external calls. Those assertions establish findings and are excluded from passing regression totals.

| Original finding | Remediation |
|---|---|
| Complete assessment listed under “Needing Results” | Explicit coverage state and current-roster missing/recorded counts |
| No attendance displayed as 0.0% | Distinct no-recorded-data state and raw observed counts |
| Excused-only attendance displayed as 0.0% without a denominator | Excused count and recorded-date coverage; no inferred percentage |
| Administrator teacher count survives late account disablement | Current actor predicate in the same snapshot SELECT |
| Administrator teacher count survives late school move | Same current role/school predicate; denied authority is `null` |
| Guardian's previously loaded child survives unlink during dependent queries | Profiles, attendance and published reports share one current-scoped SELECT |
| Student's previously loaded profile survives unlink before report read | Same coherent explicit-profile snapshot |
| Teacher's previously loaded class survives reassignment before assessment read | Classes and assessments share the same assigned-class snapshot |

Focused fixed-behavior tests contain 135 service/D1 mapping assertions. Independent checks contain 414 assertions across 56 actual-session SQLite scenarios. They cover late actor/reference changes, denied authority versus genuine zero totals, private draft/identity exclusion, exact totals versus list caps, saved zero scores and retained ambiguous/invalid academic evidence. Legacy duplicate rows are inserted before migration 0009; all final guards are installed before assertions. No original record is merged or removed.

See [batch scope](DEVELOPMENT-BATCH-3.md), [dashboard contract](../specification/DASHBOARD-DESIGN.md) and [validation](../../VALIDATION.md) for final browser/build evidence and limits. The compact principal carries no session hash, so this work does not promise session-only revocation after principal resolution. Designed case procedures, educational policy, educator/UAT acceptance and hosted release remain separate.
