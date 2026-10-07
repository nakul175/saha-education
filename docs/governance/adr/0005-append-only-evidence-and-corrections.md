# ADR 0005: Append-only evidence; corrections append

Status: in force (retrospective, written 2026-10-08) · Owner: Nakul Jain

Context: academic and identity records need an audit trail and retry safety.
Decision: confirmed records, receipts, revisions and audit evidence are preserved; corrections add reasoned entries beside the original; uncertain writes are read back before any retry; client UUIDs and compare-and-set versions make retries safe; database triggers (migration 0025 and earlier) block updates and deletes of evidence tables.
Consequences: ordinary deletion and erasure are blocked by design, which conflicts with possible erasure duties; retention and deletion policy are undecided (D-10).
Links: [AGENTS.md](../../../AGENTS.md), [the security record](../../current/DEMO-security-change-control.md), [RETENTION-SCHEDULE.md](../RETENTION-SCHEDULE.md).
