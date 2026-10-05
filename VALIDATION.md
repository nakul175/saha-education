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

## Literacy extension boundary

Local contract validation covers staff-only external launch, exact URL configuration, no outbound data forwarding and manually reviewed numeric reading checks. Launch remains disabled pending destination confirmation. Real external app availability, shared sign-in, automatic export ingestion and literacy efficacy have not been validated. See [external reading](docs/current/EXTERNAL-READING.md).

Literacy candidate checks on 5 October 2026: fresh application build, TypeScript and affected-file lint passed; catalogue, documentation and requirements audit passed. The combined static/unit/integration runner passed 323 counted assertions (75 unit, 248 integration, including 70 external-app and 84 reading-check assertions). Live provider login and external result synchronization remain untested.

Fresh locally served workerd/D1 validation passed 23/23 literacy scenarios with isolated synthetic sessions: persistence/history/metrics, matching retries/conflicts, school and assignment boundaries, family/anonymous denial and disabled external launch. An initial transient anonymous503 during concurrent build/load resolved to401 in isolation; the full final run passed. Server stopped. Existing authentication served checks had passed separately in the prior candidate; neither run authenticates against a live provider.

## Confirmed product reference

The sponsor confirmed AmplifiU on 5 October 2026. The teacher workspace plan replaces the earlier conditional Amplify Reading comparison. This documentation revision adds no executable feature or AI provider activation; curriculum/resource drafting, review and assignment are planned next.

## Teacher workspace candidate

5 October 2026, `feat/teacher-resource-workspace`. New manual authoring/review/assignment workflow; no AI service activation or deployment. Fresh build, TypeScript and affected-file lint passed. Static/unit/integration runner passed 482 counted checks (75 unit, 407 integration), including 147 actual-session resource checks and concurrent create/revision/approval scenarios. Documentation/requirements and catalogue checks passed.

The SQLite test adapter now preserves raw array columns rather than object values, matching D1 and avoiding duplicate joined-column loss. The corrected harness exposed no application leak: private notes/keys are explicitly removed from assignment responses. Existing suites passed with this corrected adapter.

The browser caught a vinext beta client-link transition error on opening resource detail. The new workspace and learner pages use full-page anchors, and affected shell state/navigation lint issues were corrected. Initial UI checks also assumed a client status element where the server intentionally renders a staff-only message; the check was corrected to inspect the actual access-denial view. These are recorded as discovered issues, not hidden successful first runs.

Limits: synthetic sessions are supplied to isolated local workerd/D1; real provider callback and hosted deployment remain unverified. Manual templates do not establish curriculum/content accuracy, learning efficacy or teacher usability acceptance. Self-review is permitted; independent approval and guardian publication remain policy decisions. No student submission/grading, AI drafting, external Classroom adapter or file-format export was tested or implemented.

Final built application verification passed 23/23 served resource scenarios and 14/14 real-browser checks, including dashboard links, create/review/assign/print, pinned approved content after revision and learner denial/privacy. All data and sessions were synthetic. The local server was stopped after verification.

## Requirements, design and parallel test documentation

5 October 2026, `docs/platform-specification`, application source `5488bc0`. The BRD was written first, followed by FSD, HLD and LLD; QA/data/contracts were developed in parallel against one canonical register. This stage changes documentation, consistency tooling and the test-count baseline; application behavior is unchanged.

| Check | Observed result | Limits |
|---|---|---|
| Documentation and historical audit | 43 Markdown files and 20 historical requirements passed | Offline links/source/register consistency |
| New specification consistency | 12 BR, 35 FR/NFR, 101 cases; 20 tables/156 fields; 31 routes/55 handlers | CSV/JSON/trace parity, actual migrated columns and exported route methods checked |
| Existing static/unit/integration | 482 checks passed: 75 unit, 407 integration; three static steps | Synthetic fixtures; fast mode reused the previously verified unchanged application build |
| Regression baseline and guarded recheck | Eleven meaningful unit/integration suites; guard passed, zero quarantine exemptions | Counts detect lost assertions, not semantic completeness or business acceptance |
| Clickable wireframe review | Twenty checks passed; desktop/mobile inspected, zero network calls | Isolated fictional prototype; no formal accessibility certification |
| Affected-script lint | Zero errors, one pre-existing unused-variable warning | Limited to specification checker and test runner |

