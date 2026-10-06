# Eight-hour continuation: sessions, reviewed creation and private demo

This first batch starts from `053ab13af9dcd6fbb81e436769aefa6e29f00a20`. It preserves all earlier application history and the original APIs, while adding token-specific current session checks, separately reviewed registry creation and a runtime-gated isolated synthetic demo. Actual dated evidence is in [the execution record](EIGHT-HOUR-BATCH-1-EXECUTION.json); the authorized release timing is in [the eight-hour log](EIGHT-HOUR-DEVELOPMENT.md).

## Application behavior

A server-issued Principal retains private exact-session evidence. Protected SQL reads and writes verify the particular unexpired session and current issuer/subject, enabled account, school and role. Session evidence never appears in ordinary JSON responses. Existing internal plain-Principal fixtures retain their documented account-only compatibility; HTTP requests still require a real server session.

The new `/api/registry/students` and `/api/registry/guardians` workflows require an explicit review, reason and UUID. Immutable receipts preserve the exact original unlinked profile and timestamps. Exact committed retries return the original receipt without recreating or restoring an older profile; changed requests conflict. Unknown replies keep the exact request in mounted page memory, hide private current views and require fresh confirmation of the original administrator before explicit recovery. Legacy creation APIs retain their existing behavior.

Enrolment/report screens suppress obsolete scoped replies, clear private loaded records after account or access changes, lock duplicate actions synchronously and correlate confirmed saves. Legacy non-idempotent academic outcomes require original-account reload and manual comparison; only existing idempotent publication supports exact retry. Shared login/header controls have native labels, wrapping phone layout and keyboard skip navigation. An attempted sign-out immediately hides private content; an uncertain acknowledgement offers explicit retry or sign-in navigation.

The separate demo creates four fixed fictional role accounts and a bounded school/teaching dataset only in a pristine database. It requires runtime enablement and an installation UUID; school identity configuration, mixed accounts or another school close the demo. The sign-in screen requires fictional-data acknowledgement and cannot submit arbitrary accounts. This does not configure the real school sign-in provider or external oral-reading app.

## Database and operational boundary

Additive migrations0015–0016 introduce registry creation receipts and a demo installation marker:41 tables/338 fields,60 API route files/96 handlers. Original migration SQL and records remain. Migration0015 uses short UUID shape checks because local workerd/D1 rejected the initial longer GLOB pattern; the shortened checks preserve lowercase UUID validation. A complete current Drizzle snapshot makes the next disposable generation a no-op, while historical timestamp-order concerns and actual hosted applied-file history remain explicit release checks.

## Verification and next work

A fresh isolated build and17,783 assertions across46 meaningful suites plus three static checks passed. All39 previous thresholds are retained; seven new suites are recorded, none removed or lowered. The reviewed creation browser rerun passed30 procedures after correcting a closing-dialog readiness boundary. The offline prototype passed37 checks. Actual demo checks now pass26 mounted procedures, with38 report and59 prior-development procedures separately passing. Navigation-readiness fixes capture unchanged server replies before native navigation. The guardian/student demo exposed a real SQLite expression-depth failure; a materialized permitted-class CTE preserves the exact scope in one query and the new51-check portability regression enforces runtime limits. All four final-source demo dashboards now load. [Workerd source](https://github.com/cloudflare/workerd/blob/main/src/workerd/util/sqlite.c%2B%2B#L1327) and [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) document the relevant limits.

Canonical v2.9 contains293 designed cases/42 scenarios. All remain unrun as TC procedures and all business approvals remain false. The next source batch improves the family inbox/class viewer and staff reading-to-practice preparation; those changes are excluded from this isolated candidate. No main merge or hosted success is inferred from local tests or source publication.
