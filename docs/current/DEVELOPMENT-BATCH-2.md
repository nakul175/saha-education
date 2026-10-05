# Current authority and atomic report publication

Second implementation batch in the [four-hour continuation](FOUR-HOUR-DEVELOPMENT.md), based on first-batch commit `82f20ce9ae023bdb78d53aecc229331b57bce5eb`. Addresses the [independently reproduced original-domain findings](REMAINING-DOMAIN-REVIEW.md). This document describes the implementation boundary; actual final verification and source publication are recorded separately in [validation](../../VALIDATION.md).

## Current database authority

Common student, guardian and class scopes now include a matching enabled account with the principal's current school/role and a nonempty trusted issuer/subject mapping. An earlier session lookup does not authorize a later query after those properties change. Remaining school/course/account/report/notice queries and mutations use the same current authority. The principal contains account ID, school and role; this does not claim identity remapping or a match to an earlier cached issuer/subject.

Course/class creation uses a guarded INSERT SELECT. Class inserts and updates recheck the selected course school and currently enabled trusted teacher mapping in the actual statement. Late actor/reference changes yield safe conflicts while preserving original rows. Class detail and its scoped roster come from one joined query, retaining the existing response shape and family roster restrictions. The account picker exposes only IDs, names and roles for enabled mapped school accounts. School bootstrap remains operator provisioned.

## Publication winner and recipients

Additive migration 0012 introduces six-field private `report_publication_receipts`, unique per report and immutable after insertion. An authorized receipt INSERT SELECT only selects a currently unpublished report whose student remains in the administrator's school. Database triggers verify current authority, publish exactly one report or abort, and select eligible guardian recipients from the current student–guardian/profile/account relationships. Report publication, receipt and deterministic in-app notices commit in one SQL statement. A failed publication or notice insertion rolls back the entire statement.

A concurrent legitimate publication or retry reads the authorized saved report and creates no extra notice. Existing published reports retain their original timestamps without invented receipts or notices. Old personal notices remain historical recipient-owned records; no unlink-related deletion or retention policy is introduced. Newly created notices require current eligibility. Publication receipts stay private and do not change family API response shapes.

Generic notice creation rechecks current actor, enabled mapped recipient, school and teacher relationship at insertion. Personal feed and read-status writes recheck current authority. Repeated mark-as-read preserves the first read timestamp and original update timestamp, allowing a lost response to be safely retried for the same notice. No external email/SMS delivery is activated.

## Role-appropriate screens and truthful recovery

The report screen loads its verified role and scoped students. Only administrators can create drafts or see publication controls. Each stored draft must be reviewed using its visible checkbox before the UI sends the existing publication request. This checkbox is a local interaction; no server-side review reason or new publication request UUID is invented. Student changes and list failures clear previous report rows, and obsolete responses are ignored.

Saving a draft has no new idempotent creation guarantee. A lost or uncertain save keeps entered text and blocks another creation until an explicit report reload and check. Publication retries are naturally bound to the same report. Notice-read failures retain the inbox and tell the user to retry the same record. List and save failures are visible, rather than console-only events.

Existing school/class/course screens are aligned to verified school and role: administrators maintain school details and create eligible school courses/classes; other roles see their scoped lists without administrator forms or account-picker requests. The unavailable school-bootstrap action and duplicated null-principal shell are removed. Independent real-browser checks cover legitimate saves, role controls, lost replies, rejected/uncertain writes, failed refreshes and mobile labels/width.

## Verification boundary

Targeted session-backed SQLite, raw SQL trigger and D1-driver contracts have passed during implementation. A populated encrypted local recovery roundtrip includes real publication receipt and notice evidence. Final fresh build passed. The guarded run passed 3,619 checks across 28 meaningful suites, with 104 new served checks, 36 report/notice browser checks, 26 structure browser checks and 54 separate automated accessibility samples. Prior served/browser journeys and 37 offline prototype checks also passed. See the [actual execution record](DEVELOPMENT-BATCH-2-EXECUTION.json) for timestamps, counts and limits.

The v2.3 specification matches final source: 35 tables/294 fields, 51 routes/84 handlers and 157 designed cases across 25 scenarios. Designed procedures remain unrun for the specification and business approvals remain false. All work remains synthetic and local. No main merge, hosted deployment, live identity/ORF provider, paid AI or real messaging is activated. Academic grade/date/retention policy, representative load/accessibility and educator/UAT acceptance remain separate dependencies.
