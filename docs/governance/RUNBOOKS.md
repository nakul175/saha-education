# Runbooks

Owner: Nakul Jain · Last reviewed: 2026-10-08 · Update trigger: any change to `deploy/*`, migration handling or secrets.
Status: agent-drafted from `deploy/` and the release documents; **none of these procedures has been rehearsed by a person on a real host.** Synthetic data only. Canonical longer text: [deploy/README.md](../../deploy/README.md), [RELEASE-CHECKLIST.md](../RELEASE-CHECKLIST.md), [docs/education/OPERATIONS.md](../education/OPERATIONS.md) (historical, draft). Host topology: [ARCHITECTURE-HOSTING.md](ARCHITECTURE-HOSTING.md).

Placeholders: `<host>` is the droplet's name. All droplet commands run as root.

## 1. Deploy

- Normal path: merge to `main` (sponsor decision); the droplet picks it up within about 3 minutes.
- Check: `cat /var/lib/saha-education/deploy-status.json` (fields `commit`, `state` ok or failed, `at`); `journalctl -u saha-education-update -n 50`.
- First-time setup: see "First-time setup" in `deploy/README.md` (`SAHA_HOST=<host> SAHA_FIRST_USER=<email> bash provision.sh`). If no git token is set, the first run prints a public deploy key to add under repository Settings > Deploy keys (read-only), then run it again.
- Force a run now: `systemctl start saha-education-update.service`.
- Before any release, follow [RELEASE-CHECKLIST.md](../RELEASE-CHECKLIST.md) sections 1 to 5.

## 2. Restart

```bash
systemctl restart saha-education
systemctl status saha-education
journalctl -u saha-education -f
curl -fsS -m 20 -o /dev/null http://127.0.0.1:3200/ && echo up
```

Proxy: `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` then `systemctl reload caddy`.

## 3. Rollback

Forward-only for data (RELEASE-CHECKLIST section 6): confirmed records, evidence and applied schema are never deleted.

1. Revert the bad commit on `main` through a pull request (sponsor merges). The next timer run redeploys. `deploy/README.md`: "Data is untouched by a redeploy."
2. The previous code must still work against the newer additive schema. Do not drop tables, columns, indexes or triggers; ship a new forward migration instead.
3. To stop updates while investigating: `systemctl stop saha-education-update.timer`. Restart them afterwards.
4. If a migration failed part-way, **do not retry the same file blindly** and do not edit it: the ledger line is appended only after a successful `d1 execute`, so inspect the database and the ledger first (section 7 of this page).

## 4. Secret rotation

Names and owners: [SECRETS-REGISTER.md](SECRETS-REGISTER.md). Never print or commit values.

- Droplet git token: write the new token to `/etc/saha/saha-education.git-token` (mode 600, root). Tokens expire; when they do, updates silently stop and `deploy-status.json` ages.
- Deploy key: generate a new key with `provision.sh` after removing the old file, add the new public key, remove the old one in GitHub.
- A person's password-wall sign-in: `saha-education-add-user <email>` replaces the entry and prints a new password once. To remove a person, delete their line from `/etc/saha/saha-education.users` and `systemctl reload caddy`.
- OIDC client secret and Cloudflare token: no live values exist; rotation steps are TBD (owner: Nakul Jain) until a provider is chosen.
- If a secret may have leaked, treat it as an incident ([INCIDENT-PROCESS.md](INCIDENT-PROCESS.md)).

## 5. Restore

Not rehearsed. Plan and limits are in [BACKUP-DR.md](BACKUP-DR.md). Never overwrite the live database to test a restore. Sessions restored from a snapshot may be revoked ones: review or invalidate them.

## 6. Add or reset a password-wall sign-in

`saha-education-add-user <email>` (validates the address, generates a 20-character password, stores a bcrypt hash with mode 0640 root:caddy, reloads Caddy). Give the password to the person over a private channel.

## 7. Inspect migration state

The ledger is `/var/lib/saha-education/applied-migrations.txt` (one filename per applied migration). Compare with `ls drizzle/*.sql` in `/opt/saha-education/src`. `node scripts/diagnose-migration-splitting.mjs` shows how files split into statements. The known hosting failure on another platform is described in [HOSTED-DEPLOYMENT-FAILURE.md](../current/HOSTED-DEPLOYMENT-FAILURE.md).
