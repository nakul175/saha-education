# Secrets and key register

Owner: Nakul Jain · Last reviewed: 2026-10-08 · Update trigger: any new secret, provider, host, or rotation.
**Names, owners and rotation only. Values never appear here or anywhere in git.** Sources: [.env.example](../../.env.example), `deploy/*.sh`, [AUTH-ACCESS.md](../current/AUTH-ACCESS.md), [DEPLOY-CLOUDFLARE.md](../DEPLOY-CLOUDFLARE.md). "Not provisioned" means no real value exists today.

| Name | Purpose | Where it lives | Owner | Rotation | State |
|---|---|---|---|---|---|
| `SAHA_OIDC_ISSUER` | Expected token issuer (configuration, not secret) | Worker binding | Nakul Jain | n/a | Not provisioned; provider not named |
| `SAHA_OIDC_CLIENT_ID` | Registered client id (not secret) | Worker binding | Nakul Jain | with client | Not provisioned |
| `SAHA_OIDC_CLIENT_SECRET` | Confidential client secret | Worker secret store, never in git | Nakul Jain | on provider policy, TBD | Not provisioned |
| `SAHA_OIDC_REDIRECT_URL`, `SAHA_OIDC_TOKEN_AUTH_METHOD` | Callback and auth method (configuration) | Worker binding | Nakul Jain | n/a | Not provisioned |
| `SAHA_ALLOWED_ORIGINS` | Exact trusted origins for mutations (configuration) | Worker binding | Nakul Jain | per host change | Set by deploy script for Cloudflare demo; on the droplet `https://education.aplyd.org`, passed as a `--var` by the systemd service (see [ARCHITECTURE-HOSTING](ARCHITECTURE-HOSTING.md)) |
| `SAHA_DEMO_ENABLED`, `SAHA_DEMO_INSTALLATION_ID` | Switch and marker for the synthetic demo (configuration) | Worker binding / demo launcher | Nakul Jain | n/a | Demo only; must be off with any real provider |
| `SAHA_ORF_APP_URL` | Reading-app launch URL | Worker binding | Nakul Jain | n/a | Blank by design |
| `SAHA_NOTIFICATION_EMAIL_FROM` | Sender address, delivery disabled | Worker binding | Nakul Jain | n/a | Not used |
| `DB_URL` | Dev database setting | Local env | Nakul Jain | n/a | Dev only |
| `CLOUDFLARE_API_TOKEN` | Limited token (Workers Scripts: Edit, D1: Edit) for `deploy-cloudflare.mjs` | Operator's shell only | Nakul Jain | after each use or on 90-day cycle, TBD | Never created |
| `CLOUDFLARE_ACCOUNT_ID` | Account identifier (not secret) | Operator's shell | Nakul Jain | n/a | Not provided |
| Droplet git token `/etc/saha/saha-education.git-token` | Read-only Contents access for `update.sh` | Droplet, root, mode 600 | Nakul Jain | Fine-grained tokens expire (30 days default); replace before expiry | Unknown whether in use |
| Droplet deploy key `/etc/saha/saha-education.deploy-key` | Read-only SSH deploy key, alternative to the token | Droplet, root | Nakul Jain | Does not expire; rotate on suspicion or staff change | Unknown |
| Password-wall list `/etc/saha/saha-education.users` | bcrypt hashes of per-person Caddy passwords | Droplet, root:caddy 0640 | Nakul Jain | Reset per person with `saha-education-add-user`; remove leavers | Unknown who has entries; **passwords are not recorded here** |
| Droplet SSH keys / DigitalOcean account / GitHub account | Admin access | Owner's accounts | Nakul Jain | TBD; use hardware MFA where possible | Not reviewed |
| Backup passphrase (`scripts/recovery.mjs`, 16 to 1,024 characters) | Encrypts snapshot envelopes | Owner's password manager | Nakul Jain | per backup policy, TBD | No backups made |
| Session tokens | Random per sign-in; only SHA-256 stored in `auth_sessions` | Database | System | 8-hour expiry | In use for demo sessions |

## Rules

Secrets stay out of git, issues, PR text, logs and screenshots. If a value is exposed, treat it as compromised and rotate ([RUNBOOKS.md](RUNBOOKS.md) 4, [INCIDENT-PROCESS.md](INCIDENT-PROCESS.md)). No secret scanner runs in CI (gap). There is no key-management service; the only cryptographic key material in the app is the provider's public signing keys fetched through OIDC discovery.
