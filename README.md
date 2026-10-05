# Saha Education

Start with the current [BRD → FSD → HLD → LLD pack](docs/specification/README.md), [implementation delivery](docs/current/SPECIFICATION-DELIVERY.md) and [HANDOVER.md](HANDOVER.md). The [education documentation set](docs/education/README.md) preserves the original rebuild baseline.

Saha Education is a comprehensive school management platform designed to streamline educational operations. The system supports efficient management of schools, students, teachers, guardians, courses, classes, enrolments, attendance tracking, assessments, report cards, and user notifications.

The application provides a modern web interface for managing all aspects of education administration while maintaining data integrity and user privacy. The platform is built with a focus on accessibility, scalability, and maintainability, following best practices in modern software development.

## Features

Saha Education is a school management system with the following key features:

- Student registration and profile management
- Guardian/guardian relationship tracking
- School information and management
- Course catalog and class creation
- Class attendance tracking
- Assessment management and grading
- Report card generation and publishing
- Notification system for students, teachers, and guardians
- User roles: admin, teacher, guardian, student
- Reviewed account provisioning and enablement/disablement with administration evidence
- Manually authored curriculum references, immutable reviews and source-bound teaching draft copies
- Approved class resources, learner text attempts and reviewed formative feedback
- External oral-reading launch configuration, manual observations and attributable corrections/history

## Roles

The application supports the following user roles:

- **Admin**: Administration within their school; owner authority does not override student scope
- **Teacher**: Assigned classes and scoped learner records; private teaching drafts and approved curriculum sources
- **Guardian**: Explicitly linked learner records and published reports
- **Student**: Their own linked profile, active classes, approved assignments, saved responses and reviewed feedback

## Stack

This project uses:
- Next.js 16 + TypeScript with React 19
- Cloudflare Workers via vinext/vite/wrangler
- Drizzle ORM on Cloudflare D1 (sqlite)
- shadcn components in components/ui
- Tailwind 4 for styling
- pnpm as the package manager
- Node >= 22.13 for development

The architecture was modelled on the Saha Health project while maintaining distinct educational domain terminology and functionality.

See [current authentication/access setup](docs/current/AUTH-ACCESS.md) and [validation evidence](VALIDATION.md). Use synthetic data until provider/account lifecycle and remaining acceptance gates are verified. The identity provider and external ORF destination remain unconfigured; AI drafting and result synchronization remain planned.

## Setup

To get started with Saha Education:

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test

# Generate database schema
pnpm db:generate
```

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Run development server |
| `pnpm build` | Build for production |
| `pnpm test` | Run the full test suite |
| `pnpm test:static` | Run static analysis |
| `pnpm test:unit` | Run unit tests |
| `pnpm test:integration` | Run integration tests |
| `pnpm test:resilience` | Run resilience/backup tests |
| `pnpm test:smoke` | Run smoke tests |
| `pnpm test:ui` | Run UI component tests |
| `pnpm test:nfr` | Run non-functional requirement tests |
| `pnpm test:uat` | Run user acceptance tests |
| `pnpm test:regression` | Run regression tests |
| `pnpm test:full` | Run all test layers |
| `pnpm db:generate` | Generate database schema migrations |

## Project structure

```
.
├── app/                # Next.js app directory with routes and pages
├── components/         # UI components (shadcn)
├── lib/education/      # Business logic and application layer
├── drizzle/            # Database migrations and schema
├── docs/               # Documentation files
├── scripts/            # Helper scripts for build, test etc.
├── tests/              # Test suite files
├── public/             # Static assets
└── .env.example        # Example environment variables
```

## Data model

The database schema is managed with Drizzle ORM. The [current dictionary](docs/specification/DATA-DICTIONARY.md) covers all 28 tables/225 fields, including authentication, teaching resources and the specification extensions. Core school-administration tables include:

- **schools**: Stores school information including name, address, and timestamps
- **users**: User accounts with roles (admin|teacher|guardian|student) and associated school references
- **students**: Student records with personal details, admission numbers, and grade levels
- **guardians**: Guardian information linked to user accounts with phone/email details
- **student_guardians**: Relationship table linking students to their guardians with primary flag
- **courses**: Course catalog with codes, titles, descriptions, and grade levels
- **classes**: Class information including course references, teacher assignments, and scheduling
- **enrolments**: Student enrolment records in classes with status tracking
- **attendance**: Attendance records for students in classes with date, status, and notes
- **assessments**: Assessment tracking including type (exam|quiz|assignment|project), max scores, and dates
- **assessment_results**: Individual student scores, grades, and feedback for each assessment
- **report_cards**: Report card generation with terms, summaries, overall grades, and publish status
- **notifications**: In-app notification system with channels (in_app|email|sms) and read tracking

Database migrations are generated using `pnpm db:generate` command.

## Testing

Saha Education defines the following test layers. Static, unit, integration and smoke suites currently run through the catalogue; separate manual Worker/browser procedures cover built synthetic journeys. Recovery, representative load, full accessibility and educator UAT still require their own configured execution. See the [test strategy](docs/specification/TEST-STRATEGY.md) and [actual validation](VALIDATION.md).

### Test layers:
1. **Static**: Type checking, code analysis
2. **Unit**: Business logic and function testing in isolation
3. **Integration**: API endpoints, database operations, and data flows
4. **Resilience**: System robustness and error handling
5. **Smoke**: Rapid validation of core system functionality
6. **UI**: Component rendering and interaction behavior
7. **NFR**: Non-functional requirements (performance, security)
8. **UAT**: User acceptance testing scenarios

### Test locations:
- Unit tests: `tests/unit/`
- Integration tests: `tests/integration/`
- API contract tests: `tests/integration/`
- Manual built-app browser checks: `tests/worker-specification-ui-check.mjs`

### Test helpers:
The helpers in `tests/support/` load service modules and create disposable synthetic SQLite fixtures for contract tests. Manual served/browser procedures use the built Worker and isolated local D1 state with synthetic sessions. They refuse remote origins.

Test results are aggregated and reported with counts for each layer, showing passed, failed, and skipped test counts to validate system quality before deployment.

## Known limitations

- Provider-based sign-in replaces role-selection demo login; provider configuration is pending
- All records require verified school and relationship scopes; no role cookie grants access
- Reviewed account provisioning and status administration are implemented; role, identity, school and profile remapping remain pending
