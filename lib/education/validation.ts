import { z } from 'zod';
import type { 
  InsertSchool,
  InsertUser, 
  InsertStudent,
  InsertGuardian,
  InsertStudentGuardian,
  InsertCourse,
  InsertClass,
  InsertEnrolment,
  InsertAttendance,
  InsertAssessment,
  InsertAssessmentResult,
  InsertReportCard,
  InsertNotification
} from '@/db/schema';

// Schema for Schools
export const schoolSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'School name is required'),
  address: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// Schema for Users
export const userSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'User name is required'),
  email: z.string().email('Invalid email address'),
  role: z.enum(['admin', 'teacher', 'guardian', 'student']),
  schoolId: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// Schema for Students
export const studentSchema = z.object({
  id: z.string().optional(),
  schoolId: z.string().min(1, 'School ID is required'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  admissionNumber: z.string().min(1, 'Admission number is required'),
  gradeLevel: z.string().min(1, 'Grade level is required'),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// Schema for Guardians
export const guardianSchema = z.object({
  id: z.string().optional(),
  userId: z.string().optional(),
  name: z.string().min(1, 'Guardian name is required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email address').optional(),
  relationship: z.string().min(1, 'Relationship is required'),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// Schema for StudentGuardians (many-to-many)
export const studentGuardianSchema = z.object({
  studentId: z.string().min(1, 'Student ID is required'),
  guardianId: z.string().min(1, 'Guardian ID is required'),
  isPrimary: z.boolean().optional(),
});

// Schema for Courses
export const courseSchema = z.object({
  id: z.string().optional(),
  schoolId: z.string().min(1, 'School ID is required'),
  code: z.string().min(1, 'Course code is required'),
  title: z.string().min(1, 'Course title is required'),
  description: z.string().optional(),
  gradeLevel: z.string().min(1, 'Grade level is required'),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// Schema for Classes
export const classSchema = z.object({
  id: z.string().optional(),
  schoolId: z.string().min(1, 'School ID is required'),
  courseId: z.string().min(1, 'Course ID is required'),
  teacherId: z.string().min(1, 'Teacher ID is required'),
  name: z.string().min(1, 'Class name is required'),
  term: z.string().min(1, 'Term is required'),
  schedule: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// Schema for Enrolments
export const enrolmentSchema = z.object({
  id: z.string().optional(),
  studentId: z.string().min(1, 'Student ID is required'),
  classId: z.string().min(1, 'Class ID is required'),
  status: z.enum(['active', 'withdrawn', 'completed']),
  enrolledAt: z.string().min(1, 'Enrolled date is required'),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// Schema for Attendance
export const attendanceSchema = z.object({
  id: z.string().optional(),
  classId: z.string().min(1, 'Class ID is required'),
  studentId: z.string().min(1, 'Student ID is required'),
  date: z.string().min(1, 'Date is required'),
  status: z.enum(['present', 'absent', 'late', 'excused']),
  note: z.string().optional(),
  recordedBy: z.string().min(1, 'Recorded by is required'),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// Schema for Assessments
export const assessmentSchema = z.object({
  id: z.string().optional(),
  classId: z.string().min(1, 'Class ID is required'),
  title: z.string().min(1, 'Assessment title is required'),
  kind: z.enum(['exam', 'quiz', 'assignment', 'project']),
  maxScore: z.number().int().min(0, 'Maximum score must be positive'),
  date: z.string().min(1, 'Date is required'),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// Schema for Assessment Results
export const assessmentResultSchema = z.object({
  id: z.string().optional(),
  assessmentId: z.string().min(1, 'Assessment ID is required'),
  studentId: z.string().min(1, 'Student ID is required'),
  score: z.number().int().min(0, 'Score must be positive'),
  grade: z.string().optional(),
  feedback: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// Schema for Report Cards
export const reportCardSchema = z.object({
  id: z.string().optional(),
  studentId: z.string().min(1, 'Student ID is required'),
  term: z.string().min(1, 'Term is required'),
  summary: z.string().optional(),
  overallGrade: z.string().min(1, 'Overall grade is required'),
  publishedAt: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// Schema for Notifications
export const notificationSchema = z.object({
  id: z.string().optional(),
  userId: z.string().min(1, 'User ID is required'),
  channel: z.enum(['in_app', 'email', 'sms']),
  title: z.string().min(1, 'Title is required'),
  body: z.string().min(1, 'Body is required'),
  readAt: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// Export types
export type SchoolInput = z.infer<typeof schoolSchema>;
export type UserInput = z.infer<typeof userSchema>;
export type StudentInput = z.infer<typeof studentSchema>;
export type GuardianInput = z.infer<typeof guardianSchema>;
export type StudentGuardianInput = z.infer<typeof studentGuardianSchema>;
export type CourseInput = z.infer<typeof courseSchema>;
export type ClassInput = z.infer<typeof classSchema>;
export type EnrolmentInput = z.infer<typeof enrolmentSchema>;
export type AttendanceInput = z.infer<typeof attendanceSchema>;
export type AssessmentInput = z.infer<typeof assessmentSchema>;
export type AssessmentResultInput = z.infer<typeof assessmentResultSchema>;
export type ReportCardInput = z.infer<typeof reportCardSchema>;
export type NotificationInput = z.infer<typeof notificationSchema>;