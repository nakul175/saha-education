// Actual route/session contracts against isolated SQLite, including SQL-time
// authority changes and a migration applied over unresolved legacy evidence.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bindings, freshDatabase, seedSecurityData, load, stamp } from '../support/security-db.mjs';

const { db, schema, sqlite } = freshDatabase();
await seedSecurityData(db, schema);
const sessionsService = await load('lib/education/session.ts');
const enrolments = await load('lib/education/enrolments.ts');
const attendance = await load('lib/education/attendance.ts');
const assessments = await load('lib/education/assessments.ts');
const editor = await load('lib/education/assessment-editor.ts');
const classDetail = await load('app/api/classes/[id]/route.ts');
const routes = {
  enrolments: await load('app/api/enrolments/route.ts'),
  attendance: await load('app/api/attendance/route.ts'),
  assessments: await load('app/api/assessments/route.ts'),
  results: await load('app/api/assessments/[id]/results/route.ts'),
  guardians: await load('app/api/students/[id]/guardians/route.ts'),
};
const origin = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = origin;
const cookies = {};
for (const user of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'guardian-a', 'student-user-a'])
  cookies[user] = (await sessionsService.createSession(user)).split(';')[0];
const admin = { id: 'admin-a', role: 'admin', schoolId: 'a' };
const teacher = { id: 'teacher-a', role: 'teacher', schoolId: 'a' };
let checks = 0;
function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  checks++;
}
function request(user, method = 'GET', payload, path = '/api/academic', selectedOrigin = origin) {
  const headers = { origin: selectedOrigin, ...(cookies[user] ? { cookie: cookies[user] } : {}) };
  const init = { method, headers };
  if (payload !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  }
  return new Request(origin + path, init);
}
const parameters = (id) => ({ params: Promise.resolve({ id }) });
const mark = (user, payload) => routes.attendance.POST(request(user, 'POST', payload));
const record = (user, payload, id = 'assessment-a') =>
  routes.results.POST(request(user, 'POST', { results: payload }), parameters(id));
const enrol = (user, payload) => routes.enrolments.POST(request(user, 'POST', payload));
const link = (user, guardianId = 'guardian-profile-other', id = 'student-a') =>
  routes.guardians.POST(request(user, 'POST', { guardianId }), parameters(id));
