# Data-subject request procedure, including guardians and minors

Owner: Nakul Jain · Last reviewed: 2026-10-08 · Update trigger: retention decision, a first real request, change in export/deletion capability, legal advice.
**Agent-drafted 2026-10-08, not reviewed by a person or counsel; no certification or compliance claimed.** A proposed procedure using GDPR Chapter III (access, rectification, erasure, restriction, portability) and the DPDP Act 2023 data-principal rights (access, correction, erasure, grievance, nomination) as frameworks only. Deadlines and legal duties: TBD with counsel. It applies only once real data exists; today all data is synthetic.

## Who may ask

- An **adult data subject** (staff member, or a guardian about their own data).
- A **guardian about a child**. Children's data is a specially protected case in both frameworks, and a guardian normally acts for a minor. The age of majority, and when a student may act for themselves, is a legal and school-policy question: TBD (owner: Nakul Jain).
- A student who is an adult by law, for their own records.

## Verify the requester (before disclosing anything)

1. Request arrives at the school's contact (the school is the controller; TBD) or via nakul.jain@aplyd.com, which forwards to the school.
2. Confirm identity through the school, not by email address alone: for a guardian, confirm they are linked to that student (`student_guardians`); the app maps guardians only by explicit link, never by email match. Link verification policy is an open decision.
3. Where guardians disagree or custody is disputed, stop and ask the school leadership. Do not release to either side until resolved.
4. Log the request: date, requester, child (by internal id), type, decision, who handled it. Keep the log free of record contents. A log table does not exist yet: TBD.

## Handling by request type

| Request | What the system can do now | Gap |
|---|---|---|
| Access / copy | A school administrator can view records in the app; the guardian already sees published reports, attendance and notices. **There is no unified export** (D-10; "unified export/retention" is listed as pending) | Build or script an export; until then a manual compile by an administrator with a second-person check |
| Correction | Corrections **append** (reasoned corrections beside the original; reviewed edits with history). Originals are retained for evidence | Decide when an original must be redacted instead |
| Erasure / withdrawal | **Not supported**: evidence tables are immutable by database triggers; no deletion procedure; backups unaddressed | Legal decision on what must be erased versus kept for the school's legal duties; reviewed migration or procedure; backup handling |
| Restriction / objection | Admin can set a student inactive (does not change sign-in or family visibility) or disable an account | Define the effect on visibility |
| Portability | None | Part of export design |
| Grievance | Contact above | Grievance officer: TBD |

## Minors: extra rules

- Never contact or disclose to a child directly about another person's data.
- Disclosure to a guardian covers only that guardian's linked child and only what the guardian role may already see unless the school approves more.
- Do not profile or target children; no analytics or advertising exists ([AI-FEATURES.md](AI-FEATURES.md)).
- Before processing a child's data for a new purpose, update the [record of processing](RECORD-OF-PROCESSING.md) and [DPIA](DPIA.md).

## Time limits and records

Response deadlines: TBD (GDPR is typically one month; the DPDP Act timelines depend on rules to be confirmed; counsel to advise). Keep each request's log entry and the decision.
