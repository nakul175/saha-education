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

Sections 2 onward are completed as the work proceeds and are final only when the execution record at the end says so.
