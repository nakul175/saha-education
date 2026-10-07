# Deploy the demo to your Cloudflare account

This puts the same invented school that `pnpm demo` runs locally on a public address in your own Cloudflare account. Only synthetic records are loaded. Real sign-in, reading-app (ORF) sync, paid AI drafting and delivery to real people stay off: the script never writes a setting for any of them and removes any such setting from its own environment.

**Status, stated plainly:** this deployment path has been packaged and dry-run (`--dry-run` below) but **has not been run against a real Cloudflare account**, because no credentials were available when it was written. The first live run is the first proof. The script therefore ends by checking the live address itself and prints the address only if every check passes.

## What you need

1. A Cloudflare account (the free Workers and D1 plans are enough for a demo).
2. An API token for that account with only these permissions: **Workers Scripts: Edit** and **D1: Edit** (account level). Create it under *My Profile, API Tokens, Create Token, Custom token*. Do not use the global API key.
3. The 32-character **account id** (shown on the Workers & Pages overview page).
4. Node 22.13 or newer and `pnpm install` done in this repository.

## Run it

```
export CLOUDFLARE_API_TOKEN=...      # the limited token
export CLOUDFLARE_ACCOUNT_ID=...
node scripts/deploy-cloudflare.mjs
```

| Option | Meaning |
| --- | --- |
| `--dry-run` | No account and no network. Packages the Worker with the deploy configuration, checks the demo switch is on and that no real-provider setting is present, and builds the seed. Safe to run anywhere. |
| `--name saha-education-demo` | Worker name (becomes part of the address). |
| `--db saha-education-demo-db` | D1 database name. |
| `--origin https://demo.example.org` | Use your own domain instead of the workers.dev address. You must attach the domain to the Worker in Cloudflare yourself. |
| `--reseed` | Delete the demo database and create it again (only ever holds invented records). |
| `--rebuild` | Build again before deploying. |
| `--anchor 2026-10-06` | Pin the term dates in the invented school (default: today). |

What it does: builds the Worker, finds or creates the D1 database, loads every migration plus the invented school once, deploys, reads the workers.dev address Cloudflare prints, pins `SAHA_ALLOWED_ORIGINS` to that exact https origin (the Worker refuses writes from any other origin) and deploys again, then checks the live address: the sign-in page answers, security headers are present, a demo sign-in works for each of the four roles, 40 students are loaded, a guardian is refused the administrator list and a write from another origin is refused. Re-running is safe: a database that already holds the demo is not loaded twice.

## Before you share the link

The demo has no passwords. Anyone with the address can tick the fictional-records box and sign in as an administrator, teacher, guardian or student of the invented school. That is intended for a demonstration and exposes no real data, but the address is public and the pages are indexable. If the link will travel beyond people you trust:

- Put **Cloudflare Access** (Zero Trust, free for a few users) in front of the Worker, or
- use a custom domain behind your own gate, or
- delete the deployment when the demonstration is over (below).

The demonstration shows one fixed set of invented people. Nothing typed into it is protected, backed up or private; do not enter real student details.

## Remove it

```
node node_modules/wrangler/bin/wrangler.js delete --name saha-education-demo
node node_modules/wrangler/bin/wrangler.js d1 delete saha-education-demo-db
```

## What is verified and what is not

| Claim | Evidence |
| --- | --- |
| The Worker builds and packages for Cloudflare | `node scripts/deploy-cloudflare.mjs --dry-run`: Total upload about 5.1 MiB, 1.2 MiB gzip, which fits the Workers script size limits on the free and paid plans (published limits change; check Cloudflare's current page). |
| The same Worker, migrations and invented school run correctly locally | `pnpm demo`, and the mounted browser procedures listed in [the integration record](current/DEMO-integration.md). |
| The deploy script's live steps (create database, load seed, deploy, live checks) | **Not run.** They are written against the Cloudflare command line but have not met a real account. |
| Loading the seed (about 850 KiB of SQL containing triggers) into remote D1 in one `d1 execute --file` | **Not verified on D1.** An earlier private hosting runner failed with `incomplete input: SQLITE_ERROR` on this repository's migrations ([hosting record](current/HOSTED-DEPLOYMENT-FAILURE.md)); the cause was never established. If the load step fails, the script stops there, leaves the Worker undeployed and shows Cloudflare's message; send that message back. |
| Any behaviour on a real school's identity provider | Not covered. Real sign-in settings are unprovided and demo mode switches off when they are present. |

Original migrations 0000 to 0016 are untouched. Six of them (0005, 0010, 0012 to 0015) put several statements in one piece; see finding M1 in [the security record](current/DEMO-security-change-control.md).
