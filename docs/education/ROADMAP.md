# Roadmap, risks and decision log

> Documentation version 1.0 · 5 October 2026 · Draft for sponsor review.
> Describes the Next.js rebuild at `b4cbfc5f6855479ed523b5bf4c0aed0d2b6f6e3d`, not the legacy application on `main`.
> Requirements are proposed targets; code presence does not establish acceptance or production readiness.

## Delivery sequence

| Stage | Deliverable | Exit evidence |
|---|---|---|
| 0: Approve baseline | Confirm school-management scope, policies and owners | Approved BRD/PRD/SRS and decisions below |
| 1: Protect records | Real identity, scoped authorization, closed public reads | UAT-01/02; adversarial served HTTP tests |
| 2: Complete setup | User/teacher management, student/guardian links, class/enrolment repairs | UAT-03/04/05 and persistent state |
| 3: Academic workflows | Reliable attendance, assessments, grades and report publication | UAT-06/07/08; failure/retry evidence |
| 4: User readiness | Role views, search, bounded lists, accessibility | UAT-09 and approved accessibility result |
| 5: Operate safely | Audit/privacy, release monitoring, backup/restore | UAT-10/11/12 and approved operating ownership |

No dates, budgets, staffing or completion claims are assigned. Estimate after the baseline and missing capabilities are agreed.

## Decisions requiring sponsor or operator input

| ID | Decision | Proposed owner | Current state |
|---|---|---|---|
| DEC-01 | Supported school types, jurisdictions and first pilot size | Sponsor | Open |
| DEC-02 | Identity provider, provisioning and guardian verification | Sponsor + engineering | Open |
| DEC-03 | Teacher/admin delegated powers and report publisher | School leadership | Open |
| DEC-04 | Term calendar, timezone, grading and excused-attendance policy | School leadership | Open |
| DEC-05 | Per-school identifier uniqueness and primary guardian policy | Product + data owner | Open |
| DEC-06 | Privacy, retention, correction/export/deletion and audit policy | Data owner | Open |
| DEC-07 | Hosting path, deployment trigger, service objectives and recovery targets | Operator | Open |
| DEC-08 | External messaging providers, consent, retries and costs | Sponsor | Deferred |
| DEC-09 | Legacy-to-rebuild migration versus clean synthetic start | Sponsor + engineering | Open |

Record decision date, owner, chosen option, alternatives, rationale, requirement impact and evidence. This table does not authorize deployment or provider activation.

## Risk register

| Risk | Consequence | Mitigation |
|---|---|---|
| Demo auth mistaken for real access control | Exposure or modification of student records | Synthetic-only boundary; stage 1 launch gate |
| Source presence mistaken for completeness | Failed teacher/family workflows | Served UAT evidence and current-state inventory |
| Health tooling reused without review | Wrong deployment, backups or misleading tests | Education-specific verification and preserved hosting config |
| Partial batch/publication failure | Inconsistent records or duplicate notices | Transaction/reconciliation/idempotency design |
| Main/rebuild branch confusion | Documentation applied to the wrong application | Immutable baseline links and explicit branch boundary |
| Unapproved school/privacy rules | Incorrect grades or record handling | DEC-03..06 before pilot |

## Next delivery

Agree the draft scope, then implement trusted identity/object scope and repair missing user/teacher administration. Keep accepted requirement evidence synchronized with the implementation; do not mark the overall product ready after a documentation change.
