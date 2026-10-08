# Calm workspace redesign

8 October 2026. The sponsor approved the Calm workspace mockup and explicitly requested application-wide implementation, merge and deployment. Source branch: `feat/calm-workspace-redesign`, based on main `75e9f97cbebf3f29d6ea67c65598c16d22fd4da0`. Historical delivery and acceptance records remain unchanged.

## Implemented boundary

The shared shell and global design tokens now apply the approved sage, forest and warm-paper palette throughout the application. Navigation groups existing destinations into Today, Classroom, Attendance, Teaching, Reading, Progress and School, with the existing role visibility. A phone drawer supports keyboard focus containment, Escape dismissal and return to the opener. Tables retain their scrolling containers, forms keep labels and review controls, and print styles omit navigation. Teaching, reading, notices, notifications and account/admin layouts now use the same shell as classroom and registry pages, with one main landmark.

The four role dashboards have clearer task hierarchies and real scoped counts. The teacher's first assigned class is a starting action, not an invented timetable or recommendation. Full assessment coverage and invalid/ambiguous evidence remain available. Orientation guidance is a collapsed native disclosure. The resource draft editor separates planning, student material and optional staff notes; all existing required fields, exact-request recovery, saved-version review and assignment boundaries remain. Attendance has an intended/current count strip and quick status controls; the accessible status list remains in a disclosure. No record is saved by choosing a status or marking unrecorded students present: reason, explicit review, original snapshots and the existing save flow still apply.

Profiles show actual names and link to student-scoped attendance and reading history. The reading deep link selects an available authorized class associated with that student, using existing scoped endpoints. The existing client/server role and scope checks still run.

Header names come from the existing authenticated account endpoint. Its body remains unchanged; a new `x-saha-account-scope` response header carries the SHA-256/base64url digest of `[userId, role, schoolId-or-null]` solely to bind display metadata to the exact parent principal. It is predictable metadata, not an access credential. Null/changed parents and sign-out withhold old names/navigation. Account fetching never establishes page authority.

No migrations, schema changes, real-provider activation, paid AI, external reading transmission or real-recipient messages are part of this change. Existing records, revision history, retries and receipts remain intact.

## Verification

The final local release run passed 79 suites, 62,627 assertions, zero failures/skips; all 78 existing regression baselines passed without quarantine or reduced counts. The new navigation suite contributes 36 assertions. The demo-login source-mounted harness passed 257 assertions across 28 scenarios, including exact-parent friendly-name binding and mismatched response-scope rejection. These are isolated contracts, not browser or business acceptance.

The build and TypeScript checks passed using Node 24.19.0. The repository lint command passed with zero errors and 12 retained warnings. Native SQLite portability calibrations still reject over-limit queries; the harness now supports a statically linked Python runtime by resolving the system SQLite library when `_sqlite3.__file__` is absent. No limit or assertion was relaxed. The earlier runs with an old Python and then an unavailable native-library path failed; the recorded passing release run followed both corrections.

Manual browser checks used an isolated local Worker at port 8798 and `.wrangler/calm-preview-2026-10-08`, with fictional River School data. Teacher login/dashboard, resource editor, student directory/profile, student-specific reading history, a reviewed 20-student attendance save and reload, administrator/guardian/student dashboards and approved student class material were inspected. A stale module URL during an in-place local rebuild produced a load error; restarting the Worker and reloading the final build restored the learning page. The resource page at 390px and attendance register at 320px had no document overflow. The phone menu opened, focused its close control and returned focus to its opener on Escape. The guardian dashboard at 390px had no document overflow. This sampling is not a full route, screen-reader, accessibility or educator acceptance run.

[Desktop teacher preview](../design/calm-workspace-desktop.jpg) and [phone family preview](../design/calm-workspace-mobile.jpg) are local synthetic screenshots. They are not hosted-deployment evidence.

Older mounted browser procedures that target flat navigation labels, visible orientation guidance, the old profile heading, a detached inbox or the attendance select without opening its disclosure need intentional adaptation. Their historical results retain their original source boundary; none is claimed rerun here. The canonical 371 designed cases and all approval flags remain unchanged.

## Deployment and continuation

Requested destination: the existing private host at `https://education.aplyd.org`. The checked-in DigitalOcean updater pulls main every three minutes, builds, checks its migration ledger and restarts the application. GitHub CI verifies source only; it does not deploy. Host revision proof is `/var/lib/saha-education/deploy-status.json` plus authenticated hosted/browser checks.

At preparation time the host returned HTTP 401 from its outer Caddy access wall; no authenticated browser/server connection was available, and the browser also rejected direct navigation. An access request is pending. Do not remove the wall, infer the deployed revision from GitHub or call this real-school production readiness. PR29 contains separate deployment-kit documentation for flags already installed on the server; preserve that work. Release publication and actual hosted status will be recorded separately when known.

Next work: verify the merged revision through the existing server connection, inspect deployment status/build logs if it failed, then check private hosted login, each role dashboard, resource editing and reviewed attendance. Preserve the existing state directory and migration ledger. Broader route, zoom, screen-reader, long-content and educator review remains open for NFR-05/NFR-06; no acceptance cases are promoted by these checks.
