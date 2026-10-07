# Compliance control mapping

Owner: Nakul Jain · Last reviewed: 2026-10-08 · Update trigger: a framework is formally adopted, a control changes, or legal advice is received.
**Agent-drafted 2026-10-08, not reviewed by a person or counsel. This is an internal mapping of existing controls to framework themes. No certification or compliance is claimed, and no framework has been adopted.** Frameworks are named as reference points only; section numbers are as commonly cited and must be checked by counsel.

Status key: Partial = some evidence exists; Gap = nothing exists; N/A = not applicable yet.

| Theme (framework reference) | Control in this repo | Evidence | Status |
|---|---|---|---|
| Lawful basis and consent, children's data (GDPR Art. 6, 8; DPDP Act 2023 consent and children's provisions) | None decided | [DPIA.md](DPIA.md) | Gap |
| Records of processing (GDPR Art. 30) | Draft record | [RECORD-OF-PROCESSING.md](RECORD-OF-PROCESSING.md) | Partial |
| DPIA (GDPR Art. 35) | Draft assessment, unreviewed | [DPIA.md](DPIA.md) | Partial |
| Data minimisation and storage limitation (GDPR Art. 5; DPDP Act) | No audio or tracking collected; retention undecided | [RETENTION-SCHEDULE.md](RETENTION-SCHEDULE.md) | Partial |
| Data-subject / data-principal rights (GDPR Ch. III; DPDP Act rights and grievance) | Procedure drafted; no export or erasure capability | [DATA-SUBJECT-REQUESTS.md](DATA-SUBJECT-REQUESTS.md) | Partial |
| Security of processing, reasonable safeguards (GDPR Art. 32; DPDP Act security safeguards) | Server-side authorisation, hashed sessions, headers, immutable evidence, tests | [ACCESS-CONTROL.md](ACCESS-CONTROL.md), [THREAT-MODEL.md](THREAT-MODEL.md), [SECURE-DEV-EVIDENCE.md](SECURE-DEV-EVIDENCE.md) | Partial |
| Data protection by design and default (GDPR Art. 25) | Providers, AI and recipients off by default; synthetic-only rule | [ADR 0003](adr/0003-synthetic-data-and-providers-off.md) | Partial |
| Breach notification (GDPR Art. 33-34; DPDP Act breach intimation) | Incident process drafted; no regulator or school notification path | [INCIDENT-PROCESS.md](INCIDENT-PROCESS.md) | Partial |
| Processor terms and transfers (GDPR Art. 28, 44+; DPDP Act cross-border provisions) | Vendor list only | [RECORD-OF-PROCESSING.md](RECORD-OF-PROCESSING.md) | Gap |
| Access control and least privilege (ISO 27001 style access management) | Role and scope model | [ACCESS-CONTROL.md](ACCESS-CONTROL.md) | Partial |
| Logging and audit (OWASP ASVS logging themes) | Audit trail for school changes; infrastructure logs unreviewed | [GUIDES.md](GUIDES.md), THREAT-MODEL T14 | Partial |
| Change management | PR template, CI gate, migration rules, release checklist | [RELEASE-CHECKLIST.md](../RELEASE-CHECKLIST.md) | Partial |
| Backup and recovery (ISO 27001 style continuity) | Snapshot tool only | [BACKUP-DR.md](BACKUP-DR.md) | Gap |
| Supplier and supply-chain management | Lockfile policy, inventory | [SBOM.md](SBOM.md) | Partial |
| Accessibility (WCAG 2.2 AA) | Automated checks on WCAG 2.1 tags | [ACCESSIBILITY-STATEMENT.md](ACCESSIBILITY-STATEMENT.md) | Partial |
| Application security verification (OWASP ASVS) | Authorisation matrix and hardening tests | [the security record](../current/DEMO-security-change-control.md) | Partial |
| AI governance | No AI present | [AI-FEATURES.md](AI-FEATURES.md) | N/A |
| Certification (SOC 2, ISO 27001) | None sought | none | N/A |
