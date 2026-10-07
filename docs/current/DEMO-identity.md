# Demo identity workstream (FR-01 trusted sign-in, FR-04 identity administration)

Overnight synthetic-demo run, agent A1, 6 October 2026. Synthetic data only; no real identity provider, ORF, paid AI or real recipient is enabled or contacted. Nothing here marks a designed case, requirement or approval accepted.

## 1. Specification gap list (written before coding)

Compared: FSD FR-01/FR-04, LLD, API-CONTRACTS, SESSION-DEMO-DESIGN, WIREFRAMES login rows, TRACEABILITY rows FR-01/FR-04 and designed cases TC-001..010, 014, 015, 016, 021, 022, 095, 102..109, 206, 257, 278, 282, 284 against `lib/education/{oidc,identity,session,demo,demo-policy,identity-admin}.ts`, `app/api/{auth,demo,session,users,admin/users}`, `app/login`, `app/admin/users`.

| # | Gap found | Requirement | Disposition |
|---|---|---|---|
| G1 | No end-to-end proof of the OIDC flow against a standing issuer model: existing unit test mocks token/JWKS responses but never validates the authorization request (client, redirect, PKCE challenge) or the code exchange (code single use, PKCE verifier, client authentication), has no disabled-user, email-match, missing-claim, unsupported-algorithm, future-iat, state-tamper, provider-timeout or logout/replay cases. | FR-01, TC-002..009 | Closed by a local fake issuer inside the tests (no network). |
| G2 | The login page ignored `?error=signin_failed`, the redirect that the callback produces for every failure, so a failed provider sign-in showed nothing. | FR-01 | Closed. |
| G3 | Real mode: the login page offered a button that failed only after being pressed; missing configuration had no up-front unavailable state. | FR-01, FSD "Missing configuration shows an unavailable state" | Closed with a no-secret `GET /api/auth/login` that reports only configured/not configured. |
| G4 | Demo entry: a disabled demo account, a rate limit, a wrong origin and an unavailable installation all showed the same "demo unavailable" text; no expired-session or "you were signed out" explanation; no account page showing who is signed in, the sign-in kind, expiry and sign-out. | FR-01/FR-02, TC-278/282/284 | Closed (plain per-cause messages, `/account`, expiry notice). |
| G5 | Identity administration could provision and enable/disable only. No way to change the role of an existing account, or to link/unlink the school sign-in identity of an existing account (legacy accounts without a mapping were permanently stranded). FSD, API-CONTRACTS and TC-022 record "existing identity role/school/pair remapping" as an unapproved policy decision. | FR-04 | Implemented additively at the sponsor's request (new reviewed, versioned, audited, session-revoking routes). **Policy approval is still outstanding**; see section 4. |
| G6 | No audit evidence for role/identity decisions (identity_admin_events has a CHECK limiting actions to provision/enable/disable). | FR-04, FR-26 | New immutable table `identity_admin_changes` (migration 0024). |
| G7 | Synthetic isolation hazard: a demo administrator could provision an account with a non-synthetic issuer, which closes every demo session by design (isolation predicate). | FR-01/FR-04, TC-282 | Closed: a synthetic installation accepts only its synthetic issuer and refuses unlinking. |
| G8 | `/admin/users` offers no role change, no link/unlink, no search/filter and shows raw ids in the history. | FR-04, WF | Closed in the page. |
| G9 | Real provider/issuer settings, ORF, hosted deployment URL: not provided. | FR-01, TC-010, TC-284 | Blocked by the sponsor (unchanged). |

## 2. What was built

