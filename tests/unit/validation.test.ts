import { test } from 'node:test';
import * as assert from 'node:assert';
import { 
  schoolSchema, 
  studentSchema, 
  guardianSchema, 
  courseSchema, 
  classSchema, 
  enrolmentSchema, 
  attendanceSchema, 
  assessmentSchema, 
  assessmentResultSchema,
  reportCardSchema,
  notificationSchema,
  userSchema
} from '@/lib/education/validation';

test('school schema validation', async () => {
  // Valid school data
  const validSchool = {
    name: 'Test School',
    address: '123 Test St'
  };
  
  const result = schoolSchema.safeParse(validSchool);
  assert.ok(result.success, 'Valid school data should pass validation');
  
  // Invalid school data
  const invalidSchool = {
    name: ''
  };
  
  const invalidResult = schoolSchema.safeParse(invalidSchool);
  assert.ok(!invalidResult.success, 'Invalid school data should fail validation');
});

test('student schema validation', async () => {
  const validStudent = {
    schoolId: '123',
    firstName: 'John',
    lastName: 'Doe',
    dateOfBirth: '2005-01-01',
    admissionNumber: 'A123',
    gradeLevel: '5th Grade'
  };
  
  const result = studentSchema.safeParse(validStudent);
  assert.ok(result.success, 'Valid student data should pass validation');
  
  // Invalid student data
  const invalidStudent = {
    schoolId: '123',
    firstName: '',
    lastName: 'Doe',
    dateOfBirth: '2005-01-01',
    admissionNumber: 'A123',
    gradeLevel: '5th Grade'
  };
  
  const invalidResult = studentSchema.safeParse(invalidStudent);
  assert.ok(!invalidResult.success, 'Invalid student data should fail validation');
});

test('guardian schema validation', async () => {
  const validGuardian = {
    name: 'Jane Doe',
    phone: '123-456-7890',
    email: 'jane@example.com',
    relationship: 'Mother'
  };
  
  const result = guardianSchema.safeParse(validGuardian);
  assert.ok(result.success, 'Valid guardian data should pass validation');
});

test('course schema validation', async () => {
  const validCourse = {
    schoolId: '123',
    code: 'MATH101',
    title: 'Mathematics',
    gradeLevel: '5th Grade'
  };
  
  const result = courseSchema.safeParse(validCourse);
  assert.ok(result.success, 'Valid course data should pass validation');
});

test('class schema validation', async () => {
  const validClass = {
    schoolId: '123',
    courseId: '456',
    teacherId: '789',
    name: 'Math Class',
    term: 'Fall 2023'
  };
  
  const result = classSchema.safeParse(validClass);
  assert.ok(result.success, 'Valid class data should pass validation');
});

test('enrolment schema validation', async () => {
  const validEnrolment = {
    studentId: '123',
    classId: '456',
    status: 'active',
    enrolledAt: '2023-09-01'
  };
  
  const result = enrolmentSchema.safeParse(validEnrolment);
  assert.ok(result.success, 'Valid enrolment data should pass validation');
});

test('attendance schema validation', async () => {
  const validAttendance = {
    classId: '123',
    studentId: '456',
    date: '2023-09-01',
    status: 'present',
    recordedBy: '789'
  };
  
  const result = attendanceSchema.safeParse(validAttendance);
  assert.ok(result.success, 'Valid attendance data should pass validation');
});

test('assessment schema validation', async () => {
  const validAssessment = {
    classId: '123',
    title: 'Midterm Exam',
    kind: 'exam',
    maxScore: 100,
    date: '2023-09-15'
  };
  
  const result = assessmentSchema.safeParse(validAssessment);
  assert.ok(result.success, 'Valid assessment data should pass validation');
});

test('assessment result schema validation', async () => {
  const validResult = {
    assessmentId: '123',
    studentId: '456',
    score: 85
  };
  
  const result = assessmentResultSchema.safeParse(validResult);
  assert.ok(result.success, 'Valid assessment result data should pass validation');
});

test('report card schema validation', async () => {
  const validReportCard = {
    studentId: '123',
    term: 'Fall 2023',
    overallGrade: 'A'
  };
  
  const result = reportCardSchema.safeParse(validReportCard);
  assert.ok(result.success, 'Valid report card data should pass validation');
});

test('notification schema validation', async () => {
  const validNotification = {
    userId: '123',
    channel: 'in_app',
    title: 'Test Notification',
    body: 'This is a test'
  };
  
  const result = notificationSchema.safeParse(validNotification);
  assert.ok(result.success, 'Valid notification data should pass validation');
});

test('user schema validation', async () => {
  const validUser = {
    name: 'John Doe',
    email: 'john@example.com',
    role: 'teacher'
  };
  
  const result = userSchema.safeParse(validUser);
  assert.ok(result.success, 'Valid user data should pass validation');
});

test('user schema validation with invalid email', async () => {
  const invalidUser = {
    name: 'John Doe',
    email: 'invalid-email',
    role: 'teacher'
  };
  
  const result = userSchema.safeParse(invalidUser);
  assert.ok(!result.success, 'Invalid email should fail validation');
});

test('user schema validation with invalid role', async () => {
  const invalidUser = {
    name: 'John Doe',
    email: 'john@example.com',
    role: 'invalid-role'
  };
  
  const result = userSchema.safeParse(invalidUser);
  assert.ok(!result.success, 'Invalid role should fail validation');
});