See the [execution record](docs/specification/TEST-EXECUTION.md) and [sanitized machine-readable evidence](docs/specification/EXECUTION-SUMMARY.json). All 101 designed cases remain `not-run-for-this-specification`; existing-suite success does not execute those procedures. The vacuous smoke placeholder is excluded from the baseline and meaningful evidence. No live identity/ORF/AI provider, real learner record, external message, database migration, acceptance approval or hosted deployment occurred in this stage.

## Specification implementation candidate

5 October 2026, `feat/specification-delivery`, based on documentation parent `d53adcf` and historical application source `5488bc0`. This slice implements reviewed account administration, immutable manual curriculum references/source-bound draft copies, learner text attempts/reviewed formative feedback, and append-only reading corrections/comparable history. Ten workstreams were delivered in groups within the four-concurrent-agent session limit. New additive migrations were exercised only against disposable synthetic local databases.

| Check | Observed result | Limits |
|---|---|---|
| Fresh final-source production Worker build | Passed | `node scripts/run-framework.mjs build`; no hosted deployment |
| Static checks | Three steps passed | Catalogue, TypeScript and specification consistency |
| Unit checks | 94 passed, zero failed/skipped | Eight suites, including streamed JSON limits and catalogue context |
| Integration checks | 1,182 passed, zero failed/skipped | Eleven suites; actual synthetic sessions, route handlers and SQLite/D1-compatible adapter |
| Executed smoke checks | 56 passed, zero failed/skipped | Real route/migration/session/origin checks replace the vacuous placeholder |
| Final combined guarded run | 1,332 checks passed across 20 suites | `node scripts/test.mjs static unit integration smoke --fast --guard`; reused the separately verified fresh build |
| Regression baseline | Twenty suites checked, zero quarantine exemptions | Nine suites added and two thresholds raised from actual counts; zero thresholds lowered or removed |
| Affected-file lint | 53 files; zero errors, one pre-existing warning | Unused `interrupted` variable in the inherited test runner |
| Documentation, historical audit and whitespace | Passed | 44 Markdown files, 20 historical requirements; 28 tables/225 fields, 44 API routes/74 handlers, 12 BR/35 FR+NFR and 101 designed cases |
| Built local Worker checks | 146 passed, zero failed/skipped | Isolated local workerd/D1 and injected synthetic sessions; account/source/attempt/review/correction workflows and scope denial |
| Real-browser workflows | 38 passed, zero failed/skipped | Native forms, same-UUID lost-response recovery, exact feedback history, review resets, staff/family denial and mobile labels/width; zero external requests or unhandled page errors |
| Visual review | Desktop/mobile captures inspected | Synthetic application screens; no formal usability/accessibility acceptance |

Security review first reproduced stale-authority defects in original resource creation and account-event retries. The fixes recheck enabled actor, trusted identity, role, school and parent record authority in the actual mutation/evidence SQL. Targeted tests cover authority changes between earlier validation and later reads/writes, atomic status/session/event decisions, concurrent requests, reviewed immutable history and rollback. Original resource checks still pass. The resource library now uses one scoped latest-version query; this does not establish representative latency/capacity targets.

Browser preparation found review confirmation surviving changed account or reading inputs; confirmation now clears when those reviewed values change. The previous request-body suite contained commented assertions; it now actually exercises native FormData and invalid parsing. The synthetic fixture writer emits tables before dependent indexes/views/triggers. All observed fixes are recorded as findings, rather than successful first runs.

The first served run timed out before its first authenticated request; isolated session probes and the complete rerun succeeded without an application change. The helper now drains denial/redirect response bodies to release connections, while retaining its ten-second request cap. Initial browser runs exposed test locator/readiness assumptions: native wrapped selects include option text, fields must be enabled after loading, and repeated labelled regions/numeric evidence need scoped locators. These selectors were corrected without weakening the workflow assertions; the final browser run passed. Temporary synthetic withdrawal was restored after each procedure.

See [sanitized implementation evidence](docs/current/SPECIFICATION-EXECUTION.json) and [delivery boundary](docs/current/SPECIFICATION-DELIVERY.md). The earlier specification execution record remains historical. All 101 designed TC procedures remain unrun and every requirement remains unapproved. Live provider callback, ORF destination/result adapters, AI drafting, pilot content rights/accuracy, grades/deadlines/family publication, formal accessibility/load, retention/recovery and hosted deployment remain outside this evidence.

## Four-hour continuation: first tested batch

