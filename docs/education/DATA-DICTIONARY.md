# Data dictionary

> Documentation version 1.0 · 5 October 2026 · Draft for sponsor review.
> Describes the Next.js rebuild at `b4cbfc5f6855479ed523b5bf4c0aed0d2b6f6e3d`, not the legacy application on `main`.
> Requirements are proposed targets; code presence does not establish acceptance or production readiness.

Canonical source: [db/schema.ts](https://github.com/nakul175/saha-education/blob/b4cbfc5f6855479ed523b5bf4c0aed0d2b6f6e3d/db/schema.ts). This dictionary describes declared schema; foreign-key enforcement and deployed migration state were not tested.

## schools

| TypeScript property | SQL column | Storage | Constraints |
|---|---|---|---|
| id | id | text | primary key |
| name | name | text | required |
| address | address | text | nullable |
| createdAt | created_at | text | required |
| updatedAt | updated_at | text | required |

## users

| TypeScript property | SQL column | Storage | Constraints |
|---|---|---|---|
| id | id | text | primary key |
| name | name | text | required |
| email | email | text | required, unique globally |
| role | role | text | required |
| schoolId | school_id | text | FK schools.id |
| createdAt | created_at | text | required |
| updatedAt | updated_at | text | required |

## students

| TypeScript property | SQL column | Storage | Constraints |
|---|---|---|---|
| id | id | text | primary key |
| schoolId | school_id | text | required, FK schools.id |
| firstName | first_name | text | required |
| lastName | last_name | text | required |
| dateOfBirth | date_of_birth | text | required |
| admissionNumber | admission_number | text | required, unique globally |
| gradeLevel | grade_level | text | required |
| createdAt | created_at | text | required |
| updatedAt | updated_at | text | required |

## guardians

| TypeScript property | SQL column | Storage | Constraints |
|---|---|---|---|
| id | id | text | primary key |
| userId | user_id | text | FK users.id |
| name | name | text | required |
| phone | phone | text | nullable |
| email | email | text | nullable |
| relationship | relationship | text | required |
| createdAt | created_at | text | required |
| updatedAt | updated_at | text | required |

## student_guardians

| TypeScript property | SQL column | Storage | Constraints |
|---|---|---|---|
| studentId | student_id | text | required, FK students.id |
| guardianId | guardian_id | text | required, FK guardians.id |
| isPrimary | is_primary | integer | required, default 0 |

## courses

| TypeScript property | SQL column | Storage | Constraints |
|---|---|---|---|
| id | id | text | primary key |
| schoolId | school_id | text | required, FK schools.id |
| code | code | text | required, unique globally |
| title | title | text | required |
| description | description | text | nullable |
| gradeLevel | grade_level | text | required |
| createdAt | created_at | text | required |
| updatedAt | updated_at | text | required |

## classes

| TypeScript property | SQL column | Storage | Constraints |
|---|---|---|---|
| id | id | text | primary key |
| schoolId | school_id | text | required, FK schools.id |
| courseId | course_id | text | required, FK courses.id |
| teacherId | teacher_id | text | required, FK users.id |
| name | name | text | required |
| term | term | text | required |
| schedule | schedule | text | nullable |
| createdAt | created_at | text | required |
| updatedAt | updated_at | text | required |

## enrolments

| TypeScript property | SQL column | Storage | Constraints |
|---|---|---|---|
| id | id | text | primary key |
| studentId | student_id | text | required, FK students.id |
| classId | class_id | text | required, FK classes.id |
| status | status | text | required |
| enrolledAt | enrolled_at | text | required |
| createdAt | created_at | text | required |
| updatedAt | updated_at | text | required |

## attendance

| TypeScript property | SQL column | Storage | Constraints |
|---|---|---|---|
| id | id | text | primary key |
| classId | class_id | text | required, FK classes.id |
| studentId | student_id | text | required, FK students.id |
| date | date | text | required |
| status | status | text | required |
| note | note | text | nullable |
| recordedBy | recorded_by | text | required |
| createdAt | created_at | text | required |
| updatedAt | updated_at | text | required |

## assessments

| TypeScript property | SQL column | Storage | Constraints |
|---|---|---|---|
| id | id | text | primary key |
| classId | class_id | text | required, FK classes.id |
| title | title | text | required |
| kind | kind | text | required |
| maxScore | max_score | integer | required |
| date | date | text | required |
| createdAt | created_at | text | required |
| updatedAt | updated_at | text | required |

## assessment_results

| TypeScript property | SQL column | Storage | Constraints |
|---|---|---|---|
| id | id | text | primary key |
| assessmentId | assessment_id | text | required, FK assessments.id |
| studentId | student_id | text | required, FK students.id |
| score | score | integer | required |
| grade | grade | text | nullable |
| feedback | feedback | text | nullable |
| createdAt | created_at | text | required |
| updatedAt | updated_at | text | required |

## report_cards

| TypeScript property | SQL column | Storage | Constraints |
|---|---|---|---|
| id | id | text | primary key |
| studentId | student_id | text | required, FK students.id |
| term | term | text | required |
| summary | summary | text | nullable |
| overallGrade | overall_grade | text | required |
| publishedAt | published_at | text | nullable |
| createdAt | created_at | text | required |
| updatedAt | updated_at | text | required |

## notifications

| TypeScript property | SQL column | Storage | Constraints |
|---|---|---|---|
| id | id | text | primary key |
| userId | user_id | text | required, FK users.id |
| channel | channel | text | required |
| title | title | text | required |
| body | body | text | required |
| readAt | read_at | text | nullable |
| createdAt | created_at | text | required |
| updatedAt | updated_at | text | required |

## Additional indexes and relationships

student_guardians has a composite primary key (student_id, guardian_id), with indexes on each side. Attendance has a unique index on (class_id, student_id, date). users.email, students.admission_number and courses.code are globally unique. There are no declared unique pairs for enrolments or assessment_results. A school has students, courses and classes; classes reference courses and user records as teachers; students join guardians through student_guardians and classes through enrolments.

## Values and calculations

Validated role values: admin, teacher, guardian, student. Enrolment statuses: active, withdrawn, completed. Attendance statuses: present, absent, late, excused. Assessment kinds: exam, quiz, assignment, project. Notification channels: in_app, email, sms. These enums are primarily application validation; text columns do not establish equivalent database CHECK constraints.

Dates and timestamps are stored as text. Creation/update functions usually use ISO timestamps; birth dates and assessment dates are currently only required nonempty strings. Grades and terms are free text. Scores/maxScore are integer and validation allows zero, but the result schema does not enforce score <= assessment.maxScore.

attendancePercentage counts present and late in its numerator and every record in its denominator, including excused; an empty set returns 0. This is current code behavior, not an approved school policy. Report-card overallGrade is supplied, not automatically calculated from a defined grading scale.

## Integrity work before real use

Decide per-school admission/course uniqueness; validate same-school foreign references and teacher role; enforce unique enrolment/result pairs; define one primary guardian behavior; create explicit student/user mapping; use guardian.userId for notices; validate academic dates; define revisions, retention and publication immutability. Timestamps alone are not audit history. No soft-delete or audit table is declared.

## Migration policy

Use generated migrations, review the SQL and test it against a representative synthetic database. Record application revision and applied migrations. Never edit an applied migration to repair data. Legacy MongoDB to D1 migration is not implemented or specified by the current rebuild.