| Area | Change |
| --- | --- |
| Sign-in proof | `tests/support/fake-oidc-issuer.mjs` is a strict local OpenID Connect provider that exists only inside the tests (RSA key pair generated per run, a replacement `fetch` that answers only its own issuer URLs and records then refuses every other host). It checks the authorization request (client, redirect, scope, S256 challenge, state, nonce), binds a one-use code to client, redirect, challenge and nonce, authenticates the client (basic, post or public) and verifies the PKCE verifier. `tests/integration/oidc-local-issuer-contract.mjs` drives the production `startLogin`/`finishLogin` and the real route handlers against it. Real provider settings are not provided and nothing in the application was changed to accept any. |
| Synthetic entry | Already server-authoritative. Added plain per-cause explanations on the login page (switched-off demo account, refused page, demo switched off, rate limit), the `/account` page and the demo-installation guard that a synthetic installation accepts only its own synthetic issuer and cannot unlink (gap G7). |
| Account page | New `/account` for every role: name, email, role, school, how the person signed in (school sign-in or the labelled synthetic entry), when the session ends, sign out and, for a synthetic account, switch role. Backed by `GET /api/account`, which returns the caller's own record only and never the provider issuer or subject. A "Your account" link sits in the shared header identity block (outside the School navigation, whose exact links other checks assert). |
| Login page | Explains `?error=signin_failed` (every callback failure redirects there) and `?reason=expired`; states up front, from the new no-secret `GET /api/auth/login`, that school sign-in has not been set up; the sign-in button stays available and still fails closed with the existing friendly message. |
| Identity administration | `/admin/users` gains search and filters, a per-account Manage panel (linked profile, classes taught, sign-in link, last-administrator and own-account protection, synthetic label), a reviewed **role change** and a reviewed **link/unlink of the school sign-in identity**, plain-language refusal reasons, and one merged history (access decisions and role/sign-in decisions) that names people rather than ids. All existing accessible names and the single status region are unchanged. |
| Server | `lib/education/identity-changes.ts` with `PATCH /api/admin/users/[id]/role` and `/identity`, `GET /api/admin/users/[id]` (detail) and `GET /api/admin/users/changes`. Same pattern as the reviewed provisioning/status decisions: client UUID, request hash, compare-and-set version shared with the status decisions, INSERT...SELECT guards and the write in one D1 batch, session revocation in the same batch, and an immutable evidence table (migration 0024 `identity_admin_changes`, additive, two immutability triggers). Guards: school scope, live administrator, no change to oneself, never the last enabled mapped administrator, no leaving the student/guardian role while a profile is linked, no leaving teacher while classes are assigned, a link only when the account is unmapped and the exact issuer/subject is held by nobody (email is never used), an unlink only when mapped and not a fixed synthetic account, and the synthetic installation rules. |

## 3. Pages by role

| Role | Pages exercised | Mounted evidence |
| --- | --- | --- |
| Anyone signed out | `/login` (demo and real-mode variants), `/login?error=signin_failed`, `/login?reason=expired`, protected pages redirect | demo run and real run |
| Administrator | `/account`, `/admin/users` (list, search, filter, provision, access review, Manage panel, role change, link/unlink, history) | both runs |
| Teacher | `/account`; `/admin/users` shows the restricted message and the APIs answer 403 | both runs |
| Guardian | `/account`; same refusals | both runs |
| Learner | `/account`; same refusals | both runs |

## 4. Evidence (all synthetic, all local)

Commands run from the worktree with Node 24; heavy steps through the shared machine lock. The build was a locked `node scripts/run-framework.mjs build` at the code state tested.

