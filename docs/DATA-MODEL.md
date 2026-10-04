# Saha Education Data Model

This document describes the database schema and relationships for the Saha Education system.

## Database Schema

The system uses Cloudflare D1 (SQLite) with Drizzle ORM. The schema is defined in migration files under `drizzle/`.

## Tables Overview

### users
Stores user information including students, teachers, guardians, and admins.
- `id` TEXT PRIMARY KEY - Unique identifier for the user
- `name` TEXT NOT NULL - Full name of the user 
- `email` TEXT NOT NULL UNIQUE - Email address (unique)
- `role` TEXT NOT NULL - User role (admin, teacher, guardian, student)
- `school_id` TEXT - Reference to school if applicable (foreign key to schools)
- `created_at` TEXT NOT NULL - Timestamp when record was created
- `updated_at` TEXT NOT NULL - Timestamp when record was last updated

### students
Stores student information and enrollment details.
- `id` TEXT PRIMARY KEY - Unique identifier for the student
- `school_id` TEXT NOT NULL - Reference to the school (foreign key to schools)
- `first_name` TEXT NOT NULL - Student's first name
- `last_name` TEXT NOT NULL - Student's last name  
- `date_of_birth` TEXT NOT NULL - Date of birth in ISO format
- `admission_number` TEXT NOT NULL UNIQUE - Unique admission number
- `grade_level` TEXT NOT NULL - Current grade level
- `created_at` TEXT NOT NULL - Timestamp when record was created
- `updated_at` TEXT NOT NULL - Timestamp when record was last updated

### guardians
Stores guardian information for students.
- `id` TEXT PRIMARY KEY - Unique identifier for the guardian
- `user_id` TEXT - Reference to associated user (foreign key to users) 
- `name` TEXT NOT NULL - Guardian's name
- `phone` TEXT - Phone number
- `email` TEXT - Email address
- `relationship` TEXT NOT NULL - Relationship to student (parent, guardian, etc.)
- `created_at` TEXT NOT NULL - Timestamp when record was created
- `updated_at` TEXT NOT NULL - Timestamp when record was last updated

### student_guardians
Junction table linking students to their guardians.
- `student_id` TEXT NOT NULL - Reference to student (foreign key to students)
- `guardian_id` TEXT NOT NULL - Reference to guardian (foreign key to guardians) 
- `is_primary` INTEGER DEFAULT 0 NOT NULL - Flag indicating primary guardian
- PRIMARY KEY (`student_id`, `guardian_id`)
- FOREIGN KEY (`student_id`) REFERENCES students(id)
- FOREIGN KEY (`guardian_id`) REFERENCES guardians(id)

### schools
Stores school information.
- `id` TEXT PRIMARY KEY - Unique identifier for the school
- `name` TEXT NOT NULL - School name
- `address` TEXT - Address information
- `created_at` TEXT NOT NULL - Timestamp when record was created
- `updated_at` TEXT NOT NULL - Timestamp when record was last updated

### courses
Stores course catalog information.
- `id` TEXT PRIMARY KEY - Unique identifier for the course
- `school_id` TEXT NOT NULL - Reference to school (foreign key to schools)
- `code` TEXT NOT NULL UNIQUE - Course code (unique)
- `title` TEXT NOT NULL - Course title
- `description` TEXT - Course description
- `grade_level` TEXT NOT NULL - Grade level(s) for the course
- `created_at` TEXT NOT NULL - Timestamp when record was created
- `updated_at` TEXT NOT NULL - Timestamp when record was last updated

### classes
Stores class information and scheduling.
- `id` TEXT PRIMARY KEY - Unique identifier for the class
- `school_id` TEXT NOT NULL - Reference to school (foreign key to schools)
- `course_id` TEXT NOT NULL - Reference to course (foreign key to courses)
- `teacher_id` TEXT NOT NULL - Reference to teacher (foreign key to users)
- `name` TEXT NOT NULL - Class name
- `term` TEXT NOT NULL - Academic term
- `schedule` TEXT - Schedule information
- `created_at` TEXT NOT NULL - Timestamp when record was created
- `updated_at` TEXT NOT NULL - Timestamp when record was last updated

