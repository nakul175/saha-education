// Synthetic SQLite persistence + real exported HTTP handlers. Not a served-Worker test.
import assert from 'node:assert/strict';
import { freshDatabase, seedSecurityData, load, bindings, stamp } from '../support/security-db.mjs';
const { db, schema, sqlite } = freshDatabase();
await seedSecurityData(db, schema);
bindings.SAHA_ALLOWED_ORIGINS = 'https://school.example.invalid';
const students = await load('lib/education/students.ts');
const classes = await load('lib/education/classes.ts');
const reports = await load('lib/education/report-cards.ts');
const notices = await load('lib/education/notifications.ts');
const results = await load('lib/education/assessments.ts');
const sessions = await load('lib/education/session.ts');
const principals = {
  admin: { id: 'admin-a', role: 'admin', schoolId: 'a' },
  teacher: { id: 'teacher-a', role: 'teacher', schoolId: 'a' },
  guardian: { id: 'guardian-a', role: 'guardian', schoolId: 'a' },
  student: { id: 'student-user-a', role: 'student', schoolId: 'a' },
};
const tests = [];
const test = (name, run) => tests.push({ name, run });
for (const [role, p] of Object.entries(principals)) {
  test(role + ' student list is scoped', async () => {
    const records = await students.listStudents(p);
    assert.deepEqual(
      records.map((r) => r.id).sort(),
      role === 'admin' ? ['student-a', 'student-other'] : ['student-a'],
    );
    assert.equal(await students.getStudent(p, 'student-b'), null);
    if (role !== 'admin') assert.equal(await students.getStudent(p, 'student-other'), null);
  });
  test(role + ' class list is scoped', async () => {
    const records = await classes.listClasses(p);
    assert.deepEqual(
      records.map((r) => r.id).sort(),
      role === 'admin' ? ['class-a', 'class-other'] : ['class-a'],
    );
    assert.equal(await classes.getClass(p, 'class-b'), null);
  });
}
for (const role of ['guardian', 'student'])
  test(role + ' report drafts are private', async () => {
    assert.deepEqual(
      (await reports.listReportCards(principals[role])).map((r) => r.id),
      ['published-a'],
    );
    assert.equal(await reports.getReportCard(principals[role], 'draft-a'), null);
    assert.equal(await reports.getReportCard(principals[role], 'published-b'), null);
  });