| Check | Result |
| --- | --- |
| `node scripts/test.mjs static unit integration smoke --fast --guard` (after the locked build) | **passed**: 57 suites, 22,971 assertions (unit 119, integration 22,675, smoke 177), 0 failed, 0 skipped. Regression guard passed; the four new suites are not yet in `tests/regression-baseline.json` (restricted file) |
| `tests/integration/oidc-local-issuer-contract.mjs` | 150 checks, 300 requests to the local fake issuer, 0 external requests |
| `tests/integration/identity-lifecycle-contract.mjs` | 186 checks (role change, link/unlink, audit, scope, no-elevation, last administrator, replay, races, production D1 batch driver) |
| `tests/integration/demo-session-lifecycle-contract.mjs` | 71 checks (role entry, cookie shape, account summary, sign-out, expiry/renewal, role switch, disabled account, demo administration, rate limit, switched off) |
| `tests/integration/identity-ui-contract.mjs` | 128 checks, 16 scenarios, 69 local requests, 0 external (login, account and administration client code over real routes) |
| Existing UI contracts touched by the shell/login change: demo-login-ui (249), school-ui, registry-ui, family-ui, profile-assessment-ui, learner-recovery-ui, course-catalog-ui | all pass (inside the guarded run) |
| Mounted, demo ON, pristine D1 (`worker-identity-demo-check`) | **14 passed, 0 failed, 0 not executed**; 0 external requests, 0 page errors, 97 local API requests, 0 navigation retries |
| Mounted, demo OFF, fixture sessions (`worker-identity-demo-check`) | **16 passed, 0 failed, 0 not executed**; 0 external requests, 0 page errors, 72 local API requests, 0 navigation retries |
| Mounted regression, existing `worker-demo-ui-check` (pristine demo D1) | 26 passed, 0 failed of 26; 0 external, 0 page errors |
| Mounted regression, existing `worker-specification-ui-check` (account page flows) | 38 passed, 0 failed, 0 blocked external requests |
| ESLint on every touched file | clean (the one remaining warning is in untouched `lib/education/client-api.ts`) |
| Whole-repo `tsc --noEmit` (locked) | clean, exit 0, no output |
| `python3 scripts/check-documentation.py`, `audit-requirements.mjs --check`, `check-specification.mjs`, `test.mjs --check-catalogue` | all exit 0 |

The mounted runs also cover the 375 px width for the login, account and administration pages (every form control labelled, no horizontal overflow, no nested interactive elements) and write 15 screenshots to the output directory (not committed).

Browser journeys exercised: demo role entry for all four roles, the account page and its sign-out, switching role, wrong-origin/origin-less/unacknowledged/forged-cookie refusals, a genuine server-side session expiry (the persisted D1 row is expired through the local D1 tool, the page then explains it and entering again renews the session), disabling a demo account (open session ends, entry refused in plain words, re-enabling does not revive the old session), refusal of a provider issuer inside the synthetic installation, the fail-closed real-mode login, the failed-callback and expiry notices, the full administration journey (search, filter, provision, role change, refusals for classes/profile/own account, unlink, re-link, held-identity refusal, history after reload, school scope, role refusals).

## 5. Designed cases from the brief: actual results

Status words: **pass** = the case's steps and expectations were executed by automated local checks and met; **partial** = only part was executed (stated); **regression-run-only** = existing suites in the guarded run passed, nothing authored here; **blocked**; **not-executed**. None of this is acceptance or sign-off, and `execution_status` in TEST-CASES was not changed.

