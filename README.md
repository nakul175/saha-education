# Saha Education

Saha Education is an open-source learning management system designed to support students, teachers, guardians, and schools. Built on modern web technologies, it provides a comprehensive platform for managing courses, classes, enrolments, attendance, assessments, and report cards.

## Repository Structure

```
saha-education/
├── src/                    # Source code
│   ├── components/         # Reusable UI components
│   ├── modules/            # Application modules (users, courses, classes, etc.)
│   ├── services/           # Business logic and data services
│   ├── utils/              # Utility functions
│   ├── types/              # TypeScript types (if applicable)
│   ├── assets/             # Static assets
│   └── styles/             # Styling files
├── tests/                  # Test files
├── config/                 # Configuration files
├── docs/                   # Documentation
├── scripts/                # Build and deployment scripts
├── .env                    # Environment variables (not committed)
├── package.json           # Project metadata and dependencies
└── README.md              # This file
```

## Features

- **User Management**: Support for students, teachers, guardians, and administrators
- **Course Management**: Create, edit, and manage courses and class schedules
- **Enrolment System**: Student registration and course enrolment tracking
- **Attendance Tracking**: Monitor student attendance and generate reports
- **Assessment & Grading**: Manage assignments, tests, and grade reporting
- **Report Cards**: Generate comprehensive student performance reports

## Getting Started

1. Clone the repository
2. Install dependencies with `npm install`
3. Set up environment variables in `.env`
4. Run the development server with `npm run dev`

## Technologies Used

- Backend: Node.js, Express
- Database: MongoDB (with Mongoose)
- Authentication: JWT tokens
- Build Tools: Babel, Webpack (if applicable)
- Testing: Jest
- Security: Helmet.js, bcrypt

## Contributing

Contributions are welcome! Please read our contribution guidelines before submitting pull requests.

## License

This project is licensed under the MIT License.