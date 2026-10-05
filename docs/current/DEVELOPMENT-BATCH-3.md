# Current role dashboards and truthful recorded evidence

Third implementation batch in the [four-hour continuation](FOUR-HOUR-DEVELOPMENT.md), based on second-batch commit `88205cdce71840066d37ebc3a08d317cea7e3f37`. Final execution evidence and publication are recorded separately; this boundary does not constitute business acceptance.

## One current-authority snapshot

Each role dashboard uses one database SELECT for its current actor, school, relationships, lists, totals and snapshot time. A disabled, moved or role-changed actor produces a denied `null`, rather than misleading authorized zero totals. School and class counts, explicit student/guardian profile links, active enrolments and published reports use the existing authorization policy at that statement's snapshot. The principal carries no session hash; session-only revocation after principal resolution is outside this contract.

Administrator counts include only their school and identify enabled teachers with trusted mappings. Teacher lists disclose exact totals and explicit limits: 100 classes and 100 assessments. Family dashboards disclose up to 50 authorized profiles and 20 published reports per profile, with exact totals and truncation flags. Compact projections omit private account identity, staff report summaries, drafts and individual assessment feedback.

## Recorded evidence, without inferred policy

Teacher assessment cards distinguish no current roster, missing saved results, recorded results for the current roster, and evidence needing review. A saved zero counts as a recorded result. Multiple retained enrolment/result records, invalid scores and invalid maxima are explicitly flagged; no legacy record is merged or deleted. Coverage uses the current roster and does not imply educator approval, grade calculation or learner proficiency.

Family attendance shows observed status counts, recorded-row totals, valid date coverage and invalid-date counts. No attendance percentage, expected-school-day denominator or absent-by-default inference is introduced. No recorded rows and excused-only records have distinct states. Published report grades are labeled as school supplied.

## Accessible role screens and navigation

The four dashboards render their verified role and school, clear empty states and snapshot time. Native links open class, result, attendance and report workflows. Bounded lists disclose omitted items and offer the relevant full list. Wrapping cards and headings support narrow screens. Real browser and automated accessibility evidence remain separate from formal acceptance.

## Verification and release boundary

Focused service and independent access checks use real synthetic SQLite sessions and the production D1 prepared-query mapping. Legacy duplicate fixtures are created before the relevant migration, then all final guards are installed before the Worker is exercised. Isolated local fixture export preserves foreign-key parent ordering; no production guard is disabled for browser testing.

Final fresh build and guarded regression passed 4,168 checks across 30 meaningful suites, with 31 real-browser dashboard checks and 62 automated resting-page accessibility samples. Prior served checks passed 172/146/104; the 12-screen offline prototype passed 37 checks. See the [actual execution record](DEVELOPMENT-BATCH-3-EXECUTION.json) for exact timestamps, findings and limits. Canonical v2.4 contains 181 unrun cases across 28 scenarios, 35 tables/294 fields and 51 routes/84 handlers. No schema or API endpoint is added. Historical execution records remain unchanged. Live identity/reading providers, real learner data, paid AI, external messages, main merge and hosted deployment remain pending.
