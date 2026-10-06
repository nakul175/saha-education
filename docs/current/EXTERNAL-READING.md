# External reading integration

Status: implementation candidate; destination and sign-in provider await confirmation. No deployment or real external assessment exchange has been performed.

## Launch and identity

`SAHA_ORF_APP_URL` enables the oral-reading-fluency app slot when it is an HTTPS URL without credentials, query or fragment. Keep it blank until the sponsor confirms the app. Signed-in school administrators and teachers can prepare a launch; other roles cannot. The destination receives no student identifiers or Saha credentials. Opening uses a separate tab without referrer information. This is a launch connection, not shared sign-in or automatic result synchronization.

Language Studio is a candidate found in the sponsor’s repositories. Its inspected implementation supports adult-reviewed English and Hindi reading, but its current authentication relies on its own Sites dispatcher. No supported external launch context, server result API or callback was found. Its documented hosted address has not been verified live or confirmed by the sponsor. Do not forward dispatcher headers or Saha session cookies.

## Reviewed records

The staff screen at `/external-apps` allows an administrator or assigned teacher to enter an adult-reviewed check for an accessible class and enrolled student. Stored records include passage reference, language, date, duration, attempted/correct counts and immutable recorder/school/source provenance. Correct words per minute and accuracy are calculated from the counts. Client scores are rejected. Records are append-only; matching retry keys return the same record and conflicting reuse is rejected.

These records are manually entered from an external app and are not authenticated exports from that app. No audio, transcript, full passage or external learner identifiers are collected. Family access awaits an explicit publication policy. Teacher historical visibility follows current class assignment and active enrolment; an approved historical policy remains outstanding. Reading dates use UTC and may need a school-timezone policy. No norms, grade cutoffs, diagnosis or claims of standardized assessment validity are supplied.

## Setup and verification

Apply migration `0002_reviewed_reading.sql` with the prior migrations in an authorized environment. Configure exact allowed origins and the already-required account/session setup. Confirm the actual external app URL before setting its binding. There are no external API keys or automated messages in this stage. Contract tests cover verified sessions, school/class/student scope, URL validation, strict input, calculated metrics and idempotent retries. These do not establish live external sign-in or result exchange.

See [literacy product plan](AMPLIFY-LITERACY-PLAN.md) for the confirmed AmplifiU comparison and phased delivery. Next decisions: confirmed reading app,  existing sign-in provider, curriculum/grades/languages and publication/correction policy.

## Delivery requirements and evidence

These are draft additions, not accepted changes to the historical requirements baseline.

| ID | Requirement | Evidence | Status |
|---|---|---|---|
| LIT-01 | Verified school staff launch only a trusted configured HTTPS destination without forwarding learner data or credentials. | `tests/integration/external-apps-contract.mjs` | Local contract verified; app confirmation pending |
| LIT-02 | Staff record reviewed numeric checks only for authorized enrolled students; clients cannot assign authorship or derived scores. | `tests/integration/reading-checks-contract.mjs` | Local contract verified; curriculum/policy review pending |
| LIT-03 | Preserve append-only provenance and reject conflicting retry payloads. | Same reading-check contract; additive migration0002 | Local contract verified; correction workflow outstanding |
| LIT-04 | Provide original skill teaching, practice and progress workflows informed by the confirmed AmplifiU comparison. | `AMPLIFY-LITERACY-PLAN.md` | Planned; curriculum and delivery scope pending |
