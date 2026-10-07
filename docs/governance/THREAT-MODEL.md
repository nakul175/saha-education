# Threat model

Owner: Nakul Jain · Last reviewed: 2026-10-08 · Update trigger: new integration, real provider, real data, new hosting, or a security finding.
**Agent-drafted 2026-10-08, not reviewed by a person or counsel; no certification or compliance is claimed.** Built from [SECURITY-PRIVACY.md](../education/SECURITY-PRIVACY.md) (older threat register), [the security record](../current/DEMO-security-change-control.md), [AUTH-ACCESS.md](../current/AUTH-ACCESS.md), `deploy/` and [INTEGRATION-CONTRACTS.md](../specification/INTEGRATION-CONTRACTS.md). Method: STRIDE-style walk over the assets and boundaries below. Ratings are the drafter's judgement.

## Assets

Learner and guardian personal data (names, dates of birth, admission numbers, contact details, family links); academic records (attendance, results, report cards, feedback); account identities and sessions; audit evidence; deploy credentials; the droplet itself.

## Trust boundaries

Browser to Caddy (HTTPS and password wall); Caddy to Worker on loopback; Worker to SQLite file; droplet to GitHub (pull); app to OIDC provider (not configured); app to reading app (launch link only, no data sent); operator to droplet (SSH).

## Threats and current controls

| # | Threat | Control present (evidence) | Residual / gap |
|---|---|---|---|
| T1 | Role impersonation by client-supplied role | Server-side session lookup; old role cookie rejected; tests with forged cookie and header | Demo login is not real authentication; fine only for synthetic data |
| T2 | Cross-school or cross-student access | Per-object scope in services; 20,330-check matrix over 96 handlers; 404 for foreign objects | Matrix covers the 96 handlers documented; 150 exist now. Verify the newer routes are in the matrix (TBD) |
| T3 | Session theft or fixation | Random token, hash-only storage, Secure/HttpOnly/SameSite cookie, 8 h expiry | No idle timeout, no MFA, no real sign-out behind the Caddy wall |
| T4 | CSRF and cross-origin writes | Origin allow-list on mutations; fetch-metadata rejection | `SAHA_ALLOWED_ORIGINS` must be set right per host |
| T5 | Injection / hostile input | Drizzle queries; endpoint schema validation (`lib/education/validation.ts`); 128 KiB body bound; tests with hostile ids and text | No per-field length limits (F5) |
| T6 | Browser-side attack (XSS, framing) | CSP, nosniff, frame deny, referrer and permissions headers on Worker responses | CSP keeps `'unsafe-inline'`; static assets lack the headers (F10) |
| T7 | Tampering with evidence | Append-only triggers, receipts, CAS versions | Legacy overwrite paths have no history (documented); trigger list must be kept in sync |
| T8 | Lost or duplicate writes | Atomic batches, client-UUID retry keys; fault-injection tests | Hosted behaviour on D1 not verified |
| T9 | Password-wall brute force | bcrypt (cost 12) hashes; random 20-char passwords | No lockout or rate limit in Caddy config; app sign-in throttle keys on `cf-connecting-ip`, which Caddy does not set (see [ACCESS-CONTROL.md](ACCESS-CONTROL.md)); basic auth over HTTPS only |
| T10 | Supply-chain compromise | Frozen lockfile, 7-day release-age rule, build-script allow-list | No `pnpm audit` or SBOM scan in CI ([SBOM.md](SBOM.md)); deploy runs `pnpm install` as root on the droplet |
| T11 | Deploy channel abuse | Pull-only; read-only token or deploy key; no inbound deploy | A merged malicious commit is deployed in about 3 minutes with root build scripts; `main` protection settings unknown (TBD) |
| T12 | Data loss | Snapshot tool exists | No scheduled backup, no tested restore ([BACKUP-DR.md](BACKUP-DR.md)) |
| T13 | Secret leakage | `.env.example` names only; secrets outside git; token in `/etc/saha` mode 600 | See [SECRETS-REGISTER.md](SECRETS-REGISTER.md); no secret scanning in CI |
| T14 | Personal data in logs or error text | Generic error bodies tested; no content logging in code reviewed by tests | Log content on the droplet (journald) not reviewed |
| T15 | Insider misuse by administrators | Reviewed, versioned account actions; audit trail | Access review not scheduled; audit trail incomplete for legacy writes |
| T16 | Single point of failure | None | One droplet, one file, shared by other apps if co-hosted |
| T17 | Guardian/minor data exposed by mistaken family link | Explicit link rules; reviewed link/unlink with history | Guardian identity verification policy undecided (D-10 area) |
| T18 | Reading-app launch leaks data | Fixed operator-configured HTTPS URL; no student or session data appended | Destination unconfirmed; result sync absent |

## Out of scope / not assessed

No penetration test, no load test, no review of the dependency tree beyond inventory, no review of Cloudflare or DigitalOcean account security, no physical or personnel controls.