5 October 2026, `feat/specification-delivery`, implementation parent `398df9c8bf57659a5fd97718f76fe962011cf7d2`. Implements reviewed profile ownership, academic integrity/editor safeguards, staged normalized reading imports/receipts and explicit submission windows. [Batch boundary](docs/current/DEVELOPMENT-BATCH-1.md), [sanitized actual evidence](docs/current/DEVELOPMENT-BATCH-1-EXECUTION.json) and [timed progress](docs/current/FOUR-HOUR-DEVELOPMENT.md) distinguish this stage from prior observations.

| Check | Observed result | Limits |
|---|---|---|
| Fresh final-source production build | Passed | After recovery-message and mobile fixes; no hosted deployment |
| Final guarded static/unit/integration/smoke | 2,302 checks passed; 25 meaningful suites plus three static steps | 94 unit, 2,115 integration, 93 executed smoke; zero failed/skipped, zero quarantine exemptions |
| Regression baseline update | Five suites added, two thresholds raised, none lowered/removed | Based on executed checks, not newly designed case procedures |
| Affected lint | 57 files, zero errors, one existing warning | Unused attendance date setter; no whole-repository lint claim |
| New built local workflows | 172 passed | Profile decisions/replay, import preview/confirm/dedup/reject, window closure/reopen/retry/history, academic pairs/results; synthetic injected sessions |
| Existing served/browser regression | 146 served and 38 browser passed | Prior journeys rerun on this batch; old status locators distinguish new window status |
| New final-source browser journeys | 57 passed, zero failures/skips | Real drained-response aborts and same UUID recovery, review resets, exact UTC/local cutoff, preserved scores/grades/text, six mobile screens; zero external requests/page errors |
| Populated encrypted local recovery | 188 passed, included in integration total | Existing recovery helper; exact 34-table/72-index/20-trigger restore, current scope, immutable/duplicate guards and retries; no hosted export/cutover/key custody/scheduling claim |
| Offline wireframe prototype | 37 passed across 12 screens | Desktop/mobile labels, heading focus, width and illustrative review transitions; zero network/page errors; separately counted prototype evidence |
| Specification/documentation/whitespace | Passed | 47 Markdown files; 20 historical requirements; 34 tables/288 fields, 51 routes/84 handlers, 12 BR/35 FR+NFR, 133 cases/22 scenarios; API CSV/MD parity |

Browser review found three concrete UI issues: native lost-import errors lacked the retained-ID recovery instruction, profile action buttons overflowed on mobile, and enrolment name/actions shared an overflowing horizontal row. All were fixed and the complete final-source browser run passed. The assessment editor and controlled enrolment selector also now preserve intended confirmed values/actions. A local test-server auto reload retained a stale static-asset registry after rebuilding; a complete restart restored matching script/CSS files. This was a harness state issue, recorded separately from the application fixes. Desktop/mobile application and prototype captures were visually inspected. Assessment 409 was deliberately injected in the browser to verify retained editor text; actual service concurrency/conflicts have independent SQLite coverage.

The independent [remaining-domain review](docs/current/REMAINING-DOMAIN-REVIEW.md) reproduced 16 unsafe outcomes in original school/course/class/report/notification/account paths, with 59 diagnostic assertions and two guarded positive controls. Those assertions establish defects and are excluded from passing totals. The next batch addresses live authority at persistence/read time and report notices that can be saved without successful publication or after guardian unlink. Source publication remains a draft review candidate; no merge, deployment or production-readiness claim is made.

All 133 designed TC procedures remain `not-run-for-this-specification`; all requirements remain unapproved. Real sign-in provider/ORF/vendor verification, paid AI, real records/messages, educator efficacy/UAT, formal accessibility/load, result correction history and hosted operational recovery remain outside this evidence.

## Four-hour continuation: current authority and publication batch

5 October 2026, `feat/specification-delivery`, parent `82f20ce9ae023bdb78d53aecc229331b57bce5eb`. Implements original-domain current actor/reference guards, one-statement report publication/receipt/current guardian notices, and role-appropriate school/course/class/report/notification screens. [Scope](docs/current/DEVELOPMENT-BATCH-2.md), [actual sanitized execution](docs/current/DEVELOPMENT-BATCH-2-EXECUTION.json) and [timed progress](docs/current/FOUR-HOUR-DEVELOPMENT.md) keep this stage separate from prior observations.

