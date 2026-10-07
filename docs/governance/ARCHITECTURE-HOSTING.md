# Architecture addendum: how the app is hosted

Owner: Nakul Jain · Last reviewed: 2026-10-08 · Update trigger: any change to `deploy/`, `worker/`, `wrangler` settings, or to where the app runs.
Canonical architecture documents: [docs/ARCHITECTURE.md](../ARCHITECTURE.md) (layers), [HLD](../specification/HLD.md) and [LLD](../specification/LLD.md) (components, trust boundaries). This page adds only the hosting facts those pages lack, taken from [deploy/README.md](../../deploy/README.md), the deploy scripts and [DEPLOY-CLOUDFLARE.md](../DEPLOY-CLOUDFLARE.md). Sign-in credentials are deliberately not recorded anywhere in this repository.

## Runtime

- Next.js 16 / React 19 built with vinext/Vite into a Cloudflare-style Worker (`worker/index.ts`), with a D1 (SQLite) binding named `DB` and Drizzle ORM. Business logic is in `lib/education/`; routes in `app/api/`.
- The Worker adds browser security headers to every response (`lib/education/security-headers.ts`) and forces `Cache-Control: no-store` on non-asset responses.

## Topologies that exist in the repo (none is production)

| Topology | State | Evidence |
|---|---|---|
| Local demo (`pnpm demo`, port 8787, database in `.wrangler/demo`) | Works; synthetic school | [docs/DEMO.md](../DEMO.md) |
| DigitalOcean droplet (below) | Deploy kit; the `deploy/README.md` status line says "not yet run on a droplet". Whether a droplet is live, and its address: TBD (owner: Nakul Jain) | `deploy/` |
| Cloudflare Workers + D1 | Script and dry run exist; **never run against a real account**; no hosted URL | [DEPLOY-CLOUDFLARE.md](../DEPLOY-CLOUDFLARE.md) |
| Private Sites hosting | Failed at migration time (`incomplete input: SQLITE_ERROR`), no URL; cause unknown | [HOSTED-DEPLOYMENT-FAILURE.md](../current/HOSTED-DEPLOYMENT-FAILURE.md) |

## DigitalOcean droplet (from `deploy/`)

```
Internet -> Caddy :443 (automatic HTTPS, basic-auth wall) -> 127.0.0.1:3200 (wrangler dev --local, systemd unit saha-education)
                                                             |
                                                             +-> D1 as a SQLite file under /var/lib/saha-education/state
```

- Ubuntu 24.04, 2 GB RAM or more, Bangalore region; firewall allows ports 22, 80 and 443 only; the app listens on 127.0.0.1.
- **Password wall:** Caddy asks for a username (an email address) and password from `/etc/saha/saha-education.users` (bcrypt hashes) before any request reaches the app. Behind it the app still has its own demo role login. No MFA, lockout or real sign-out. Credentials are created with `saha-education-add-user <email>`, which prints a random password once and stores only the hash.
- **Pull-based deploy:** `saha-education-update.timer` runs `deploy/update.sh` every 3 minutes: fetch `main`, and if it moved, `pnpm install --frozen-lockfile`, `pnpm run build`, stop the service, apply each `drizzle/*.sql` not yet in the ledger `/var/lib/saha-education/applied-migrations.txt`, restart, then check `http://127.0.0.1:3200/` and write `/var/lib/saha-education/deploy-status.json`. Nothing connects in from outside to deploy. A flock prevents overlapping updates, and `/var/lock/saha-build.lock` serialises builds across apps on one droplet.
- **Database:** `wrangler dev --local` is a development runtime. It is acceptable for the private synthetic demo and not for production or real learner data (`deploy/README.md`, "Known limits"). The D1 database is one file; droplet backups are advised but not shown to be on.
- **Merging to `main` changes the running site within about 3 minutes.** A docs-only merge only refreshes the checkout (the update script still rebuilds when the commit changes).
- **Git access:** a read-only fine-grained token in `/etc/saha/saha-education.git-token` (expires, default 30 days) or an ed25519 deploy key at `/etc/saha/saha-education.deploy-key`.
- Several Saha apps can share one droplet (own port, service, database file and user list each); one failure domain.

## Not yet defined

How the demo switch (`SAHA_DEMO_ENABLED`) and `SAHA_ALLOWED_ORIGINS` reach the Worker on the droplet: the systemd unit sets only `SITES_RUNTIME_ROOT`, and `deploy/` shows no other source. TBD (owner: Nakul Jain). The service runs as user `saha` with `NoNewPrivileges`, `PrivateTmp` and `ProtectHome`; the update job (build and `pnpm install`) runs as root.

Production hosting, identity provider, monitoring destination, backup schedule and RPO/RTO: TBD (owner: Nakul Jain). See [SLO-ALERTS.md](SLO-ALERTS.md) and [BACKUP-DR.md](BACKUP-DR.md).
