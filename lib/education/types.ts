export type Role = 'admin' | 'teacher' | 'guardian' | 'student';

export interface Principal {
  id: string;
  role: Role;
  schoolId?: string;
}

export type School = {
  id: string;
  name: string;
  address?: string;
  createdAt: string;
  updatedAt: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  schoolId?: string;
  createdAt: string;
  updatedAt: string;
};

export type Student = {
  id: string;
  userId?: string;
  schoolId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  admissionNumber: string;
  gradeLevel: string;
  createdAt: string;
  updatedAt: string;
};

export type Guardian = {
  id: string;
  schoolId?: string;
  userId?: string;
  name: string;
  phone?: string;
  email?: string;
  relationship: string;
  createdAt: string;
  updatedAt: string;
};

export type StudentGuardian = {
  studentId: string;
  guardianId: string;
  isPrimary: boolean;
};

export type Course = {
  id: string;
  schoolId: string;
  code: string;
  title: string;
  description?: string;
  gradeLevel: string;
  createdAt: string;
  updatedAt: string;
};

export type Class = {
  id: string;
  schoolId: string;
  courseId: string;
  teacherId: string;
  name: string;
  term: string;
  schedule?: string;
  createdAt: string;
  updatedAt: string;
  enrolledStudents?: Student[];
};

export type Enrolment = {
  id: string;
  studentId: string;
  classId: string;
  status: 'active' | 'withdrawn' | 'completed';
  enrolledAt: string;
  createdAt: string;
  updatedAt: string;
};

export type Attendance = {
  id: string;
  classId: string;
  studentId: string;
  date: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  note?: string;
  recordedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type Assessment = {
  id: string;
  classId: string;
  title: string;
  kind: 'exam' | 'quiz' | 'assignment' | 'project';
  maxScore: number;
  date: string;
  createdAt: string;
  updatedAt: string;
};

export type AssessmentResult = {
  id: string;
  assessmentId: string;
  studentId: string;
  score: number;
  grade?: string;
  feedback?: string;
  createdAt: string;
  updatedAt: string;
};

export type ReportCard = {
  id: string;
  studentId: string;
  term: string;
  summary: string | null;
  overallGrade: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Notification = {
  id: string;
  userId: string;
  channel: 'in_app' | 'email' | 'sms';
  title: string;
  body: string;
  readAt?: string;
  createdAt: string;
  updatedAt: string;
};