| Case | Result | Evidence and limits |
| --- | --- | --- |
| TC-001 | pass | oidc-local-issuer-contract (unset and broken provider settings: 503, no provider redirect, no session); mounted real-mode run (friendly failure, GET /api/auth/login reports configured:false) |
| TC-002 | pass | oidc-local-issuer-contract: full code+PKCE flow against the local fake issuer with basic, post and public client authentication; session only for the provisioned identity |
| TC-003 | pass | wrong issuer, audience, authorized party, audience list without azp, each with a valid signature: rejected, no session |
| TC-004 | pass | expired, future-dated, missing exp/iat/sub/nonce, unsupported and unadvertised algorithms rejected; no session |
| TC-005 | pass | wrong nonce rejected; another browser cannot consume the transaction |
| TC-006 | pass | replayed callback, expired transaction, forged/duplicate state rejected; one session only |
| TC-007 | pass | unknown subject with a matching email is refused; email never links |
| TC-008 | partial | request 21 returns 429 before provider work and the counter lives in D1 (one process). Two separate handler instances and a process restart were not exercised |
| TC-009 | pass | discovery, token and JWKS timeouts, error and malformed replies, access_denied: no session, no demo fallback, no secret in the redirect |
| TC-010 | blocked | needs the real provider, client registration and HTTPS origin; none provided |
| TC-014 | partial | disabled/role-change effects on the next request are covered by the existing session-revocation suite (in the guarded run) and the new role/identity change suite; the school-change fixture was not authored here |
| TC-015 | pass | existing identity-admin-contract (153 checks) plus demo-session-lifecycle and the mounted disable/re-enable of a demo account (old session stays dead, entry blocked in plain words) |
| TC-016 | pass | forged saha_demo_role cookie and x-saha headers rejected in the contract suites and in both mounted runs |
| TC-021 | regression-run-only | outside this workstream; existing suites ran inside the guarded run and passed; nothing was added |
| TC-022 | partial | provisioning, duplicates, changed payload, unauthorised actor: existing + new suites pass; wider existing-account remapping is an unapproved policy (see section 7) |
| TC-095 | partial | migration 0024 applies on every fresh database used by the suites and the mounted workers; legacy fail-closed upgrade was not re-authored here |
| TC-102 | regression-run-only | existing profile-link suites (not modified) pass in the guarded run; not individually mapped by this workstream |
| TC-103 | regression-run-only | as TC-102 |
| TC-104 | regression-run-only | as TC-102 |
| TC-105 | regression-run-only | as TC-102 |
| TC-106 | regression-run-only | as TC-102 |
| TC-107 | regression-run-only | as TC-102 |
| TC-108 | regression-run-only | as TC-102 |
| TC-109 | not-executed | UAT with a named school reviewer; no such person was involved |
| TC-206 | regression-run-only | outside this workstream; existing suites in the guarded run pass |
| TC-257 | partial | role, issuer, subject and disabled changes made through the new administration routes end the sessions and are re-checked in SQL (lifecycle suite); the independent per-field mutation fixtures of the existing suite also pass; auth_sessions.user_id mutation not re-authored |
| TC-278 | pass | synthetic-demo-contract, demo-session-lifecycle (off by default, wrong/missing origin 403, invalid body 400, forged cookie 401) and the mounted wrong-origin/unacknowledged probes |
| TC-282 | partial | switching the demo off, configuring a provider and the isolation hazard are covered locally; a non-pristine/missing-marker database entry was not re-authored |
| TC-284 | blocked | needs the working private hosted deployment (hosting failure unresolved, no URL) |

Totals over 29 cases: blocked 2, not-executed 1, partial 6, pass 11, regression-run-only 9.

## 6. Mutation checks

Each mutant was applied to the production source, the relevant suite run, and the file restored from git. 37 of 40 were detected; 3 survived and are explained.

| Mutant | Change | Result |
| --- | --- | --- |
| oidc-browser-binding | remove the browser-hash condition of the one-use transaction | detected |
| oidc-nonce | skip the nonce comparison | detected |
| oidc-disabled | allow a disabled account to sign in | detected |
| oidc-audience | drop the audience requirement | detected |
| oidc-issuer | drop the issuer requirement | detected |
| oidc-expiry | ignore transaction expiry | detected |
| oidc-pkce | send a wrong PKCE verifier | detected |
| oidc-user-issuer | map by subject without issuer | detected |
| oidc-replay-delete | read instead of atomically delete the transaction | detected |
| oidc-required-claims | drop required claims | detected |
| oidc-algorithms | accept algorithms the provider did not advertise | detected |
| oidc-revoke-old | keep the earlier session on sign-in | detected |
| oidc-rate-limit | raise the limit to 2000 | detected |
| id-self (TypeScript guard only) | remove the early self refusal | survived: the SQL guard `target.id <> actor` still refuses; equivalent mutant |
| id-self-sql (SQL guard only) | remove the SQL self guard | survived: the TypeScript guard still refuses; equivalent mutant |
| id-self-both | remove both self guards | detected |
| id-sessions | do not revoke target sessions | detected |
| id-class-guard | allow leaving teacher with classes | detected |
| id-profile-guard | allow leaving student with a linked profile | detected |
| id-version | ignore the expected version | detected |
| id-unmapped | allow linking an already mapped account | detected |
| id-live-actor | skip the live-actor check | detected |
| id-school | skip the school scope | detected |
| id-demo-unlink | allow unlink in a synthetic installation | detected |
| id-demo-issuer | allow a foreign issuer in a synthetic installation | detected |
| id-fixed-demo | allow unlinking a fixed demo account | detected |
| id-last-admin-demote | remove the last-administrator guard from the role change | survived: unreachable, because the target can only be the actor (refused earlier) or another administrator while the actor remains; kept as defence in depth |
| id-reason-reuse | let a changed payload reuse a decision id | detected |
| ui-conflict-map | drop the plain refusal reasons | detected |
| ui-retry-id | new request id on every retry | detected |
| ui-unconfigured | hide the unconfigured notice | detected |
| ui-signin-failed | ignore ?error=signin_failed | detected |
| ui-expired | ignore ?reason=expired | detected |
| ui-demo-403 | one message for every 403 | detected |
| ui-demo-fieldset | allow unlink form for synthetic accounts | detected |
| ui-self-fieldset | enable own-account role form | detected |
| ui-account-lock | remove same-frame sign-out lock | detected |
| ui-account-expired | drop the expiry reason on 401 | detected |
| ui-role-filter | role filter does nothing | detected |
| ui-cross-clear | keep the confirmation after the reason changes | detected |

