# Service level objectives and alert catalogue

Owner: Nakul Jain · Last reviewed: 2026-10-08 · Update trigger: a pilot is agreed, monitoring is added, or targets are measured.
Status: **proposed targets, not measured.** No monitoring, alerting, uptime probe or on-call exists today (`docs/education/OPERATIONS.md`: "No working alerts ... or incident service is established"). `docs/specification/DECISIONS-RISKS.md` D-14 keeps nonfunctional targets open. Agent-drafted 2026-10-08; not reviewed by a person.

## Proposed SLOs (for discussion; nothing here has been agreed or measured)

| Service level indicator | Proposed target | Source of the measure | Measured today |
|---|---|---|---|
| Availability of the signed-in app, per calendar month | 99.0% (single droplet, no redundancy) | external probe of `/login` | No |
| Successful page and API responses (non-5xx) | 99.5% | Worker/Caddy logs | No |
| Update freshness: time from merge to `deploy-status.json` ok | within 15 minutes | `deploy-status.json` `at` | Partly: file exists on a provisioned droplet |
| Data loss on host failure | RPO TBD | [BACKUP-DR.md](BACKUP-DR.md) | No |

## Alert catalogue (proposed; none is wired)

| ID | Condition | Source | Severity | First action |
|---|---|---|---|---|
| A1 | `deploy-status.json` state is `failed`, or older than 30 minutes while `main` moved | file on droplet | High | RUNBOOKS 1 and 7; look at `journalctl -u saha-education-update` |
| A2 | `saha-education.service` not active | systemd | High | RUNBOOKS 2 |
| A3 | Local health check `http://127.0.0.1:3200/` fails | probe | High | RUNBOOKS 2 |
| A4 | Disk free below 20% on `/var/lib/saha-education` | host | Medium | free space; builds use 1 to 2 GB |
| A5 | Git token near expiry or update fetch failing | update log | Medium | RUNBOOKS 4 |
| A6 | Spike in 401/403 responses or sign-in rate-limit hits (20 per 10 minutes per client bucket) | logs | Medium | possible probing: INCIDENT-PROCESS |
| A7 | Any 5xx on a mutation route | logs | Medium | read persisted state before retrying; do not blind-retry |
| A8 | Caddy certificate renewal failure | Caddy log | Medium | `journalctl -u caddy` |

Alert destination, on-call owner and severity definitions: TBD (owner: Nakul Jain). Logging requirements (correlation IDs, no personal payloads) are stated in `docs/education/OPERATIONS.md` and not yet verified for the current build.
