const tests = [];
const test = (name, fn) => tests.push({ name, fn });

import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = fileURLToPath(new URL('../../', import.meta.url));  // repo root (test files live in tests/<layer>/)
registerHooks({ resolve(spec, ctx, next) {
  if (spec === '@/db' || spec === '@/db/index') return { url: 'data:text/javascript,export const getDb = () => globalThis.__sahaTestDb;', shortCircuit: true };
  if (/^next\/[a-z-]+$/.test(spec)) return next(spec + '.js', ctx);
  let s = spec; if (s.startsWith('@/')) s = pathToFileURL(join(root, s.slice(2))).href;
  if ((s.startsWith('.') || s.startsWith('file:')) && !/\.[cm]?[jt]sx?$/.test(s)) { const base = new URL(s, ctx.parentURL); for (const ext of ['.ts', '.tsx', '/index.ts']) { const u = new URL(base.href + ext); if (existsSync(u)) return { url: u.href, shortCircuit: true }; } }
  return next(s, ctx); } });

function freshDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync(join(root, 'drizzle')).filter((f) => /^\d.*\.sql$/.test(f)).sort()) 
    for (const st of readFileSync(join(root, 'drizzle', f), 'utf8').split('--> statement-breakpoint')) 
      if (st.trim()) sqlite.exec(st);
  return sqlite;
}

const { drizzle } = await import('drizzle-orm/sqlite-proxy');
const schema = await import(pathToFileURL(join(root, 'db/schema.ts')).href);

function installTestDb(sqlite) {
  globalThis.__sahaTestDb = drizzle(async (sql, params, method) => {
    const st = sqlite.prepare(sql);
    if (method === 'run') { st.run(...params); return { rows: [] }; }
    if (method === 'get') { const r = st.get(...params); return { rows: r ? Object.values(r) : undefined }; }
    return { rows: st.all(...params).map((r) => Object.values(r)) };
  }, { schema });
}

let sqlite = freshDb();
installTestDb(sqlite);

const { 
  schoolSchema,
  userSchema,
  studentSchema,
  guardianSchema,
  studentGuardianSchema,
  courseSchema,
  classSchema,
  enrolmentSchema,
  attendanceSchema,
  assessmentSchema,
  assessmentResultSchema,
  reportCardSchema,
  notificationSchema
} = await import(pathToFileURL(join(root, 'lib/education/validation.ts')).href);

// School validation tests
test('school schema - valid input', () => {
  const validSchool = {
    id: 'school-1',
    name: 'Test School',
    address: '123 Main St',
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-01T00:00:00Z'
  };
  
  const result = schoolSchema.safeParse(validSchool);
  assert.ok(result.success, 'Valid school should parse successfully');
  assert.equal(result.data.name, 'Test School');
  assert.equal(result.data.address, '123 Main St');
});

test('school schema - invalid name', () => {
  const invalidSchool = {
    id: 'school-1',
    name: '',
    address: '123 Main St'
  };
  
  const result = schoolSchema.safeParse(invalidSchool);
  assert.ok(!result.success, 'School with empty name should be rejected');
});

// User validation tests
test('user schema - valid input', () => {
  const validUser = {
    id: 'user-1',
    name: 'John Doe',
    email: 'john@example.com',
    role: 'teacher',
    schoolId: 'school-1',
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-01T00:00:00Z'
  };
  
  const result = userSchema.safeParse(validUser);
  assert.ok(result.success, 'Valid user should parse successfully');
  assert.equal(result.data.name, 'John Doe');
  assert.equal(result.data.email, 'john@example.com');
  assert.equal(result.data.role, 'teacher');
});

test('user schema - invalid email', () => {
  const invalidUser = {
    id: 'user-1',
    name: 'John Doe',
    email: 'invalid-email',
    role: 'teacher'
  };
  
  const result = userSchema.safeParse(invalidUser);
  assert.ok(!result.success, 'User with invalid email should be rejected');
});

test('user schema - invalid role', () => {
  const invalidUser = {
    id: 'user-1',
    name: 'John Doe',
    email: 'john@example.com',
    role: 'invalid-role'
  };
  
  const result = userSchema.safeParse(invalidUser);
  assert.ok(!result.success, 'User with invalid role should be rejected');
});

// Student validation tests
test('student schema - valid input', () => {
  const validStudent = {
    id: 'student-1',
    schoolId: 'school-1',
    firstName: 'John',
    lastName: 'Doe',
    dateOfBirth: '2010-01-01',
    admissionNumber: 'ADMS-001',
    gradeLevel: '5th Grade',
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-01T00:00:00Z'
  };
  
  const result = studentSchema.safeParse(validStudent);
  assert.ok(result.success, 'Valid student should parse successfully');
  assert.equal(result.data.firstName, 'John');
  assert.equal(result.data.lastName, 'Doe');
});