The two single-guard self mutants survive by design: removing either the TypeScript or the SQL self-refusal leaves the other refusing, and removing both is detected. The survivor `id-last-admin-demote` is the same kind of redundancy.

## 7. Limits (what these results do not show)

- No real identity provider, tenant, client registration, ORF, paid AI or recipient was available or used. The provider protocol is proven only against the local fake issuer inside the tests. A real provider can differ (discovery caching, clock skew, claim shapes, token endpoint authentication method, logout), so TC-010 stays blocked.
- The hosted deployment is still failing and has no URL; TC-284 stays blocked. Local Worker and D1 results are not hosted results.
- The callback suites substitute React hooks and elements; they are not mounted evidence. The mounted procedures are one browser (local Chromium), a desktop and a 375 px width, fictional data; they are not cross-browser, assistive-technology, performance, accessibility-certification or educator UAT evidence.
- The role-change session revocation and the stale-version conflict are proven in the contract suites (actual sessions, actual SQL) and by the page tests; the mounted run cannot sign in as a freshly provisioned account because no provider is available.
- Unlinking is demonstrable only on a non-demo installation (by design a synthetic installation keeps its sign-in link).
- Wider remapping of **existing** accounts (role, sign-in identity) is recorded in the FSD, API-CONTRACTS and TC-022 as an unapproved policy. It was added at the sponsor's request, additively and with conservative guards, but **nobody has approved the policy**; the requirement/traceability documents were not edited (restricted files) and still describe the narrower scope.
- Moving an account to another school is not implemented and the server refuses every cross-school read or write.

## 8. Items for the orchestrator (restricted files that were not edited)

- `docs/specification/FSD`/`LLD`/`TRACEABILITY.*`/`TEST-CASES.*`: add the routes `GET /api/account`, `GET /api/auth/login`, `GET /api/admin/users/[id]`, `PATCH /api/admin/users/[id]/role`, `PATCH /api/admin/users/[id]/identity`, `GET /api/admin/users/changes`, the page `/account`, the table `identity_admin_changes` (migration 0024) and the evidence files named below. API-CONTRACTS and DATA-DICTIONARY were updated because `scripts/check-specification.mjs` compares them with the code.
- FR-04 wording: "existing identity role/school/pair remapping" is now partly implemented (role and sign-in identity only; school never). Approve or reject that policy.
- Deployment: TC-010 and TC-284 need the sponsor's provider settings and a working private deployment.
- `tests/regression-baseline.json`: add the four new suites (`integration/oidc-local-issuer-contract` 150, `identity-lifecycle-contract` 186, `demo-session-lifecycle-contract` 71, `identity-ui-contract` 128) with `node scripts/test.mjs ... --update-baseline`; it is a restricted file and was not edited, so the guard currently notes them as not baselined.
- Machine-readable counts are in [DEMO-identity-EXECUTION.json](DEMO-identity-EXECUTION.json).
