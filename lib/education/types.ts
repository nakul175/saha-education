import type { 
  SelectSchool, 
  InsertSchool,
  SelectUser, 
  InsertUser,
  SelectStudent, 
  InsertStudent,
  SelectGuardian, 
  InsertGuardian,
  SelectStudentGuardian, 
  InsertStudentGuardian,
  SelectCourse, 
  InsertCourse,
  SelectClass, 
  InsertClass,
  SelectEnrolment, 
  InsertEnrolment,
  SelectAttendance, 
  InsertAttendance,
  SelectAssessment, 
  InsertAssessment,
  SelectAssessmentResult, 
  InsertAssessmentResult,
  SelectReportCard, 
  InsertReportCard,
  SelectNotification, 
  InsertNotification
} from '../../db/schema';

export type Role = 'admin' | 'teacher' | 'guardian' | 'student';

// Re-export types for each entity
export type School = SelectSchool;
export type InsertSchoolType = InsertSchool;

export type User = SelectUser;
export type InsertUserType = InsertUser;

export type Student = SelectStudent;
export type InsertStudentType = InsertStudent;

export type Guardian = SelectGuardian;
export type InsertGuardianType = InsertGuardian;

export type StudentGuardian = SelectStudentGuardian;
export type InsertStudentGuardianType = InsertStudentGuardian;

export type Course = SelectCourse;
export type InsertCourseType = InsertCourse;

export type Class = SelectClass;
export type InsertClassType = InsertClass;

export type Enrolment = SelectEnrolment;
export type InsertEnrolmentType = InsertEnrolment;

export type Attendance = SelectAttendance;
export type InsertAttendanceType = InsertAttendance;

export type Assessment = SelectAssessment;
export type InsertAssessmentType = InsertAssessment;

export type AssessmentResult = SelectAssessmentResult;
export type InsertAssessmentResultType = InsertAssessmentResult;

export type ReportCard = SelectReportCard;
export type InsertReportCardType = InsertReportCard;

export type Notification = SelectNotification;
export type InsertNotificationType = InsertNotification;