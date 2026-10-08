# Development Plan: Saha Education Application

## Stage 1: Survey and cleanup

Explore the reference Saha Health project and remove old Express/Mongoose JavaScript app to prepare for Next.js rebuild.

## Stage 2: Framework and tooling

Set up Next.js 16 + TypeScript + React 19 with Cloudflare Workers infrastructure using vinext/vite/wrangler.

## Stage 3: UI components and hooks

Implement shadcn UI components in components/ui/, create custom React hooks for data fetching and utility functions.

## Stage 4: Drizzle schema and migration

Define database schema for students, teachers, guardians, schools, classes, courses, enrolments, assessments, report cards using Drizzle ORM.

## Stage 5: Core library (db client, auth/roles, i18n, validation, data access)

Build core functionality including database client, authentication/authorization system, i18n support, validation utilities and data access layers.

## Stage 6: App shell, login and dashboards

Create Next.js app layout, implement login functionality with role-based access control, build dashboard views for each user type.

## Stage 7: Features part 1 (students and guardians, schools and classes, courses and enrolments)

Implement core features including student management, guardian relationships, school information, class scheduling, course offerings and enrolment system.

## Stage 8: Features part 2 (attendance, assessments and results, report cards, notifications)

Develop attendance tracking, assessment management, results generation, report card creation, and notification systems.

## Stage 9: Tests and docs

Write unit tests, integration tests, documentation and code quality checks for all implemented features.

## Stage 10: Final verification

Perform final testing, verify all functionality works correctly, ensure consistency with the reference architecture.