### enrolments
Stores student enrollment in classes.
- `id` TEXT PRIMARY KEY - Unique identifier for the enrolment
- `student_id` TEXT NOT NULL - Reference to student (foreign key to students)
- `class_id` TEXT NOT NULL - Reference to class (foreign key to classes)
- `status` TEXT NOT NULL - Enrollment status (active, withdrawn, etc.)
- `enrolled_at` TEXT NOT NULL - Date when student was enrolled
- `created_at` TEXT NOT NULL - Timestamp when record was created
- `updated_at` TEXT NOT NULL - Timestamp when record was last updated

### assessments
Stores assessment information for classes.
- `id` TEXT PRIMARY KEY - Unique identifier for the assessment
- `class_id` TEXT NOT NULL - Reference to class (foreign key to classes)
- `title` TEXT NOT NULL - Assessment title
- `kind` TEXT NOT NULL - Type of assessment (exam, quiz, homework, etc.)
- `max_score` INTEGER NOT NULL - Maximum possible score
- `date` TEXT NOT NULL - Date of the assessment
- `created_at` TEXT NOT NULL - Timestamp when record was created
- `updated_at` TEXT NOT NULL - Timestamp when record was last updated

### assessment_results 
Stores results for individual students in assessments.
- `id` TEXT PRIMARY KEY - Unique identifier for the result
- `assessment_id` TEXT NOT NULL - Reference to assessment (foreign key to assessments)
- `student_id` TEXT NOT NULL - Reference to student (foreign key to students)  
- `score` INTEGER NOT NULL - Student's score
- `grade` TEXT - Letter grade
- `feedback` TEXT - Instructor feedback 
- `created_at` TEXT NOT NULL - Timestamp when record was created
- `updated_at` TEXT NOT NULL - Timestamp when record was last updated

### attendance
Stores attendance records for students in classes.
- `id` TEXT PRIMARY KEY - Unique identifier for the attendance record
- `class_id` TEXT NOT NULL - Reference to class (foreign key to classes)
- `student_id` TEXT NOT NULL - Reference to student (foreign key to students)
- `date` TEXT NOT NULL - Date of attendance
- `status` TEXT NOT NULL - Attendance status (present, absent, late, excused) 
- `note` TEXT - Additional note about attendance
- `recorded_by` TEXT NOT NULL - Who recorded the attendance
- `created_at` TEXT NOT NULL - Timestamp when record was created
- `updated_at` TEXT NOT NULL - Timestamp when record was last updated

### report_cards
Stores report card information for students.
- `id` TEXT PRIMARY KEY - Unique identifier for the report card
- `student_id` TEXT NOT NULL - Reference to student (foreign key to students)
- `term` TEXT NOT NULL - Academic term
- `summary` TEXT - Overall summary of student performance
- `overall_grade` TEXT NOT NULL - Overall letter grade
- `published_at` TEXT - Timestamp when report card was published
- `created_at` TEXT NOT NULL - Timestamp when record was created
- `updated_at` TEXT NOT NULL - Timestamp when record was last updated

### notifications
Stores system notification messages.  
- `id` TEXT PRIMARY KEY - Unique identifier for the notification
- `user_id` TEXT NOT NULL - Reference to user (foreign key to users)
- `channel` TEXT NOT NULL - Notification channel (email, sms, in-app)
- `title` TEXT NOT NULL - Notification title
- `body` TEXT NOT NULL - Notification content
- `read_at` TEXT - Timestamp when notification was read
- `created_at` TEXT NOT NULL - Timestamp when notification was created
- `updated_at` TEXT NOT NULL - Timestamp when record was updated

## Relationships

- Students are linked to guardians via the student_guardians junction table (many-to-many)
- Students belong to schools (one-to-many) 
- Users can be teachers, guardians or students and may belong to schools
- Classes belong to schools, courses and teachers (many-to-one relationships)  
- Classes contain enrollments linking students (many-to-many)
- Assessments are linked to classes and have student results
- Attendance records are linked to classes and students (many-to-many with composite key constraint)
- Report cards are linked to students
- Notifications are linked to users

## Indexes

- Unique index on `students.admission_number` 
- Unique index on `courses.code`
- Unique index on attendance (`class_id`, `student_id`, `date`) to prevent duplicate entries
- Indexes on foreign key relationships for improved query performance