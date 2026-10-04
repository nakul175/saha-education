# Saha Education Architecture

## Overview
Saha Education follows a modular, microservice-inspired architecture with a monorepo approach. The system is designed to be scalable and maintainable.

## Core Modules

### Users Module
Manages all user types including students, teachers, guardians, and administrators.

### Courses Module  
Handles course creation, scheduling, and management.

### Classes Module
Manages class schedules, room assignments, and class attendance.

### Enrolments Module
Tracks student enrollments in courses and manages registration.

### Attendance Module
Records and reports student attendance data.

### Assessments Module
Manages assignments, tests, and grading systems.

### Reports Module
Generates academic reports including report cards and performance summaries.

## Technology Stack

- **Backend**: Node.js with Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT tokens with bcrypt password hashing
- **Security**: Helmet.js for security headers
- **Testing**: Jest framework
- **Build Tools**: Babel for ES6+ support

## Data Flow
1. User authentication occurs via JWT tokens
2. All API requests go through middleware for validation and authentication
3. Business logic is handled in service modules
4. Data is stored in MongoDB collections
5. Frontend consumes RESTful APIs