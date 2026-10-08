// Actual sessions/routes/SQLite plus production D1 mapping. Legacy APIs stay callable.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { freshDatabase, seedSecurityData, load, bindings, stamp, root } from '../support/security-db.mjs';
const origin = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = origin;
const session = await load('lib/education/session.ts');
const { assessmentReviews } = await load('db/assessment-reviews-schema.ts');
const route = await load('app/api/assessments/[id]/result-editor/route.ts');
const historyRoute = await load('app/api/assessments/[id]/result-editor/history/route.ts');
const legacy = await load('app/api/assessments/[id]/results/route.ts');
const parameters = (id) => ({ params: Promise.resolve({ id }) });
let passed = 0,
  scenarios = 0,
  networkCalls = 0;
const check = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  passed++;
};
function status(response, expected, message) {
  check(response.status, expected, message);
  check(response.headers.get('cache-control'), 'no-store', message + ': no-store');
}
function input(
  snapshot,
  entries = [{ studentId: 'student-a', score: 0, grade: null, feedback: null, expectedRecord: null }],
) {
  return {
    clientRequestId: crypto.randomUUID(),
    reviewConfirmed: true,
    reason: 'Synthetic explicit assessment result review.',
    expectedAssessment: snapshot.assessment,
    entries,
  };
}
const oldFetch = globalThis.fetch;
globalThis.fetch = async () => {
  networkCalls++;
  throw new Error('Reviewed-result contracts are offline only.');
};
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
  const cookies = {};
  for (const actor of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'guardian-a', 'student-user-a'])
    cookies[actor] = (await session.createSession(actor)).split(';')[0];
  const request = (
    actor,
    method = 'GET',
    data,
    path = '/api/assessments/assessment-a/result-editor',
    selectedOrigin = origin,
  ) =>
    new Request(origin + path, {
      method,
      headers: {
        ...(cookies[actor] ? { cookie: cookies[actor] } : {}),
        origin: selectedOrigin,
        ...(data === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(data === undefined ? {} : { body: typeof data === 'string' ? data : JSON.stringify(data) }),
    });
  const snapshot = async (actor = 'teacher-a', id = 'assessment-a') => {
    const response = await route.GET(request(actor), parameters(id));
    status(response, 200, 'Authorized single snapshot');
    return response.json();
  };
  const save = (data, actor = 'teacher-a', id = 'assessment-a') =>
    route.POST(request(actor, 'POST', data), parameters(id));
  const history = (
    actor = 'teacher-a',
    path = '/api/assessments/assessment-a/result-editor/history',
    id = 'assessment-a',
  ) => historyRoute.GET(request(actor, 'GET', undefined, path), parameters(id));
  const count = (table) => fixture.sqlite.prepare(`SELECT count(*) n FROM ${table}`).get().n;
  function beforeExecution(operation, table, mutation, ordinal = 1) {
    let seen = 0,
      injected = false;
    const chain = new Set(['select', 'where', 'limit', 'returning', 'onConflictDoNothing']);
    function wrap(query) {
      return new Proxy(query, {
        get(target, member) {
          if (member === 'then')
            return (fulfilled, rejected) =>
              (async () => {
                if (!injected && ++seen === ordinal) {
                  injected = true;
                  globalThis.__sahaTestDb = baseDb;
                  await mutation();
                }
                return await target;
              })().then(fulfilled, rejected);
          const value = Reflect.get(target, member, target);
          if (typeof value !== 'function') return value;
          return (...args) => {
            const result = value.apply(target, args);
            return chain.has(member) && result && typeof result === 'object' ? wrap(result) : result;
          };
        },
      });
    }
    globalThis.__sahaTestDb = new Proxy(baseDb, {
      get(target, member) {
        if (operation === 'read' && member === 'select')
          return (...args) => {
            const builder = target.select(...args);
            return new Proxy(builder, {
              get(query, property) {
                if (property === 'from')
                  return (selected) =>
                    selected === table ? wrap(query.from(selected)) : query.from(selected);
                const value = Reflect.get(query, property, query);
                return typeof value === 'function' ? value.bind(query) : value;
              },
            });
          };
        if (member === operation)
          return (...args) => (args[0] === table ? wrap(target[member](...args)) : target[member](...args));
        const value = Reflect.get(target, member, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    return () => {
      globalThis.__sahaTestDb = baseDb;
      check(injected, true, name + ': injected at actual SQL execution');
    };
  }
  try {
    await action({ ...fixture, request, snapshot, save, history, count, beforeExecution });
    scenarios++;
  } finally {
    globalThis.__sahaTestDb = baseDb;
    fixture.sqlite.close();
  }
}
try {
  await scenario(
    'Snapshot zero review exact retry and private projection',
    async ({ snapshot, save, history, count, sqlite }) => {
      const current = await snapshot();
      check(current.class, { id: 'class-a', name: 'class-a' }, 'Class metadata from current scope');
      check(current.assessment.maxScoreType, 'integer', 'Maximum storage type disclosed');
      check(current.invalidMaximum, false, 'Normal maximum valid');
      check(current.invalidDate, false, 'Normal raw date valid');
      check(current.roster.total, 1, 'Distinct active pupil total');
      check(current.roster.items[0].record, null, 'Unrecorded score remains null');
      check(current.canReview, true, 'Unambiguous valid snapshot can be reviewed');
      check(
        Object.keys(current.roster.items[0].student).sort(),
        ['admissionNumber', 'firstName', 'id', 'lastName'],
        'No profile contacts or login mapping',
      );
      let response = await history();
      status(response, 200, 'Empty history');
      check(
        await response.json(),
        { items: [], total: 0, limit: 100, truncated: false },
        'No backfilled evidence',
      );
      const data = input(current);
      response = await save(data);
      status(response, 201, 'First explicit zero review');
      const outcome = await response.json();
      check(outcome.replayed, false, 'New outcome distinct from retry');
      check(outcome.review.id, data.clientRequestId, 'UUID durable identity');
      check(outcome.review.reviewedBy, 'teacher-a', 'Authenticated reviewer attribution');
      check(outcome.review.assessment, current.assessment, 'Original metadata retained with review');
      check(outcome.review.changes[0].beforeRecord, null, 'No invented original result');
      check(outcome.review.changes[0].afterRecord.score, 0, 'Zero saved exactly');
      check(outcome.review.changes[0].afterRecord.grade, null, 'No grade calculation');
      response = await save(data);
      status(response, 200, 'Exact committed UUID retry');
      check(await response.json(), { review: outcome.review, replayed: true }, 'Original outcome unchanged');
      for (const table of ['assessment_results', 'assessment_reviews', 'assessment_review_entries'])
        check(count(table), 1, 'Exactly one row in ' + table);
      check(sqlite.prepare('PRAGMA foreign_key_check').all(), [], 'References remain valid');
      check(JSON.stringify(outcome).includes('requestHash'), false, 'Fingerprint not exposed');
      check(JSON.stringify(outcome).includes('entriesJson'), false, 'Pending payload not exposed');
    },
  );
  await scenario('Auth staff origin before malformed and oversized body', async ({ request, count }) => {
    for (const actor of [null, 'guardian-a', 'student-user-a']) {
      status(
        await route.GET(request(actor), parameters('assessment-a')),
        actor ? 403 : 401,
        'Editor staff boundary',
      );
      status(
        await historyRoute.GET(request(actor), parameters('assessment-a')),
        actor ? 403 : 401,
        'History staff boundary',
      );
      status(
        await route.POST(request(actor, 'POST', '{'), parameters('assessment-a')),
        actor ? 403 : 401,
        'Mutation before JSON parsing',
      );
    }
    status(
      await route.POST(
        request('teacher-a', 'POST', '{', '/api/editor', 'https://foreign.example.invalid'),
        parameters('assessment-a'),
      ),
      403,
      'Origin before JSON',
    );
    status(
      await route.POST(request('teacher-a', 'POST', '{'), parameters('assessment-a')),
      400,
      'Authorized bad JSON',
    );
    status(
      await route.POST(request('teacher-a', 'POST', ' '.repeat(128 * 1024 + 1)), parameters('assessment-a')),
      400,
      'Bounded streamed body',
    );
    check(count('assessment_reviews'), 0, 'No rejected request receipt');
  });
  await scenario(
    'Strict validation integer zero maximum and Unicode parity',
    async ({ snapshot, save, sqlite, count }) => {
      const current = await snapshot(),
        data = input(current);
      for (const bad of [
        { ...data, schoolId: 'b' },
        { ...data, reviewedBy: 'admin-a' },
        { ...data, reviewConfirmed: false },
        { ...data, clientRequestId: 'bad' },
        { ...data, reason: '😀'.repeat(5) },
        { ...data, reason: '😀'.repeat(501) },
        { ...data, entries: [] },
        { ...data, entries: [data.entries[0], data.entries[0]] },
        ...[-1, 0.5, 21, '2'].map((score) => ({ ...data, entries: [{ ...data.entries[0], score }] })),
        { ...data, entries: [{ ...data.entries[0], grade: '😀'.repeat(2001) }] },
        { ...data, entries: [{ ...data.entries[0], feedback: 'x'.repeat(2001) }] },
      ]) {
        status(await save(bad), 400, 'Invalid or spoofed packet rejected');
      }
      check(count('assessment_results'), 0, 'Validation creates no results');
      sqlite.exec("UPDATE assessments SET max_score=0 WHERE id='assessment-a'");
      const zero = await snapshot();
      check(zero.canReview, true, 'Maximum zero remains legitimate');
      status(
        await save({ ...input(zero), reason: '😀'.repeat(10) }),
        201,
        'Valid Unicode reason and score zero commit',
      );
    },
  );
  await scenario(
    'Dirty-only grade feedback null empty and full existing evidence',
    async ({ db, schema, request, snapshot, save, sqlite }) => {
      await db.insert(schema.enrolments).values({
        id: 'second-active',
        studentId: 'student-other',
        classId: 'class-a',
        status: 'active',
        enrolledAt: stamp,
        createdAt: stamp,
        updatedAt: stamp,
      });
      status(
        await legacy.POST(
          request('teacher-a', 'POST', {
            results: [
              { studentId: 'student-a', score: 7, grade: 'School supplied', feedback: 'Original comment' },
              { studentId: 'student-other', score: 9, feedback: 'Untouched comment' },
            ],
          }),
          parameters('assessment-a'),
        ),
        200,
        'Legacy existing results',
      );
      const current = await snapshot(),
        before = current.roster.items.find((row) => row.student.id === 'student-a').record;
      const other = {
        ...sqlite.prepare("SELECT * FROM assessment_results WHERE student_id='student-other'").get(),
      };
      status(
        await save(
          input(current, [
            {
              studentId: 'student-a',
              score: before.score,
              grade: before.grade,
              feedback: before.feedback,
              expectedRecord: before,
            },
          ]),
        ),
        400,
        'No-op has no review',
      );
      const response = await save(
        input(current, [
          { studentId: 'student-a', score: 0, grade: '', feedback: null, expectedRecord: before },
        ]),
      );
      status(response, 201, 'Reviewed changed result');
      const result = await response.json();
      check(result.review.changes[0].beforeRecord, before, 'All actual before fields retained');
      check(result.review.changes[0].afterRecord.grade, '', 'Empty grade distinct from null');
      check(result.review.changes[0].afterRecord.feedback, null, 'Explicit null feedback retained');
      check(result.review.changes[0].afterRecord.id, before.id, 'Existing result identity preserved');
      check(
        result.review.changes[0].afterRecord.createdAt,
        before.createdAt,
        'Existing creation time preserved',
      );
      check(
        { ...sqlite.prepare("SELECT * FROM assessment_results WHERE student_id='student-other'").get() },
        other,
        'Untouched result stays byte-for-byte unchanged',
      );
    },
  );
  await scenario(
    'Oversized unchanged grade feedback preserve no clipping',
    async ({ db, schema, snapshot, save }) => {
      await db.insert(schema.assessmentResults).values({
        id: 'long-result',
        assessmentId: 'assessment-a',
        studentId: 'student-a',
        score: 5,
        grade: 'g'.repeat(2200),
        feedback: '😀'.repeat(2100),
        createdAt: stamp,
        updatedAt: stamp,
      });
      const current = await snapshot(),
        before = current.roster.items[0].record;
      const response = await save(
        input(current, [
          {
            studentId: 'student-a',
            score: 6,
            grade: before.grade,
            feedback: before.feedback,
            expectedRecord: before,
          },
        ]),
      );
      status(response, 201, 'Score-only review preserves long evidence');
      const result = await response.json();
      check(result.review.changes[0].afterRecord.grade, before.grade, 'Long unchanged grade retained');
      check(
        result.review.changes[0].afterRecord.feedback,
        before.feedback,
        'Long unchanged feedback retained',
      );
    },
  );
  for (const [field, value] of Object.entries({
    id: 'other-result-id',
    assessmentId: 'assessment-b',
    studentId: 'student-other',
    score: 4,
    scoreType: 'text',
    grade: 'Stale grade',
    feedback: 'Stale comment',
    createdAt: 'old-created',
    updatedAt: 'old-updated',
  })) {
    await scenario('Full result CAS ' + field, async ({ db, schema, snapshot, save, sqlite, count }) => {
      await db.insert(schema.assessmentResults).values({
        id: 'existing-result',
        assessmentId: 'assessment-a',
        studentId: 'student-a',
        score: 5,
        grade: null,
        feedback: null,
        createdAt: stamp,
        updatedAt: stamp,
      });
      const current = await snapshot(),
        before = current.roster.items[0].record,
        saved = { ...sqlite.prepare('SELECT * FROM assessment_results').get() };
      status(
        await save(
          input(current, [
            {
              studentId: 'student-a',
              score: 6,
              grade: null,
              feedback: null,
              expectedRecord: { ...before, [field]: value },
            },
          ]),
        ),
        409,
        'Stale exact result field rejected',
      );
      check(
        { ...sqlite.prepare('SELECT * FROM assessment_results').get() },
        saved,
        'Stale field leaves result unchanged',
      );
      check(count('assessment_reviews'), 0, 'Stale field creates no receipt');
    });
  }
  for (const [field, value] of Object.entries({
    title: 'Changed title',
    kind: 'project',
    max_score: 10,
    date: 'different raw date',
    created_at: 'new-created',
    updated_at: 'new-updated',
  })) {
    await scenario(
      'Metadata changed at SQL ' + field,
      async ({ snapshot, save, beforeExecution, sqlite, count }) => {
        const data = input(await snapshot());
        const finish = beforeExecution('insert', assessmentReviews, () =>
          sqlite.prepare(`UPDATE assessments SET ${field}=? WHERE id='assessment-a'`).run(value),
        );
        status(await save(data), 409, 'Actual receipt SQL rechecks full metadata');
        finish();
        check(count('assessment_results'), 0, 'Metadata race leaves no result');
        check(count('assessment_reviews'), 0, 'Metadata race leaves no receipt');
      },
    );
  }
  for (const [name, statement] of [
    ['disabled actor', "UPDATE users SET disabled_at='revoked' WHERE id='teacher-a'"],
    ['role change', "UPDATE users SET role='guardian' WHERE id='teacher-a'"],
    ['school change', "UPDATE users SET school_id='b' WHERE id='teacher-a'"],
    ['blank issuer', "UPDATE users SET identity_issuer='' WHERE id='teacher-a'"],
    ['blank subject', "UPDATE users SET identity_subject='' WHERE id='teacher-a'"],
    ['class reassigned', "UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'"],
    ['class transferred', "UPDATE classes SET school_id='b' WHERE id='class-a'"],
    ['pupil transferred', "UPDATE students SET school_id='b' WHERE id='student-a'"],
    ['pupil withdrawn', "UPDATE enrolments SET status='withdrawn' WHERE id='student-a-enrolment'"],
    ['assessment remapped', "UPDATE assessments SET class_id='class-other' WHERE id='assessment-a'"],
  ])
    await scenario(
      'Late current write authority ' + name,
      async ({ snapshot, save, beforeExecution, sqlite, count }) => {
        const data = input(await snapshot());
        const finish = beforeExecution('insert', assessmentReviews, () => sqlite.exec(statement));
        status(await save(data), 409, 'Actual SQL denies ' + name);
        finish();
        check(count('assessment_reviews'), 0, 'No authority-race receipt');
        check(count('assessment_results'), 0, 'No authority-race result');
      },
    );
  await scenario(
    'Same UUID concurrent convergence different UUID CAS and old receipt replay',
    async ({ snapshot, save, request, beforeExecution, sqlite, count, history }) => {
      const current = await snapshot(),
        data = input(current);
      let winner;
      const finish = beforeExecution('insert', assessmentReviews, async () => {
        const response = await save(data);
        status(response, 201, 'Inner concurrent winner');
        winner = await response.json();
      });
      let response = await save(data);
      finish();
      status(response, 200, 'Outer same UUID recovers winner');
      check(await response.json(), { review: winner.review, replayed: true }, 'Concurrent exact evidence');
      status(
        await save({ ...data, clientRequestId: crypto.randomUUID() }),
        409,
        'Different UUID stale absent-record expectation conflicts',
      );
      status(
        await legacy.POST(
          request('teacher-a', 'POST', {
            results: [
              { studentId: 'student-a', score: 14, grade: 'Later supplied', feedback: 'Later comment' },
            ],
          }),
          parameters('assessment-a'),
        ),
        200,
        'Later legacy replacement',
      );
      sqlite.exec(
        "UPDATE assessments SET title='Later metadata',max_score=18 WHERE id='assessment-a'; UPDATE enrolments SET status='withdrawn' WHERE id='student-a-enrolment'",
      );
      response = await save(data);
      status(response, 200, 'Original committed retry survives later metadata and withdrawal');
      check(
        await response.json(),
        { review: winner.review, replayed: true },
        'Original receipt never reapplies old score',
      );
      check(sqlite.prepare('SELECT score FROM assessment_results').get().score, 14, 'Later score remains');
      check(count('assessment_reviews'), 1, 'Only one concurrent receipt');
      response = await history();
      status(response, 200, 'Same-school withdrawn evidence retained');
      check(
        (await response.json()).items,
        [winner.review],
        'History original metadata and before after records immutable',
      );
      sqlite.exec("UPDATE students SET school_id='b' WHERE id='student-a'");
      response = await history();
      status(response, 200, 'Current class history feed remains');
      check((await response.json()).items, [], 'Transferred original pupil hides batch evidence');
      status(await save(data), 409, 'Transferred original batch cannot replay into scope');
    },
  );
  await scenario(
    'Forced event fault rolls back existing new result receipt and evidence',
    async ({ db, schema, snapshot, save, sqlite, count }) => {
      await db.insert(schema.enrolments).values({
        id: 'second-active',
        studentId: 'student-other',
        classId: 'class-a',
        status: 'active',
        enrolledAt: stamp,
        createdAt: stamp,
        updatedAt: stamp,
      });
      await db.insert(schema.assessmentResults).values({
        id: 'existing',
        assessmentId: 'assessment-a',
        studentId: 'student-a',
        score: 8,
        grade: 'Original',
        feedback: 'Preserved',
        createdAt: stamp,
        updatedAt: stamp,
      });
      const current = await snapshot(),
        before = current.roster.items.find((row) => row.student.id === 'student-a').record,
        original = { ...sqlite.prepare('SELECT * FROM assessment_results').get() };
      const data = input(current, [
        { studentId: 'student-a', score: 9, grade: null, feedback: '', expectedRecord: before },
        { studentId: 'student-other', score: 0, grade: null, feedback: null, expectedRecord: null },
      ]);
      sqlite.exec(
        "CREATE TRIGGER synthetic_result_event_fault BEFORE INSERT ON assessment_review_entries WHEN NEW.student_id='student-other' BEGIN SELECT RAISE(ABORT,'synthetic result evidence failure'); END",
      );
      let response = await save(data);
      status(response, 500, 'Unrelated storage fault remains500');
      check(await response.json(), { error: 'Internal server error' }, 'No storage detail leak');
      check(count('assessment_results'), 1, 'New result rolled back');
      check(
        { ...sqlite.prepare('SELECT * FROM assessment_results').get() },
        original,
        'Existing result and timestamp restored',
      );
      for (const table of ['assessment_reviews', 'assessment_review_entries'])
        check(count(table), 0, 'Fault rolls back ' + table);
      sqlite.exec('DROP TRIGGER synthetic_result_event_fault');
      response = await save(data);
      status(response, 201, 'Same request succeeds after real fault removed');
      for (const statement of [
        "UPDATE assessment_reviews SET reason='Changed reason text'",
        'DELETE FROM assessment_reviews',
        "UPDATE assessment_review_entries SET after_record='{}'",
        'DELETE FROM assessment_review_entries',
      ]) {
        assert.throws(() => sqlite.exec(statement), /immutable/);
        passed++;
      }
    },
  );
  await scenario(
    'Active result and enrolment ambiguities block without losing legacy rows',
    async ({ snapshot, save, count }) => {
      const current = await snapshot();
      check(current.roster.total, 1, 'Distinct roster despite legacy pairs');
      check(current.roster.items[0].resultRows, 2, 'Exact duplicate result count');
      check(current.roster.items[0].records.length, 2, 'Actual duplicate full evidence shown');
      check(current.roster.items[0].record, null, 'No arbitrary winner selected');
      check(current.roster.items[0].needsReview, true, 'Ambiguity disclosed');
      check(current.canReview, false, 'Ambiguous whole editable roster blocked');
      status(await save(input(current)), 409, 'Ambiguous reviewed write rejected');
      check(count('assessment_results'), 2, 'Every old result preserved');
    },
    async ({ db, schema }) => {
      await db.insert(schema.enrolments).values({
        id: 'legacy-other-pair',
        studentId: 'student-a',
        classId: 'class-a',
        status: 'withdrawn',
        enrolledAt: stamp,
        createdAt: stamp,
        updatedAt: stamp,
      });
      await db.insert(schema.assessmentResults).values(
        [1, 2].map((score) => ({
          id: 'legacy-' + score,
          assessmentId: 'assessment-a',
          studentId: 'student-a',
          score,
          createdAt: stamp,
          updatedAt: stamp,
        })),
      );
    },
  );
  await scenario(
    'Historical-only duplicates do not block current active pupil',
    async ({ snapshot, save, count }) => {
      const current = await snapshot();
      check(current.roster.total, 1, 'Historical-only pupil is excluded from editable roster');
      check(current.canReview, true, 'Unrelated legacy duplicates do not globally block');
      status(await save(input(current)), 201, 'Current pupil reviewed while historical evidence preserved');
      check(count('assessment_results'), 3, 'Both old historical rows plus new active result remain');
    },
    async ({ db, schema }) =>
      db.insert(schema.assessmentResults).values(
        [1, 2].map((score) => ({
          id: 'historical-' + score,
          assessmentId: 'assessment-a',
          studentId: 'student-other',
          score,
          createdAt: stamp,
          updatedAt: stamp,
        })),
      ),
  );
  for (const maximum of ['not numeric', -1, 1.25, 9007199254740992])
    await scenario('Malformed maximum ' + maximum, async ({ sqlite, snapshot, save, count }) => {
      sqlite.prepare("UPDATE assessments SET max_score=? WHERE id='assessment-a'").run(maximum);
      const current = await snapshot();
      check(current.invalidMaximum, true, 'Malformed maximum is disclosed without coercion');
      check(current.canReview, false, 'Malformed maximum blocks new reviewed results');
      status(await save(input(current)), 409, 'Malformed legacy maximum fails safely');
      check(count('assessment_results'), 0, 'Malformed maximum stores no new result');
    });
  for (const exact of ['9007199254740993', '-9007199254740993'])
    await scenario(
      'Unsafe stored INTEGER read-only exact ' + exact,
      async ({ sqlite, snapshot, save, count }) => {
        sqlite.exec(
          "INSERT INTO assessment_results VALUES('unsafe','assessment-a','student-a'," +
            exact +
            ",NULL,NULL,'" +
            stamp +
            "','" +
            stamp +
            "')",
        );
        const current = await snapshot(),
          row = current.roster.items[0];
        check(row.record.score, exact, 'Stored unsafe integer is disclosed exactly as text without rounding');
        check(row.record.scoreType, 'integer', 'Actual storage type retained');
        check(row.needsReview, true, 'Unsafe integer requires evidence review');
        check(current.canReview, false, 'Unsafe integer blocks the current editor');
        status(
          await save(
            input(current, [
              { studentId: 'student-a', score: 0, grade: null, feedback: null, expectedRecord: row.record },
            ]),
          ),
          409,
          'No rounded before evidence can be reviewed',
        );
        check(
          sqlite.prepare('SELECT CAST(score AS TEXT) exact FROM assessment_results').get().exact,
          exact,
          'Exact unsafe value remains unchanged',
        );
        check(count('assessment_reviews'), 0, 'No unsafe receipt');
      },
    );
  await scenario('Unsafe maximum exact representation', async ({ sqlite, snapshot, save }) => {
    sqlite.exec("UPDATE assessments SET max_score=9007199254740993 WHERE id='assessment-a'");
    const current = await snapshot();
    check(current.assessment.maxScore, '9007199254740993', 'Unsafe stored maximum is exact text');
    check(current.assessment.maxScoreType, 'integer', 'Unsafe maximum storage type retained');
    check(current.invalidMaximum, true, 'Unsafe maximum disclosed');
    status(await save(input(current)), 409, 'Unsafe maximum remains read-only');
  });
  for (const [literal, exact] of [
    ['9e999', 'Inf'],
    ['-9e999', '-Inf'],
  ])
    await scenario(
      'Nonfinite legacy REAL exact read-only ' + exact,
      async ({ sqlite, snapshot, save, count }) => {
        sqlite.exec(
          "INSERT INTO assessment_results VALUES('nonfinite','assessment-a','student-a'," +
            literal +
            ",NULL,NULL,'" +
            stamp +
            "','" +
            stamp +
            "')",
        );
        const current = await snapshot(),
          row = current.roster.items[0];
        check(row.record.score, exact, 'Nonfinite REAL disclosed as actual SQL text rather than HTTP null');
        check(row.record.scoreType, 'real', 'Actual REAL storage type retained');
        check(row.needsReview, true, 'Nonfinite saved score is explicitly read-only');
        check(current.canReview, false, 'No nonfinite before evidence can be reviewed');
        status(
          await save(
            input(current, [
              { studentId: 'student-a', score: 0, grade: null, feedback: null, expectedRecord: row.record },
            ]),
          ),
          409,
          'Nonfinite result repair cannot rely on lossy JSON evidence',
        );
        check(count('assessment_reviews'), 0, 'No nonfinite result receipt');
        sqlite.exec('UPDATE assessments SET max_score=' + literal + " WHERE id='assessment-a'");
        const metadata = await snapshot();
        check(metadata.assessment.maxScore, exact, 'Nonfinite maximum disclosed as exact SQL text');
        check(metadata.invalidMaximum, true, 'Nonfinite maximum is invalid');
      },
    );
  await scenario(
    'Late unsafe INTEGER on untouched active classmate blocks SQL review',
    async ({ db, schema, sqlite, snapshot, save, beforeExecution, count }) => {
      await db.insert(schema.enrolments).values({
        id: 'unsafe-second',
        studentId: 'student-other',
        classId: 'class-a',
        status: 'active',
        enrolledAt: stamp,
        createdAt: stamp,
        updatedAt: stamp,
      });
      const current = await snapshot();
      const finish = beforeExecution('insert', assessmentReviews, () =>
        sqlite.exec(
          "INSERT INTO assessment_results VALUES('late-unsafe','assessment-a','student-other',9007199254740993,NULL,NULL,'" +
            stamp +
            "','" +
            stamp +
            "')",
        ),
      );
      status(
        await save(input(current)),
        409,
        'Whole editable-roster SQL guard detects late untouched unsafe score',
      );
      finish();
      check(count('assessment_results'), 1, 'Only actual preexisting unsafe legacy result remains');
      check(count('assessment_reviews'), 0, 'No partial review receipt');
      check(
        sqlite.prepare('SELECT CAST(score AS TEXT) exact FROM assessment_results').get().exact,
        '9007199254740993',
        'Late unsafe original remains exact',
      );
    },
  );
  await scenario(
    'Existing invalid raw date is disclosed not a school-calendar save policy',
    async ({ sqlite, snapshot, save }) => {
      sqlite.exec("UPDATE assessments SET date='2026-02-30' WHERE id='assessment-a'");
      const current = await snapshot();
      check(current.assessment.date, '2026-02-30', 'Original raw date is not shifted or clipped');
      check(current.invalidDate, true, 'Invalid calendar evidence disclosed');
      check(current.canReview, true, 'Invalid existing date alone does not impose school-day eligibility');
      status(await save(input(current)), 201, 'Existing assessment review remains possible');
    },
  );
  await scenario(
    'Exact100 cap then actual late101st blocks whole write',
    async ({ db, schema, snapshot, save, beforeExecution, count }) => {
      await db.insert(schema.students).values(
        Array.from({ length: 100 }, (_, i) => ({
          id: 'cap-' + i,
          schoolId: 'a',
          firstName: 'Synthetic cap',
          lastName: String(i),
          dateOfBirth: '2012-01-01',
          admissionNumber: 'CAP-' + i,
          gradeLevel: '8',
          createdAt: stamp,
          updatedAt: stamp,
        })),
      );
      await db.insert(schema.enrolments).values(
        Array.from({ length: 99 }, (_, i) => ({
          id: 'cap-enrolment-' + i,
          studentId: 'cap-' + i,
          classId: 'class-a',
          status: 'active',
          enrolledAt: stamp,
          createdAt: stamp,
          updatedAt: stamp,
        })),
      );
      const current = await snapshot();
      check(current.roster.total, 100, 'Exactly100 roster');
      check(current.canReview, true, 'Exactly100 allows write');
      const finish = beforeExecution('insert', assessmentReviews, () =>
        db.insert(schema.enrolments).values({
          id: 'late-cap',
          studentId: 'cap-99',
          classId: 'class-a',
          status: 'active',
          enrolledAt: stamp,
          createdAt: stamp,
          updatedAt: stamp,
        }),
      );
      status(await save(input(current)), 409, 'Late101st blocks actual atomic write');
      finish();
      const next = await snapshot();
      check(next.roster.total, 101, 'Exact total retained');
      check(next.roster.items.length, 100, 'Visible list capped');
      check(next.roster.truncated, true, 'Cap disclosed');
      check(next.canReview, false, 'Truncated save blocked');
      check(count('assessment_results'), 0, 'No partial result');
    },
  );
  await scenario(
    'Actual SELECT read authority and denied postcommit readback',
    async ({ snapshot, save, request, schema, beforeExecution, sqlite, count }) => {
      const data = input(await snapshot());
      const finish = beforeExecution(
        'read',
        assessmentReviews,
        () => sqlite.exec("UPDATE users SET disabled_at='revoked' WHERE id='teacher-a'"),
        2,
      );
      status(await save(data), 404, 'Revoked after commit cannot receive evidence');
      finish();
      check(count('assessment_results'), 1, 'Actual committed result remains');
      check(count('assessment_reviews'), 1, 'Actual committed receipt remains');
      sqlite.exec("UPDATE users SET disabled_at=NULL WHERE id='teacher-a'");
      const readFinish = beforeExecution('read', schema.assessments, () =>
        sqlite.exec("UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'"),
      );
      status(
        await route.GET(request('teacher-a'), parameters('assessment-a')),
        404,
        'Actual read class authority rechecked',
      );
      readFinish();
    },
  );
  await scenario(
    'Production D1 maps one atomic write rollback and original replay',
    async ({ db, schema, sqlite, snapshot, save, count }) => {
      await db.insert(schema.enrolments).values({
        id: 'd1-second',
        studentId: 'student-other',
        classId: 'class-a',
        status: 'active',
        enrolledAt: stamp,
        createdAt: stamp,
        updatedAt: stamp,
      });
      const { drizzle } = await import('drizzle-orm/d1');
      const commands = [];
      let batches = 0;
      function prepared(query, params = []) {
        async function execute(arrayRows) {
          commands.push(query);
          const statement = sqlite.prepare(query);
          if (arrayRows) statement.setReturnArrays(true);
          if (statement.columns().length) return statement.all(...params);
          statement.run(...params);
          return [];
        }
        return {
          bind(...values) {
            return prepared(query, values);
          },
          async raw() {
            return execute(true);
          },
          async all() {
            return { success: true, results: await execute(false), meta: {} };
          },
          async run() {
            return { success: true, results: await execute(false), meta: {} };
          },
        };
      }
      globalThis.__sahaTestDb = drizzle(
        {
          prepare: prepared,
          async batch() {
            batches++;
            throw new Error('Reviewed results require one statement.');
          },
        },
        { schema },
      );
      const current = await snapshot();
      check(current.roster.total, 2, 'D1 typed scalar snapshot');
      const data = input(current, [
        { studentId: 'student-a', score: 0, grade: null, feedback: '', expectedRecord: null },
        {
          studentId: 'student-other',
          score: 10,
          grade: 'School supplied',
          feedback: null,
          expectedRecord: null,
        },
      ]);
      sqlite.exec(
        "CREATE TRIGGER synthetic_d1_fault BEFORE INSERT ON assessment_review_entries WHEN NEW.student_id='student-other' BEGIN SELECT RAISE(ABORT,'synthetic D1 event failure'); END",
      );
      status(await save(data), 500, 'D1 trigger fault safe500');
      for (const table of ['assessment_results', 'assessment_reviews', 'assessment_review_entries'])
        check(count(table), 0, 'D1 atomic rollback ' + table);
      sqlite.exec('DROP TRIGGER synthetic_d1_fault');
      commands.length = 0;
      let response = await save(data);
      status(response, 201, 'D1 one-statement review');
      const result = await response.json();
      check(
        commands.filter((command) => /^(insert|update|delete)\b/i.test(command)).length,
        1,
        'One actual D1 write',
      );
      check(batches, 0, 'No batch dependency');
      check(result.review.changes.length, 2, 'D1 maps both events');
      commands.length = 0;
      response = await save(data);
      status(response, 200, 'D1 original committed retry');
      check(await response.json(), { review: result.review, replayed: true }, 'D1 exact evidence retained');
      check(
        commands.filter((command) => /^(insert|update|delete)\b/i.test(command)).length,
        0,
        'D1 retry never writes',
      );
    },
  );
  await scenario(
    'Legacy replacement omitted text and concurrent200 behavior unchanged',
    async ({ request, sqlite, count }) => {
      status(
        await legacy.POST(
          request('teacher-a', 'POST', {
            results: [{ studentId: 'student-a', score: 8, grade: 'Old supplied', feedback: 'Old comment' }],
          }),
          parameters('assessment-a'),
        ),
        200,
        'Legacy original result',
      );
      const responses = await Promise.all(
        [9, 10].map((score) =>
          legacy.POST(
            request('teacher-a', 'POST', { results: [{ studentId: 'student-a', score }] }),
            parameters('assessment-a'),
          ),
        ),
      );
      check(
        responses.map((response) => response.status),
        [200, 200],
        'Legacy concurrent replacements both200',
      );
      check(
        { ...sqlite.prepare('SELECT grade,feedback FROM assessment_results').get() },
        { grade: null, feedback: null },
        'Legacy omitted text still clears',
      );
      check(count('assessment_reviews'), 0, 'No invented legacy reviews');
    },
  );
  check(networkCalls, 0, 'No external calls');
  console.log(JSON.stringify({ passed, failed: 0, skipped: 0, scenarios, networkCalls }));
} finally {
  globalThis.fetch = oldFetch;
}
