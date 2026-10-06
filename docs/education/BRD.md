# Business requirements

> Documentation version 1.0 · 5 October 2026 · Draft for sponsor review.
> Describes the Next.js rebuild at `b4cbfc5f6855479ed523b5bf4c0aed0d2b6f6e3d`, not the legacy application on `main`.
> Requirements are proposed targets; code presence does not establish acceptance or production readiness.

## Purpose and problem

Schools need a coherent record of students, family relationships, courses, classes, enrolments, daily attendance, assessment results and term reports. Saha Education aims to reduce duplicate administrative work and give each stakeholder access to the records they are responsible for. These are product intentions inferred from the existing feature scope, not validated customer research.

## Stakeholders and responsibilities

| Stakeholder | Need | Proposed responsibility |
|---|---|---|
| Sponsor / school leadership | Reliable oversight and controlled rollout | Approve scope, policies and release acceptance |
| Administrator | Maintain school and academic records | Configure school, users, students, courses and classes |
| Teacher | Manage assigned teaching work | Record attendance, assessments and results |
| Guardian | Understand a linked child's progress | Read permitted attendance and published reports |
| Student | Understand personal academic progress | Read personal records and published reports |
| Operator | Reliable service and recoverable data | Manage environments, support and recovery |

No individual owner or approval date is assigned by this document.

## Scope

The proposed first release includes school and user administration, student profiles, guardian relationships, course and class setup, enrolment lifecycle, attendance, assessments/results, published term report cards and in-app notifications. Authentication and server-enforced school/class/student access are release prerequisites.

Excluded from this baseline: fees/payments, payroll, transport, admissions campaigns, live lessons, lesson-content authoring, examination proctoring, AI tutoring, government integrations, native mobile apps and offline synchronization. Email/SMS delivery is deferred until provider, consent and delivery policies are approved. Expansion needs a separate scope decision.

## Business outcomes and measurement

Proposed measures are: completion rate for enrolment and attendance workflows; time taken to prepare a term report; correction rate for attendance/results; family access success; and support incidents caused by unauthorized access or data loss. Before rollout, collect a synthetic baseline and agree targets with the sponsor. No claimed savings, adoption targets or customer validation exist in the reviewed repository.

## Business rules

1. Records belong to a school; changing request filters never grants authority over another school.
2. Teachers act within assigned classes; guardians act only for linked students; students see only themselves.
3. Draft results and reports require explicit publication before family/student visibility.
4. Attendance and result corrections need attributable history before real use.
5. Publishing a report must not imply successful external message delivery.
6. Withdrawal preserves the student's historical enrolment and academic record.

## Constraints and dependencies

The rebuild is a web application targeting Cloudflare Workers and D1. Existing authentication is a role-selection demo, and identity lifecycle is not implemented. The data model is an early baseline, with unconfirmed grading, retention, tenant administration and academic calendar policies. Production launch depends on resolving these, demonstrating recovery and obtaining operational and sponsor acceptance.

## Approval decisions

Approve which school types and jurisdictions are supported; who can create users and link guardians; academic terms and grading policy; attendance handling for excused absence; report publishing authority; retention/deletion requirements; and rollout scale. Until decided, requirements in this set remain a draft.
