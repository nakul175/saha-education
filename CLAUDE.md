# Claude repository entry point

Read [AGENTS.md](AGENTS.md) (rules, commands, safety) and then [HANDOVER.md](HANDOVER.md): its status block at the top is the one place this repository states the current version, hosting, gates and open items. [docs/DOCUMENTATION-INDEX.md](docs/DOCUMENTATION-INDEX.md) lists every other document.

Standing rules in one place:

- Start a new branch from current `origin/main`; open a draft pull request; never force-push `main`.
- Preserve all original and applied migration history, earlier source-specific records and the `sources/` reference files. Corrections append evidence; they do not rewrite it.
- Keep application authority on the server. Never retry an uncertain mutation blindly.
- Use synthetic data only. Real provider settings, paid AI and real recipients stay disabled until the owner provides and approves them.
- The v2.12 designs contain unrun cases; executable checks do not imply business acceptance.
- Historical handover notes (including the original Claude continuation handover) are in [docs/history/](docs/history/); they describe the state at the time they were written.
