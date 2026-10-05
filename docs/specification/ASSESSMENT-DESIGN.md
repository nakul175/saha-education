# Reviewed assessment result design

Version 2.9 draft, 6 October 2026. Trace: BR-01, BR-02, BR-10–BR-12; FR-03, FR-08, FR-10, FR-26; NFR-01–NFR-09. Read [BRD](BRD.md), [FSD](FSD.md), [HLD](HLD.md) and [LLD](LLD.md) in sequence. All approvals remain false; [SC-32–SC-34 cases](TEST-CASES.json) remain not-run-for-this-specification.

The v2.9 candidate is prepared on `feat/specification-delivery` from published parent `053ab13af9dcd6fbb81e436769aefa6e29f00a20`. `source_commit` identifies that parent, not the containing implementation/documentation commit. The [eight-hour development record](../current/EIGHT-HOUR-DEVELOPMENT.md) and root-maintained dated execution/release evidence identify actual frozen source, publication, merge and deployment independently. The v2.0 baseline `5488bc0d20412a3d4be0c031c99c259c56834d5e` and published v2.1–v2.8 history remain retained. All requirements are unapproved and all designed cases are `not-run-for-this-specification`.

## Scope and preserved compatibility

The [review service](../../lib/education/assessment-reviews.ts) supplies a staff-only coherent active-roster snapshot, reviewed dirty-only result save and immutable history. [Migration 0014](../../drizzle/0014_assessment_reviews.sql) adds `assessment_reviews` (10 fields) and `assessment_review_entries` (6 fields). The assessment slice added no further fields after v2.6; current v2.9 total is 41 tables/338 fields and 60 API route files/96 handlers. No new grade, norm, result-publication, school-calendar or historical entitlement policy is added; FR-10/FR-26 remain partial.

The original [result service](../../lib/education/assessments.ts) and `/api/assessments/{id}/results` retain accepted replacement semantics, including concurrent 200 responses and clearing grade/feedback when omitted. Existing pair guards and every confirmed result remain. The reviewed editor offers a distinct conflict/retry contract; legacy writes do not gain invented review receipts or backfilled history. A last-writer legacy result is compatibility behavior, not a fixed CAS contract.

The sanitized [diagnostic and remediation boundary](../current/ASSESSMENT-REVIEW.md) explains the observed editor risks and the subsequent unsafe-integer finding. Diagnostic unsafe outcomes are separate from passing regression evidence. Actual integrated counts/timestamps/build/Worker/browser/recovery results are maintained by the integrating agent in dated evidence.

## Exact derived interfaces

Persisted snake_case fields are in the [data dictionary](DATA-DICTIONARY.md). Public camelCase DTOs are derived views:

| Type | Exact fields | Meaning |
|---|---|---|
| `AssessmentMetadataSnapshot` | `id`, `classId`, `title`, `kind`, `maxScore:number|string|null`, `date`, `createdAt`, `updatedAt`, `maxScoreType` | Full exact original metadata for CAS; SQLite type is integer/real/text/blob/null |
| `AssessmentResultSnapshot` | `id`, `assessmentId`, `studentId`, `score:number|string|null`, `grade:string|null`, `feedback:string|null`, `createdAt`, `updatedAt`, `scoreType` | Full exact original or committed result evidence, including storage type |
| `AssessmentResultEditorRow` | `student:{id,firstName,lastName,admissionNumber}`, `record`, `records`, `resultRows`, `recordsTruncated`, `enrolmentRows`, `needsReview`, `invalidResult` | Current active same-school pupil; record is unique saved tuple or null; records retains bounded ambiguity evidence |
| `AssessmentResultEditorSnapshot` | `assessment`, `class:{id,name}`, `asOf`, `invalidMaximum`, `invalidDate`, `canReview`, `roster:{items,total,limit:100,truncated}` | One current-scoped metadata/class/roster/result statement |
| `AssessmentResultReviewInput` | `clientRequestId`, `reviewConfirmed:true`, `reason`, `expectedAssessment`, `entries:[{studentId,score,grade,feedback,expectedRecord}]` | Strict dirty-only request with mandatory explicit text and full original result or null absence |
| `AssessmentResultReview` | `id`, `assessmentId`, `classId`, `assessment`, `reviewedBy`, `reason`, `createdAt`, `changes:[{studentId,beforeRecord,afterRecord}]` | Immutable original metadata and attributable before/after decisions; no current-state replacement claim |
| `AssessmentResultReviewResult` | `review`, `replayed:boolean` | New committed review or exact original replay that never reapplies later results |
| `AssessmentResultReviewHistory` | `items`, `total`, `limit:100`, `truncated` | Exact currently visible inventory plus bounded newest-first immutable reviews |

