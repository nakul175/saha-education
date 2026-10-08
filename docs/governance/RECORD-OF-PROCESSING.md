# Record of processing activities

Owner: Nakul Jain · Last reviewed: 2026-10-08 · Update trigger: any new data field, recipient, provider, host or purpose; any move from synthetic to real data.
**Agent-drafted 2026-10-08, not reviewed by a person or counsel; no certification or compliance claimed.** Modelled on the structure of GDPR Article 30 and used as a framework only; India's Digital Personal Data Protection Act 2023 (DPDP Act) has no identical record requirement, and which law applies to a given school is a legal question: TBD (owner: Nakul Jain, with counsel).
**Today the system holds synthetic data only.** This record describes what it is built to process if real data were ever loaded, which must not happen before the [DPIA](DPIA.md) is reviewed and the open decisions in [RETENTION-SCHEDULE.md](RETENTION-SCHEDULE.md) are made. Sources: [DATA-DICTIONARY.md](../specification/DATA-DICTIONARY.md), [BRD.md](../specification/BRD.md), [INTEGRATION-CONTRACTS.md](../specification/INTEGRATION-CONTRACTS.md), `deploy/`.

## Controller and contacts

Controller / data owner: the school or pilot operator, **TBD** (no pilot school is named). Project owner and technical contact: Nakul Jain, nakul.jain@aplyd.com. Data protection officer or grievance contact: TBD.

## Processing activities

| # | Activity | Data subjects | Personal data (tables) | Purpose | Lawful basis / consent | Recipients | Retention |
|---|---|---|---|---|---|---|---|
| 1 | Student registry | Students (children) | name, date of birth, admission number, grade level, school, optional account link (`students`, status and event tables) | Run the school's records | TBD | Same-school staff by role; linked guardians for their child | TBD |
| 2 | Guardian registry and family links | Guardians | name, phone, email, relationship, link to student (`guardians`, `student_guardians`, link detail/events) | Contact and family access to a child's published records | TBD; guardian verification policy open | Same-school admin; the guardian | TBD |
| 3 | Accounts and sign-in | Staff, guardians, students | name, email, role, school, identity issuer and subject, disabled flag, account change history; session token hashes; login-throttle bucket (hash of client address) | Authenticate and authorise | TBD | Administrators of the school | Sessions 8 h; others TBD |
| 4 | Attendance | Students | present, absent, late, excused by date and class, reviews and changes | Record and report attendance | TBD | Teachers of the class, admin, linked family | TBD |
| 5 | Assessments, results, report cards | Students | scores, feedback, report lines, corrections, publication receipts | Assess and report progress | TBD | Staff; family only after publication | TBD |
| 6 | Reading practice | Students | manually entered oral-reading metrics, corrections, imports. **No audio or transcripts are collected** (D-10) | Teacher review of reading | TBD | Staff | TBD |
| 7 | Teaching resources, curriculum references, learner submissions | Teachers, students | authored resources; learner text attempts and teacher feedback | Learning workflow | TBD | Author, class staff, the learner | TBD |
| 8 | Notices and audit | All roles | in-app notices and recipients; audit and correction notes | Communicate; accountability | TBD | Recipients; admins | TBD |
| 9 | Operations | Operators, droplet users | password-wall usernames (email) and hashes; web server and system logs | Secure and run the service | TBD | Owner | Log retention TBD |

## Recipients and processors (vendors)

| Party | Role | Data they see | Status |
|---|---|---|---|
| DigitalOcean (droplet host) | Hosting processor if used | All app data on the droplet | Kit only; no contract or data-processing terms reviewed |
| Cloudflare | Hosting processor if used | All app data in D1 | Never deployed |
| GitHub | Source host | Code only; synthetic data only | In use; never put real data there |
| OIDC identity provider | Authentication | Identity claims | Not chosen |
| External reading app (ORF) | Separate service | Nothing: launch-only link, no data forwarded | Not confirmed |
| Email / SMS providers | Delivery | None | Disabled; none chosen |

## International transfers

Droplet region Bangalore (India) per `deploy/README.md`; cloud-provider locations otherwise TBD. No transfer analysis done.

## Security measures

See [ACCESS-CONTROL.md](ACCESS-CONTROL.md), [THREAT-MODEL.md](THREAT-MODEL.md), [SECRETS-REGISTER.md](SECRETS-REGISTER.md).
