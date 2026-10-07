# Data protection impact assessment (draft)

Owner: Nakul Jain · Last reviewed: 2026-10-08 · Update trigger: before any real learner data is loaded; any new data field, provider, AI feature, or hosting change.
**Agent-drafted 2026-10-08, not reviewed by a person or counsel; no certification or compliance claimed.** Structure follows GDPR Article 35 (description, necessity and proportionality, risks, measures) as a framework only; the DPDP Act 2023 is consulted as a framework for children's data and security safeguards. Whether a formal assessment is legally required: TBD with counsel. Inputs: [RECORD-OF-PROCESSING.md](RECORD-OF-PROCESSING.md), [THREAT-MODEL.md](THREAT-MODEL.md), [SECURITY-PRIVACY.md](../education/SECURITY-PRIVACY.md).

**Conclusion today: do not load real data.** The system is a synthetic demo, not accepted for production, with no real identity provider, no tested restore, no retention policy and no named controller.

## 1. Description

A school administration app (records, attendance, assessment, reports, notices, teacher resources) used by administrators, teachers, guardians and students. Subjects include **children**. Scale and pilot school: TBD. Processing is described in the record of processing.

## 2. Necessity and proportionality

- Data collected are the fields the school workflows need; the app collects no audio, location, biometrics or advertising identifiers, and loads no third-party scripts, fonts or images (`security-headers.ts`).
- Guardians see only linked children and only published reports; students see their own records.
- Open: whether date of birth and admission number are both needed; field length limits; guardian verification; the grounds for processing children's data and who gives consent (the DPDP Act has specific rules for children's data and a verifiable-guardian-consent concept; GDPR Article 8 sets a child-consent age that varies by country; counsel to confirm which applies). TBD (owner: Nakul Jain).

## 3. Risks to individuals

| Risk | Likelihood | Severity | Notes |
|---|---|---|---|
| Another family's child data shown to a guardian | Low in tests, unknown in practice | High | Scope tests exist; coverage of the 150 current handlers to be verified |
| Staff over-access (teacher reads drafts, finding F6) | Medium | Medium | Policy undefined |
| Account takeover (no MFA, demo login behind a password wall only) | Medium | High | Real sign-in not set up |
| Loss of records (single file, no tested restore) | Medium | High | [BACKUP-DR.md](BACKUP-DR.md) |
| Excess retention (no schedule) | High | Medium | [RETENTION-SCHEDULE.md](RETENTION-SCHEDULE.md) |
| Inability to honour access, correction or erasure | High | Medium | No unified export or deletion; immutable evidence by design |
| Unauthorised disclosure through hosting or backups | Medium | High | Single droplet, no encryption-at-rest evidence |
| Profiling or automated decisions about children | None today | n/a | No AI or automated decision runs ([AI-FEATURES.md](AI-FEATURES.md)) |

## 4. Measures and decisions needed before real data

1. Name the controller and a grievance contact; decide lawful basis, notices and guardian consent flow.
2. Approve retention, deletion and export rules; implement or document manual procedures.
3. Configure the real identity provider; add MFA for staff; review access.
4. Production-grade hosting, encrypted off-host backups, a tested restore, monitoring.
5. Human accessibility and privacy review; breach-notification procedure with legal input.
6. Re-run this assessment with a reviewer; record the sign-off here.

## 5. Sign-off

| Reviewer | Role | Date | Decision |
|---|---|---|---|
| _none_ | | | Not reviewed |