test('student schema - missing required fields', () => {
  const invalidStudent = {
    id: 'student-1',
    schoolId: 'school-1',
    firstName: 'John',
    // missing lastName, dateOfBirth, admissionNumber, gradeLevel
  };
  
  const result = studentSchema.safeParse(invalidStudent);
  assert.ok(!result.success, 'Student with missing required fields should be rejected');
});

// Guardian validation tests
test('guardian schema - valid input', () => {
  const validGuardian = {
    id: 'guardian-1',
    userId: 'user-1',
    name: 'Jane Doe',
    phone: '123-456-7890',
    email: 'jane@example.com',
    relationship: 'Mother',
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-01T00:00:00Z'
  };
  
  const result = guardianSchema.safeParse(validGuardian);
  assert.ok(result.success, 'Valid guardian should parse successfully');
  assert.equal(result.data.name, 'Jane Doe');
});

test('guardian schema - invalid email', () => {
  const invalidGuardian = {
    id: 'guardian-1',
    name: 'Jane Doe',
    email: 'invalid-email'
  };
  
  const result = guardianSchema.safeParse(invalidGuardian);
  assert.ok(!result.success, 'Guardian with invalid email should be rejected');
});

// StudentGuardian validation tests
test('studentGuardian schema - valid input', () => {
  const validStudentGuardian = {
    studentId: 'student-1',
    guardianId: 'guardian-1',
    isPrimary: true
  };
  
  const result = studentGuardianSchema.safeParse(validStudentGuardian);
  assert.ok(result.success, 'Valid student-guardian relationship should parse successfully');
  assert.equal(result.data.studentId, 'student-1');
});

test('studentGuardian schema - missing required fields', () => {
  const invalidStudentGuardian = {
    studentId: 'student-1'
    // missing guardianId
  };
  
  const result = studentGuardianSchema.safeParse(invalidStudentGuardian);
  assert.ok(!result.success, 'Student-guardian relationship with missing required fields should be rejected');
});

// Course validation tests
test('course schema - valid input', () => {
  const validCourse = {
    id: 'course-1',
    schoolId: 'school-1',
    code: 'MATH101',
    title: 'Mathematics',
    description: 'Basic math course',
    gradeLevel: '5th Grade',
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-01T00:00:00Z'
  };
  
  const result = courseSchema.safeParse(validCourse);
  assert.ok(result.success, 'Valid course should parse successfully');
  assert.equal(result.data.code, 'MATH101');
});

test('course schema - missing required fields', () => {
  const invalidCourse = {
    id: 'course-1',
    schoolId: 'school-1',
    code: 'MATH101',
    // missing title
  };
  
  const result = courseSchema.safeParse(invalidCourse);
  assert.ok(!result.success, 'Course with missing required fields should be rejected');
});

// Class validation tests
test('class schema - valid input', () => {
  const validClass = {
    id: 'class-1',
    schoolId: 'school-1',
    courseId: 'course-1',
    teacherId: 'teacher-1',
    name: 'Mathematics 5A',
    term: 'Spring 2023',
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-01T00:00:00Z'
  };
  
  const result = classSchema.safeParse(validClass);
  assert.ok(result.success, 'Valid class should parse successfully');
  assert.equal(result.data.name, 'Mathematics 5A');
});

test('class schema - missing required fields', () => {
  const invalidClass = {
    id: 'class-1',
    schoolId: 'school-1',
    courseId: 'course-1',
    // missing teacherId and name
  };
  
  const result = classSchema.safeParse(invalidClass);
  assert.ok(!result.success, 'Class with missing required fields should be rejected');
});

// Enrolment validation tests
test('enrolment schema - valid input', () => {
  const validEnrolment = {
    id: 'enrolment-1',
    studentId: 'student-1',
    classId: 'class-1',
    status: 'active',
    enrolledAt: '2023-01-01',
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-01T00:00:00Z'
  };
  
  const result = enrolmentSchema.safeParse(validEnrolment);
  assert.ok(result.success, 'Valid enrolment should parse successfully');
  assert.equal(result.data.status, 'active');
});

test('enrolment schema - invalid status', () => {
  const invalidEnrolment = {
    id: 'enrolment-1',
    studentId: 'student-1',
    classId: 'class-1',
    status: 'invalid-status'
  };
  
  const result = enrolmentSchema.safeParse(invalidEnrolment);
  assert.ok(!result.success, 'Enrolment with invalid status should be rejected');
});