| Endpoint | Scope and input | Success |
|---|---|---|
| GET `/api/assessments/{id}/result-editor` | Current-school administrator or currently assigned teacher; no required date parameter | 200 current snapshot |
| POST same endpoint | Strict review input; authenticated current staff and allowed matching origin | 201 new `{review,replayed:false}`; 200 exact original `{review,replayed:true}` |
| GET `/api/assessments/{id}/result-editor/history` | Same current staff class scope; optional `studentId` and whole original pupil school scope | 200 exact-total/latest-100 history |

Missing session is 401. Families are denied editor/review/history with 403 before body parsing. Initial unavailable assessment/class is 404; post-preflight new-write/retry conflict is 409; committed evidence readback lost to current scope is 404 without undoing the commit. The common JSON helper limits the whole POST to 128 KiB; malformed/unknown/missing/invalid strict fields are 400. Unrelated internal failures return controlled 500. Responses are no-store. The common query helper reads the first optional value and treats empty as absent; strict unknown/duplicate-filter rejection is not claimed.

## Validation and raw evidence

IDs are nonempty text up to 120 UTF-16 units; clientRequestId must be UUID. Metadata title/kind/date/timestamps and raw numeric strings have 100000-unit schema bounds. Expected result includes every identity/reference/value/timestamp/type field; caller cannot select the authenticated reviewer or server update time.

Entries contain 1–100 distinct pupil IDs. Desired score is an explicit nonnegative safe whole number within the current valid maximum, including legitimate zero. Grade and feedback are mandatory explicit string or null; empty string remains distinct from null. Only actual changed tuples may be reviewed; a no-op member rejects the whole envelope with 400. No default score, calculated grade, interpretation or learner norm exists.

Reason is trimmed 10–500 Unicode code points with controls rejected. New/replacement grade or feedback is at most 2000 code points. An exactly unchanged longer legacy value may survive a score/other-field correction when the full prior tuple matches. Desired and expected text retain a 100000 UTF-16-unit schema/transport bound and the entire request must fit 128 KiB. The unchanged exception cannot authorize a changed oversized replacement.

A valid maximum has SQLite integer type and lies in 0–Number.MAX_SAFE_INTEGER. Malformed, negative, fractional, unsafe or opaque maximum is disclosed with invalidMaximum and blocks new review. Maximum zero permits an explicitly recorded zero. Safe serializable single legacy invalid scores, including REAL/TEXT/negative evidence, may be deliberately repaired with their exact original value/type retained. This is technical record correction, not school scoring policy.

BLOB numeric values project null plus their original blob type and block review. INTEGER values outside ±Number.MAX_SAFE_INTEGER project exact CAST text, retaining integer type; nonfinite REAL values project exact `Inf`/`-Inf` text with real type. They mark affected active evidence needsReview and block whole-roster review, including when that pupil is not dirty. Actual mutation triggers repeat the guard. These gates prevent rounded JSON CAS and false HTTP null values; the workflow does not automatically normalize or delete such evidence.

`invalidDate` checks exact real YYYY-MM-DD length/pattern/calendar roundtrip. Raw stored dates remain literal; malformed legacy dates show a review warning without crashing or shifting the date through midnight UTC. This disclosure does not block otherwise authorized review or define future/past/term/weekday eligibility. The legacy creation schema still accepts nonempty date text; no new creation policy is silently imposed.

## Current coherent snapshot and limits

`getAssessmentResultEditor` executes one SELECT FROM assessments with actual `academicClassWrite`, anchoring current enabled mapped actor ID/role/school and current class assignment. Class name, full current metadata, distinct active same-school pupil names/admission, saved results and SQL UTC asOf all share that statement snapshot. There is no assembled old roster plus later empty result feed.

Roster order is firstName/lastName/ID ascending. Items cap at 100 with exact total/truncated. Every whole enrolment pair, including inactive duplicate rows, contributes to enrolmentRows for each current active pupil. Result count is exact for the assessment/pupil pair; records previews up to 10 ordered by ID and marks recordsTruncated. Only a unique tuple becomes record; ambiguity never picks an arbitrary winner.

`canReview` requires 1–100 active pupils, valid maximum and no current editable pupil with duplicate whole enrolment/result pair, opaque numeric value or unrepresentable score. Safe serializable invalid single results remain explicitly correctable. Historical results/duplicates outside active editable roster are preserved and do not block an unrelated current review. Withdrawn pupils are not presented as new writable rows. This does not widen legacy historical read rights.

Actual v2.9 actor checks use public ID/role/school plus private verified-object original token/expiry/exact issuer-subject evidence. Original session-only revocation or identity replacement after resolution denies the actual statement; no sensitive evidence is added to public DTOs. Trusted unmarked internal callers retain account-scoped compatibility. Delivered snapshots can become old; Refresh resolves and reads again rather than retracting prior content.

## Atomic full evidence and exact replay

