# Saha Education

The [education documentation set](docs/education/README.md) records the original rebuild baseline and proposed requirements. See [HANDOVER.md](HANDOVER.md) for current implementation and validation.

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

## Roles

The application supports the following user roles:

- **Admin**: Full access to all features and system management
- **Teacher**: Access to classes they teach, student records, assessments, and attendance 
- **Guardian**: Access to their child's information and grades
- **Student**: Access to personal profile, classes, assessments, and report cards

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

The database schema is managed with Drizzle ORM and consists of the following tables:

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

Saha Education employs a layered testing approach to ensure reliability:

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
- API tests: `tests/integration/api/`
- UI tests: `tests/ui/`

### Test helpers:
The `tests/support/load-education.mjs` module provides test data loading utilities for database setup during testing. All tests utilize in-memory SQLite databases for isolated test execution.

Test results are aggregated and reported with counts for each layer, showing passed, failed, and skipped test counts to validate system quality before deployment.

## Known limitations

- Demo sign-in is available via the `saha_demo_role` cookie for development purposes
- Production authentication implementation is still under development  
- Full user role management capabilities have been implemented but may be limited in the demo environment