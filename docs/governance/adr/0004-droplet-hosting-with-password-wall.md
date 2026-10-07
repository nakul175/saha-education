# ADR 0004: Droplet hosting with a password wall and pull-based deploy

Status: in force for the private demo only (retrospective, written 2026-10-08) · Owner: Nakul Jain

Context: Cloudflare account deployment was never run and the private Sites hosting failed with no URL.
Decision: run the same build on one DigitalOcean droplet under systemd with `wrangler dev --local` and D1 as a SQLite file; Caddy provides HTTPS and a basic-auth wall in front, because the app has only its own demo role login; the droplet pulls `main` every 3 minutes and builds, migrates and restarts; nothing deploys inward.
Consequences: merging to `main` changes the running site within about 3 minutes; `wrangler dev --local` is a development runtime, not for real learner data; one failure domain; no MFA or lockout at the wall; backups not set up.
Links: [deploy/README.md](../../../deploy/README.md), [ARCHITECTURE-HOSTING.md](../ARCHITECTURE-HOSTING.md), [RUNBOOKS.md](../RUNBOOKS.md).
