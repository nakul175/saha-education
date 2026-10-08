# ADR 0001: Server-side authorisation and fail-closed identity

Status: in force (retrospective, written 2026-10-08) · Owner: Nakul Jain

Context: the earlier rebuild trusted a client-chosen role cookie ([SECURITY-PRIVACY.md](../../education/SECURITY-PRIVACY.md)).
Decision: identity comes only from a verified OIDC ID token mapped to a pre-provisioned (issuer, subject) account (`lib/education/identity.ts`, `oidc.ts`); sessions are opaque, hash-only in the database; every request re-reads role, school and disabled state; authorisation is enforced per object in the server services; public identity headers are never trusted; with no provider configured, sign-in returns 503.
Consequences: no real login works until a provider is named; a separate, labelled synthetic demo sign-in exists for demonstration only. UI role checks are presentation only.
Links: [AUTH-ACCESS.md](../../current/AUTH-ACCESS.md), [ACCESS-CONTROL.md](../ACCESS-CONTROL.md), AGENTS.md rules.
