# Security and privacy requirements

> Documentation version 1.0 · 5 October 2026 · Draft for sponsor review.
> Describes the Next.js rebuild at `b4cbfc5f6855479ed523b5bf4c0aed0d2b6f6e3d`, not the legacy application on `main`.
> Requirements are proposed targets; code presence does not establish acceptance or production readiness.

## Current trust boundary

Demo identity derives from a client-provided role cookie. That is suitable only for synthetic demonstration. Declaring an identity provider variable does not turn it into production authentication. Every browser request, query key and record ID is untrusted. Authorization must be applied to both API and direct server-page access.

## Target controls

Use a trusted identity service with account provisioning, disabled-account enforcement and revocable sessions. Bind each account to approved school/role relationships and explicitly map student and guardian records. Enforce the PRD permission matrix on each object before database reads and writes. Test missing identity, wrong role, second school, unassigned teacher, unlinked guardian and another student's ID.

Use secure transport and correctly configured session cookies, validate mutation origins/CSRF protection for the chosen session design, apply bounded input and rate limits, return controlled errors, and avoid exposing secrets or record bodies in logs. Keep environment secrets in the approved secret store, not tracked files. No real personal information belongs in fixtures or screenshots.

## Threat register

| Threat | Current evidence | Required mitigation / proof |
|---|---|---|
| Role impersonation | saha_demo_role cookie | Verified identity; forged/expired session rejection |
| Cross-school/object access | Coarse roles, optional list filters | Mandatory object scope and negative HTTP tests |
| Unauthenticated report/result disclosure | GET handlers lacking identity | Protect all sensitive reads, including server pages |
| Notification tampering | Ownership check omitted | Recipient-only update and unrelated-ID rejection |
| Sensitive logging | Email/SMS stub logs title/body | Structured redacted logs; no message content |
| Lost or duplicate mutations | Sequential writes, no pair uniqueness | Concurrency rules, constraints and retry-safe publication |
| Data loss | Recovery not demonstrated | Isolated restoration drill and integrity evidence |

## Student-data handling

Inventory student names, date of birth, admission number, guardian contacts, relationship, attendance and grades before a pilot. Agree who controls the data, permitted purposes, access review, correction/export/deletion processes, retention and incident response. Jurisdiction-specific legal obligations require separate review; this document makes no compliance claim. Retention periods and guardian verification are open sponsor decisions.

## Audit and corrections

The schema has creation/update timestamps but no audit log or revision tables. Target evidence must identify actor, school, record, action and time, preserve correction history and avoid full sensitive payloads. Publication must retain the approved report version. A deletion or cleanup must not erase academic history without approved policy.

## Release gate

Use synthetic data until trusted identity, scoped access, private drafts, redacted logs, recovery and operating ownership are demonstrated. Record the evidence and acceptance decision. Real recipient/provider enablement requires a separate approved integration and rollout decision; no such enablement is included here.