| Check | Observed result | Limits |
|---|---|---|
| Fresh final-source production build | Passed | Includes native report anchor, synchronous draft-submit lock and mobile detail wrapping; no hosted deployment |
| Final guarded static/unit/integration/smoke | 3,619 passed; 28 meaningful suites plus three static steps | 94 unit, 3,408 integration, 117 smoke; zero failures/skips, 28 baseline suites and zero quarantine exemptions |
| Baseline and affected lint | Three suites added, two thresholds raised, none lowered/removed; 34 affected files lint clean | Executed counts; zero lint errors/warnings, no whole-repository lint claim |
| New built-Worker workflows | 104 passed | School/course/class/roster/role privacy, report winner/retry/current guardian notice, stable read markers and legacy no-backfill; synthetic real local workerd/D1 |
| New final-source browser workflows | 36 report/notice and 26 structure checks passed | Actual forms, role controls, same-frame native submit, exact detail navigation, lost acknowledgements, stale selection/list failure, save/refresh truthfulness and mobile labels/width; zero external requests/page errors |
| Earlier served/browser regression | 172/146 served and 57/38 browser passed | Prior development/specification journeys rerun; shared synthetic fixture isolation restored |
| Automated rendered accessibility sample | 54 page/viewport samples passed | Four roles, desktop/mobile resting pages and selected WCAG A/AA rules; zero external requests/page errors; incomplete checks and formal keyboard/screen-reader/all-state acceptance remain separate |
| Populated encrypted local recovery | 202 passed, included in integration total | Exact 35-table/74-index/24-trigger recovery includes actual publication receipt/notice, retries and immutable guards; no hosted export/cutover/key custody/scheduling claim |
| Offline wireframe/documentation parity | 37 prototype checks and documentation/specification/historical audit passed | 12 fictional screens; 35 tables/294 fields, 51 routes/84 handlers, 157 unrun designed cases/25 scenarios; exact API CSV/MD and field parity |

Independent fixed-behavior verification addresses the five original-domain finding groups with 783 assertions across 142 fresh actual-session/SQLite scenarios. Focused structure/publication contracts contribute 275/221 checks within the integration total. Tests exercise post-validation actor/reference changes, current guardian identity/link eligibility, zero-row and concurrent publication, forced notice rollback, private receipt preservation, legacy no-backfill and post-commit response withholding. The historical diagnostic's unsafe outcomes remain separate; no diagnostic assertions are counted as successful regression evidence.

Browser/source review found three additional concrete issues. Long tokens overflowed the mobile report detail; layout now wraps. The new report link hit the known vinext beta client-transition failure; it now uses the established full-page anchor. Two same-frame native form submissions could send two non-idempotent draft creations before state rerendered; a synchronous ref lock now sends one request and creates one draft. The complete final-source browser run confirms these fixes. Desktop/mobile captures were visually inspected. The UI does not invent server-side draft UUID retry guarantees or educational grading policies.

An initial new served check received a denied 503 for a foreign-origin write; the unchanged complete repeat and final 104-check run passed, and no causal application fix is attributed to that transient. Initial accessibility sampling referenced a nonexistent `/assignments` list; it was corrected to the actual `/learning` screen before the final sample. The older reading-history browser check initially interacted with new served enrolments for its shared learner. The served test now creates its own roster learner; previous synthetic rows remain withdrawn, the base fixture was restored and the full 38-check run passed. Discovery counts are excluded from final passing totals.

All 157 designed specification procedures remain unrun and every requirement remains unapproved. A separate next-slice dashboard inspection has found accuracy/navigation and cached assembled-read issues; those are not claimed resolved by this batch. Real provider/ORF/vendor verification, paid AI, real records/messages, representative load, educational efficacy/UAT, academic correction/grade/date/retention policy and hosted operational recovery remain outside this evidence. No merge or hosted deployment was performed.

## Four-hour continuation: coherent role dashboards

5 October 2026, third batch on `feat/specification-delivery`, parent `88205cdce71840066d37ebc3a08d317cea7e3f37`. Four role dashboards now assemble one current-authority SQL snapshot with accurate assessment coverage, raw observed attendance, exact totals/list caps and compact published family summaries. [Scope](docs/current/DEVELOPMENT-BATCH-3.md), [sanitized actual execution](docs/current/DEVELOPMENT-BATCH-3-EXECUTION.json) and [diagnostic/remediation](docs/current/DASHBOARD-REVIEW.md) separate findings from final passing evidence.

