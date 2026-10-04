import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, primaryKey, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Schools table
export const schools = sqliteTable('schools', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Users table
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  role: text('role').notNull(), // admin|teacher|guardian|student
  schoolId: text('school_id').references(() => schools.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Students table
export const students = sqliteTable('students', {
  id: text('id').primaryKey(),
  schoolId: text('school_id').notNull().references(() => schools.id),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  dateOfBirth: text('date_of_birth').notNull(),
  admissionNumber: text('admission_number').notNull().unique(),
  gradeLevel: text('grade_level').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Guardians table
export const guardians = sqliteTable('guardians', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  relationship: text('relationship').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Student guardians table
export const studentGuardians = sqliteTable('student_guardians', {
  studentId: text('student_id').notNull().references(() => students.id),
  guardianId: text('guardian_id').notNull().references(() => guardians.id),
  isPrimary: integer('is_primary').notNull().default(0),
}, t => [
  primaryKey({ columns: [t.studentId, t.guardianId] }),
  index('student_guardians_student').on(t.studentId),
  index('student_guardians_guardian').on(t.guardianId)
]);

// Courses table
export const courses = sqliteTable('courses', {
  id: text('id').primaryKey(),
  schoolId: text('school_id').notNull().references(() => schools.id),
  code: text('code').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  gradeLevel: text('grade_level').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Classes table
export const classes = sqliteTable('classes', {
  id: text('id').primaryKey(),
  schoolId: text('school_id').notNull().references(() => schools.id),
  courseId: text('course_id').notNull().references(() => courses.id),
  teacherId: text('teacher_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  term: text('term').notNull(),
  schedule: text('schedule'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Enrolments table
export const enrolments = sqliteTable('enrolments', {
  id: text('id').primaryKey(),
  studentId: text('student_id').notNull().references(() => students.id),
  classId: text('class_id').notNull().references(() => classes.id),
  status: text('status').notNull(), // active|withdrawn|completed
  enrolledAt: text('enrolled_at').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Attendance table
export const attendance = sqliteTable('attendance', {
  id: text('id').primaryKey(),
  classId: text('class_id').notNull().references(() => classes.id),
  studentId: text('student_id').notNull().references(() => students.id),
  date: text('date').notNull(),
  status: text('status').notNull(), // present|absent|late|excused
  note: text('note'),
  recordedBy: text('recorded_by').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, t => [
  uniqueIndex('attendance_unique').on(t.classId, t.studentId, t.date)
]);

// Assessments table
export const assessments = sqliteTable('assessments', {
  id: text('id').primaryKey(),
  classId: text('class_id').notNull().references(() => classes.id),
  title: text('title').notNull(),
  kind: text('kind').notNull(), // exam|quiz|assignment|project
  maxScore: integer('max_score').notNull(),
  date: text('date').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Assessment results table
export const assessmentResults = sqliteTable('assessment_results', {
  id: text('id').primaryKey(),
  assessmentId: text('assessment_id').notNull().references(() => assessments.id),
  studentId: text('student_id').notNull().references(() => students.id),
  score: integer('score').notNull(),
  grade: text('grade'),
  feedback: text('feedback'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Report cards table
export const reportCards = sqliteTable('report_cards', {
  id: text('id').primaryKey(),
  studentId: text('student_id').notNull().references(() => students.id),
  term: text('term').notNull(),
  summary: text('summary'),
  overallGrade: text('overall_grade').notNull(),
  publishedAt: text('published_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Notifications table
export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  channel: text('channel').notNull(), // in_app|email|sms
  title: text('title').notNull(),
  body: text('body').notNull(),
  readAt: text('read_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Export inferred select/insert types for each table
export type SelectSchool = typeof schools.$inferSelect;
export type InsertSchool = typeof schools.$inferInsert;

export type SelectUser = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type SelectStudent = typeof students.$inferSelect;
export type InsertStudent = typeof students.$inferInsert;

export type SelectGuardian = typeof guardians.$inferSelect;
export type InsertGuardian = typeof guardians.$inferInsert;

export type SelectStudentGuardian = typeof studentGuardians.$inferSelect;
export type InsertStudentGuardian = typeof studentGuardians.$inferInsert;

export type SelectCourse = typeof courses.$inferSelect;
export type InsertCourse = typeof courses.$inferInsert;

export type SelectClass = typeof classes.$inferSelect;
export type InsertClass = typeof classes.$inferInsert;

export type SelectEnrolment = typeof enrolments.$inferSelect;
export type InsertEnrolment = typeof enrolments.$inferInsert;

export type SelectAttendance = typeof attendance.$inferSelect;
export type InsertAttendance = typeof attendance.$inferInsert;

export type SelectAssessment = typeof assessments.$inferSelect;
export type InsertAssessment = typeof assessments.$inferInsert;

export type SelectAssessmentResult = typeof assessmentResults.$inferSelect;
export type InsertAssessmentResult = typeof assessmentResults.$inferInsert;

export type SelectReportCard = typeof reportCards.$inferSelect;
export type InsertReportCard = typeof reportCards.$inferInsert;

export type SelectNotification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;