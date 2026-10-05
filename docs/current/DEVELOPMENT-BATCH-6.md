# Recovery of original learner and staff actions

Sixth batch in the [four-hour continuation](FOUR-HOUR-DEVELOPMENT.md), based on published assessment commit `61f0751b5c38384783f56823a07964421a18c0bf`. Source callbacks and browser evidence are separate from designed case execution and business approval.

## Exact recovery before another action

Learner responses, formative feedback and assignment-window reviews now retain the original endpoint, complete serialized body, actor and UUID before sending. Refresh updates the displayed history or current window without rebasing that pending request. New saves and relevant text/selection controls remain locked until the original outcome is confirmed or explicitly rejected. Recovery verifies current assignment/account access and resends the original bytes. A recovered older response cannot become a new latest attempt; older feedback cannot create another revision; a recovered close cannot re-close an assignment that another review reopened.

A valid acknowledgement must correlate with the original action, rather than merely contain its UUID. Learner/feedback receipts check actor, exact assigned version or attempt, sequence and reviewed text. Window receipts check original review values and permit a newer current window. Malformed acknowledgements retain uncertainty. The confirmed original receipt is shown separately from the current history/window. Recognized validation/conflict rejection permits a new explicit review; uncertain network/server replies retain the original request.

Pending requests remain private in memory while this page and its window component stay mounted. Keep the tab open until recovery. Hard navigation, closing the tab or browser reload discards that state; cross-device recovery and durable client storage are not implemented by this slice.

## Current access and truthful availability

Known 401/403/404 replies hide assignment material, responses, reviews, pupil labels and editing controls. Pending bodies remain private and require the same account plus an authorized refresh before recovery. The mounted window delegates sign-in to its parent so a child denial cannot discard a parent's unresolved response or feedback. A separate-tab sign-in keeps the current page's recovery state. The learning list rechecks the current session/role, clears stale cards and labels, and discards obsolete replies.

The attendance editor now hides current/private/history evidence on known history access denial, including when a current snapshot succeeded. It preserves the saved fact after a valid acknowledgement, without claiming access was verified. Pending receipt recovery still requires an authorized reload. Temporary history failure remains an availability error and does not invent empty history or a denial. This change preserves attendance API, date, note and record semantics.

Every fulfilled composite assignment reply is consumed even when another request or body fails. Generation/abort guards prevent obsolete responses and labels replacing a newer view. No authentication, database schema, legacy service or provider contract changes are introduced.

## Evidence and remaining boundary

Five earlier UI observations were reproduced with 56 actual synthetic route requests and substituted React hooks; those unsafe diagnostics are excluded from passing totals. A separate read-only mounted attendance diagnostic used an actual current snapshot plus a local history403 delivery injection: two private rows, four row controls and a reason remained visible/enabled. No write or real role change occurred during that diagnostic.

The independent recovery suite uses actual sessions/routes and the production D1 query mapping over SQLite, with unchanged production source callbacks and substituted React hooks. It is callback-state evidence, not mounted React/browser rendering. Built localhost browser procedures, API journeys, automated resting-page accessibility samples and offline wireframes have their own final execution records. See [sanitized actual execution](DEVELOPMENT-BATCH-6-EXECUTION.json), [learner recovery design](../specification/LEARNER-RECOVERY-DESIGN.md) and [validation](../../VALIDATION.md).

Canonical v2.7 retains 39 tables/325 fields and 56 route files/91 handlers, with 245 designed cases across 36 scenarios. All cases remain unrun and approvals false. Actual source validation does not activate identity/ORF providers, paid AI, real learner records/messages, main merge, hosted release or educational/UAT acceptance.
