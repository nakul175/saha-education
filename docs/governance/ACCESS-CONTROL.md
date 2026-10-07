# Access-control model

Owner: Nakul Jain · Last reviewed: 2026-10-08 · Update trigger: any change to roles, `lib/education/access.ts`, `principal-authority.ts`, `session.ts`, `identity.ts`, or to who may reach the droplet.
Status: agent-drafted summary of existing documents; not an access review by a person. Canonical sources: [AUTH-ACCESS.md](../current/AUTH-ACCESS.md) (design and delivery), [API-CONTRACTS.md](../specification/API-CONTRACTS.md) (per-route role and scope), [FSD.md](../specification/FSD.md), and the matrix test `tests/integration/authorization-matrix-contract.mjs`.

## Layers (outside in)

| Layer | Control | Where |
|---|---|---|
| Network | Droplet firewall allows 22, 80, 443; app bound to 127.0.0.1 | `deploy/provision.sh` |
| Site gate | Caddy basic-auth wall; one entry per person; bcrypt hashes in `/etc/saha/saha-education.users`. No MFA, lockout or real sign-out | `deploy/Caddyfile`, `deploy/add-user.sh` |
| Identity | OIDC authorization code with PKCE, state, nonce; `jose` verifies ID tokens; only a pre-provisioned `(issuer, subject)` pair gets a session. **No real provider is configured**: login returns 503 and fails closed. A separate synthetic demo sign-in exists only when `SAHA_DEMO_ENABLED` is on and no OIDC setting is present | `lib/education/oidc.ts`, `identity.ts`, `demo-policy.ts` |
| Session | 32-byte random token; only its SHA-256 is stored; cookie `__Host-saha_session` (Secure, HttpOnly, SameSite=Lax, Path=/), 8-hour life; every request re-reads the account's role, school and disabled state | `lib/education/session.ts` |
| Request | Matching `Origin` in `SAHA_ALLOWED_ORIGINS` for mutations; 128 KiB body bound; no public identity header is trusted | `lib/education/http.ts` |
| Authorisation | Server-side, per object, in the domain services (`access.ts`, `principal-authority.ts`); UI role checks are presentation only | `lib/education/*` |
| Database | Append-only evidence guarded by triggers (migration 0025 and earlier); unique and foreign-key constraints | `drizzle/` |

## Roles and scope

| Role | Read | Write |
|---|---|---|
| Admin | Own assigned school only | Own-school administration and publication; account administration |
| Teacher | Assigned classes and currently active enrolled students | Attendance, assessments and results, notices to related recipients, own resources |
| Guardian | Explicitly linked children (same school); own notices; **published** reports | Own notice read status |
| Student | Own linked profile; own notices; published reports; active classes | Own notice read status and own submissions |

Rules that matter: an unmapped or school-less account has no access (fail closed); a foreign school or hidden object answers 404 (no existence oracle); owner or admin authority does not override student scope; drafts and raw results are staff-only until a publication model says otherwise; school creation is operator provisioning, not an admin capability.

## Account lifecycle

Provisioning, role change, identity link/unlink, disable and last-administrator protection are reviewed, versioned actions with history (`/admin/users`; [DEMO-identity.md](../current/DEMO-identity.md)). There is no public signup. `disabled_at` blocks the next request. Production provisioning and account-recovery procedure: TBD (owner: Nakul Jain).

## Review and recertification

No periodic access review has been done or scheduled. Proposed: owner reviews droplet password-wall entries and administrator accounts at each release and at least quarterly once real data exists. Cadence: TBD (owner: Nakul Jain).

## Open items

Teacher read of unpublished report drafts of assigned pupils (finding F6, policy undefined); no idle-timeout or concurrent-session cap (G8); sign-in throttling is per Cloudflare client IP and shares one bucket when that header is absent (F8); behind Caddy on the droplet nothing sets `cf-connecting-ip`, so (reading `deploy/Caddyfile` and `oidc.ts`, untested) the throttle there is either one shared bucket or keyed by a value the client can send itself. Treat it as not effective on the droplet until tested (TBD).
