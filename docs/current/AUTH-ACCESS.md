# Authentication and access-control delivery

Draft delivery, 5 October 2026. Reviewed and implemented by parallel identity, domain-access and API agents, integrated by the parent agent. This document describes the implementation candidate on `feat/education-auth-access`, including the existing Next.js rebuild; the original source baseline remains documented under [education](../education/README.md).

## Implemented boundary

The role-selection cookie grants no authority. Login uses configurable OpenID Connect authorization code flow with PKCE, state, nonce and a five-minute browser-bound one-use D1 transaction. `jose` verifies signed ID tokens against the configured issuer's discovered keys, with issuer/audience/expiry/issued-at/nonce checks. Only an explicitly provisioned `(identityIssuer, identitySubject)` user can receive a session. Email matches, browser-selected roles and public identity headers do not grant authority.

Sessions use 32-byte random tokens; only SHA-256 digests are stored in D1. The `__Host-saha_session` cookie is Secure, HttpOnly, SameSite=Lax, has Path=/ and expires after eight hours. Every request reloads current account role/school/disabled state. Logout deletes the current session. Future account-management endpoints must call `revokeUserSessions` on disable or identity change; disabled state already denies existing sessions on the next request.

All education APIs authenticate through one wrapper, return uncached responses and require an explicitly configured matching Origin for mutations. Protected page layouts use server-side sessions. Browser pages use scoped APIs rather than importing D1 modules. Domain services require a principal and filter at the database boundary.

| Role | Read scope | Write scope |
|---|---|---|
| Admin | Assigned school | Own-school administration and publication |
| Teacher | Assigned classes and currently active students | Attendance, assessments/results and notices to related recipients |
| Guardian | Explicit linked children; own notices; published reports | Own notification read status |
| Student | Explicit linked student profile; own notices; published reports | Own notification read status |

Assessment result reads are staff-only until an explicit result-publication model is implemented. School creation is operator provisioning, not a school-admin capability. Missing school and unmapped legacy profiles fail closed. Report publication and mapped guardian notices share a D1 batch; deterministic notice IDs prevent duplicate publication notices on retry. Attendance/results validate the full batch before transactional writes. Canonical IDs and creation timestamps cannot be supplied to domain updates.

## Provider configuration — pending

The user selected an existing sign-in provider, but its name/tenant/issuer and client registration have not been supplied. No provider is connected or enabled. Without configuration, starting sign-in returns 503. The callback and token-exchange tests use a synthetic provider; live account authentication is not verified.

Configure these through ignored local environment files or the approved Worker secret/configuration mechanism:

| Setting | Meaning |
|---|---|
| SAHA_OIDC_ISSUER | Exact HTTPS issuer advertised by the selected provider |
| SAHA_OIDC_CLIENT_ID | Registered client identifier |
| SAHA_OIDC_CLIENT_SECRET | Confidential client secret, when applicable; never tracked |
| SAHA_OIDC_REDIRECT_URL | Registered HTTPS callback ending in `/api/auth/callback` |
| SAHA_OIDC_TOKEN_AUTH_METHOD | `client_secret_basic`, `client_secret_post`, or `none`, supported by discovery |
| SAHA_ALLOWED_ORIGINS | Comma-separated exact approved web origins |

The callback origin must appear in SAHA_ALLOWED_ORIGINS. Register the exact callback at the selected provider. The provider must support discovery, code flow, PKCE and one of the allowed asymmetric signing algorithms. Do not use a Microsoft `common` issuer or assume a provider's tenant template is the literal token issuer; configure and test the actual issuer for the approved tenant. Live setup requires the provider's official configuration guidance after it is named.

Login initiation is `POST /api/auth/login`, returning `{url}` for a browser redirect. Callback is `GET /api/auth/callback`; failure redirects to `/login?error=signin_failed`. `GET /api/session` returns the current principal; `DELETE /api/session` revokes it. Legacy `POST /api/session` role selection is rejected. Login initiation is rate-limited atomically in D1 to twenty attempts per ten-minute Cloudflare client-IP bucket; a missing trusted edge IP uses a shared restrictive bucket.

## Migration and identity provisioning

Migration `drizzle/0001_trusted_identity.sql` adds issuer/subject/disabled fields, explicit student-user and guardian-school links, sessions, OIDC transactions and login-rate buckets. Existing rows deliberately receive no identity or school backfill. Review and apply migrations to an isolated environment first. No live database was changed. The snapshot/journal are synchronized so later schema generation need not recreate this migration.

Provisioning must associate approved school accounts with their verified issuer/subject and role. There is no public signup or automatic first-admin endpoint. Guardian/student profiles must be linked explicitly, with the matching role and school; legacy null links remain inaccessible. The production provisioning and account-management process is still pending.

The synthetic generator writes SQL only; it never applies it:

```sh
node scripts/provision-synthetic-identities.mjs --synthetic \
  --fixture tests/fixtures/oidc-identities.example.json --output /tmp/education-identities.sql
```

It accepts only explicit synthetic fixtures, HTTPS `.test` issuers and `@example.test` recipients, uses inserts rather than replacements, and refuses to overwrite its output. Review generated SQL before applying to an isolated synthetic database. It is not a production bootstrap tool.

## Validation and limits

See [VALIDATION.md](../../VALIDATION.md) for recorded evidence. The delivered boundary addresses EDU-F01/F02 and parts of EDU-F04/F06/F11/F12/N04. Requirements remain unapproved and are not promoted to accepted. Live provider/browser callback verification, production provisioning, recovery, accessibility, academic publication/history rules and broad end-to-end product acceptance remain outstanding.

The implementation branch is based on main and merges the existing rebuild history, then includes documentation and access changes. Reviewers can review the new auth commit separately from the imported rebuild. Merging remains sponsor-controlled; actual deployment wiring must be confirmed before any main merge.

Primary design references: [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html), [jose](https://github.com/panva/jose).