test('Missing school is rejected instead of global admin access', async () => {
  await assert.rejects(() => students.listStudents({ id: 'admin-a', role: 'admin' }));
});
test('Explicit second-school filter rejected', async () => {
  await assert.rejects(() => students.listStudents(principals.admin, 'b'));
});
test('Teacher cannot change student administration', async () => {
  await assert.rejects(() =>
    students.updateStudent(principals.teacher, 'student-a', {
      schoolId: 'a',
      firstName: 'Changed',
      lastName: 'Synthetic',
      dateOfBirth: '2012-01-01',
      admissionNumber: 'student-a',
      gradeLevel: '8',
    }),
  );
  assert.equal((await students.getStudent(principals.admin, 'student-a')).firstName, 'student-a');
});
test('Guardian notices are own-recipient only', async () => {
  const rows = await notices.listNotifications(principals.guardian, principals.guardian.id);
  assert.deepEqual(
    rows.map((r) => r.id),
    ['notice-guardian-a'],
  );
  await assert.rejects(() => notices.markNotificationRead(principals.guardian, 'notice-guardian-other'));
  assert.equal(
    sqlite.prepare('SELECT read_at FROM notifications WHERE id=?').get('notice-guardian-other').read_at,
    null,
  );
});
test('Result correction never overwrites a different student', async () => {
  await db.insert(schema.enrolments).values({
    id: 'second-in-class-a',
    studentId: 'student-other',
    classId: 'class-a',
    status: 'active',
    enrolledAt: stamp,
    createdAt: stamp,
    updatedAt: stamp,
  });
  await results.recordResults(principals.teacher, 'assessment-a', [
    { studentId: 'student-a', score: 10, grade: 'B', feedback: 'Synthetic' },
    { studentId: 'student-other', score: 15, grade: 'A', feedback: 'Synthetic' },
  ]);
  await results.recordResults(principals.teacher, 'assessment-a', [
    { studentId: 'student-a', score: 12, grade: 'B', feedback: 'Corrected' },
  ]);
  const rows = sqlite.prepare('SELECT student_id,score FROM assessment_results ORDER BY student_id').all();
  assert.deepEqual(
    rows,
    [
      { student_id: 'student-a', score: 12 },
      { student_id: 'student-other', score: 15 },
    ].map((r) => Object.assign(Object.create(null), r)),
  );
});
test('Mixed-scope result batch rejected before writes', async () => {
  const before = sqlite
    .prepare('SELECT score FROM assessment_results WHERE student_id=?')
    .get('student-a').score;
  await assert.rejects(() =>
    results.recordResults(principals.teacher, 'assessment-a', [
      { studentId: 'student-a', score: 20 },
      { studentId: 'student-b', score: 20 },
    ]),
  );
  assert.equal(
    sqlite.prepare('SELECT score FROM assessment_results WHERE student_id=?').get('student-a').score,
    before,
  );
});
test('Teacher cannot write another assigned class', async () => {
  await assert.rejects(() =>
    results.recordResults(principals.teacher, 'assessment-b', [{ studentId: 'student-b', score: 1 }]),
  );
});
test('Publish notice uses linked user ID and retry avoids duplicate notice', async () => {
  await reports.publishReportCard(principals.admin, 'draft-a');
  await reports.publishReportCard(principals.admin, 'draft-a');
  const notices = sqlite
    .prepare("SELECT user_id FROM notifications WHERE title='Report Card Published'")
    .all();
  assert.equal(notices.length, 1);
  assert.equal(notices[0].user_id, 'guardian-a');
});
// Real session persistence, not a mocked principal.
async function tokenFor(userId) {
  // Exported createSession issues the token; testing hook supports the documented session shape.
  const cookie = await sessions.createSession(userId);
  return cookie.split('=')[1].split(';')[0];
}
const request = (path, token, method = 'GET', body, origin = 'https://school.example.invalid') =>
  new Request('https://school.example.invalid' + path, {
    method,
    headers: {
      ...(token ? { Cookie: `${sessions.SESSION_COOKIE}=${token}` } : {}),
      ...(method !== 'GET' ? { Origin: origin, 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
test('Legacy role cookie never authenticates', async () => {
  const route = await load('app/api/students/route.ts');
  const response = await route.GET(
    new Request('https://school.example.invalid/api/students', {
      headers: { Cookie: 'saha_demo_role=admin' },
    }),
  );
  assert.equal(response.status, 401);
});
test('Session-backed API read and family class roster are scoped', async () => {
  const session = await tokenFor('guardian-a');
  const token = typeof session === 'string' ? session : session.token;
  const route = await load('app/api/classes/[id]/route.ts');
  const response = await route.GET(request('/api/classes/class-a', token), {
    params: Promise.resolve({ id: 'class-a' }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(
    (await response.json()).enrolledStudents.map((r) => r.id),
    ['student-a'],
  );
});
test('Valid session cannot cross school on HTTP reads', async () => {
  const session = await tokenFor('admin-a');
  const token = typeof session === 'string' ? session : session.token;
  const route = await load('app/api/students/[id]/route.ts');
  assert.equal(
    (
      await route.GET(request('/api/students/student-b', token), {
        params: Promise.resolve({ id: 'student-b' }),
      })
    ).status,
    404,
  );
});
test('Origin rejection occurs before persistent mutation', async () => {
  const session = await tokenFor('admin-a');
  const token = typeof session === 'string' ? session : session.token;
  const route = await load('app/api/report-cards/[id]/route.ts');
  assert.equal(
    (
      await route.PATCH(
        request(
          '/api/report-cards/published-a',
          token,
          'PATCH',
          { publish: true },
          'https://attacker.example.invalid',
        ),
        { params: Promise.resolve({ id: 'published-a' }) },
      )
    ).status,
    403,
  );
});
test('Disabled account loses authority on existing session', async () => {
  const session = await tokenFor('admin-b');
  const token = typeof session === 'string' ? session : session.token;
  const auth = await load('lib/education/auth.ts');
  assert.equal((await auth.getPrincipal(request('/', token))).id, 'admin-b');
  const { eq } = await import('drizzle-orm');
  await db.update(schema.users).set({ disabledAt: stamp }).where(eq(schema.users.id, 'admin-b'));
  assert.equal(await auth.getPrincipal(request('/', token)), null);
});
test('Guardian creation stores school ownership even without a client school field', async () => {
  const guardians = await load('lib/education/guardians.ts');
  const record = await guardians.createGuardian(principals.admin, {
    name: 'Synthetic new guardian',
    relationship: 'parent',
  });
  assert.equal(record.schoolId, 'a');
  assert.equal((await guardians.getGuardian(principals.admin, record.id)).id, record.id);
});
test('Normal student edits preserve identity and immutable system fields', async () => {
  const existing = await students.getStudent(principals.admin, 'student-a');
  await students.updateStudent(principals.admin, 'student-a', {
    ...existing,
    userId: undefined,
    id: 'tampered-id',
    createdAt: 'tampered-time',
    firstName: 'Synthetic edited',
  });
  const updated = await students.getStudent(principals.admin, 'student-a');
  assert.equal(updated.userId, 'student-user-a');
  assert.equal(updated.id, 'student-a');
  assert.equal(updated.createdAt, existing.createdAt);
});
test('Unpublished assessment results are not available to families', async () => {
  for (const role of ['guardian', 'student'])
    await assert.rejects(
      () => results.listResults(principals[role], 'assessment-a'),
      (e) => e.status === 403,
    );
});
let passed = 0,
  failed = 0;
for (const { name, run } of tests) {
  try {
    await run();
    passed++;
    console.log('ok - ' + name);
  } catch (e) {
    failed++;
    console.error('not ok - ' + name + '\n' + e.stack);
  }
}
console.log(JSON.stringify({ passed, failed, skipped: 0 }));
sqlite.close();
process.exitCode = failed ? 1 : 0;