// Attendance validation tests
test('attendance schema - valid input', () => {
  const validAttendance = {
    id: 'attendance-1',
    classId: 'class-1',
    studentId: 'student-1',
    date: '2023-01-01',
    status: 'present',
    recordedBy: 'teacher-1',
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-01T00:00:00Z'
  };
  
  const result = attendanceSchema.safeParse(validAttendance);
  assert.ok(result.success, 'Valid attendance should parse successfully');
  assert.equal(result.data.status, 'present');
});

test('attendance schema - invalid status', () => {
  const invalidAttendance = {
    id: 'attendance-1',
    classId: 'class-1',
    studentId: 'student-1',
    date: '2023-01-01',
    status: 'invalid-status',
    recordedBy: 'teacher-1'
  };
  
  const result = attendanceSchema.safeParse(invalidAttendance);
  assert.ok(!result.success, 'Attendance with invalid status should be rejected');
});

// Assessment validation tests
test('assessment schema - valid input', () => {
  const validAssessment = {
    id: 'assessment-1',
    classId: 'class-1',
    title: 'Mathematics Test',
    kind: 'exam',
    maxScore: 100,
    date: '2023-01-01',
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-01T00:00:00Z'
  };
  
  const result = assessmentSchema.safeParse(validAssessment);
  assert.ok(result.success, 'Valid assessment should parse successfully');
  assert.equal(result.data.kind, 'exam');
  assert.equal(result.data.maxScore, 100);
});

test('assessment schema - invalid kind', () => {
  const invalidAssessment = {
    id: 'assessment-1',
    classId: 'class-1',
    title: 'Mathematics Test',
    kind: 'invalid-kind'
  };
  
  const result = assessmentSchema.safeParse(invalidAssessment);
  assert.ok(!result.success, 'Assessment with invalid kind should be rejected');
});

// AssessmentResult validation tests
test('assessmentResult schema - valid input', () => {
  const validAssessmentResult = {
    id: 'result-1',
    assessmentId: 'assessment-1',
    studentId: 'student-1',
    score: 85,
    grade: 'B',
    feedback: 'Good work',
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-01T00:00:00Z'
  };
  
  const result = assessmentResultSchema.safeParse(validAssessmentResult);
  assert.ok(result.success, 'Valid assessment result should parse successfully');
  assert.equal(result.data.score, 85);
});

test('assessmentResult schema - negative score', () => {
  const invalidAssessmentResult = {
    id: 'result-1',
    assessmentId: 'assessment-1',
    studentId: 'student-1',
    score: -5
  };
  
  const result = assessmentResultSchema.safeParse(invalidAssessmentResult);
  assert.ok(!result.success, 'Assessment result with negative score should be rejected');
});

// ReportCard validation tests
test('reportCard schema - valid input', () => {
  const validReportCard = {
    id: 'report-1',
    studentId: 'student-1',
    term: 'Spring 2023',
    summary: 'Good performance',
    overallGrade: 'B+',
    publishedAt: '2023-06-01T00:00:00Z',
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-01T00:00:00Z'
  };
  
  const result = reportCardSchema.safeParse(validReportCard);
  assert.ok(result.success, 'Valid report card should parse successfully');
  assert.equal(result.data.term, 'Spring 2023');
});

test('reportCard schema - missing required fields', () => {
  const invalidReportCard = {
    id: 'report-1',
    studentId: 'student-1',
    // missing term and overallGrade
  };
  
  const result = reportCardSchema.safeParse(invalidReportCard);
  assert.ok(!result.success, 'Report card with missing required fields should be rejected');
});

// Notification validation tests
test('notification schema - valid input', () => {
  const validNotification = {
    id: 'notification-1',
    userId: 'user-1',
    channel: 'email',
    title: 'Test Notification',
    body: 'This is a test notification',
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-01T00:00:00Z'
  };
  
  const result = notificationSchema.safeParse(validNotification);
  assert.ok(result.success, 'Valid notification should parse successfully');
  assert.equal(result.data.channel, 'email');
});

test('notification schema - invalid channel', () => {
  const invalidNotification = {
    id: 'notification-1',
    userId: 'user-1',
    channel: 'invalid-channel',
    title: 'Test Notification'
  };
  
  const result = notificationSchema.safeParse(invalidNotification);
  assert.ok(!result.success, 'Notification with invalid channel should be rejected');
});

// Run all tests
let passed = 0;
let failed = 0;

for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`ok - ${name}`);
    passed++;
  } catch (error) {
    console.log(`not ok - ${name}: ${error.message}`);
    failed++;
  }
}

console.log(JSON.stringify({ passed, failed, skipped: 0 }));
process.exitCode = failed ? 1 : 0;