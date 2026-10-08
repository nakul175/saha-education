# Saha development workflow

Every coding agent (Claude, GPT/Codex, Cursor) and every person continuing this repository starts with [HANDOVER.md](HANDOVER.md): current state, how to verify a change, open defects and the next work. The shared project rules below apply to every coding agent.

The user has requested that all ongoing code changes be committed and pushed to GitHub.

- GitHub source repository: https://github.com/nakul175/saha-education (private).
- Commit each completed, meaningful batch of changes, including relevant tests and documentation, and push it before reporting completion.
- Check the remote branch before updating it. Preserve concurrent work; never force-push or overwrite unrelated changes.
- Use the authenticated GitHub connector when native git authentication is unavailable. Create a commit from the current remote parent, update its branch, and verify the resulting tree matches the intended source. Connector commits may have different SHAs from local commits.
- Report a failed push accurately and retain the local commit for recovery.
- Keep credentials, real student records, local databases, generated build output, and dependencies out of git. Track only the empty environment template.
- Retain Sites hosting configuration. GitHub source publication does not move or redeploy the running application.

The initial GitHub source import is the complete Release 3 working tree. Earlier development history remains in the Sites-managed repository.

## Project rules for every agent

- Branch from GitHub `main`, open a pull request into `main`, and merge only when the sponsor says so. The sponsor authorized the combined eight-hour candidate's merge during 6 October 2026, 02:18–03:18 UTC. Verify the exact final source and current remote before merging. GitHub publication/merge does not deploy Sites: no repository workflow currently proves automatic Education staging or `SAHA_DEPLOY_FREEZE` behavior. Use the explicit private Sites release workflow and record deployment status ([hosted synthetic staging](docs/current/HOSTED-STAGING.md)).
- Keep application authorisation on the server. Owner authority does not override student scope. Identity comes only from the trusted provider in `lib/education/identity.ts`; never trust public identity headers directly.
- Preserve confirmed records, revisions, audit, receipts, applied migrations and legacy source. Corrections append evidence; uncertainty never authorises a blind external retry.
- Synthetic data only. Do not turn on providers or message real recipients.
- For code changes, run the affected checks and record the real results, with dates and limits, in `VALIDATION.md`. Update the implementation boundary, requirement assessments, next-delivery row and evidence together, and never promote an acceptance case because a related unit check passes. For documentation changes run `python3 scripts/check-documentation.py` and `node scripts/audit-requirements.mjs --check`.

## Commands

- `pnpm install` - Install project dependencies
- `pnpm dev` - Run development server
- `pnpm build` - Build for production
- `pnpm test` - Run all tests
- `pnpm db:generate` - Generate database schema migrations

## Conventions

- Use TypeScript with strict mode enabled
- Follow Next.js 16 app directory conventions
- Components are in components/ui/
- Business logic is in lib/education/
- Database migrations are in drizzle/ directory
- Tests are in tests/ directory
- Documentation is in docs/ directory
- UI components use shadcn and Tailwind CSS

## Where things live

- App pages: app/ directory - Next.js 16 app directory structure
- Components: components/ directory - shadcn UI components
- Business logic: lib/education/ directory - TypeScript modules for application layer
- Database schema: drizzle/ directory - Drizzle ORM migrations and schema
- Tests: tests/ directory - Test files organized by test type
- Documentation: docs/ directory - Project documentation including architecture, data model, and testing guidelines

## Rules

- Never commit secrets, API keys, or real student data
- Keep node_modules, .next, dist, .wrangler, and other build artifacts out of git
- Follow the existing code style and conventions
- Write clear, maintainable code with appropriate type annotations
- All documentation changes must pass verification scripts