const count = (table) => sqlite.prepare(`SELECT count(*) n FROM ${table}`).get().n;
const originalDb = globalThis.__sahaTestDb;
function beforeOperation(operation, table, mutate) {
  let injected = false;
  globalThis.__sahaTestDb = new Proxy(originalDb, {
    get(target, property) {
      if (property === operation)
        return (...args) => {
          if (!injected && (table === null || args[0] === table)) {
            injected = true;
            globalThis.__sahaTestDb = originalDb;
            mutate();
          }
          return target[property](...args);
        };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return () => {
    globalThis.__sahaTestDb = originalDb;
    check(injected, true, 'Authority change occurred after preflight and immediately before actual write');
  };
}
function beforeRead(table, mutate) {
  let injected = false;
  globalThis.__sahaTestDb = new Proxy(originalDb, {
    get(target, property) {
      if (property === 'select')
        return (...args) => {
          const builder = target.select(...args);
          return new Proxy(builder, {
            get(query, member) {
              if (member === 'from')
                return (selected) => {
                  if (!injected && selected === table) {
                    injected = true;
                    globalThis.__sahaTestDb = originalDb;
                    mutate();
                  }
                  return query.from(selected);
                };
              const value = Reflect.get(query, member, query);
              return typeof value === 'function' ? value.bind(query) : value;
            },
          });
        };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return () => {
    globalThis.__sahaTestDb = originalDb;
    check(injected, true, 'Authority change occurred immediately before actual downstream SELECT');
  };
}
const originalFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = async () => {
  networkCalls++;
  throw new Error('Academic contracts stay local');
};
try {
  // Authentication/origin/role must precede body parsing, including malformed JSON.
  for (const [name, route, role, params] of [
    ['enrolment', routes.enrolments, 'teacher-a', undefined],
    ['attendance', routes.attendance, 'guardian-a', undefined],
    ['assessment', routes.assessments, 'student-user-a', undefined],
    ['result', routes.results, 'guardian-a', parameters('assessment-a')],
    ['guardian link', routes.guardians, 'teacher-a', parameters('student-a')],
  ]) {
    let response = await route.POST(request(null, 'POST', '{'), params);
    check(response.status, 401, `${name} authenticates before malformed JSON`);
    check(response.headers.get('cache-control'), 'no-store', `${name} unauthenticated denial is uncached`);
    response = await route.POST(request(role, 'POST', '{'), params);
    check(response.status, 403, `${name} denies unauthorized role before JSON`);
    response = await route.POST(
      request('admin-a', 'POST', '{', '/api/academic', 'https://foreign.example.invalid'),
      params,
    );
    check(response.status, 403, `${name} checks origin before JSON`);
    response = await route.POST(request('admin-a', 'POST', '{'), params);
    check(response.status, 400, `${name} validates authorized malformed JSON`);
  }
  check(
    (await routes.enrolments.PATCH(request('teacher-a', 'PATCH', '{'))).status,
    403,
    'Enrolment status also denies role before malformed JSON',
  );

  const concurrent = await Promise.all([
    enrol('admin-a', { studentId: 'student-other', classId: 'class-a' }),
    enrol('admin-a', { studentId: 'student-other', classId: 'class-a' }),
  ]);
  check(
    concurrent.map((response) => response.status).sort(),
    [201, 409],
    'Concurrent enrolment has exactly one winner',
  );
  check(
    sqlite
      .prepare("SELECT count(*) n FROM enrolments WHERE student_id='student-other' AND class_id='class-a'")
      .get().n,
    1,
    'Concurrent enrolment persists exactly one pair',
  );
  const enrolment = await concurrent.find((response) => response.status === 201).json();
  const conflictResponse = concurrent.find((response) => response.status === 409);
  check(
    await conflictResponse.json(),
    { error: 'Conflict' },
    'Conflict response is safe and actionable without SQL details',
  );
  check(conflictResponse.headers.get('cache-control'), 'no-store', 'Conflict response is uncached');
  check(
    (await enrol('admin-a', { studentId: 'student-b', classId: 'class-a' })).status,
    404,
    'Cross-school student enrolment denied',
  );
  check(
    (await enrol('admin-a', { studentId: 'student-a', classId: 'class-b' })).status,
    404,
    'Cross-school class enrolment denied',
  );
  for (const status of ['withdrawn', 'completed', 'active']) {
    const response = await routes.enrolments.PATCH(request('admin-a', 'PATCH', { id: enrolment.id, status }));
    check(response.status, 200, `Existing ${status} lifecycle retained`);
    check((await response.json()).id, enrolment.id, 'Lifecycle keeps original evidence identity');
    check(
      (await enrol('admin-a', { studentId: 'student-other', classId: 'class-a' })).status,
      409,
      'Existing lifecycle pair cannot acquire a second row',
    );
  }
  let caught;
  try {
    await enrolments.updateEnrolment(admin, 'student-a-enrolment', {
      studentId: 'student-other',
      classId: 'class-a',
      status: 'active',
      enrolledAt: stamp,
    });
  } catch (error) {
    caught = error;
  }
  check(caught?.status, 409, 'Moving an enrolment onto an existing pair conflicts');
  check(
    sqlite.prepare("SELECT student_id FROM enrolments WHERE id='student-a-enrolment'").get().student_id,
    'student-a',
    'Rejected pair move retains original enrolment',
  );

  const links = await Promise.all([link('admin-a'), link('admin-a')]);
  check(
    links.map((response) => response.status),
    [200, 200],
    'Concurrent guardian relationship retries remain idempotent',
  );
  check(
    sqlite
      .prepare(
        "SELECT count(*) n FROM student_guardians WHERE student_id='student-a' AND guardian_id='guardian-profile-other'",
      )
      .get().n,
    1,
    'Guardian pair has one row',
  );
  await link('admin-a', 'guardian-profile-a');
  check(
    sqlite
      .prepare(
        "SELECT is_primary FROM student_guardians WHERE student_id='student-a' AND guardian_id='guardian-profile-a'",
      )
      .get().is_primary,
    1,
    'Link retry retains established primary relationship',
  );
  check((await link('admin-a', 'guardian-profile-b')).status, 404, 'Foreign guardian cannot be linked');
  check(
    (await link('admin-b', 'guardian-profile-b', 'student-a')).status,
    404,
    'Foreign administrator cannot link student',
  );
  const guardianRead = await routes.guardians.GET(request('guardian-a'), parameters('student-a'));
  check(guardianRead.status, 200, 'Guardian can read permitted own relationship');
  check(
    (await guardianRead.json()).map((row) => row.id),
    ['guardian-profile-a'],
    'Guardian cannot read other linked guardian private identity',
  );

  const attendanceInput = {
    classId: 'class-a',
    date: '2026-10-05',
    entries: [
      { studentId: 'student-a', status: 'present', note: 'Original synthetic note' },
      { studentId: 'student-other', status: 'late' },
    ],
  };
  let response = await mark('teacher-a', attendanceInput);
  check(response.status, 200, 'Full authorized attendance batch saves');
  const originalAttendance = await response.json();
  const attendanceRace = await Promise.all([
    mark('teacher-a', { ...attendanceInput, entries: [{ studentId: 'student-a', status: 'absent' }] }),
    mark('teacher-a', { ...attendanceInput, entries: [{ studentId: 'student-a', status: 'excused' }] }),
  ]);
  check(
    attendanceRace.map((item) => item.status),
    [200, 200],
    'Concurrent attendance replacements both retain existing contract',
  );
  const savedAttendance = sqlite
    .prepare(
      "SELECT * FROM attendance WHERE class_id='class-a' AND student_id='student-a' AND date='2026-10-05'",
    )
    .all();
  check(savedAttendance.length, 1, 'Concurrent attendance never duplicates pair/date');
  check(
    savedAttendance[0].id,
    originalAttendance.find((row) => row.studentId === 'student-a').id,
    'Attendance replacement retains record ID',
  );
  check(
    savedAttendance[0].created_at,
    originalAttendance.find((row) => row.studentId === 'student-a').createdAt,
    'Attendance replacement retains creation evidence',
  );
  check(savedAttendance[0].note, null, 'Omitted replacement note clears prior note explicitly');
  check(savedAttendance[0].recorded_by, 'teacher-a', 'Authenticated staff recorder is persisted');
  check(
    (
      await mark('teacher-a', {
        ...attendanceInput,
        entries: [attendanceInput.entries[0], attendanceInput.entries[0]],
      })
    ).status,
    400,
    'Duplicate attendance batch student rejected',
  );
  check(
    (await mark('teacher-other', attendanceInput)).status,
    404,
    'Other assigned teacher cannot change class attendance',
  );
  check(
    (
      await mark('teacher-a', {
        ...attendanceInput,
        entries: [attendanceInput.entries[0], { studentId: 'student-b', status: 'present' }],
      })
    ).status,
    404,
    'Mixed-school attendance batch rejected',
  );
  check(count('attendance'), 2, 'Rejected attendance batches append no partial rows');

  const resultRace = await Promise.all([
    record('teacher-a', [{ studentId: 'student-a', score: 11 }]),
    record('teacher-a', [{ studentId: 'student-a', score: 12 }]),
  ]);
  check(
    resultRace.map((item) => item.status),
    [200, 200],
    'Concurrent result replacements both retain existing contract',
  );
  check(
    sqlite
      .prepare(
        "SELECT count(*) n FROM assessment_results WHERE assessment_id='assessment-a' AND student_id='student-a'",
      )
      .get().n,
    1,
    'Concurrent result saves persist exactly one pair',
  );
  response = await record('teacher-a', [
    { studentId: 'student-a', score: 13, grade: 'Synthetic supplied', feedback: 'Synthetic feedback' },
    { studentId: 'student-other', score: 14 },
  ]);
  check(response.status, 200, 'Mixed new/existing authorized result batch saves');
  const originalResult = sqlite
    .prepare("SELECT * FROM assessment_results WHERE assessment_id='assessment-a' AND student_id='student-a'")
    .get();
  response = await record('teacher-a', [{ studentId: 'student-a', score: 15 }]);
  check(response.status, 200, 'Exact student result correction saves');
  const correctedResult = sqlite
    .prepare("SELECT * FROM assessment_results WHERE assessment_id='assessment-a' AND student_id='student-a'")
    .get();
  check(correctedResult.id, originalResult.id, 'Result replacement retains ID');
  check(
    correctedResult.created_at,
    originalResult.created_at,
    'Result replacement retains creation timestamp',
  );
  check(
    [correctedResult.grade, correctedResult.feedback],
    [null, null],
    'Omitted result replacement fields clear prior values',
  );
  check(
    sqlite.prepare("SELECT score FROM assessment_results WHERE student_id='student-other'").get().score,
    14,
    'Correction cannot overwrite another student result',
  );
  check(
    (await record('teacher-a', [{ studentId: 'student-a', score: 21 }])).status,
    400,
    'Current maximum score enforced',
  );
  check(
    (
      await record('teacher-a', [
        { studentId: 'student-a', score: 1 },
        { studentId: 'student-a', score: 2 },
      ])
    ).status,
    400,
    'Duplicate result batch student rejected',
  );
  check(
    (await record('teacher-a', [{ studentId: 'student-b', score: 1 }])).status,
    404,
    'Cross-school result student denied',
  );
  check(
    (await record('teacher-other', [{ studentId: 'student-a', score: 1 }])).status,
    404,
    'Unassigned teacher cannot record assessment results',
  );
  for (const role of ['guardian-a', 'student-user-a'])
    check(
      (await routes.results.GET(request(role), parameters('assessment-a'))).status,
      403,
      'Unpublished results remain private to staff',
    );

  // Database failures still roll back full mutations, including a mixed
  // insert/update result batch. No success response precedes commit.
  sqlite.exec(
    "CREATE TRIGGER academic_attendance_failure BEFORE INSERT ON attendance WHEN NEW.student_id='student-other' AND NEW.date='synthetic-failure' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;",
  );
  response = await mark('teacher-a', { ...attendanceInput, date: 'synthetic-failure' });
  check(response.status, 500, 'Unexpected attendance SQL failure has safe failure response');
  check(
    sqlite.prepare("SELECT count(*) n FROM attendance WHERE date='synthetic-failure'").get().n,
    0,
    'Attendance SQL failure rolls back entire batch',
  );
  sqlite.exec('DROP TRIGGER academic_attendance_failure');
  sqlite.exec(
    "CREATE TRIGGER academic_result_failure BEFORE UPDATE ON assessment_results WHEN NEW.student_id='student-other' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;",
  );
  const resultBeforeFailure = sqlite.prepare('SELECT * FROM assessment_results ORDER BY id').all();
  check(
    (
      await record('teacher-a', [
        { studentId: 'student-a', score: 18 },
        { studentId: 'student-other', score: 18 },
      ])
    ).status,
    500,
    'Unexpected result SQL failure has safe failure response',
  );
  check(
    sqlite.prepare('SELECT * FROM assessment_results ORDER BY id').all(),
    resultBeforeFailure,
    'Result batch failure rolls back prior updates',
  );
  sqlite.exec('DROP TRIGGER academic_result_failure');

  const mutations = [
    [
      'account disablement',
      "UPDATE users SET disabled_at='synthetic-revocation' WHERE id='teacher-a'",
      "UPDATE users SET disabled_at=NULL WHERE id='teacher-a'",
    ],
    [
      'account role change',
      "UPDATE users SET role='guardian' WHERE id='teacher-a'",
      "UPDATE users SET role='teacher' WHERE id='teacher-a'",
    ],
    [
      'account school change',
      "UPDATE users SET school_id='b' WHERE id='teacher-a'",
      "UPDATE users SET school_id='a' WHERE id='teacher-a'",
    ],
    [
      'identity mapping removal',
      "UPDATE users SET identity_subject=NULL WHERE id='teacher-a'",
      "UPDATE users SET identity_subject='sub-teacher-a' WHERE id='teacher-a'",
    ],
    [
      'class reassignment',
      "UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'",
      "UPDATE classes SET teacher_id='teacher-a' WHERE id='class-a'",
    ],
    [
      'student transfer',
      "UPDATE students SET school_id='b' WHERE id='student-other'",
      "UPDATE students SET school_id='a' WHERE id='student-other'",
    ],
    [
      'enrolment withdrawal',
      "UPDATE enrolments SET status='withdrawn' WHERE student_id='student-other' AND class_id='class-a'",
      "UPDATE enrolments SET status='active' WHERE student_id='student-other' AND class_id='class-a'",
    ],
  ];
  for (const [name, change, restore] of mutations) {
    const before = sqlite.prepare('SELECT * FROM attendance ORDER BY id').all();
    let finish = beforeOperation('insert', schema.attendance, () => sqlite.exec(change));
    try {
      check(
        (await mark('teacher-a', attendanceInput)).status,
        409,
        `Attendance actual SQL denies ${name} after preflight`,
      );
      finish();
    } finally {
      globalThis.__sahaTestDb = originalDb;
      sqlite.exec(restore);
    }
    check(
      sqlite.prepare('SELECT * FROM attendance ORDER BY id').all(),
      before,
      'Changed attendance authority leaves entire batch unchanged',
    );
    const resultBefore = sqlite.prepare('SELECT * FROM assessment_results ORDER BY id').all();
    finish = beforeOperation('batch', null, () => sqlite.exec(change));
    try {
      check(
        (
          await record('teacher-a', [
            { studentId: 'student-a', score: 17 },
            { studentId: 'student-other', score: 17 },
          ])
        ).status,
        409,
        `Result actual SQL denies ${name} after preflight`,
      );
      finish();
    } finally {
      globalThis.__sahaTestDb = originalDb;
      sqlite.exec(restore);
    }
    check(
      sqlite.prepare('SELECT * FROM assessment_results ORDER BY id').all(),
      resultBefore,
      'Changed result authority leaves entire batch unchanged',
    );
  }
  let finish = beforeOperation('batch', null, () =>
    sqlite.prepare("UPDATE assessments SET max_score=10 WHERE id='assessment-a'").run(),
  );
  const scoresBefore = sqlite.prepare('SELECT * FROM assessment_results ORDER BY id').all();
  try {
    check(
      (
        await record('teacher-a', [
          { studentId: 'student-a', score: 12 },
          { studentId: 'student-other', score: 9 },
        ])
      ).status,
      409,
      'Result SQL rechecks changed maximum score for entire batch',
    );
    finish();
  } finally {
    globalThis.__sahaTestDb = originalDb;
    sqlite.prepare("UPDATE assessments SET max_score=20 WHERE id='assessment-a'").run();
  }
  check(
    sqlite.prepare('SELECT * FROM assessment_results ORDER BY id').all(),
    scoresBefore,
    'Changed score maximum leaves valid and invalid batch members untouched',
  );

  for (const [name, change, restore] of [
    [
      'admin disabled',
      "UPDATE users SET disabled_at='synthetic' WHERE id='admin-a'",
      "UPDATE users SET disabled_at=NULL WHERE id='admin-a'",
    ],
    [
      'student transferred',
      "UPDATE students SET school_id='b' WHERE id='student-a'",
      "UPDATE students SET school_id='a' WHERE id='student-a'",
    ],
    [
      'class moved',
      "UPDATE classes SET school_id='b' WHERE id='class-other'",
      "UPDATE classes SET school_id='a' WHERE id='class-other'",
    ],
  ]) {
    const before = count('enrolments');
    finish = beforeOperation('insert', schema.enrolments, () => sqlite.exec(change));
    try {
      check(
        (await enrol('admin-a', { studentId: 'student-a', classId: 'class-other' })).status,
        409,
        `Enrolment SQL denies ${name} after preflight`,
      );
      finish();
    } finally {
      globalThis.__sahaTestDb = originalDb;
      sqlite.exec(restore);
    }
    check(count('enrolments'), before, 'Denied enrolment creates no record');
  }
  finish = beforeOperation('update', schema.enrolments, () =>
    sqlite.prepare("UPDATE users SET role='teacher' WHERE id='admin-a'").run(),
  );
  try {
    check(
      (
        await routes.enrolments.PATCH(
          request('admin-a', 'PATCH', { id: 'student-a-enrolment', status: 'completed' }),
        )
      ).status,
      409,
      'Enrolment lifecycle SQL rechecks admin role',
    );
    finish();
  } finally {
    globalThis.__sahaTestDb = originalDb;
    sqlite.prepare("UPDATE users SET role='admin' WHERE id='admin-a'").run();
  }
  check(
    sqlite.prepare("SELECT status FROM enrolments WHERE id='student-a-enrolment'").get().status,
    'active',
    'Denied lifecycle update preserves original status',
  );

  for (const [name, change, restore] of [
    [
      'administrator disabled',
      "UPDATE users SET disabled_at='synthetic' WHERE id='admin-a'",
      "UPDATE users SET disabled_at=NULL WHERE id='admin-a'",
    ],
    [
      'student transferred',
      "UPDATE students SET school_id='b' WHERE id='student-other'",
      "UPDATE students SET school_id='a' WHERE id='student-other'",
    ],
    [
      'guardian transferred',
      "UPDATE guardians SET school_id='b' WHERE id='guardian-profile-a'",
      "UPDATE guardians SET school_id='a' WHERE id='guardian-profile-a'",
    ],
  ]) {
    const before = count('student_guardians');
    finish = beforeOperation('insert', schema.studentGuardians, () => sqlite.exec(change));
    try {
      check(
        (await link('admin-a', 'guardian-profile-a', 'student-other')).status,
        409,
        `Relationship SQL denies ${name} after preflight`,
      );
      finish();
    } finally {
      globalThis.__sahaTestDb = originalDb;
      sqlite.exec(restore);
    }
    check(count('student_guardians'), before, 'Denied relationship creates no row');
  }
  finish = beforeOperation('insert', schema.assessments, () =>
    sqlite.prepare("UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'").run(),
  );
  const assessmentCount = count('assessments');
  try {
    check(
      (
        await routes.assessments.POST(
          request('teacher-a', 'POST', {
            classId: 'class-a',
            title: 'Synthetic late create',
            kind: 'quiz',
            maxScore: 10,
            date: '2026-10-05',
          }),
        )
      ).status,
      409,
      'Assessment creation rechecks assigned teacher at INSERT',
    );
    finish();
  } finally {
    globalThis.__sahaTestDb = originalDb;
    sqlite.prepare("UPDATE classes SET teacher_id='teacher-a' WHERE id='class-a'").run();
  }
  check(count('assessments'), assessmentCount, 'Denied assessment creation appends no record');
  finish = beforeOperation('update', schema.assessments, () =>
    sqlite.prepare("UPDATE users SET disabled_at='synthetic' WHERE id='teacher-a'").run(),
  );
  let serviceConflict;
  try {
    try {
      await assessments.updateAssessment(teacher, 'assessment-a', {
        classId: 'class-a',
        title: 'Synthetic rejected edit',
        kind: 'quiz',
        maxScore: 20,
        date: '2026-10-05',
      });
    } catch (error) {
      serviceConflict = error;
    }
    check(serviceConflict?.status, 409, 'Assessment update SQL rechecks live teacher after preflight');
    finish();
  } finally {
    globalThis.__sahaTestDb = originalDb;
    sqlite.prepare("UPDATE users SET disabled_at=NULL WHERE id='teacher-a'").run();
  }
  check(
    sqlite.prepare("SELECT title FROM assessments WHERE id='assessment-a'").get().title,
    'Synthetic quiz',
    'Denied assessment edit keeps original metadata',
  );
  finish = beforeOperation('insert', schema.attendance, () =>
    sqlite
      .prepare("UPDATE enrolments SET status='withdrawn' WHERE student_id='student-a' AND class_id='class-a'")
      .run(),
  );
  serviceConflict = undefined;
  try {
    try {
      await attendance.createAttendance(teacher, {
        id: 'ignored-client-id',
        classId: 'class-a',
        studentId: 'student-a',
        date: '2026-10-07',
        status: 'present',
        recordedBy: 'admin-b',
        createdAt: stamp,
        updatedAt: stamp,
      });
    } catch (error) {
      serviceConflict = error;
    }
    check(serviceConflict?.status, 409, 'Single attendance insert SQL rechecks active membership');
    finish();
  } finally {
    globalThis.__sahaTestDb = originalDb;
    sqlite
      .prepare("UPDATE enrolments SET status='active' WHERE student_id='student-a' AND class_id='class-a'")
      .run();
  }
  check(
    sqlite.prepare("SELECT count(*) n FROM attendance WHERE date='2026-10-07'").get().n,
    0,
    'Denied single attendance creates no record',
  );
  serviceConflict = undefined;
  try {
    await attendance.createAttendance(teacher, {
      id: 'ignored-client-id',
      classId: 'class-a',
      studentId: 'student-a',
      date: '2026-10-05',
      status: 'present',
      recordedBy: 'admin-b',
      createdAt: stamp,
      updatedAt: stamp,
    });
  } catch (error) {
    serviceConflict = error;
  }
  check(
    serviceConflict?.status,
    409,
    'Direct attendance duplicate receives safe conflict instead of raw constraint failure',
  );
  check(count('attendance'), 2, 'Direct attendance duplicate preserves established records');

  finish = beforeRead(schema.assessmentResults, () =>
    sqlite.prepare("UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'").run(),
  );
  try {
    response = await routes.results.GET(request('teacher-a'), parameters('assessment-a'));
    finish();
    check(response.status, 200, 'Late result read revocation may return safe empty list');
    check(await response.json(), [], 'Actual result SELECT rechecks class authority after initial lookup');
  } finally {
    globalThis.__sahaTestDb = originalDb;
    sqlite.prepare("UPDATE classes SET teacher_id='teacher-a' WHERE id='class-a'").run();
  }
  finish = beforeRead(schema.studentGuardians, () =>
    sqlite.prepare("UPDATE users SET disabled_at='synthetic' WHERE id='guardian-a'").run(),
  );
  try {
    response = await routes.guardians.GET(request('guardian-a'), parameters('student-a'));
    finish();
    check(
      await response.json(),
      [],
      'Guardian relationship SELECT rechecks disabled actor after student lookup',
    );
  } finally {
    globalThis.__sahaTestDb = originalDb;
    sqlite.prepare("UPDATE users SET disabled_at=NULL WHERE id='guardian-a'").run();
  }
  sqlite.prepare("UPDATE users SET disabled_at='synthetic' WHERE id='teacher-a'").run();
  try {
    check(await attendance.listAttendance(teacher), [], 'Direct stale-principal attendance read is empty');
    check(await assessments.listAssessments(teacher), [], 'Direct stale-principal assessment read is empty');
    check(await enrolments.listEnrolments(teacher), [], 'Direct stale-principal enrolment read is empty');
    check(
      (await routes.attendance.GET(request('teacher-a'))).status,
      401,
      'Existing session disabled actor fails authentication',
    );
  } finally {
    sqlite.prepare("UPDATE users SET disabled_at=NULL WHERE id='teacher-a'").run();
  }

  // The real class/result feed drives the editor projection. An unopened or
  // untouched screen must not synthesize zero scores or clear saved grades.
  await db.insert(schema.students).values({
    id: 'student-unscored',
    schoolId: 'a',
    userId: null,
    firstName: 'Unscored',
    lastName: 'Synthetic',
    dateOfBirth: '2012-01-01',
    admissionNumber: 'unscored-synthetic',
    gradeLevel: '8',
    createdAt: stamp,
    updatedAt: stamp,
  });
  check(
    (await enrol('admin-a', { studentId: 'student-unscored', classId: 'class-a' })).status,
    201,
    'Unscored synthetic student joins authorized editor roster',
  );
  check(
    (
      await record('teacher-a', [
        {
          studentId: 'student-a',
          score: 15,
          grade: 'Existing supplied grade',
          feedback: 'Saved educator feedback',
        },
        { studentId: 'student-other', score: 0 },
      ])
    ).status,
    200,
    'Saved nonzero and legitimate zero scores prepared through actual route',
  );
  response = await classDetail.GET(request('teacher-a'), parameters('class-a'));
  check(response.status, 200, 'Actual scoped roster feed loads for result editor');
  const editorRoster = (await response.json()).enrolledStudents;
  response = await routes.results.GET(request('teacher-a'), parameters('assessment-a'));
  check(response.status, 200, 'Actual saved results feed loads before editor is available');
  const editorSaved = await response.json();
  const editorRows = editor.buildAssessmentEditor(editorRoster, editorSaved);
  check(
    editorRows.find((row) => row.id === 'student-a').result,
    { score: 15, grade: 'Existing supplied grade', feedback: 'Saved educator feedback' },
    'Editor preserves actual stored score, grade and feedback',
  );
  check(
    editorRows.find((row) => row.id === 'student-other').result.score,
    0,
    'Editor preserves legitimate saved zero',
  );
  check(
    editorRows.find((row) => row.id === 'student-unscored').result.score,
    null,
    'Editor represents absence of a result with blank score',
  );
  check(
    editor.assessmentEditorChanges(editorRows, 20),
    [],
    'Unedited screen produces no replacement result payload',
  );
  const editedRows = editorRows.map((row) =>
    row.id === 'student-a'
      ? { ...row, dirty: true, result: { ...row.result, feedback: 'Explicit edited feedback' } }
      : row,
  );
  const changes = editor.assessmentEditorChanges(editedRows, 20);
  check(
    changes,
    [
      {
        studentId: 'student-a',
        score: 15,
        grade: 'Existing supplied grade',
        feedback: 'Explicit edited feedback',
      },
    ],
    'Only edited student is submitted with preserved supplied grade',
  );
  check(
    (await record('teacher-a', changes)).status,
    200,
    'Editor output is accepted by actual scoped result route',
  );
  check(
    sqlite
      .prepare(
        "SELECT grade FROM assessment_results WHERE student_id='student-a' AND assessment_id='assessment-a'",
      )
      .get().grade,
    'Existing supplied grade',
    'Feedback edit cannot clear existing supplied grade',
  );
  check(
    sqlite
      .prepare(
        "SELECT score FROM assessment_results WHERE student_id='student-other' AND assessment_id='assessment-a'",
      )
      .get().score,
    0,
    'Editing other student cannot overwrite saved zero',
  );
  check(
    sqlite.prepare("SELECT count(*) n FROM assessment_results WHERE student_id='student-unscored'").get().n,
    0,
    'Untouched unscored student acquires no automatic result',
  );
  const zeroEdit = editorRows.map((row) =>
    row.id === 'student-other'
      ? { ...row, dirty: true, result: { ...row.result, feedback: 'Explicit zero feedback' } }
      : row,
  );
  check(
    editor.assessmentEditorChanges(zeroEdit, 20)[0].score,
    0,
    'Feedback-only edit retains actual zero score',
  );
  for (const score of [null, -1, 21, 1.5, Number.NaN]) {
    assert.throws(
      () =>
        editor.assessmentEditorChanges(
          editorRows.map((row) =>
            row.id === 'student-unscored' ? { ...row, dirty: true, result: { ...row.result, score } } : row,
          ),
          20,
        ),
      /whole-number score/,
    );
    checks++;
  }
  assert.throws(
    () => editor.buildAssessmentEditor(editorRoster, [...editorSaved, editorSaved[0]]),
    /Multiple saved results/,
  );
  checks++;
  assert.throws(
    () => editor.buildAssessmentEditor([...editorRoster, editorRoster[0]], editorSaved),
    /Multiple enrolment records/,
  );
  checks++;

  // Remove only the newly applied guards to construct a pre-0009 legacy
  // fixture, then apply the exact migration over those existing duplicates.
  for (const trigger of [
    'enrolments_pair_insert_guard',
    'enrolments_pair_update_guard',
    'assessment_results_pair_insert_guard',
    'assessment_results_pair_update_guard',
  ])
    sqlite.exec(`DROP TRIGGER ${trigger}`);
  sqlite.exec('DROP INDEX enrolments_pair_lookup; DROP INDEX assessment_results_pair_lookup');
  sqlite
    .prepare(
      "INSERT INTO enrolments(id,student_id,class_id,status,enrolled_at,created_at,updated_at) VALUES ('legacy-enrolment-duplicate','student-a','class-a','completed',?,?,?)",
    )
    .run(stamp, stamp, stamp);
  sqlite
    .prepare(
      "INSERT INTO assessment_results(id,assessment_id,student_id,score,grade,feedback,created_at,updated_at) VALUES ('legacy-result-duplicate','assessment-a','student-a',7,'Legacy supplied','Confirmed legacy feedback',?,?)",
    )
    .run(stamp, stamp);
  const legacyEnrolments = sqlite.prepare('SELECT * FROM enrolments ORDER BY id').all();
  const legacyResults = sqlite.prepare('SELECT * FROM assessment_results ORDER BY id').all();
  sqlite.exec(
    readFileSync(new URL('../../drizzle/0009_academic_integrity.sql', import.meta.url), 'utf8').replaceAll(
      '--> statement-breakpoint',
      '',
    ),
  );
  check(
    sqlite.prepare('SELECT * FROM enrolments ORDER BY id').all(),
    legacyEnrolments,
    'Migration preserves every unresolved enrolment duplicate and field',
  );
  check(
    sqlite.prepare('SELECT * FROM assessment_results ORDER BY id').all(),
    legacyResults,
    'Migration preserves every confirmed legacy result and field',
  );
  check(
    sqlite
      .prepare("PRAGMA index_list('enrolments')")
      .all()
      .find((row) => row.name === 'enrolments_pair_lookup').unique,
    0,
    'Enrolment lookup deliberately nonunique for legacy preservation',
  );
  check(
    sqlite
      .prepare("PRAGMA index_list('assessment_results')")
      .all()
      .find((row) => row.name === 'assessment_results_pair_lookup').unique,
    0,
    'Result lookup deliberately nonunique for legacy preservation',
  );
  for (const [statement, params, marker] of [
    [
      "INSERT INTO enrolments(id,student_id,class_id,status,enrolled_at,created_at,updated_at) VALUES ('new-invalid-duplicate','student-a','class-a','active',?,?,?)",
      [stamp, stamp, stamp],
      /saha_enrolment_pair_conflict/,
    ],
    [
      "INSERT INTO assessment_results(id,assessment_id,student_id,score,created_at,updated_at) VALUES ('new-invalid-result','assessment-a','student-a',9,?,?)",
      [stamp, stamp],
      /saha_result_pair_conflict/,
    ],
    [
      "UPDATE enrolments SET student_id='student-a',class_id='class-a' WHERE id='student-other-enrolment'",
      [],
      /saha_enrolment_pair_conflict/,
    ],
    [
      "UPDATE assessment_results SET student_id='student-a' WHERE assessment_id='assessment-a' AND student_id='student-other'",
      [],
      /saha_result_pair_conflict/,
    ],
  ]) {
    assert.throws(() => sqlite.prepare(statement).run(...params), marker);
    checks++;
  }
  check(
    sqlite.prepare('SELECT * FROM enrolments ORDER BY id').all(),
    legacyEnrolments,
    'Raw guarded pair failures retain all enrolments',
  );
  check(
    sqlite.prepare('SELECT * FROM assessment_results ORDER BY id').all(),
    legacyResults,
    'Raw guarded pair failures retain all results',
  );
  check(
    (
      await record('teacher-a', [
        { studentId: 'student-a', score: 19 },
        { studentId: 'student-other', score: 19 },
      ])
    ).status,
    409,
    'Ambiguous legacy result pair conflicts for entire batch',
  );
  check(
    sqlite.prepare('SELECT * FROM assessment_results ORDER BY id').all(),
    legacyResults,
    'Legacy ambiguity neither chooses arbitrary evidence nor updates other valid member',
  );
  response = await routes.results.GET(request('teacher-a'), parameters('assessment-a'));
  check(response.status, 200, 'Staff legacy feed retains all confirmed result evidence');
  const ambiguousSaved = await response.json();
  assert.throws(() => editor.buildAssessmentEditor(editorRoster, ambiguousSaved), /Multiple saved results/);
  checks++;
  check(
    (
      await routes.enrolments.PATCH(
        request('admin-a', 'PATCH', { id: 'legacy-enrolment-duplicate', status: 'withdrawn' }),
      )
    ).status,
    200,
    'Legacy duplicate may retain established lifecycle updates',
  );
  check(
    sqlite.prepare("SELECT status FROM enrolments WHERE id='student-a-enrolment'").get().status,
    'active',
    'Legacy lifecycle update changes only explicitly selected row',
  );
  check(
    sqlite
      .prepare("SELECT count(*) n FROM enrolments WHERE student_id='student-a' AND class_id='class-a'")
      .get().n,
    2,
    'Legacy lifecycle does not merge or destroy duplicate evidence',
  );

  // Use the production Drizzle D1 prepared/batch path over the same isolated
  // SQLite. Returning rows must be available to confirm actual committed saves.
  const { drizzle: d1Drizzle } = await import('drizzle-orm/d1');
  function prepared(query, params = []) {
    return {
      bind(...values) {
        return prepared(query, values);
      },
      async run() {
        const statement = sqlite.prepare(query);
        if (statement.columns().length) return { success: true, results: statement.all(...params), meta: {} };
        const result = statement.run(...params);
        return { success: true, results: [], meta: { changes: Number(result.changes) } };
      },
      async all() {
        return { success: true, results: sqlite.prepare(query).all(...params), meta: {} };
      },
      async raw() {
        const statement = sqlite.prepare(query);
        statement.setReturnArrays(true);
        return statement.all(...params);
      },
    };
  }
  globalThis.__sahaTestDb = d1Drizzle(
    {
      prepare: prepared,
      async batch(statements) {
        sqlite.exec('BEGIN');
        try {
          const results = [];
          for (const statement of statements) results.push(await statement.run());
          sqlite.exec('COMMIT');
          return results;
        } catch (error) {
          sqlite.exec('ROLLBACK');
          throw error;
        }
      },
    },
    { schema },
  );
  response = await enrol('admin-a', { studentId: 'student-a', classId: 'class-other' });
  check(response.status, 201, 'Production D1 driver conditional enrolment insert succeeds');
  check(
    (await response.json()).studentId,
    'student-a',
    'D1 enrolment returning maps selected columns correctly',
  );
  check(
    (await enrol('admin-a', { studentId: 'student-a', classId: 'class-other' })).status,
    409,
    'Production D1 enrolment repeat conflicts safely',
  );
  check(
    (await link('admin-a', 'guardian-profile-a', 'student-other')).status,
    200,
    'Production D1 conditional guardian link succeeds',
  );
  check(
    (await link('admin-a', 'guardian-profile-a', 'student-other')).status,
    200,
    'Production D1 guardian retry remains idempotent',
  );
  response = await mark('teacher-a', { ...attendanceInput, date: '2026-10-06' });
  check(response.status, 200, 'Production D1 JSON attendance insert/upsert succeeds');
  check((await response.json()).length, 2, 'Production D1 attendance returns every saved row');
  response = await routes.assessments.POST(
    request('teacher-a', 'POST', {
      classId: 'class-a',
      title: 'Synthetic D1 assessment',
      kind: 'quiz',
      maxScore: 20,
      date: '2026-10-06',
    }),
  );
  check(response.status, 201, 'Production D1 conditional assessment create succeeds');
  const d1Assessment = await response.json();
  response = await record(
    'teacher-a',
    [
      { studentId: 'student-a', score: 10 },
      { studentId: 'student-other', score: 11 },
    ],
    d1Assessment.id,
  );
  check(response.status, 200, 'Production D1 two-statement result batch succeeds');
  check(
    sqlite.prepare('SELECT count(*) n FROM assessment_results WHERE assessment_id=?').get(d1Assessment.id).n,
    2,
    'D1 batch stores exactly one result for each pair',
  );
  response = await record('teacher-a', [{ studentId: 'student-a', score: 12 }], d1Assessment.id);
  check(response.status, 200, 'Production D1 exact result replacement succeeds');
  check(
    sqlite
      .prepare('SELECT score FROM assessment_results WHERE assessment_id=? AND student_id=?')
      .get(d1Assessment.id, 'student-other').score,
    11,
    'D1 replacement preserves other student result',
  );
  const d1FailureAssessment = await assessments.createAssessment(teacher, {
    classId: 'class-a',
    title: 'Synthetic D1 rollback',
    kind: 'quiz',
    maxScore: 20,
    date: '2026-10-06',
  });
  sqlite.exec(
    "CREATE TRIGGER academic_d1_result_failure BEFORE UPDATE ON assessment_results WHEN NEW.student_id='student-other' BEGIN SELECT RAISE(ABORT,'synthetic D1 failure'); END;",
  );
  check(
    (
      await record(
        'teacher-a',
        [
          { studentId: 'student-a', score: 13 },
          { studentId: 'student-other', score: 13 },
        ],
        d1FailureAssessment.id,
      )
    ).status,
    500,
    'D1 returning-batch failure produces safe error',
  );
  check(
    sqlite
      .prepare('SELECT count(*) n FROM assessment_results WHERE assessment_id=?')
      .get(d1FailureAssessment.id).n,
    0,
    'D1 result update failure rolls back earlier new inserts in full batch',
  );
  sqlite.exec('DROP TRIGGER academic_d1_result_failure');
  check(networkCalls, 0, 'All academic verification stays local with no providers or recipients');
  console.log(
    `Academic integrity contract: ${checks} checks passed (real sessions/routes, atomic SQLite and production D1 driver, SQL-time authority races and legacy-preserving migration; synthetic only).`,
  );
  console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0 }));
} finally {
  globalThis.__sahaTestDb = originalDb;
  globalThis.fetch = originalFetch;
  sqlite.close();
}
