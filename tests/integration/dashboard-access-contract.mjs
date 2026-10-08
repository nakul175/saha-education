// Independent live-authority dashboard contracts over real SQLite, migrations,
// Drizzle SQL and synthetic sessions. No unsafe diagnostic outcome is a pass.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { freshDatabase, seedSecurityData, load, stamp, root } from '../support/security-db.mjs';

const dashboards = await load('lib/education/dashboard.ts');
const sessions = await load('lib/education/session.ts');
const auth = await load('lib/education/auth.ts');
const profileLinks = await load('lib/education/profile-links.ts');
const origin = 'https://education.example.invalid';
const identities = [
  ['admin-a', 'admin'],
  ['teacher-a', 'teacher'],
  ['guardian-a', 'guardian'],
  ['student-user-a', 'student'],
];
let checks = 0,
  scenarios = 0,
  networkCalls = 0;
const check = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  checks++;
};
const keys = (value, expected, message) => check(Object.keys(value).sort(), [...expected].sort(), message);
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  networkCalls++;
  throw new Error('Dashboard access contracts must remain offline.');
};

function listContract(value, limit) {
  keys(value, ['items', 'total', 'limit', 'truncated'], 'Bounded list has explicit inventory metadata');
  check(value.limit, limit, 'List documents its actual cap');
  check(typeof value.total, 'number', 'Exact scoped total is numeric');
  check(value.truncated, value.total > limit, 'Truncation follows the exact total');
  check(
    value.items.length,
    Math.min(limit, value.total),
    'Displayed list length matches the scoped total and cap',
  );
}
function shape(value, role) {
  check(value.role, role, 'Snapshot retains the resolved role');
  check(value.schoolId, 'a', 'Snapshot retains the resolved school');
  check(Number.isFinite(Date.parse(value.asOf)), true, 'Snapshot has a real database timestamp');
  if (role === 'admin') {
    keys(
      value,
      ['role', 'schoolId', 'asOf', 'school', 'counts'],
      'Administrator response is a compact summary',
    );
    keys(value.school, ['id', 'name'], 'School summary omits private or operational fields');
    keys(
      value.counts,
      ['students', 'courses', 'classes', 'enabledMappedTeachers'],
      'Administrator counts have explicit meanings',
    );
  } else if (role === 'teacher') {
    keys(
      value,
      ['role', 'schoolId', 'asOf', 'classes', 'assessments'],
      'Teacher response contains assigned academic summaries',
    );
    listContract(value.classes, 100);
    listContract(value.assessments, 100);
    for (const row of value.classes.items)
      keys(
        row,
        ['id', 'name', 'courseId', 'courseTitle', 'term', 'activeStudents'],
        'Class summary never includes user mappings or a roster',
      );
    for (const row of value.assessments.items) {
      keys(
        row,
        ['id', 'classId', 'title', 'kind', 'date', 'maxScore', 'coverage'],
        'Assessment summary does not release learner result details',
      );
      keys(
        row.coverage,
        [
          'state',
          'activeStudents',
          'recordedStudents',
          'missingStudents',
          'ambiguousEnrolmentStudents',
          'ambiguousResultStudents',
          'invalidResultStudents',
          'invalidMaximum',
        ],
        'Coverage distinguishes missing, ambiguous and invalid evidence',
      );
    }
  } else {
    keys(
      value,
      ['role', 'schoolId', 'asOf', 'profiles'],
      'Family response contains only explicitly linked profile summaries',
    );
    listContract(value.profiles, 50);
    for (const row of value.profiles.items) {
      keys(
        row,
        ['id', 'firstName', 'lastName', 'admissionNumber', 'attendance', 'reports'],
        'Profile summary omits login, contacts and birth date',
      );
      keys(
        row.attendance,
        ['recordedRows', 'counts', 'firstDate', 'lastDate', 'invalidDateRows'],
        'Attendance describes recorded evidence without inventing a rate',
      );
      keys(
        row.attendance.counts,
        ['present', 'absent', 'late', 'excused', 'other'],
        'Attendance statuses retain explicit categories',
      );
      listContract(row.reports, 20);
      for (const report of row.reports.items)
        keys(
          report,
          ['id', 'term', 'overallGrade', 'publishedAt'],
          'Family report summary omits drafts and report body',
        );
    }
  }
  const serialized = JSON.stringify(value);
  for (const privateValue of [
    '@example.invalid',
    'https://identity.example.invalid',
    'sub-admin-a',
    'sub-teacher-a',
    'sub-guardian-a',
    'sub-student-user-a',
    'SECRET_RESULT_FEEDBACK',
    'SECRET_RESULT_GRADE',
    'SECRET_DRAFT_SUMMARY',
    'SECRET_DRAFT_GRADE',
  ])
    check(
      serialized.includes(privateValue),
      false,
      'Dashboard excludes synthetic private identity, draft and result markers',
    );
}

