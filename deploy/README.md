# Hosting Saha Education on DigitalOcean

Status: deployment kit, not yet run on a droplet. Synthetic data only. Real identity provider, paid AI and real-recipient delivery stay disabled, as in HANDOVER.md.

## What runs where

- One droplet, Ubuntu 24.04, **2 GB RAM or more** (the build needs it; a 1 GB droplet runs out of memory), Bangalore region.
- The app is the same build that ran on Cloudflare. It runs in the open-source Workers runtime (`wrangler dev --local`) under systemd, with its D1 database stored as a SQLite file in `/var/lib/saha-education/state`. No application code changed.
- Caddy terminates HTTPS (automatic certificate) and proxies to `127.0.0.1:3200`. Firewall allows 22, 80 and 443 only.
- The droplet pulls `main` every 3 minutes (`saha-education-update.timer`), builds, applies any new `drizzle/*.sql` once (ledger in `/var/lib/saha-education/applied-migrations.txt`) and restarts. Nothing connects in from outside to deploy.
- Release status: `/var/lib/saha-education/deploy-status.json` (commit, state, time).

## First-time setup

1. Merge this change into `main` (the droplet clones `main`).
2. Create the droplet. Create a GitHub fine-grained token with read-only "Contents" access to this repository only.
3. On the droplet, as root:

The repository is private, so copy `deploy/provision.sh` to the droplet first (scp, or paste it into a file). Then:

```bash
SAHA_GIT_TOKEN=<token> SAHA_HOST=education.<ip-with-dashes>.sslip.io bash provision.sh
```

A custom domain works the same way: point an A record at the droplet and pass it as `SAHA_HOST`.

## Operate

```bash
systemctl status saha-education            # journalctl -u saha-education -f
journalctl -u saha-education-update -n 50
cat /var/lib/saha-education/deploy-status.json
```

Rollback: revert the commit on `main`; the next timer run redeploys it. Data is untouched by a redeploy.

## Known limits

- `wrangler dev --local` is a development runtime, acceptable for the private synthetic demo and not for production or real learner data.
- The D1 database is one file on the droplet. Turn on DigitalOcean droplet backups (about 20% of the droplet price) before relying on it.
- Authentication is the demo role cookie from the application; nothing here adds real sign-in.

## Sharing one droplet with other Saha apps

Several apps can run on one droplet (recommended: 8 GB RAM for four apps). Each app has its own port, system service, database file and sign-in list. Run each app's `provision.sh` in turn with its own `SAHA_HOST` (for example `health.<ip-dashed>.sslip.io`, `agriculture.<ip-dashed>.sslip.io`).

- Caddy: each app writes `/etc/caddy/conf.d/<app>.caddy`; `/etc/caddy/Caddyfile` only imports that folder.
- Builds share one lock (`/var/lock/saha-build.lock`), so update timers never build two apps at once.
- Failure domain: one droplet means one crash, disk or build problem affects every app on it, and one backup covers all of them.

## Git access: token or deploy key

`provision.sh` reaches the private repository in one of two ways:

- `SAHA_GIT_TOKEN` set: a fine-grained GitHub token with read-only Contents access, stored in `/etc/saha/<app>.git-token`. Fine-grained tokens expire (30 days by default), after which the 3-minute updates stop until the file is replaced.
- `SAHA_GIT_TOKEN` unset: an ed25519 deploy key generated on the droplet at `/etc/saha/<app>.deploy-key`. The first run only prints the public key; add it to the repository under Settings > Deploy keys (read-only), then run `provision.sh` again. GitHub's SSH host keys are fetched from `api.github.com/meta` over TLS into `/etc/ssh/ssh_known_hosts`. Deploy keys do not expire and are scoped to one repository.

Both the first clone and every later update use the same method; `update.sh` picks the key automatically when the file exists.
