# Authentication and access validation

Date: 5 October 2026. Candidate: working tree on `feat/education-auth-access` immediately before its implementation commit. Synthetic data only; no live provider, remote database or deployment.

| Check | Result | Evidence / limits |
|---|---|---|
| Production Worker build | Passed | `node scripts/run-framework.mjs build`; final build completed, routes generated |
| TypeScript and test catalogue | Passed | `node scripts/test.mjs static unit integration --fast`; fast flag reused the separately verified final build |
| Unit suites | 75 passed, 0 failed | Six suites; auth suite has six grouped cases, including real signed tokens with mocked discovery/token/JWKS |
| Integration suites | 88 passed, 0 failed | 62 isolated route guards plus 26 actual SQLite persistence/service/handler cases |
| Served local Worker | 23 passed, 0 failed | `tests/worker-access-check.mjs` against built workerd and isolated local D1 with injected synthetic sessions |
| Affected ESLint | Passed: 0 errors, 15 warnings | Mostly existing unused imports/hooks; one client navigation warning. Warnings remain for follow-up |
| Documentation and requirements checks | Passed: 20 Markdown files, 20 requirements | Local links/titles/baseline and register/UAT consistency only |
| Whitespace checks | Passed | Before commit |

## Served evidence

Unauthenticated APIs return 401; protected pages redirect to login; old role cookies are rejected. All four role student lists match their scope. Cross-school detail and family draft-report reads return 404. Family unpublished-result reads return 403. Foreign-origin writes return 403. Another recipient's notification cannot be acknowledged. Publication creates exactly one notice for the correct guardian user on retry. Server-side guardian dashboard authentication works. Missing provider configuration returns 503.

The served suite injects previously generated synthetic session cookies to isolate record authorization; it does not claim a live provider login or browser cookie callback. Auth unit groups use actual RSA signing and token verification to exercise PKCE/state/nonce, browser binding/replay, invalid issuer/audience/expiry, unknown account, session revocation/live roles/disabled state and shared rate limiting.

## Environment and reproducibility

Bundled Node v24.19.0; pnpm v11.19.0; package manifest declares pnpm 11.25.0. Installation explicitly disabled automatic package-manager replacement and used the local dependency cache, without dependency install scripts. The project lockfile includes jose 6.2.12. Installed dependencies compiled and ran; exact pinned pnpm 11.25.0 was not separately verified.

For served checks: build first, generate SQL/session fixtures using `tests/support/write-worker-fixture.mjs`, initialize a fresh isolated local D1 state using the generated SQL, start the built Worker with an approved localhost origin, then run the manual Worker suite with SAHA_WORKER_TEST_URL and SAHA_WORKER_SESSION_FIXTURE. Never target a remote database. The checker itself refuses non-local hosts.

One fixture-load attempt failed a foreign-key constraint because rows were emitted in schema order. The writer was corrected to dependency order and the successful check used a new isolated state. That failure touched only a disposable local synthetic database. Initial inherited runner invocation could not find npm; the runner now invokes the framework through its current Node executable. Initial test counts did not parse two suite summaries; both now emit structured counts.

## Outstanding verification

Real provider connection and callback; browser journeys/cookie behavior under approved HTTPS origin; full account provisioning/admin lifecycle; recovery/rollback; deployment wiring; duplicate enrolment/result concurrency constraints; historical enrolment eligibility; accessibility/load; all remaining UAT cases. No sponsor acceptance, merge, production-readiness or deployment claim is made.
