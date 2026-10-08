# Hosting Saha Education on DigitalOcean

Status: deployment kit, in use since October 2026 on the shared droplet `saha-apps` (64.227.190.72) for the Education demo at `https://education.aplyd.org` (see "Public origin and the demo switches" below for how the running unit differs from this kit). Synthetic data only. Real identity provider, paid AI and real-recipient delivery stay disabled, as in HANDOVER.md.

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
SAHA_HOST=education.<ip-with-dashes>.sslip.io SAHA_FIRST_USER=<email> bash provision.sh
```

A custom domain works the same way: point an A record at the droplet and pass it as `SAHA_HOST`.

## Operate

```bash
systemctl status saha-education            # journalctl -u saha-education -f
journalctl -u saha-education-update -n 50
cat /var/lib/saha-education/deploy-status.json
```

Rollback: revert the commit on `main`; the next timer run redeploys it. Data is untouched by a redeploy.

## Public origin and the demo switches (one host per app)

The unit file passes two upstream flags and three `--var` switches to the Worker, and `provision.sh` substitutes `SAHA_HOST` into the unit as it does into the Caddyfile. Both were missing from the first version of this kit.

Why they exist. On 8 October 2026 the droplet copy of Education refused every browser write with 403. `requireSameOrigin` in `lib/education/identity.ts` accepts a write only when the request's `Origin` header equals the origin of `request.url` and is listed in `SAHA_ALLOWED_ORIGINS`. Under `wrangler dev --local` without an upstream setting, Miniflare gives the Worker `http://127.0.0.1:3200` as its own URL, so behind the proxy no browser origin could ever match. `--local-upstream SAHA_HOST --upstream-protocol https` makes `request.url` carry the public https origin and the writes pass. The same copy had no demo switches at all (`wrangler.json` has `vars: {}` and the unit set no `--var`), so its sign-in page offered a demo entry that answered "demo switched off" and a school sign-in that was not configured.

One origin per process. The Worker serves exactly one origin: `--local-upstream` takes one host, and `SAHA_ALLOWED_ORIGINS` must be exactly `https://SAHA_HOST`. Any second name for the app, such as the `<app>.<ip-dashed>.sslip.io` name after a move to a custom domain, must answer a redirect to `SAHA_HOST` in Caddy and must not be proxied to the app; served under a second name, every write fails again with 403.

The three demo variables. `SAHA_DEMO_ENABLED:true` and `SAHA_DEMO_INSTALLATION_ID:<uuid4>` turn on the synthetic demo sign-in with the role picker; any `SAHA_OIDC_*` setting switches the demo off again (`lib/education/demo-policy.ts`). The kit is for synthetic data only. On the first demo sign-in, when the database is pristine (no school, user or demo installation yet), the app seeds its own small synthetic school. To load the rich demo school instead, generate it with `node scripts/seed-demo.mjs --out seed.sql --installation 5a4a0e26-6d0c-4a3e-9c1d-0e2600000a10` (the same installation id as the unit) and apply it before the first demo sign-in, the way `update.sh` applies migrations: from `/opt/saha-education/src`, with the service stopped, `wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to /var/lib/saha-education/state --file seed.sql`. Once the small school exists the rich one is not loaded.

State on the shared droplet (8 October 2026). The installed unit predates this change, so the flags live in a systemd drop-in, `/etc/systemd/system/saha-education.service.d/public-origin.conf`, which resets `ExecStart` and repeats it with the flags. The canonical host is `education.aplyd.org`; `education.64-227-190-72.sslip.io` answers 301 to it. The small self-seeded school is in use; the rich `scripts/seed-demo.mjs` school was not loaded. When the unit is next installed from this kit (a re-run of `provision.sh`), delete the drop-in first, so that the two `ExecStart` lines do not drift apart. `docs/governance/ARCHITECTURE-HOSTING.md` and `docs/governance/SECRETS-REGISTER.md` still describe the old state ("droplet value TBD" for `SAHA_ALLOWED_ORIGINS`, and no known path for the demo switch to reach the Worker); they should be corrected in a documentation pass.

## Known limits

- `wrangler dev --local` is a development runtime, acceptable for the private synthetic demo and not for production or real learner data.
- The D1 database is one file on the droplet. Turn on DigitalOcean droplet backups (about 20% of the droplet price) before relying on it.
- Sign-in is a Caddy password wall (one username and password per person, `sudo saha-education-add-user <email>` prints a random password once; only the bcrypt hash is stored). Behind it the application still uses its own demo role login. There is no MFA, lockout or real sign-out.

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