async function scenario(name, action, legacySetup) {
  const fixture = freshDatabase(legacySetup ? { beforeMigration: '0009_academic_integrity.sql' } : undefined);
  const baseDb = fixture.db;
  await seedSecurityData(baseDb, fixture.schema);
  if (legacySetup) {
    await legacySetup(fixture);
    const migrations = readdirSync(join(root, 'drizzle'))
      .filter((file) => /^\d.*\.sql$/.test(file))
      .sort();
    for (const file of migrations.slice(migrations.indexOf('0009_academic_integrity.sql')))
      fixture.sqlite.exec(
        readFileSync(join(root, 'drizzle', file), 'utf8').replaceAll('--> statement-breakpoint', ''),
      );
  }
  await baseDb.insert(fixture.schema.attendance).values(
    [
      ['visible-present', 'class-a', 'student-a', '2026-10-01', 'present'],
      ['visible-absent', 'class-a', 'student-a', '2026-10-02', 'absent'],
      ['visible-late', 'class-a', 'student-a', '2026-10-03', 'late'],
      ['unrelated-class', 'class-other', 'student-a', '2026-10-04', 'present'],
      ['foreign-class', 'class-b', 'student-a', '2026-10-05', 'present'],
      ['other-pupil', 'class-other', 'student-other', '2026-10-01', 'excused'],
    ].map(([id, classId, studentId, date, status]) => ({
      id,
      classId,
      studentId,
      date,
      status,
      note: 'PRIVATE_ATTENDANCE_NOTE',
      recordedBy: 'teacher-a',
      createdAt: stamp,
      updatedAt: stamp,
    })),
  );
  fixture.sqlite
    .prepare(
      "UPDATE report_cards SET summary='SECRET_DRAFT_SUMMARY',overall_grade='SECRET_DRAFT_GRADE' WHERE id='draft-a'",
    )
    .run();
  const cookies = {};
  for (const [id] of identities) cookies[id] = (await sessions.createSession(id)).split(';')[0];
  async function principal(actor) {
    const resolved = await auth.getPrincipal(
      new Request(origin, { headers: { cookie: cookies[actor] ?? '' } }),
    );
    assert.ok(resolved, name + ': a real synthetic session resolves before the tested statement');
    return resolved;
  }
  // Wrap each actual awaited SELECT, after statement construction. A nested
  // reviewed link operation uses the unwrapped database, then the snapshot
  // resumes. One query assertion covers the current exported SELECT path.
  async function read(actor, beforeSelect) {
    const resolved = typeof actor === 'string' ? await principal(actor) : actor;
    const executed = [];
    let injected = false;
    const chain = new Set([
      'where',
      'limit',
      'orderBy',
      'offset',
      'leftJoin',
      'innerJoin',
      'groupBy',
      'having',
    ]);
    let observedDb;
    function statement(query) {
      return new Proxy(query, {
        get(target, member) {
          if (member === 'then')
            return (fulfilled, rejected) =>
              (async () => {
                if (beforeSelect && !injected) {
                  injected = true;
                  globalThis.__sahaTestDb = baseDb;
                  try {
                    await beforeSelect();
                  } finally {
                    globalThis.__sahaTestDb = observedDb;
                  }
                }
                executed.push(target.toSQL().sql);
                return await target;
              })().then(fulfilled, rejected);
          const value = Reflect.get(target, member, target);
          if (typeof value !== 'function') return value;
          return (...args) => {
            const result = value.apply(target, args);
            return chain.has(member) && result && typeof result === 'object' ? statement(result) : result;
          };
        },
      });
    }
    observedDb = new Proxy(baseDb, {
      get(target, member) {
        if (member === 'select' || member === 'selectDistinct')
          return (...args) => {
            const builder = target[member](...args);
            return new Proxy(builder, {
              get(query, property) {
                if (property === 'from') return (table) => statement(query.from(table));
                const value = Reflect.get(query, property, query);
                return typeof value === 'function' ? value.bind(query) : value;
              },
            });
          };
        const value = Reflect.get(target, member, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    globalThis.__sahaTestDb = observedDb;
    let result;
    try {
      result = await dashboards.getRoleDashboard(resolved);
    } finally {
      globalThis.__sahaTestDb = baseDb;
    }
    check(executed.length, 1, name + ': exactly one real SELECT supplies the complete role snapshot');
    check(/^select\b/i.test(executed[0]), true, name + ': dashboard statement is read only');
    if (beforeSelect) check(injected, true, name + ': late mutation reached the actual SQL boundary');
    return result;
  }
  const unlink = (type) =>
    profileLinks.reviewProfileLink(
      { id: 'admin-a', role: 'admin', schoolId: 'a' },
      {
        profileType: type,
        profileId: type === 'guardian' ? 'guardian-profile-a' : 'student-a',
        userId: null,
        expectedVersion: 0,
        clientRequestId: crypto.randomUUID(),
        reviewConfirmed: true,
        reason: 'Synthetic concurrent reviewed dashboard ownership unlink.',
      },
    );
  try {
    await action({ ...fixture, principal, read, unlink, cookies });
    scenarios++;
  } finally {
    globalThis.__sahaTestDb = baseDb;
    fixture.sqlite.close();
  }
}

try {
  await scenario('Four role baseline scopes and projections', async ({ read }) => {
    for (const [actor, role] of identities) {
      const result = await read(actor);
      shape(result, role);
      if (role === 'admin')
        check(
          result.counts,
          { students: 2, courses: 1, classes: 2, enabledMappedTeachers: 2 },
          'Administrator totals exclude the foreign school',
        );
      else if (role === 'teacher') {
        check(
          result.classes.items.map((row) => row.id),
          ['class-a'],
          'Teacher sees only its current assigned class',
        );
        check(
          result.assessments.items.map((row) => row.id),
          ['assessment-a'],
          'Teacher sees only its assigned class assessment',
        );
        check(
          result.assessments.items[0].coverage,
          {
            state: 'missing-results',
            activeStudents: 1,
            recordedStudents: 0,
            missingStudents: 1,
            ambiguousEnrolmentStudents: 0,
            ambiguousResultStudents: 0,
            invalidResultStudents: 0,
            invalidMaximum: false,
          },
          'Current unrecorded pupil is accurately missing',
        );
      } else {
        check(
          result.profiles.items.map((row) => row.id),
          ['student-a'],
          'Family sees only its explicit current pupil',
        );
        const profile = result.profiles.items[0];
        check(
          profile.reports.items.map((row) => row.id),
          ['published-a'],
          'Family report summary excludes drafts and foreign reports',
        );
        check(
          profile.attendance,
          {
            recordedRows: 3,
            counts: { present: 1, absent: 1, late: 1, excused: 0, other: 0 },
            firstDate: '2026-10-01',
            lastDate: '2026-10-03',
            invalidDateRows: 0,
          },
          'Attendance excludes former/unrelated and foreign classes',
        );
      }
    }
  });

  for (const [actor, role] of identities)
    for (const [label, sql] of [
      ['disabled', "UPDATE users SET disabled_at='synthetic-revocation' WHERE id=?"],
      ['role changed', 'UPDATE users SET role=? WHERE id=?'],
      ['school changed', "UPDATE users SET school_id='b' WHERE id=?"],
      ['issuer removed', 'UPDATE users SET identity_issuer=NULL WHERE id=?'],
      ['subject blanked', "UPDATE users SET identity_subject='' WHERE id=?"],
    ])
      await scenario(role + ' late actor ' + label, async ({ sqlite, read }) => {
        const result = await read(actor, () =>
          label === 'role changed'
            ? sqlite.prepare(sql).run(role === 'student' ? 'teacher' : 'student', actor)
            : sqlite.prepare(sql).run(actor),
        );
        check(result, null, 'Lost current authority returns no summary rather than misleading zero totals');
      });

  for (const [actor, type] of [
    ['guardian-a', 'guardian'],
    ['student-user-a', 'student'],
  ])
    await scenario('Reviewed late ' + type + ' unlink', async ({ read, unlink, cookies }) => {
      const result = await read(actor, () => unlink(type));
      check(
        result,
        null,
        'Reviewed unlink revokes the exact resolved session before the snapshot and releases no private summary',
      );
      check(
        await auth.getPrincipal(new Request(origin, { headers: { cookie: cookies[actor] } })),
        null,
        'Reviewed ownership change also revokes that actual session',
      );
      cookies[actor] = (await sessions.createSession(actor)).split(';')[0];
      const current = await read(actor);
      check(current.role, type, 'A fresh same-account session resolves the original family role');
      check(
        current.profiles,
        { items: [], total: 0, limit: 50, truncated: false },
        'Fresh authorized session preserves the current empty-profile behavior after reviewed unlink',
      );
    });

  for (const [label, sql] of [
    [
      'guardian relationship removed',
      "DELETE FROM student_guardians WHERE student_id='student-a' AND guardian_id='guardian-profile-a'",
    ],
    ['guardian mapping removed', "UPDATE guardians SET user_id=NULL WHERE id='guardian-profile-a'"],
    ['guardian profile transferred', "UPDATE guardians SET school_id='b' WHERE id='guardian-profile-a'"],
    ['pupil transferred', "UPDATE students SET school_id='b' WHERE id='student-a'"],
  ])
    await scenario('Guardian late ' + label, async ({ sqlite, read }) => {
      const result = await read('guardian-a', () => sqlite.exec(sql));
      check(result.profiles.items, [], 'Old guardian relationship cannot release any pupil summary');
      check(result.profiles.total, 0, 'Old guardian relationship cannot leak pupil count');
    });
  for (const [label, sql] of [
    ['pupil login removed', "UPDATE students SET user_id=NULL WHERE id='student-a'"],
    ['pupil transferred', "UPDATE students SET school_id='b' WHERE id='student-a'"],
  ])
    await scenario('Learner late ' + label, async ({ sqlite, read }) => {
      const result = await read('student-user-a', () => sqlite.exec(sql));
      check(result.profiles.items, [], 'Learner cannot retain an old profile');
      check(result.profiles.total, 0, 'Learner cannot retain an old profile count');
    });

  await scenario('Current guardian relationship replacement is coherent', async ({ sqlite, read }) => {
    const result = await read('guardian-a', () =>
      sqlite.exec(
        "DELETE FROM student_guardians WHERE guardian_id='guardian-profile-a'; INSERT INTO student_guardians(student_id,guardian_id,is_primary) VALUES('student-other','guardian-profile-a',0);",
      ),
    );
    check(
      result.profiles.items.map((row) => row.id),
      ['student-other'],
      'Snapshot shows only the current relationship',
    );
    check(
      result.profiles.items[0].attendance.counts,
      { present: 0, absent: 0, late: 0, excused: 1, other: 0 },
      'Attendance belongs to the same current pupil snapshot',
    );
    check(
      result.profiles.items[0].reports.items,
      [],
      'No earlier pupil report survives the current relationship snapshot',
    );
  });

  for (const [label, sql] of [
    ['class reassigned', "UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'"],
    ['class transferred', "UPDATE classes SET school_id='b' WHERE id='class-a'"],
  ])
    await scenario('Teacher late ' + label, async ({ sqlite, read }) => {
      const result = await read('teacher-a', () => sqlite.exec(sql));
      check(
        result.classes,
        { items: [], total: 0, limit: 100, truncated: false },
        'Former class is absent from both list and exact total',
      );
      check(
        result.assessments,
        { items: [], total: 0, limit: 100, truncated: false },
        'Former class assessment is absent from the same snapshot',
      );
    });
  for (const [label, sql] of [
    ['pupil withdrawn', "UPDATE enrolments SET status='withdrawn' WHERE id='student-a-enrolment'"],
    ['pupil transferred', "UPDATE students SET school_id='b' WHERE id='student-a'"],
  ])
    await scenario('Teacher late ' + label, async ({ sqlite, read }) => {
      const result = await read('teacher-a', () => sqlite.exec(sql));
      check(result.classes.items[0].activeStudents, 0, 'Class roster excludes the former pupil');
      check(
        result.assessments.items[0].coverage.state,
        'no-current-roster',
        'Empty current roster is explicit rather than complete or missing',
      );
      check(
        result.assessments.items[0].coverage.activeStudents,
        0,
        'Assessment roster agrees with the class snapshot',
      );
      check(
        result.assessments.items[0].coverage.missingStudents,
        0,
        'No missing learner is invented for an empty roster',
      );
    });
  await scenario('Teacher foreign course details omitted', async ({ sqlite, read }) => {
    const result = await read('teacher-a', () =>
      sqlite
        .prepare("UPDATE courses SET school_id='b',title='PRIVATE_FOREIGN_COURSE' WHERE id='course-a'")
        .run(),
    );
    check(
      result.classes.items[0].courseTitle,
      null,
      'Foreign course title does not leak through an existing class reference',
    );
    check(
      JSON.stringify(result).includes('PRIVATE_FOREIGN_COURSE'),
      false,
      'Foreign course marker is absent',
    );
  });

  for (const actor of ['guardian-a', 'student-user-a'])
    for (const [label, sql] of [
      [
        'active enrolment withdrawn',
        "UPDATE enrolments SET status='withdrawn' WHERE id='student-a-enrolment'",
      ],
      ['class transferred', "UPDATE classes SET school_id='b' WHERE id='class-a'"],
    ])
      await scenario(actor + ' current attendance ' + label, async ({ sqlite, read }) => {
        const result = await read(actor, () => sqlite.exec(sql));
        check(
          result.profiles.items[0].attendance.recordedRows,
          0,
          'Attendance retains current accessible class scope',
        );
        check(result.profiles.items[0].attendance.firstDate, null, 'No stale class date range survives');
        check(
          result.profiles.items[0].reports.items.map((row) => row.id),
          ['published-a'],
          'Explicit linked published reports retain their separate access boundary',
        );
      });
  for (const actor of ['guardian-a', 'student-user-a'])
    await scenario(actor + ' late report references and publication', async ({ sqlite, read }) => {
      const result = await read(actor, () =>
        sqlite.exec(
          "UPDATE report_cards SET student_id='student-b' WHERE id='published-a'; UPDATE report_cards SET published_at='2026-10-06T00:00:00.000Z',overall_grade='Supplied final' WHERE id='draft-a';",
        ),
      );
      check(
        result.profiles.items[0].reports.items.map((row) => row.id),
        ['draft-a'],
        'Report list uses current profile ownership and current publication in one statement',
      );
      check(
        result.profiles.items[0].reports.items[0].overallGrade,
        'Supplied final',
        'New published summary is current, without returning its private body',
      );
    });

  await scenario('Administrator totals share one current snapshot', async ({ sqlite, read }) => {
    const result = await read('admin-a', () =>
      sqlite.exec(
        "UPDATE students SET school_id='b' WHERE id='student-other'; UPDATE courses SET school_id='b' WHERE id='course-a'; UPDATE classes SET school_id='b' WHERE id='class-other'; UPDATE users SET disabled_at='synthetic-revocation' WHERE id='teacher-other'; UPDATE schools SET name='Current synthetic school' WHERE id='a';",
      ),
    );
    check(
      result.counts,
      { students: 1, courses: 0, classes: 1, enabledMappedTeachers: 1 },
      'All totals use the same post-change school snapshot',
    );
    check(result.school.name, 'Current synthetic school', 'School heading belongs to that same snapshot');
  });
  await scenario(
    'Teacher totals and coverage share the current replacement class',
    async ({ sqlite, read }) => {
      const result = await read('teacher-a', () =>
        sqlite.exec(
          "UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'; UPDATE classes SET teacher_id='teacher-a' WHERE id='class-other'; UPDATE assessments SET class_id='class-other' WHERE id='assessment-a';",
        ),
      );
      check(
        result.classes.items.map((row) => row.id),
        ['class-other'],
        'Latest assigned class replaces the former class',
      );
      check(
        result.assessments.items[0].classId,
        'class-other',
        'Assessment belongs to that same replacement class',
      );
      check(
        result.assessments.items[0].coverage.activeStudents,
        1,
        'Coverage uses the replacement class roster',
      );
    },
  );

  await scenario('Mapped teacher total excludes unusable accounts', async ({ sqlite, read }) => {
    sqlite.exec("UPDATE users SET identity_subject='' WHERE id='teacher-other';");
    const result = await read('admin-a');
    check(
      result.counts.enabledMappedTeachers,
      1,
      'Enabled unmapped teacher is excluded from the eligible teacher total',
    );
    check(result.counts.students, 2, 'Profile totals are not accidentally reduced to linked login totals');
  });
  await scenario('Real zero totals differ from denied authority', async ({ sqlite, read }) => {
    sqlite.exec(
      "UPDATE students SET school_id='b' WHERE school_id='a'; UPDATE classes SET school_id='b' WHERE school_id='a'; UPDATE courses SET school_id='b' WHERE school_id='a'; UPDATE users SET disabled_at='synthetic-revocation' WHERE role='teacher' AND school_id='a';",
    );
    const result = await read('admin-a');
    check(result !== null, true, 'An authorized empty school still has a dashboard');
    check(
      result.counts,
      { students: 0, courses: 0, classes: 0, enabledMappedTeachers: 0 },
      'Genuine zero totals are returned truthfully',
    );
  });

  for (const [label, score, maximum, state, recorded, invalid] of [
    ['zero', 0, 20, 'recorded-for-current-roster', 1, 0],
    ['at maximum', 20, 20, 'recorded-for-current-roster', 1, 0],
    ['zero maximum', 0, 0, 'recorded-for-current-roster', 1, 0],
    ['above maximum', 21, 20, 'needs-review', 0, 1],
    ['negative', -1, 20, 'needs-review', 0, 1],
    ['fractional', 0.5, 20, 'needs-review', 0, 1],
  ])
    await scenario('Current score control ' + label, async ({ db, schema, sqlite, read }) => {
      await db.insert(schema.assessmentResults).values({
        id: 'synthetic-result',
        assessmentId: 'assessment-a',
        studentId: 'student-a',
        score,
        grade: 'SECRET_RESULT_GRADE',
        feedback: 'SECRET_RESULT_FEEDBACK',
        createdAt: stamp,
        updatedAt: stamp,
      });
      const result = await read('teacher-a', () =>
        sqlite.prepare("UPDATE assessments SET max_score=? WHERE id='assessment-a'").run(maximum),
      );
      const coverage = result.assessments.items[0].coverage;
      check(
        coverage.state,
        state,
        'Completeness distinguishes a legitimate recorded score from invalid evidence',
      );
      check(coverage.recordedStudents, recorded, 'Only one valid current result counts as recorded');
      check(coverage.invalidResultStudents, invalid, 'Invalid score evidence is explicit');
      check(coverage.missingStudents, 0, 'An invalid existing row is not mislabeled as missing');
      check(
        JSON.stringify(result).includes('SECRET_RESULT_'),
        false,
        'Coverage never releases grade or feedback',
      );
    });
  for (const maximum of [-1, 1.5])
    await scenario('Invalid current maximum ' + maximum, async ({ sqlite, read }) => {
      const result = await read('teacher-a', () =>
        sqlite.prepare("UPDATE assessments SET max_score=? WHERE id='assessment-a'").run(maximum),
      );
      check(
        result.assessments.items[0].coverage.state,
        'needs-review',
        'Invalid assessment maximum needs explicit review',
      );
      check(
        result.assessments.items[0].coverage.invalidMaximum,
        true,
        'Invalid maximum flag preserves the data defect',
      );
    });

  await scenario(
    'Legacy ambiguous enrolment and result evidence remains',
    async ({ sqlite, read }) => {
      const result = await read('teacher-a');
      const coverage = result.assessments.items[0].coverage;
      check(
        result.classes.items[0].activeStudents,
        1,
        'Legacy duplicate enrolment does not double-count a pupil',
      );
      check(coverage.activeStudents, 1, 'Assessment roster also counts the pupil once');
      check(coverage.state, 'needs-review', 'Ambiguous existing evidence cannot promise completion');
      check(coverage.ambiguousEnrolmentStudents, 1, 'Active plus withdrawn legacy pair remains ambiguous');
      check(coverage.ambiguousResultStudents, 1, 'Two legacy result rows remain ambiguous');
      check(
        coverage.recordedStudents,
        0,
        'An ambiguous result pair does not count as a unique recorded result',
      );
      check(
        sqlite
          .prepare("SELECT count(*) AS n FROM enrolments WHERE student_id='student-a' AND class_id='class-a'")
          .get().n,
        2,
        'Dashboard does not repair or delete legacy enrolment evidence',
      );
      check(
        sqlite
          .prepare(
            "SELECT count(*) AS n FROM assessment_results WHERE assessment_id='assessment-a' AND student_id='student-a'",
          )
          .get().n,
        2,
        'Dashboard does not repair or delete legacy result evidence',
      );
      assert.throws(
        () =>
          sqlite
            .prepare('INSERT INTO enrolments VALUES(?,?,?,?,?,?,?)')
            .run('blocked-new-pair', 'student-a', 'class-a', 'active', stamp, stamp, stamp),
        /saha_enrolment_pair_conflict/,
      );
      checks++;
      assert.throws(
        () =>
          sqlite
            .prepare('INSERT INTO assessment_results VALUES(?,?,?,?,?,?,?,?)')
            .run('blocked-new-result', 'assessment-a', 'student-a', 1, null, null, stamp, stamp),
        /saha_result_pair_conflict/,
      );
      checks++;
    },
    async ({ db, schema }) => {
      await db.insert(schema.enrolments).values({
        id: 'legacy-withdrawn-pair',
        studentId: 'student-a',
        classId: 'class-a',
        status: 'withdrawn',
        enrolledAt: stamp,
        createdAt: stamp,
        updatedAt: stamp,
      });
      await db.insert(schema.assessmentResults).values(
        [1, 2].map((score) => ({
          id: 'legacy-result-' + score,
          assessmentId: 'assessment-a',
          studentId: 'student-a',
          score,
          createdAt: stamp,
          updatedAt: stamp,
        })),
      );
    },
  );

  await scenario('Teacher exact totals exceed bounded displayed lists', async ({ db, schema, read }) => {
    await db.insert(schema.classes).values(
      Array.from({ length: 102 }, (_, index) => ({
        id: 'bounded-class-' + index,
        schoolId: 'a',
        courseId: 'course-a',
        teacherId: 'teacher-a',
        name: 'Bounded ' + String(index).padStart(3, '0'),
        term: 'T1',
        createdAt: stamp,
        updatedAt: stamp,
      })),
    );
    await db.insert(schema.assessments).values(
      Array.from({ length: 104 }, (_, index) => ({
        id: 'bounded-assessment-' + index,
        classId: 'class-a',
        title: 'Bounded ' + index,
        kind: 'quiz',
        maxScore: 10,
        date: '2026-10-05',
        createdAt: stamp,
        updatedAt: stamp,
      })),
    );
    const result = await read('teacher-a');
    check(result.classes.total, 103, 'Assigned class total is exact before the display cap');
    check(result.classes.items.length, 100, 'Displayed classes obey the cap');
    check(result.classes.truncated, true, 'Class truncation is explicit');
    check(result.assessments.total, 105, 'Assigned assessment total is exact before the display cap');
    check(result.assessments.items.length, 100, 'Displayed assessments obey the cap');
    check(result.assessments.truncated, true, 'Assessment truncation is explicit');
    const repeated = await read('teacher-a');
    check(
      repeated.classes.items.map((row) => row.id),
      result.classes.items.map((row) => row.id),
      'Bounded class ordering is deterministic',
    );
    check(
      repeated.assessments.items.map((row) => row.id),
      result.assessments.items.map((row) => row.id),
      'Bounded assessment ordering is deterministic',
    );
  });
  await scenario('Family exact report total excludes drafts before cap', async ({ db, schema, read }) => {
    await db.insert(schema.reportCards).values(
      Array.from({ length: 22 }, (_, index) => ({
        id: 'bounded-published-' + index,
        studentId: 'student-a',
        term: 'Published ' + index,
        overallGrade: 'School supplied',
        publishedAt: stamp,
        createdAt: stamp,
        updatedAt: stamp,
      })),
    );
    await db.insert(schema.reportCards).values(
      Array.from({ length: 23 }, (_, index) => ({
        id: 'bounded-draft-' + index,
        studentId: 'student-a',
        term: 'SECRET_DRAFT_' + index,
        overallGrade: 'SECRET_DRAFT_GRADE',
        createdAt: stamp,
        updatedAt: stamp,
      })),
    );
    const result = await read('guardian-a');
    const reports = result.profiles.items[0].reports;
    check(reports.total, 23, 'Published total excludes every unpublished draft');
    check(reports.items.length, 20, 'Published summaries obey their cap');
    check(reports.truncated, true, 'Published summary truncation is explicit');
    check(
      JSON.stringify(result).includes('SECRET_DRAFT_'),
      false,
      'Unpublished draft markers remain private at the cap',
    );
  });

  check(networkCalls, 0, 'Dashboard service never contacts an external provider');
  console.log(
    JSON.stringify({
      suite: 'dashboard-access-contract',
      passed: checks,
      failed: 0,
      skipped: 0,
      scenarios,
      networkCalls,
      limits: [
        'Real SQLite/Drizzle and synthetic session service; no browser render or Cloudflare deployment.',
        'Public principal omits session evidence; actual snapshot also rejects the exact session revoked by a reviewed ownership change and a fresh same-account session sees only current profiles.',
        'Legacy duplicates are inserted before migration0009; all final guards remain enabled during assertions.',
      ],
    }),
  );
} finally {
  globalThis.fetch = originalFetch;
}