1. Parse strict input; sort entries by binary student-ID comparison. Hash exact actor/school/assessment/full expected metadata/reason/sorted entries. Generate a server result ID only for expected absence.
2. Read current snapshot, then scoped original UUID receipt. Same actor/hash returns original immutable review before new-write canReview/metadata denial, allowing exact replay after later result/metadata edits or same-school withdrawal. Changed actor/payload is 409.
3. New review requires canReview, current metadata equality and desired scores within the valid current maximum. Insert one receipt through actual `academicClassWrite` with ON CONFLICT DO NOTHING; no multi-statement partial save is exposed.
4. BEFORE INSERT checks current enabled mapped staff/class/assessment, every metadata field, whole-roster cap/ambiguity/unrepresentable evidence, distinct dirty members, active same-school membership and every exact prior result field/storage type or absence. JSON numeric compatibility supports deliberate REAL normalization without mistaking it for an unchanged integer result.
5. AFTER INSERT updates existing tuples, inserts absent pairs and derives immutable entries from actual saved rows. Row counts must match all expected existing/new/events. Any stale member, count mismatch or evidence failure aborts the entire statement: every result, receipt and entry rolls back. Existing IDs/creation times remain; update time/reviewer are server/authenticated-derived.
6. Final receipt SELECT repeats current original-class and all original pupil school scope. New outcome is 201, exact prior outcome 200. A committed outcome whose readback loses scope returns 404 while durable data remains. A failed/uncommitted CAS without authorized receipt returns safe 409.

Two different UUIDs from identical prior evidence have one CAS winner. Concurrent identical same actor/UUID/payload produce one new outcome and original replay. Reordered equivalent entries are canonical. Original replay after a legacy replacement or newer metadata never reapplies old score/grade/feedback or overwrites later attribution.

## Immutable history and current access

Both new tables block UPDATE/DELETE with immutable-row triggers. Public reviews expose original full metadata/before/after/reviewer/reason/time, omitting school storage, requestHash, normalized entriesJson and internal reference fields. History uses one current assessment/class-scoped statement, optional pupil membership, latest 100 by createdAt/ID descending, exact visible total and truthful truncation.

Current assessment must remain in the receipt's original class. All original pupils must remain in the actor school; withdrawal alone retains current original staff history/replay. A pupil school transfer hides the entire batch from items/count/replay, including remaining-pupil filters; the immutable evidence stays in storage. Teacher reassignment/revocation removes current class authority. Pupil login unlink does not erase staff history or create family access. No legacy history backfill, result publication or platform-wide retention entitlement is added.

## Editor recovery and accessibility boundary

The staff result page loads the coherent snapshot/history and displays current active eligibility, bounds/raw warnings and before/after evidence. Missing scores stay blank. School-supplied grades are labelled as stored text; no derived grades or percentages appear. Field changes, reason changes or loaded metadata/evidence changes clear review confirmation. Only dirty intended fields survive a CAS comparison reload; newer untouched fields refresh from saved evidence.

A synchronous submission lock prevents duplicate same-frame saves. 409 preserves intended edits and requires current reload/comparison plus fresh explicit review. Lost/network/internal/denied acknowledgement retains the original UUID/payload and locks changes. A 401/403/404 from snapshot, history or save clears unavailable private displayed evidence; an editor 200/history 403 combination cannot leave an editable roster visible. Current authorized reload is required before exact retry. A non-access history failure such as 500/503 is a separate visible history error while current authorized marks remain available. A confirmed immutable receipt remains distinguishable from current results, including failed subsequent refresh. Navigation/browser reload can lose in-memory intent; no persisted client queue is claimed.

Native labelled controls, fieldsets/review checkbox, announced errors/status, full-page anchors, plaintext escaping and wrapping cards support keyboard/mobile procedures. Raw calendar strings remain literal. Names use current authorized roster with stable pupil-ID fallback for preserved history. Browser samples and offline prototypes are coverage context; intentional educator/language/screen-reader acceptance remains unrun.

## Verification and remaining gates

Related files: [primary contract](../../tests/integration/assessment-review-contract.mjs), [independent D1/session/authority contract](../../tests/integration/assessment-review-access-contract.mjs), [legacy academic regression](../../tests/integration/academic-integrity-contract.mjs), [local served procedure](../../tests/worker-assessment-review-check.mjs), [browser procedure](../../tests/worker-assessment-review-ui-check.mjs) and [populated local recovery contract](../../tests/integration/development-recovery-contract.mjs). Root records actual run source/time/environment/counts separately; links do not execute designed TC cases.

Grade/scoring meaning, family result publication, correction governance, historical entitlement, reviewed repair of ambiguous/opaque/unsafe legacy evidence, legacy write bypass, unified audit/export/retention, representative performance/accessibility, hosted recovery/key custody/scheduling, operator support, selected identity/ORF providers and intentional educator UAT remain open. No production readiness, learning efficacy or real-provider activation is inferred.
