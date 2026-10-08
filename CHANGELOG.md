# Changelog

Owner: Nakul Jain · Last reviewed: 2026-10-08 · Update trigger: every merge to `main` that changes behaviour, deployment or documentation set.

Reconstructed on 2026-10-08 from `git log origin/main` and the handover files; it is not a release history, because no version has been tagged (`package.json` stays at 0.1.0) and nothing has been accepted for production. Dates are commit dates. Detail and evidence per workstream: [docs/current/DEMO-integration.md](docs/current/DEMO-integration.md) and [VALIDATION.md](VALIDATION.md).

## Unreleased

- 2026-10-08 Governance document set added under `docs/governance/` (docs only; no application change).
- 2026-10-08 Deploy kit: Caddy password wall in front of the Education demo (#27).

## 2026-10-07

- Deploy kit for a DigitalOcean droplet: first kit (#24), several apps on one droplet (#25), explicit clone of `main`, writable wrangler scratch dir, bounded health check (#26). See [deploy/README.md](deploy/README.md).
- Overnight demo workstreams merged (#11 to #22): school records, courses and enrolment, attendance, assessments and reports, reading review, curriculum and submissions, notices and audit, identity, security and change control (CI workflow, security headers, migration 0025), experience and language pass.
- Cross-role demo journey check, Cloudflare deploy script (never run against a real account) and integration record (#23).

## 2026-10-06

- Preserved assessment-detail work finished on a continuation branch ([record](docs/current/ASSESSMENT-DETAIL-COMPLETION.md)).
- Claude continuation handover published ([docs/history/CLAUDE-HANDOVER-2026-10-06.md](docs/history/CLAUDE-HANDOVER-2026-10-06.md)); PR #6 had merged the verified combined application into `main` as `bdeea544`.

## Earlier (4 to 5 October 2026)

- Next.js rebuild baseline, trusted OIDC sign-in and access control (fail-closed when no provider is configured), teacher resources, reviewed reading and registry workflows, and the BRD to LLD specification pack. History: `git log`, [docs/current/](docs/current/).
