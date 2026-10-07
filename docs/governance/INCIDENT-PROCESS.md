# Incident process

Owner: Nakul Jain · Last reviewed: 2026-10-08 · Update trigger: first real incident, a pilot starting, or a change of contacts.
Status: agent-drafted 2026-10-08, not reviewed by a person or counsel. Extends the short incident section in [docs/education/OPERATIONS.md](../education/OPERATIONS.md). Today only synthetic data is held, so a data incident means a lapse in controls, not a leak of real people's data. This changes the moment any real learner data is loaded.

## Roles

- Incident lead and sponsor: Nakul Jain (nakul.jain@aplyd.com). Backup contact: TBD (owner: Nakul Jain).
- Reporting route for security issues: [SECURITY.md](../../SECURITY.md).

## Severity (proposed)

| Level | Meaning | Example |
|---|---|---|
| SEV1 | Possible exposure of real personal data, or loss of confirmed records | a guardian sees another family's child; database file lost |
| SEV2 | Service down or core workflow blocked | app not starting after a deploy |
| SEV3 | Degraded or single-feature fault | one page failing |

## Steps

1. **Detect and record:** start time, revision (`deploy-status.json`), environment, symptom, reporter. Open a private note; keep it free of personal data.
2. **Contain:** restrict access (Caddy wall users, `systemctl stop saha-education` if needed). To cut access for one account, set `disabled_at` through the admin account workflow; disabled accounts fail on the next request ([AUTH-ACCESS](../current/AUTH-ACCESS.md)). Stop the update timer if a bad commit keeps redeploying.
3. **Preserve:** keep logs and the database file untouched; copy before changing anything. Do not delete confirmed records or evidence.
4. **Assess:** which records and people are affected? For uncertain writes, read the persisted state first; never blind-retry a mutation.
5. **Fix forward:** revert via pull request or add a forward migration ([RUNBOOKS.md](RUNBOOKS.md) 3).
6. **Notify:** the sponsor immediately for SEV1. Whether and whom to notify externally (schools, guardians, a regulator) is a legal decision: TBD (owner: Nakul Jain), with counsel. Frameworks to consult, not a compliance claim: India's Digital Personal Data Protection Act 2023 and the GDPR (see [COMPLIANCE-MAPPING.md](COMPLIANCE-MAPPING.md)).
7. **Review:** within 5 working days write a blameless postmortem with [POSTMORTEM-TEMPLATE.md](POSTMORTEM-TEMPLATE.md) and store it in `docs/governance/postmortems/` (none exist yet).

## Incident log

| Date | Severity | Summary | Postmortem |
|---|---|---|---|
| _none recorded_ | | | |
