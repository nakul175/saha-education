# Saha Education Architecture

This document describes the architectural decisions and structure of the Saha Education system.

## Overview

Saha Education is a school management system built with Next.js 16, React 19, and Cloudflare Workers. It uses Drizzle ORM with Cloudflare D1 (SQLite) for database operations and implements a clean architecture pattern separating presentation, application, and data layers.

## System Architecture

The system follows a layered architecture approach:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Presentation  │    │   Application   │    │     Data        │
│   Layer         │    │   Layer         │    │   Layer         │
│                 │    │                 │    │                 │
│  Next.js Pages  │───▶│  Business       │───▶│  Drizzle ORM    │
│  Components     │    │  Logic          │    │  Database       │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Layer Descriptions

### Presentation Layer (Next.js App Directory)
- Contains Next.js pages and components in `app/` directory  
- Implements UI/UX with shadcn components
- Handles routing and page rendering
- Communicates with API endpoints and business logic

### Application Layer (lib/education/)
- Contains the core business logic in `lib/education/`
- Implements domain-specific functionality for students, teachers, guardians, etc.
- Handles data validation, processing, and business rules
- Exposes clean interfaces that presentation layer uses

### Data Layer (Drizzle ORM + D1)
- Uses Drizzle ORM with Cloudflare D1 (SQLite) for database operations
- Migrations managed in `drizzle/` directory  
- Database schema defined in migration files
- Provides data access abstractions for application logic

## Component Structure

```
components/
├── ui/              # shadcn UI components
└── ...
  
lib/education/       # Business logic modules
├── students.ts      # Student management business logic
├── teachers.ts      # Teacher management business logic  
├── guardians.ts     # Guardian/guardian relationship logic
├── schools.ts       # School information logic
├── courses.ts       # Course catalog logic
├── classes.ts       # Class scheduling and enrollment logic
├── attendance.ts    # Attendance tracking and reporting
├── assessments.ts   # Assessment and grading logic
├── report-cards.ts    # Report card generation logic
├── notifications.ts  # Notification system logic
└── ...               # Other modules as needed

app/                 # Next.js 16 App Router pages
├── api/             # API routes for data operations
├── students/        # Student related pages
├── teachers/        # Teacher related pages  
├── guardians/       # Guardian related pages
├── schools/         # School related pages
├── courses/         # Course related pages
├── classes/         # Class related pages 
├── attendance/      # Attendance related pages
├── assessments/     # Assessment related pages
├── report-cards/    # Report card related pages
└── ...               # Other page sections

drizzle/             # Database schema and migrations
├── 0000_*.sql       # Migration files defining database structure
└── drizzle.config.ts # Drizzle configuration

tests/              # Test suite organized by test type
├── unit/           # Unit tests for business logic modules
├── integration/    # Integration tests for system flows
├── ui/             # UI component tests 
└── ...              # Other test types as needed
```

## Security and Identity

- Authentication is handled via a trusted provider in `lib/education/identity.ts`
- Authorization uses role-based access control (RBAC)
- User roles: admin, teacher, guardian, and student
- All authorization is enforced on the server to prevent bypassing
- No trust is placed in public identity headers 

## Deployment Architecture

The application deploys as a Cloudflare Worker:
- Built with Next.js 16 + React 19
- Uses vinext/vite/wrangler toolchain for deployment 
- Database connections through Cloudflare D1 (SQLite)
- Static assets served via Cloudflare CDN
- Environment variables managed through Cloudflare Pages/Workers environment

## Data Flow

1. User actions in the UI trigger Next.js page components
2. API routes in `app/api/` handle data operations  
3. Business logic in `lib/education/` processes requests and implements business rules
4. Drizzle ORM handles database interactions 
5. Responses are returned to the frontend for display

## External Dependencies

- Next.js 16 (framework)
- React 19 (UI library)
- Cloudflare Workers environment  
- Drizzle ORM (database access)
- shadcn components (UI library)
- Tailwind CSS (styling framework)
- TypeScript (static typing)

## Technology Stack Summary

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 |
| UI Library | React 19 |
| Deployment | Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) |
| ORM | Drizzle ORM |
| Components | shadcn |
| Styling | Tailwind CSS |
| Package Manager | pnpm |