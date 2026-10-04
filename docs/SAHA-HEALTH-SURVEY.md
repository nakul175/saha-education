# Saha Health Survey and Analysis

## Stack Overview

The Saha Health application uses:
- Next.js 16 with TypeScript + React 19  
- Running on Cloudflare Workers via vinext/vite/wrangler
- Drizzle ORM on Cloudflare D1 (sqlite)
- shadcn components in components/ui
- Tailwind 4
- pnpm package manager

## Folder Layout

```
saha-health/
├── app/                    # Main Next.js application pages and API routes
│   ├── api/                # API routes
│   └── ... various page components
├── lib/saha/              # Core library functions 
├── db/schema.ts           # Database schema definition using Drizzle ORM
├── drizzle/               # Drizzle configuration files  
├── components/ui/         # Shadcn UI components
├── hooks/                 # Custom React hooks
├── scripts/               # Utility scripts
├── tests/                 # Test files  
└── worker/                # Cloudflare Worker related code
```

## Package.json Scripts

The main package.json scripts include:
- dev: node scripts/run-framework.mjs dev
- build: node scripts/run-framework.mjs build  
- start: node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js dev ...
- lint: eslint . --ignore-pattern dist --ignore-pattern .next
- db:generate: drizzle-kit generate
- test: Various test runners for unit, integration, UI tests etc.

## Main Domain Entities and Features

### Core Entities:
- Patients (students)
- Health Workers/Doctors (teachers) 
- Families/Households (guardians)
- Facilities/Clinics (schools)
- Visits/Encounters (classes and attendance)
- Programmes (courses)
- Registrations (enrolments)
- Screenings (assessments)
- Health Records (report cards)

### Main Features:
- Patient management (students)  
- Health worker management (teachers)
- Family/household management (guardians)
- Clinic/facility management (schools)
- Visit/encounter tracking (classes and attendance)
- Programme/course management (courses)
- Registration/enrolment system (enrolments)
- Screening/assessment management (assessments) 
- Health record/report card system (report cards)

## Domain Mapping: Health to Education

| Health Concept         | Education Equivalent    |
|-----------------------|-------------------------|
| Patient               | Student                 |
| Health Worker/Doctor  | Teacher                 |
| Family/Household      | Guardian                |
| Facility/Clinic       | School                  |
| Visit/Encounter       | Class and Attendance    |
| Programme             | Course                  |
| Registration          | Enrolment               |
| Screening             | Assessment              |
| Health Record         | Report Card             |
| Visit                 | Class                   |  
| Encounter             | Attendance              |
| Doctor                | Teacher                 |
| Nurse                 | Teacher                 |
| Care Provider         | Teacher                 |
| Referral              | Course Recommendation   |
| Follow-up           | Continued Support       |
| Treatment Plan        | Learning Plan          |
| Clinical Notes        | Progress Notes         |
| Lab Results           | Test Scores            |
| Vaccination Record    | Immunization History   |

## Domain Relationships

### Students (Patients)
- Assigned to Teachers (Health Workers)
- Enrolled in Courses (Programmes)  
- Attend Classes (Visits/Encounters)
- Undergo Assessments (Screenings)
- Have Report Cards (Health Records)

### Teachers (Health Workers)
- Manage Student Classlists
- Conduct Classes (Visits/Encounters)
- Perform Assessments (Screenings) 
- Update Student Report Cards (Health Records)
- Collaborate in Teams

### Guardians (Families/Households)
- Guardian of Students (Patients)
- Can access student information
- Authorized to make decisions
- Receive communication about their students

### Schools (Facilities/Clinics)
- Host students/teachers 
- Store class and attendance information
- Manage courses/programmes
- Handle enrolments and assessments  

## Database Schema Analysis

The schema includes core tables:
- workspaces, accounts, organisations, teams, memberships, teamMembers, invitations
- patients, visits, integrations, plans, aiResults, submissions, referrals
- recordRevisions, auditEvents, commandReceipts, legacyMigrations 
- operations, requestMetrics, alertOccurrences, alertNotifications, notificationMessages
- pilot, outreach, expansions, governance
- households, caseloadTransfers, identityCases, rightsRequests, retention, media

## Core Components Architecture

The application follows a layered architecture:
1. Next.js based frontend with React 19
2. Cloudflare Worker backend  
3. Drizzle ORM for database management 
4. shadcn UI components with Tailwind styling
5. Custom hooks and libraries in lib/saha/

## Key Libraries Used

- Next.js 16 for framework
- TypeScript for type safety
- React 19 for UI 
- Drizzle ORM for database ORM
- Cloudflare Workers via vinext/vite/wrangler
- shadcn components for UI
- Tailwind 4 for styling
- zod for validation