Fresh guarded build passed. Final runner executed 4,168 checks across 30 meaningful suites plus 3 static steps: 94 unit, 3,957 integration and 117 smoke, zero failed/skipped/quarantined. Two added dashboard suites guard 135 focused service/D1 checks and 414 independent checks across 56 session-backed SQLite scenarios; all prior thresholds retained. Twelve affected files lint clean. Prior served checks passed 172/146/104; final dashboard browser 31 checks and 62 automated WCAG page/viewport samples passed with zero external requests/page errors. Eight app captures and the updated desktop/mobile prototype were visually reviewed; 37 offline checks cover 12 fictional screens. Populated encrypted recovery 202 checks are included in integration, without new hosted or dashboard-specific recovery claims.

The original diagnostic reproduced 8 findings with 21 diagnostic assertions; those are excluded from passing totals. Several parallel served attempts returned transient 503 responses; unchanged-source isolated probes and the complete 104-check repeat passed, with no causal app fix claimed. The runner rebuilt assets during an earlier browser attempt; root corrected that orchestration and restarted the local server after the final build. A redirect test used a manual Cookie header that Chrome dropped; its actual cookie-jar replacement verified the intended role redirect. The independent assertion summary was standardized so all 414 executed checks are counted and guarded. The synthetic fixture export was corrected to parent-first foreign-key order; all final guards remain active during Worker tests.

Canonical v2.4 matches 35 tables/294 fields and 51 routes/84 handlers, with 181 designed cases across 28 scenarios. Those procedures remain unrun and every approval remains false. Current snapshot authorization does not promise session-only revocation after Principal resolution. Reviewed attendance recording is next; academic policy, representative load/accessibility, live providers, educational/UAT and hosted operations remain separate. No merge or deployment occurred.

## Four-hour continuation: reviewed attendance

5 October 2026, fourth batch on `feat/specification-delivery`, parent `85e85d054afe039d6c633aa215d900b5881eb911`. A separate staff-only attendance workflow loads real saved marks/current active pupils, checks exact original records and atomically saves reviewed before/after evidence with UUID receipts. The original replacement API remains unchanged. The attendance viewer uses one current-scoped snapshot, truthful saved counts, literal calendar dates and explicit display caps. [Scope](docs/current/DEVELOPMENT-BATCH-4.md), [actual execution](docs/current/DEVELOPMENT-BATCH-4-EXECUTION.json) and [exact design](docs/specification/ATTENDANCE-DESIGN.md) distinguish implementation from approval.

Fresh build and TypeScript passed. Twenty-one affected files lint clean. Final static/unit/integration/smoke regression passed 8,768 checks across 34 meaningful suites plus three static steps: 94 unit, 8,532 integration and 142 smoke, zero failures/skips/quarantine exemptions. Four added suites cover 390/3,782/103/271 focused and independent checks; earlier thresholds remain, and API/recovery/smoke thresholds rose without reductions. Populated encrypted recovery contributes 226 within integration: exact 37-table/79-index/30-trigger restore, original attendance marks, immutable review history and committed retries checked after restoration.

The built local Worker passed 326 new served checks across 116 drained requests. Staff editor and viewer browser procedures passed 29/23, with no external requests/page errors. Automated resting-page WCAG samples passed 78 on desktop/mobile; these do not establish formal accessibility acceptance. Prior served checks passed 172/146/104, and the 12-screen fictional prototype passed 37. Staff/family captures were visually inspected; an initial compositor artifact was corrected by settling fonts/layout/render frames, with independent DOM confirmation that no duplicate content existed.

Independent QA found Unicode reason validation inconsistent with SQLite character length and oversized existing-note preservation; code-point limits now match persistence, while unchanged legacy notes are retained exactly. Browser verification found current-class reselection clearing the viewer, fixed with an explicit no-op guard. Non-OK recorder responses left a404 pending; consuming the error body resolved that specific request. Secure localhost cookies required explicit preservation during Playwright response injections. Two prior domain attempts returned503 instead of403 on one notification denial; isolated probes and the unchanged full 104-check run subsequently passed. No causal app fix or hosted load guarantee is claimed. An earlier nonexistent fixture database name failed before import; corrected local binding loaded every final migration/guard. Historical records and prior evidence remain unchanged.

Canonical v2.5 matches 37 tables/309 fields, 54 routes/88 handlers and 205 designed cases across 31 scenarios. All designed cases remain unrun and approvals remain false. FR-09 stays partial: calendars, correction governance, legacy API bypass, retention, educator/UAT and representative load/accessibility remain open. Principal carries no session hash, so session-only revocation after its resolution remains outside the snapshot contract. Live providers, real records/messages, main merge and hosted deployment remain pending. The next slice addresses independently reproduced assessment-editor stale replacement and uncertain-retry risks through a separate reviewed workflow.
