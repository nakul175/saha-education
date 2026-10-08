// Independent real-session route contracts using the production D1 adapter over SQLite.
// All fixtures are synthetic; mutations are injected immediately before actual SQL execution.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/d1';
import { bindings, freshDatabase, seedSecurityData, load, root, stamp } from '../support/security-db.mjs';

const editorRoute = await load('app/api/assessments/[id]/result-editor/route.ts');
const historyRoute = await load('app/api/assessments/[id]/result-editor/history/route.ts');
const legacyRoute = await load('app/api/assessments/[id]/results/route.ts');
const sessions = await load('lib/education/session.ts');
const profiles = await load('lib/education/profile-links.ts');
const origin = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = origin;
let checks = 0,
  scenarios = 0,
  externalCalls = 0;
const check = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  checks++;
};
const keys = (value, fields, message) => check(Object.keys(value).sort(), [...fields].sort(), message);
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => {
  externalCalls++;
  throw new Error('Independent result contracts remain offline.');
};
const actors = [
  'admin-a',
  'admin-b',
  'teacher-a',
  'teacher-other',
  'teacher-b',
  'guardian-a',
  'student-user-a',
];
const snapshotSql = /from "assessments" where/i;
const retrySql = /from "assessment_reviews" where/i;
const insertSql = /^insert into "assessment_reviews"/i;
const metadataFields = [
  'id',
  'classId',
  'title',
  'kind',
  'maxScore',
  'date',
  'createdAt',
  'updatedAt',
  'maxScoreType',
];
const recordFields = [
  'id',
  'assessmentId',
  'studentId',
  'score',
  'grade',
  'feedback',
  'createdAt',
  'updatedAt',
  'scoreType',
];

function publicReview(value) {
  keys(
    value,
    ['id', 'assessmentId', 'classId', 'assessment', 'reviewedBy', 'reason', 'createdAt', 'changes'],
    'Review projects only attributable public evidence',
  );
  keys(value.assessment, metadataFields, 'Original assessment metadata is exact typed evidence');
  for (const change of value.changes) {
    keys(
      change,
      ['studentId', 'beforeRecord', 'afterRecord'],
      'Change contains exact original and committed result evidence',
    );
    for (const record of [change.beforeRecord, change.afterRecord].filter(Boolean))
      keys(record, recordFields, 'Record preserves every saved result field and SQLite storage type');
  }
  for (const privateValue of [
    '@example.invalid',
    'identity.example.invalid',
    'sub-teacher',
    '2012-01-01',
    'guardian-profile',
    'SECRET_FOREIGN_RESULT',
  ])
    check(
      JSON.stringify(value).includes(privateValue),
      false,
      'Review excludes account identity, birth date and foreign evidence',
    );
}

async function scenario(name, action, legacySetup) {
  const fixture = freshDatabase(legacySetup ? { beforeMigration: '0009_academic_integrity.sql' } : undefined);
  await seedSecurityData(fixture.db, fixture.schema);
  const { sqlite, schema } = fixture;
  if (legacySetup) {
    await legacySetup(fixture);
    const files = readdirSync(join(root, 'drizzle'))
      .filter((file) => /^\d.*\.sql$/.test(file))
      .sort();
    for (const file of files.slice(files.indexOf('0009_academic_integrity.sql')))
      sqlite.exec(
        readFileSync(join(root, 'drizzle', file), 'utf8').replaceAll('--> statement-breakpoint', ''),
      );
  }
  // D1's real Drizzle prepared-query implementation maps raw array rows and RETURNING results.
  function prepare(query, params = []) {
    return {
      bind(...values) {
        return prepare(query, values);
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
  const db = drizzle(
    {
      prepare,
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
  globalThis.__sahaTestDb = db;
  const cookies = {};
  for (const actor of actors) cookies[actor] = (await sessions.createSession(actor)).split(';')[0];
  function request(
    actor,
    method,
    payload,
    path = '/api/assessments/assessment-a/result-editor',
    suppliedOrigin = origin,
    raw = false,
  ) {
    const headers = { origin: suppliedOrigin };
    if (actor) headers.cookie = cookies[actor];
    const init = { method, headers };
    if (payload !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = raw ? payload : JSON.stringify(payload);
    }
    return new Request(origin + path, init);
  }
  async function call(
    route = editorRoute,
    method = 'GET',
    actor = 'teacher-a',
    payload,
    assessmentId = 'assessment-a',
    suffix = '',
    suppliedOrigin = origin,
    raw = false,
  ) {
    return route[method](
      request(
        actor,
        method,
        payload,
        '/api/assessments/' + assessmentId + '/result-editor' + suffix,
        suppliedOrigin,
        raw,
      ),
      { params: Promise.resolve({ id: assessmentId }) },
    );
  }
  function metadata() {
    return JSON.parse(
      sqlite
        .prepare(
          "SELECT json_object('id',id,'classId',class_id,'title',title,'kind',kind,'maxScore',case when typeof(max_score)='blob' then null else max_score end,'date',date,'createdAt',created_at,'updatedAt',updated_at,'maxScoreType',typeof(max_score)) payload FROM assessments WHERE id='assessment-a'",
        )
        .get().payload,
    );
  }
  function saved(studentId = 'student-a') {
    const row = sqlite
      .prepare(
        "SELECT json_object('id',id,'assessmentId',assessment_id,'studentId',student_id,'score',case when typeof(score)='blob' then null else score end,'grade',grade,'feedback',feedback,'createdAt',created_at,'updatedAt',updated_at,'scoreType',typeof(score)) payload FROM assessment_results WHERE assessment_id='assessment-a' AND student_id=?",
      )
      .get(studentId);
    return row ? JSON.parse(row.payload) : null;
  }
  function input(
    entries = [{ studentId: 'student-a', score: 0, grade: null, feedback: null, expectedRecord: null }],
    extra = {},
  ) {
    return {
      clientRequestId: crypto.randomUUID(),
      reviewConfirmed: true,
      reason: 'Synthetic independent reviewed result evidence.',
      expectedAssessment: metadata(),
      entries,
      ...extra,
    };
  }
  async function editor(actor = 'teacher-a') {
    const response = await call(editorRoute, 'GET', actor);
    check(response.status, 200, name + ': current staff snapshot succeeds');
    check(response.headers.get('cache-control'), 'no-store', 'Editor evidence is not cached');
    return response.json();
  }
  async function save(data = input(), actor = 'teacher-a', status = 201) {
    const response = await call(editorRoute, 'POST', actor, data);
    check(response.status, status, name + ': review returns expected status');
    check(response.headers.get('cache-control'), 'no-store', 'Reviewed acknowledgements are not cached');
    const value = await response.json();
    if (status === 201 || status === 200) {
      keys(value, ['review', 'replayed'], 'Acknowledgement has immutable review and replay indicator');
      publicReview(value.review);
    }
    return value;
  }
  async function history(actor = 'teacher-a', suffix = '') {
    const response = await call(historyRoute, 'GET', actor, undefined, 'assessment-a', suffix);
    check(response.status, 200, name + ': current history succeeds');
    check(response.headers.get('cache-control'), 'no-store', 'History evidence is not cached');
    const value = await response.json();
    keys(
      value,
      ['items', 'total', 'limit', 'truncated'],
      'History declares exact total and bounded inventory',
    );
    check(value.limit, 100, 'History cap is explicit');
    check(value.truncated, value.total > 100, 'History truncation is truthful');
    for (const review of value.items) publicReview(review);
    return value;
  }
  async function legacy(results, actor = 'teacher-a') {
    return legacyRoute.POST(request(actor, 'POST', { results }, '/api/assessments/assessment-a/results'), {
      params: Promise.resolve({ id: 'assessment-a' }),
    });
  }
  function count(table) {
    return sqlite.prepare('SELECT count(*) n FROM ' + table).get().n;
  }
  async function secondPupil() {
    await db.insert(schema.enrolments).values({
      id: 'second-active',
      classId: 'class-a',
      studentId: 'student-other',
      status: 'active',
      enrolledAt: stamp,
      createdAt: stamp,
      updatedAt: stamp,
    });
  }
  async function atSql(pattern, occurrence, mutate, action) {
    let matches = 0,
      injected = false;
    const executed = [];
    const chain = new Set([
      'from',
      'select',
      'where',
      'limit',
      'orderBy',
      'offset',
      'leftJoin',
      'innerJoin',
      'groupBy',
      'having',
      'values',
      'set',
      'onConflictDoNothing',
      'onConflictDoUpdate',
      'returning',
    ]);
    let observed;
    function wrap(query) {
      return new Proxy(query, {
        get(target, member) {
          if (member === 'then')
            return (fulfilled, rejected) =>
              (async () => {
                const sql = target.toSQL().sql;
                if (pattern.test(sql) && ++matches === occurrence) {
                  injected = true;
                  globalThis.__sahaTestDb = db;
                  try {
                    await mutate();
                  } finally {
                    globalThis.__sahaTestDb = observed;
                  }
                }
                executed.push(sql);
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
    observed = new Proxy(db, {
      get(target, member) {
        if (['select', 'selectDistinct', 'insert', 'update', 'delete'].includes(member))
          return (...args) => wrap(target[member](...args));
        const value = Reflect.get(target, member, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    globalThis.__sahaTestDb = observed;
    let result;
    try {
      result = await action();
    } finally {
      globalThis.__sahaTestDb = db;
    }
    check(injected, true, name + ': adversarial mutation reached the actual awaited statement');
    return { result, executed, matches };
  }
  async function denied(response, status, message) {
    check(response.status, status, message);
    const value = await response.json();
    keys(value, ['error'], 'Denied response has only safe error text');
    check(JSON.stringify(value).includes('SECRET'), false, 'Denied response contains no result evidence');
  }
  try {
    await action({
      sqlite,
      db,
      schema,
      cookies,
      request,
      call,
      metadata,
      saved,
      input,
      editor,
      save,
      history,
      legacy,
      count,
      secondPupil,
      atSql,
      denied,
    });
    scenarios++;
  } finally {
    globalThis.__sahaTestDb = db;
    sqlite.close();
  }
}

try {
  await scenario(
    'Authentication role ordering transport and private assessment scope',
    async ({ call, request, input, count, denied }) => {
      for (const [route, method] of [
        [editorRoute, 'GET'],
        [editorRoute, 'POST'],
        [historyRoute, 'GET'],
      ]) {
        await denied(
          await call(route, method, null, method === 'POST' ? input() : undefined),
          401,
          'Anonymous result editor and history denied',
        );
        for (const actor of ['guardian-a', 'student-user-a'])
          await denied(
            await call(
              route,
              method,
              actor,
              method === 'POST' ? '{invalid' : undefined,
              'assessment-a',
              '?unexpected=bad',
              origin,
              true,
            ),
            403,
            'Family denied before malformed body or filters',
          );
        for (const actor of ['admin-b', 'teacher-b', 'teacher-other'])
          await denied(
            await call(route, method, actor, method === 'POST' ? input() : undefined),
            404,
            'Foreign or unassigned assessment stays private',
          );
      }
      await denied(
        await call(
          editorRoute,
          'POST',
          'teacher-a',
          input(),
          'assessment-a',
          '',
          'https://attacker.example.invalid',
        ),
        403,
        'Mutation origin is checked',
      );
      for (const raw of ['{invalid', ' '.repeat(128 * 1024 + 1)])
        await denied(
          await editorRoute.POST(request('teacher-a', 'POST', raw, undefined, origin, true), {
            params: Promise.resolve({ id: 'assessment-a' }),
          }),
          400,
          'Malformed and excessive bodies receive safe rejection',
        );
      const forged = new Request(origin + '/api/assessments/assessment-a/result-editor', {
        headers: { cookie: 'saha_demo_role=admin', 'x-user-id': 'admin-a' },
      });
      await denied(
        await editorRoute.GET(forged, { params: Promise.resolve({ id: 'assessment-a' }) }),
        401,
        'Public role and identity hints are not authentication',
      );
      for (const table of ['assessment_results', 'assessment_reviews', 'assessment_review_entries'])
        check(count(table), 0, 'Transport denials persist no educational evidence');
    },
  );

  await scenario(
    'One coherent compact snapshot no invented zero and exact valid zero',
    async ({ secondPupil, atSql, call, editor, metadata, save, saved }) => {
      await secondPupil();
      const { result, executed } = await atSql(
        snapshotSql,
        1,
        () => {},
        () => call(),
      );
      check(result.status, 200, 'Actual one-statement snapshot succeeds');
      check(
        executed.filter((sql) => snapshotSql.test(sql)).length,
        1,
        'Single SELECT anchors all snapshot fields',
      );
      const value = await result.json();
      keys(
        value,
        ['assessment', 'class', 'asOf', 'invalidMaximum', 'invalidDate', 'canReview', 'roster'],
        'Snapshot projects only editor needs',
      );
      keys(value.class, ['id', 'name'], 'Class projection omits account identity');
      keys(value.assessment, metadataFields, 'Assessment metadata is complete CAS evidence');
      check(value.assessment, metadata(), 'Current original metadata is exact');
      keys(value.roster, ['items', 'total', 'limit', 'truncated'], 'Roster total and bounds are explicit');
      check(value.roster.total, 2, 'Only distinct current same-school active pupils count');
      check(value.roster.limit, 100, 'Roster preview cap is declared');
      check(value.canReview, true, 'Valid bounded evidence permits review');
      check(new Date(value.asOf).toISOString(), value.asOf, 'Snapshot records a canonical database time');
      for (const row of value.roster.items) {
        keys(
          row,
          [
            'student',
            'record',
            'records',
            'resultRows',
            'recordsTruncated',
            'enrolmentRows',
            'needsReview',
            'invalidResult',
          ],
          'Roster makes preserved ambiguity and raw result validity explicit',
        );
        keys(
          row.student,
          ['id', 'firstName', 'lastName', 'admissionNumber'],
          'Pupil projection excludes date of birth, school/user mapping and contact fields',
        );
        check(row.record, null, 'No default score is fabricated');
        check(row.records, [], 'Unrecorded pupil has no saved evidence');
        check(row.resultRows, 0, 'Unrecorded result count is truthful');
      }
      const first = await save();
      check(saved().score, 0, 'Explicit legitimate zero is saved');
      check(
        first.review.changes[0].beforeRecord,
        null,
        'First saved result records absence, not invented zero',
      );
      check(first.review.changes[0].afterRecord, saved(), 'Result readback matches actual committed tuple');
      check(
        (await editor()).roster.items.find((row) => row.student.id === 'student-a').record.score,
        0,
        'Refresh preserves stored zero',
      );
      check((await editor('admin-a')).roster.total, 2, 'Current administrator gets the same current roster');
    },
  );

  await scenario(
    'Strict dirty reviewed envelope full expected records and Unicode bounds',
    async ({ input, call, count, metadata }) => {
      const row = input().entries[0];
      const base = input();
      const missingMetadata = { ...metadata() };
      delete missingMetadata.updatedAt;
      const invalid = [
        { ...base, reviewConfirmed: false },
        { ...base, reviewConfirmed: undefined },
        { ...base, clientRequestId: 'bad' },
        { ...base, reason: 'short' },
        { ...base, reason: '😀'.repeat(5) },
        { ...base, reason: '😀'.repeat(501) },
        { ...base, reason: 'Synthetic\nreview reason.' },
        { ...base, reason: 'Synthetic\u0000review reason.' },
        { ...base, reviewedBy: 'admin-a' },
        { ...base, expectedAssessment: undefined },
        { ...base, expectedAssessment: missingMetadata },
        { ...base, expectedAssessment: { ...metadata(), spoofed: true } },
        { ...base, entries: [] },
        { ...base, entries: [row, row] },
        { ...base, entries: [{ ...row, score: null }] },
        { ...base, entries: [{ ...row, score: -1 }] },
        { ...base, entries: [{ ...row, score: 0.5 }] },
        { ...base, entries: [{ ...row, score: '1' }] },
        { ...base, entries: [{ ...row, grade: undefined }] },
        { ...base, entries: [{ ...row, feedback: undefined }] },
        { ...base, entries: [{ ...row, expectedRecord: undefined }] },
        { ...base, entries: [{ ...row, id: 'spoof-result-id' }] },
        { ...base, entries: [{ ...row, grade: '😀'.repeat(2001) }] },
        { ...base, entries: [{ ...row, feedback: '😀'.repeat(2001) }] },
        {
          ...base,
          entries: [{ ...row, expectedRecord: { id: 'x', score: 1, grade: null, feedback: null } }],
        },
        {
          ...base,
          entries: Array.from({ length: 101 }, (_, i) => ({ ...row, studentId: 'synthetic-unmapped-' + i })),
        },
      ];
      for (const value of invalid)
        check(
          (await call(editorRoute, 'POST', 'teacher-a', value)).status,
          400,
          'Strict input rejects missing, spoofed, duplicate, oversized or unreviewed evidence',
        );
      check(
        (await call(editorRoute, 'POST', 'teacher-a', input([{ ...row, score: 21 }]))).status,
        400,
        'Desired score above current valid maximum is rejected',
      );
      for (const table of ['assessment_results', 'assessment_reviews', 'assessment_review_entries'])
        check(count(table), 0, 'Invalid envelope persists no results or receipts');
    },
  );

  await scenario(
    'Exact original null empty and long saved text preservation',
    async ({ legacy, saved, save, input, call, secondPupil, count, history }) => {
      await secondPupil();
      const longGrade = 'Synthetic saved grade ' + '😀'.repeat(2100);
      const longFeedback = 'Synthetic saved feedback ' + '😀'.repeat(2100);
      check(
        (
          await legacy([
            { studentId: 'student-a', score: 0, grade: longGrade, feedback: longFeedback },
            { studentId: 'student-other', score: 7, grade: '', feedback: '' },
          ])
        ).status,
        200,
        'Legacy oversized and empty text remains confirmed evidence',
      );
      const before = saved(),
        untouched = saved('student-other');
      const first = await save(
        input(
          [
            {
              studentId: 'student-a',
              score: 1,
              grade: longGrade,
              feedback: longFeedback,
              expectedRecord: before,
            },
          ],
          { reason: '😀'.repeat(10) },
        ),
      );
      check(first.review.reason, '😀'.repeat(10), 'Reason lower bound counts Unicode code points');
      check(saved().grade, longGrade, 'Unchanged long supplied grade is preserved');
      check(saved().feedback, longFeedback, 'Unchanged long feedback is preserved');
      check(saved().id, before.id, 'Correction retains original result identity');
      check(saved().createdAt, before.createdAt, 'Correction retains original creation date');
      check(saved('student-other'), untouched, 'Untouched pupil is never submitted or cleared');
      check(
        (
          await call(
            editorRoute,
            'POST',
            'teacher-a',
            input([
              {
                studentId: 'student-a',
                score: 2,
                grade: longGrade + 'changed',
                feedback: longFeedback,
                expectedRecord: saved(),
              },
            ]),
          )
        ).status,
        400,
        'Changed long grade cannot claim unchanged preservation',
      );
      const second = await save(
        input([{ studentId: 'student-a', score: 0, grade: '', feedback: null, expectedRecord: saved() }], {
          reason: '😀'.repeat(500),
        }),
      );
      check(second.review.reason, '😀'.repeat(500), 'Reason upper bound counts Unicode code points');
      check(saved().score, 0, 'Reviewed explicit score zero is retained');
      check(saved().grade, '', 'Empty supplied grade stays distinct from null');
      check(saved().feedback, null, 'Explicit null clears feedback');
      const record = saved();
      check(
        (
          await call(
            editorRoute,
            'POST',
            'teacher-a',
            input([{ studentId: 'student-a', score: 0, grade: '', feedback: null, expectedRecord: record }]),
          )
        ).status,
        400,
        'Exact no-op produces no misleading evidence',
      );
      const third = await save(
        input([
          {
            studentId: 'student-a',
            score: 0,
            grade: null,
            feedback: '😀'.repeat(2000),
            expectedRecord: record,
          },
        ]),
      );
      check(
        third.review.changes[0].beforeRecord,
        record,
        'Text-only change retains full prior zero evidence',
      );
      check(count('assessment_reviews'), 3, 'Only actual changed reviews persist');
      check((await history()).total, 3, 'Each real changed review remains attributable');
    },
  );

  await scenario(
    'Concurrent dirty CAS and original UUID arbitration',
    async ({ input, call, count, saved, save }) => {
      const first = input(),
        rival = input([
          {
            studentId: 'student-a',
            score: 9,
            grade: '',
            feedback: 'Rival synthetic edit.',
            expectedRecord: null,
          },
        ]);
      const race = await Promise.all([
        call(editorRoute, 'POST', 'teacher-a', first),
        call(editorRoute, 'POST', 'admin-a', rival),
      ]);
      check(
        race.map((response) => response.status).sort(),
        [201, 409],
        'Different UUIDs have exactly one CAS winner',
      );
      check(count('assessment_reviews'), 1, 'CAS race creates one receipt');
      check(count('assessment_review_entries'), 1, 'CAS race creates one change');
      check(count('assessment_results'), 1, 'CAS race creates one result');
      const before = saved();
      const same = input([
        {
          studentId: 'student-a',
          score: before.score === 0 ? 1 : 0,
          grade: null,
          feedback: null,
          expectedRecord: before,
        },
      ]);
      const identical = await Promise.all([
        call(editorRoute, 'POST', 'teacher-a', same),
        call(editorRoute, 'POST', 'teacher-a', same),
      ]);
      check(
        identical.map((response) => response.status).sort(),
        [200, 201],
        'Identical concurrent UUIDs produce original save plus replay',
      );
      const bodies = await Promise.all(identical.map((response) => response.json()));
      check(
        bodies[0].review,
        bodies[1].review,
        'Concurrent UUID replies refer to the same immutable evidence',
      );
      await save(same, 'teacher-a', 200);
      check(count('assessment_reviews'), 2, 'Identical retries append nothing');
    },
  );

  await scenario(
    'Original UUID replay survives later metadata legacy edits and withdrawal',
    async ({ input, save, legacy, saved, sqlite, history, call, count }) => {
      const original = input();
      const first = await save(original);
      check(
        (
          await legacy([
            {
              studentId: 'student-a',
              score: 19,
              grade: 'Later supplied grade',
              feedback: 'Later synthetic feedback',
            },
          ])
        ).status,
        200,
        'Legacy replacement remains compatible',
      );
      const later = saved();
      sqlite
        .prepare(
          "UPDATE assessments SET title='Later synthetic metadata',max_score=25,updated_at=? WHERE id='assessment-a'",
        )
        .run('2026-10-05T03:00:00.000Z');
      const replay = await save(original, 'teacher-a', 200);
      check(replay.replayed, true, 'Exact UUID replay is explicit');
      check(replay.review, first.review, 'Replay returns original assessment metadata and changes');
      check(saved(), later, 'Replay never reapplies prior marks over later legacy work');
      sqlite.prepare("UPDATE enrolments SET status='withdrawn' WHERE id='student-a-enrolment'").run();
      const withdrawn = await save(original, 'teacher-a', 200);
      check(
        withdrawn.review,
        first.review,
        'Original current class staff retains same-school withdrawn review',
      );
      check(saved(), later, 'Withdrawal retry leaves newer result untouched');
      check((await history()).total, 1, 'Withdrawal preserves original reviewed history');
      check(
        (await call(editorRoute, 'POST', 'teacher-a', input())).status,
        409,
        'Empty active roster blocks new review',
      );
      check(
        (
          await call(editorRoute, 'POST', 'teacher-a', {
            ...original,
            reason: 'Different synthetic retry reason.',
          })
        ).status,
        409,
        'Changed retry cannot claim committed UUID',
      );
      check(
        (await call(editorRoute, 'POST', 'admin-a', original)).status,
        409,
        'Another actor cannot claim original UUID',
      );
      check(count('assessment_reviews'), 1, 'Replay and denied reuse do not append evidence');
    },
  );

  const actorChanges = [
    ['disabled', (actor) => "UPDATE users SET disabled_at='synthetic-disabled' WHERE id='" + actor + "'"],
    ['demoted', (actor) => "UPDATE users SET role='guardian' WHERE id='" + actor + "'"],
    ['moved', (actor) => "UPDATE users SET school_id='b' WHERE id='" + actor + "'"],
    ['issuer removed', (actor) => "UPDATE users SET identity_issuer=NULL WHERE id='" + actor + "'"],
    ['subject blanked', (actor) => "UPDATE users SET identity_subject='' WHERE id='" + actor + "'"],
  ];
  for (const actor of ['admin-a', 'teacher-a'])
    for (const [label, statement] of actorChanges)
      for (const operation of ['snapshot', 'write', 'history', 'replay'])
        await scenario(
          actor + ' late ' + label + ' at ' + operation,
          async ({ sqlite, save, input, atSql, call, denied, count }) => {
            let original;
            if (operation === 'history' || operation === 'replay') {
              original = input();
              await save(original, actor);
            }
            const pattern =
              operation === 'write' ? insertSql : operation === 'replay' ? retrySql : snapshotSql;
            const { result } = await atSql(
              pattern,
              1,
              () => sqlite.exec(statement(actor)),
              () =>
                call(
                  operation === 'history' ? historyRoute : editorRoute,
                  operation === 'write' || operation === 'replay' ? 'POST' : 'GET',
                  actor,
                  operation === 'write' ? input() : operation === 'replay' ? original : undefined,
                ),
            );
            await denied(
              result,
              operation === 'write' || operation === 'replay' ? 409 : 404,
              'Actual SQL rechecks late ' + operation + ' actor authority',
            );
            check(
              count('assessment_reviews'),
              original ? 1 : 0,
              'Late authority loss creates no new receipt',
            );
            check(count('assessment_results'), original ? 1 : 0, 'Late authority loss creates no new result');
          },
        );

  for (const [label, statement] of [
    ['class reassignment', "UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'"],
    ['class transfer', "UPDATE classes SET school_id='b' WHERE id='class-a'"],
    ['assessment class move', "UPDATE assessments SET class_id='class-other' WHERE id='assessment-a'"],
  ])
    for (const operation of ['snapshot', 'write', 'history', 'replay'])
      await scenario(
        label + ' at actual ' + operation,
        async ({ sqlite, save, input, atSql, call, denied, count }) => {
          let original;
          if (operation === 'history' || operation === 'replay') {
            original = input();
            await save(original);
          }
          const { result } = await atSql(
            operation === 'write' ? insertSql : operation === 'replay' ? retrySql : snapshotSql,
            1,
            () => sqlite.exec(statement),
            () =>
              call(
                operation === 'history' ? historyRoute : editorRoute,
                operation === 'write' || operation === 'replay' ? 'POST' : 'GET',
                'teacher-a',
                operation === 'write' ? input() : operation === 'replay' ? original : undefined,
              ),
          );
          await denied(
            result,
            operation === 'write' || operation === 'replay' ? 409 : 404,
            'Actual SQL rejects changed class/assessment authority',
          );
          check(
            count('assessment_reviews'),
            original ? 1 : 0,
            'Changed reference leaves original history intact',
          );
        },
      );

  for (const [label, statement] of [
    ['withdrawn', "UPDATE enrolments SET status='withdrawn' WHERE id='student-a-enrolment'"],
    ['pupil school moved', "UPDATE students SET school_id='b' WHERE id='student-a'"],
    ['pupil class moved', "UPDATE enrolments SET class_id='class-other' WHERE id='student-a-enrolment'"],
  ])
    await scenario(
      label + ' before actual result mutation',
      async ({ sqlite, input, atSql, call, denied, count }) => {
        const { result } = await atSql(
          insertSql,
          1,
          () => sqlite.exec(statement),
          () => call(editorRoute, 'POST', 'teacher-a', input()),
        );
        await denied(result, 409, 'Actual reviewed write requires current same-school active membership');
        for (const table of ['assessment_results', 'assessment_reviews', 'assessment_review_entries'])
          check(count(table), 0, 'Changed membership creates no partial rows');
      },
    );

  for (const [column, next] of [
    ['title', 'Synthetic concurrent title'],
    ['kind', 'project'],
    ['max_score', 19],
    ['date', '2026-10-04'],
    ['created_at', '2026-10-04T00:00:00.000Z'],
    ['updated_at', '2026-10-05T05:00:00.000Z'],
  ])
    await scenario(
      'Exact assessment metadata CAS ' + column,
      async ({ sqlite, input, atSql, call, denied, count }) => {
        const data = input();
        const { result } = await atSql(
          insertSql,
          1,
          () =>
            sqlite.prepare('UPDATE assessments SET ' + column + '=? WHERE id=?').run(next, 'assessment-a'),
          () => call(editorRoute, 'POST', 'teacher-a', data),
        );
        await denied(result, 409, 'Full assessment metadata CAS rejects changed ' + column);
        check(count('assessment_reviews'), 0, 'Metadata conflict creates no review');
        check(count('assessment_results'), 0, 'Metadata conflict creates no result');
      },
    );

  for (const [column, next] of [
    ['id', 'synthetic-replaced-result'],
    ['score', 6],
    ['grade', 'Synthetic concurrent grade'],
    ['feedback', 'Synthetic concurrent feedback'],
    ['created_at', '2026-10-04T00:00:00.000Z'],
    ['updated_at', '2026-10-05T05:00:00.000Z'],
  ])
    await scenario(
      'Exact saved result CAS ' + column,
      async ({ sqlite, legacy, saved, input, atSql, call, denied, count }) => {
        check(
          (
            await legacy(
              [{ studentId: 'student-a', score: 5, grade: '', feedback: null }].map((row) => ({
                ...row,
                feedback: undefined,
              })),
            )
          ).status,
          200,
          'Original mutable result exists',
        );
        const before = saved();
        const data = input([
          {
            studentId: 'student-a',
            score: 7,
            grade: before.grade,
            feedback: before.feedback,
            expectedRecord: before,
          },
        ]);
        const { result } = await atSql(
          insertSql,
          1,
          () =>
            sqlite.prepare('UPDATE assessment_results SET ' + column + '=? WHERE id=?').run(next, before.id),
          () => call(editorRoute, 'POST', 'teacher-a', data),
        );
        await denied(result, 409, 'Full saved-result CAS rejects changed ' + column);
        check(
          saved()[column === 'created_at' ? 'createdAt' : column === 'updated_at' ? 'updatedAt' : column],
          next,
          'Winning saved evidence is retained',
        );
        check(count('assessment_reviews'), 0, 'Stale result creates no review receipt');
      },
    );

  await scenario(
    'One stale dirty member rejects entire result batch',
    async ({ secondPupil, legacy, saved, input, atSql, call, denied, count }) => {
      await secondPupil();
      check(
        (
          await legacy([
            { studentId: 'student-a', score: 3 },
            { studentId: 'student-other', score: 4 },
          ])
        ).status,
        200,
        'Two original results establish full batch',
      );
      const before = [saved(), saved('student-other')];
      const data = input(
        before.map((record, index) => ({
          studentId: index ? 'student-other' : 'student-a',
          score: 8,
          grade: null,
          feedback: '',
          expectedRecord: record,
        })),
      );
      const { result } = await atSql(
        insertSql,
        1,
        () => legacy([{ studentId: 'student-other', score: 12, feedback: 'Concurrent winner.' }]),
        () => call(editorRoute, 'POST', 'teacher-a', data),
      );
      await denied(result, 409, 'Any stale result rejects the full reviewed batch');
      check(saved(), before[0], 'Uncontested pupil is not partially updated');
      check(saved('student-other').score, 12, 'Contested pupil retains newer winner');
      check(count('assessment_reviews'), 0, 'Full conflict creates no receipt');
      check(count('assessment_review_entries'), 0, 'Full conflict creates no audit entries');
    },
  );

  await scenario(
    'Full expected record cannot spoof identity type or omitted evidence',
    async ({ legacy, saved, input, call, count }) => {
      check(
        (await legacy([{ studentId: 'student-a', score: 5, grade: '', feedback: '' }])).status,
        200,
        'Exact original result exists',
      );
      const before = saved();
      for (const [field, value] of [
        ['id', 'foreign-result-id'],
        ['assessmentId', 'assessment-b'],
        ['studentId', 'student-b'],
        ['scoreType', 'text'],
        ['score', '5'],
      ]) {
        const data = input([
          {
            studentId: 'student-a',
            score: 6,
            grade: before.grade,
            feedback: before.feedback,
            expectedRecord: { ...before, [field]: value },
          },
        ]);
        check(
          (await call(editorRoute, 'POST', 'teacher-a', data)).status,
          409,
          'Every saved original identity/value/type field participates in CAS',
        );
      }
      const incomplete = { ...before };
      delete incomplete.createdAt;
      check(
        (
          await call(
            editorRoute,
            'POST',
            'teacher-a',
            input([
              { studentId: 'student-a', score: 6, grade: '', feedback: '', expectedRecord: incomplete },
            ]),
          )
        ).status,
        400,
        'Omitted original timestamp is validation failure',
      );
      check(saved(), before, 'Spoofed or incomplete expectations never change confirmed record');
      check(count('assessment_reviews'), 0, 'Spoofed evidence creates no attributable receipt');
    },
  );

  await scenario(
    'Forced event failure rolls back result changes receipt and evidence',
    async ({ secondPupil, legacy, saved, sqlite, input, call, denied, count }) => {
      await secondPupil();
      check(
        (
          await legacy([
            { studentId: 'student-a', score: 3 },
            { studentId: 'student-other', score: 4 },
          ])
        ).status,
        200,
        'Original results exist for rollback',
      );
      const before = [saved(), saved('student-other')];
      sqlite.exec(
        "CREATE TRIGGER synthetic_result_event_failure BEFORE INSERT ON assessment_review_entries WHEN NEW.student_id='student-other' BEGIN SELECT RAISE(ABORT,'synthetic_forced_result_rollback'); END",
      );
      const data = input(
        before.map((record, index) => ({
          studentId: index ? 'student-other' : 'student-a',
          score: 9,
          grade: '',
          feedback: '',
          expectedRecord: record,
        })),
      );
      await denied(
        await call(editorRoute, 'POST', 'teacher-a', data),
        500,
        'Unrelated injected internal failure is safely reported',
      );
      check(
        [saved(), saved('student-other')],
        before,
        'Event failure atomically restores every original result',
      );
      check(count('assessment_reviews'), 0, 'Rollback removes review receipt');
      check(count('assessment_review_entries'), 0, 'Rollback removes all events');
    },
  );

  await scenario(
    'Immutable reviewed receipts and changes preserve original evidence',
    async ({ save, sqlite, count, legacy, saved }) => {
      const first = await save();
      const original = saved();
      for (const [statement, id] of [
        ['UPDATE assessment_reviews SET reason=? WHERE id=?', first.review.id],
        ['DELETE FROM assessment_reviews WHERE id=?', first.review.id],
        ['UPDATE assessment_review_entries SET after_record=? WHERE review_id=?', first.review.id],
        ['DELETE FROM assessment_review_entries WHERE review_id=?', first.review.id],
      ]) {
        assert.throws(
          () =>
            statement.startsWith('UPDATE')
              ? sqlite
                  .prepare(statement)
                  .run(statement.includes('after_record') ? '{}' : 'Changed synthetic evidence.', id)
              : sqlite.prepare(statement).run(id),
          /immutable/i,
          'Database triggers prevent review/evidence rewriting',
        );
        checks++;
      }
      check(count('assessment_reviews'), 1, 'Original immutable receipt persists');
      check(count('assessment_review_entries'), 1, 'Original immutable change persists');
      check(
        (await legacy([{ studentId: 'student-a', score: 5 }])).status,
        200,
        'Legacy mutable replacement remains available',
      );
      check(saved().id, original.id, 'Legacy replacement preserves original result identity');
    },
  );

  await scenario(
    'Mixed existing and absent result rollback includes newly inserted tuple',
    async ({ secondPupil, legacy, saved, sqlite, input, call, denied, count }) => {
      await secondPupil();
      check(
        (await legacy([{ studentId: 'student-a', score: 4, grade: 'Original supplied grade', feedback: '' }]))
          .status,
        200,
        'One original result exists and second pair is absent',
      );
      const before = saved();
      check(saved('student-other'), null, 'Second original is explicitly absent');
      sqlite.exec(
        "CREATE TRIGGER synthetic_mixed_result_fault BEFORE INSERT ON assessment_review_entries WHEN NEW.student_id='student-other' BEGIN SELECT RAISE(ABORT,'synthetic_mixed_result_rollback'); END",
      );
      const data = input([
        {
          studentId: 'student-a',
          score: 5,
          grade: before.grade,
          feedback: before.feedback,
          expectedRecord: before,
        },
        { studentId: 'student-other', score: 0, grade: null, feedback: null, expectedRecord: null },
      ]);
      await denied(
        await call(editorRoute, 'POST', 'teacher-a', data),
        500,
        'Mid-event failure after update and insert reports safe internal error',
      );
      check(saved(), before, 'Existing original is restored by one-statement rollback');
      check(saved('student-other'), null, 'New tuple is removed by the same rollback');
      check(count('assessment_results'), 1, 'Only pre-existing confirmed tuple survives');
      check(count('assessment_reviews'), 0, 'Mixed rollback retains no receipt');
      check(count('assessment_review_entries'), 0, 'Mixed rollback retains no partial events');
    },
  );

  await scenario(
    'Whole original review hides transferred pupil in replay and filtered history',
    async ({ secondPupil, input, save, sqlite, history, call, count }) => {
      await secondPupil();
      const original = input([
        {
          studentId: 'student-a',
          score: 0,
          grade: null,
          feedback: 'First synthetic private feedback.',
          expectedRecord: null,
        },
        {
          studentId: 'student-other',
          score: 2,
          grade: '',
          feedback: 'Second synthetic private feedback.',
          expectedRecord: null,
        },
      ]);
      await save(original);
      sqlite.prepare("UPDATE students SET school_id='b' WHERE id='student-other'").run();
      const value = await history();
      check(value.total, 0, 'Transferred member hides whole review count');
      check(value.items, [], 'Transferred member hides whole immutable payload');
      check(
        (await history('teacher-a', '?studentId=student-a')).items,
        [],
        'Exact remaining-pupil filter cannot disclose foreign batch',
      );
      check(
        (await call(editorRoute, 'POST', 'teacher-a', original)).status,
        409,
        'Original UUID cannot disclose transferred batch',
      );
      check(count('assessment_reviews'), 1, 'Transfer preserves immutable evidence without publication');
    },
  );

  for (const [label, mutate] of [
    [
      'actor disabled',
      (sqlite) =>
        sqlite.prepare("UPDATE users SET disabled_at='synthetic-disabled' WHERE id='teacher-a'").run(),
    ],
    [
      'class reassigned',
      (sqlite) => sqlite.prepare("UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'").run(),
    ],
    [
      'pupil transferred',
      (sqlite) => sqlite.prepare("UPDATE students SET school_id='b' WHERE id='student-a'").run(),
    ],
  ])
    await scenario(
      'Committed save ' + label + ' before actual readback',
      async ({ input, atSql, sqlite, call, denied, count }) => {
        const { result } = await atSql(
          retrySql,
          2,
          () => mutate(sqlite),
          () => call(editorRoute, 'POST', 'teacher-a', input()),
        );
        await denied(result, 404, 'Current readback denies released evidence after late scope loss');
        check(
          count('assessment_reviews'),
          1,
          'Committed receipt remains durable despite unavailable acknowledgement',
        );
        check(
          count('assessment_results'),
          1,
          'Committed result remains durable for original request recovery',
        );
        check(count('assessment_review_entries'), 1, 'Committed exact changes remain durable');
      },
    );

  await scenario(
    'Reviewed account unlink does not alter staff record ownership',
    async ({ input, save, atSql, call, history }) => {
      const data = input();
      const first = await save(data);
      const { result } = await atSql(
        retrySql,
        1,
        () =>
          profiles.reviewProfileLink(
            { id: 'admin-a', role: 'admin', schoolId: 'a' },
            {
              profileType: 'student',
              profileId: 'student-a',
              userId: null,
              expectedVersion: 0,
              clientRequestId: crypto.randomUUID(),
              reviewConfirmed: true,
              reason: 'Synthetic reviewed learner account unlink for independent access.',
            },
          ),
        () => call(editorRoute, 'POST', 'teacher-a', data),
      );
      check(
        result.status,
        200,
        'Current staff replay relies on pupil school and original class, not pupil login mapping',
      );
      check(
        (await result.json()).review,
        first.review,
        'Unlink does not rewrite original educational evidence',
      );
      check((await history()).total, 1, 'Staff history remains scoped and available');
    },
  );

  await scenario(
    'Empty roster exact total cap101 and subset bypass denial',
    async ({ sqlite, db, schema, editor, input, call, count }) => {
      sqlite.prepare("UPDATE enrolments SET status='withdrawn' WHERE id='student-a-enrolment'").run();
      let value = await editor();
      check(value.roster.total, 0, 'Empty current roster is explicit');
      check(value.canReview, false, 'Empty roster cannot invent results');
      check(
        (await call(editorRoute, 'POST', 'teacher-a', input())).status,
        409,
        'Empty roster denies new reviewed write',
      );
      const pupils = Array.from({ length: 101 }, (_, index) => ({
        id: 'bounded-' + String(index).padStart(3, '0'),
        schoolId: 'a',
        firstName: 'Bounded',
        lastName: String(index).padStart(3, '0'),
        admissionNumber: 'bounded-' + index,
        dateOfBirth: '2012-01-01',
        gradeLevel: '8',
        createdAt: stamp,
        updatedAt: stamp,
      }));
      await db.insert(schema.students).values(pupils);
      await db.insert(schema.enrolments).values(
        pupils.map((pupil) => ({
          id: pupil.id + '-enrolment',
          studentId: pupil.id,
          classId: 'class-a',
          status: 'active',
          enrolledAt: stamp,
          createdAt: stamp,
          updatedAt: stamp,
        })),
      );
      value = await editor();
      check(value.roster.total, 101, 'Exact current total includes undisplayed pupils');
      check(value.roster.items.length, 100, 'Snapshot list is bounded');
      check(value.roster.truncated, true, 'Cap truncation is explicit');
      check(value.canReview, false, 'Truncation blocks whole-roster review');
      check(
        (
          await call(
            editorRoute,
            'POST',
            'teacher-a',
            input([{ studentId: pupils[0].id, score: 1, grade: null, feedback: null, expectedRecord: null }]),
          )
        ).status,
        409,
        'Dirty subset cannot bypass roster cap',
      );
      sqlite
        .prepare('UPDATE enrolments SET status=? WHERE id=?')
        .run('withdrawn', pupils[100].id + '-enrolment');
      value = await editor();
      check(value.roster.total, 100, 'Exactly 100 current pupils fits bound');
      check(value.canReview, true, 'Exact-cap unique current roster may be reviewed');
      check(
        (
          await call(
            editorRoute,
            'POST',
            'teacher-a',
            input([{ studentId: pupils[0].id, score: 1, grade: null, feedback: null, expectedRecord: null }]),
          )
        ).status,
        201,
        'Dirty subset within whole checked bound succeeds',
      );
      check(count('assessment_reviews'), 1, 'Only eligible exact-cap review persists');
    },
  );

  for (const duplicateStatus of ['active', 'withdrawn'])
    await scenario(
      'Preserved whole pair legacy enrolment ambiguity ' + duplicateStatus,
      async ({ editor, input, call, count }) => {
        const value = await editor();
        check(value.roster.total, 1, 'Current roster counts distinct pupils');
        check(value.roster.items[0].enrolmentRows, 2, 'Whole enrolment pair ambiguity remains explicit');
        check(value.canReview, false, 'Preserved enrolment ambiguity blocks reviewed write');
        check(
          (await call(editorRoute, 'POST', 'teacher-a', input())).status,
          409,
          'Duplicate evidence is not silently repaired',
        );
        check(count('assessment_reviews'), 0, 'Ambiguous roster creates no fabricated evidence');
      },
      ({ sqlite }) =>
        sqlite
          .prepare(
            'INSERT INTO enrolments(id,student_id,class_id,status,enrolled_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
          )
          .run('legacy-duplicate-enrolment', 'student-a', 'class-a', duplicateStatus, stamp, stamp, stamp),
    );

  await scenario(
    'Preserved duplicate results exact count bounded records and no arbitrary winner',
    async ({ editor, input, call, count }) => {
      const value = await editor();
      const row = value.roster.items[0];
      check(row.resultRows, 12, 'Duplicate count is exact beyond preview');
      check(row.records.length, 10, 'Duplicate evidence preview is bounded');
      check(row.recordsTruncated, true, 'Duplicate preview truncation is declared');
      check(row.record, null, 'No arbitrary duplicate is selected as original record');
      check(row.needsReview, true, 'Duplicate results require separate repair');
      check(value.canReview, false, 'Duplicate current results block reviewed writes');
      check(
        (await call(editorRoute, 'POST', 'teacher-a', input())).status,
        409,
        'Reviewed write preserves unresolved duplicates',
      );
      check(count('assessment_results'), 12, 'Every original duplicate remains intact');
    },
    ({ sqlite }) => {
      for (let index = 0; index < 12; index++)
        sqlite
          .prepare(
            'INSERT INTO assessment_results(id,assessment_id,student_id,score,grade,feedback,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
          )
          .run(
            'legacy-result-' + index,
            'assessment-a',
            'student-a',
            index,
            'Saved legacy grade',
            'Saved legacy feedback',
            stamp,
            stamp,
          );
    },
  );

  for (const maximum of ['synthetic-invalid-maximum', -1, 1.5, 9007199254740992])
    await scenario(
      'Malformed saved maximum never coerced ' + maximum,
      async ({ sqlite, editor, input, call, count }) => {
        sqlite.prepare("UPDATE assessments SET max_score=? WHERE id='assessment-a'").run(maximum);
        const value = await editor();
        check(value.invalidMaximum, true, 'Invalid saved maximum is explicit');
        check(value.canReview, false, 'Invalid maximum blocks reviewed results');
        check(
          (await call(editorRoute, 'POST', 'teacher-a', input())).status,
          409,
          'Reviewed write never coerces malformed maximum',
        );
        check(count('assessment_results'), 0, 'Malformed maximum creates no result');
      },
    );

  await scenario(
    'Literal invalid assessment date is disclosed without a new calendar policy',
    async ({ sqlite, editor }) => {
      sqlite.prepare("UPDATE assessments SET date='synthetic-invalid-date' WHERE id='assessment-a'").run();
      const value = await editor();
      check(value.invalidDate, true, 'Invalid legacy calendar date is explicitly labelled');
      check(value.assessment.date, 'synthetic-invalid-date', 'Raw stored calendar evidence remains exact');
    },
  );

  await scenario(
    'Exact calendar disclosure leap centuries unrestricted future and maximum zero',
    async ({ sqlite, editor, input, save, saved }) => {
      for (const [date, invalid] of [
        ['2000-02-29', false],
        ['1900-02-29', true],
        ['2026-02-30', true],
        ['2026-2-01', true],
        ['2099-12-31', false],
      ]) {
        sqlite.prepare("UPDATE assessments SET date=? WHERE id='assessment-a'").run(date);
        const value = await editor();
        check(
          value.invalidDate,
          invalid,
          'Calendar disclosure uses an exact real date without prescribing school-day eligibility',
        );
        check(value.assessment.date, date, 'Stored literal calendar evidence is retained exactly');
      }
      sqlite.prepare("UPDATE assessments SET max_score=0 WHERE id='assessment-a'").run();
      const value = await editor();
      check(value.invalidMaximum, false, 'Maximum zero is technically valid');
      check(value.canReview, true, 'Explicit zero-maximum assessment may be reviewed');
      await save(input());
      check(saved().score, 0, 'Exact reviewed zero remains legitimate without grade or norm calculation');
    },
  );

  await scenario(
    'Exact reordered UUID replay and cross-school UUID collision privacy',
    async ({ secondPupil, input, save, call, count, sqlite }) => {
      await secondPupil();
      const original = input([
        { studentId: 'student-other', score: 2, grade: '', feedback: '', expectedRecord: null },
        { studentId: 'student-a', score: 0, grade: null, feedback: null, expectedRecord: null },
      ]);
      const first = await save(original);
      const replay = await save({ ...original, entries: [...original.entries].reverse() }, 'teacher-a', 200);
      check(replay.review, first.review, 'Equivalent entry order preserves original exact UUID outcome');
      const foreignMetadata = {
        ...sqlite
          .prepare(
            "SELECT id,class_id classId,title,kind,max_score maxScore,date,created_at createdAt,updated_at updatedAt,typeof(max_score) maxScoreType FROM assessments WHERE id='assessment-b'",
          )
          .get(),
      };
      const foreign = {
        ...original,
        expectedAssessment: foreignMetadata,
        entries: [{ studentId: 'student-b', score: 2, grade: null, feedback: null, expectedRecord: null }],
      };
      const response = await call(editorRoute, 'POST', 'admin-b', foreign, 'assessment-b');
      check(response.status, 409, 'Cross-school reused UUID has only a safe conflict');
      keys(
        await response.json(),
        ['error'],
        'Cross-school UUID collision discloses no existing source receipt',
      );
      check(count('assessment_reviews'), 1, 'Collision appends no foreign or duplicate review');
      check(count('assessment_results'), 2, 'Collision leaves original batch untouched');
    },
  );

  for (const [label, statement] of [
    ['withdrawal', "UPDATE enrolments SET status='withdrawn' WHERE id='student-a-enrolment'"],
    ['pupil transfer', "UPDATE students SET school_id='b' WHERE id='student-a'"],
    ['enrolment class move', "UPDATE enrolments SET class_id='class-other' WHERE id='student-a-enrolment'"],
  ])
    await scenario('Coherent actual snapshot ' + label, async ({ sqlite, atSql, call }) => {
      const { result } = await atSql(
        snapshotSql,
        1,
        () => sqlite.exec(statement),
        () => call(),
      );
      check(result.status, 200, 'Current class remains authorized without the former active pupil');
      const value = await result.json();
      check(value.roster.total, 0, 'Current SQL total excludes the unavailable pupil');
      check(value.roster.items, [], 'Current snapshot never combines previous roster with later evidence');
      check(value.canReview, false, 'Changed empty roster cannot be reviewed');
    });

  for (const operation of ['history', 'replay'])
    await scenario(
      'Late pupil transfer before actual ' + operation + ' SELECT',
      async ({ input, save, atSql, sqlite, call, count }) => {
        const data = input();
        await save(data);
        const { result } = await atSql(
          operation === 'history' ? snapshotSql : retrySql,
          1,
          () => sqlite.prepare("UPDATE students SET school_id='b' WHERE id='student-a'").run(),
          () =>
            call(
              operation === 'history' ? historyRoute : editorRoute,
              operation === 'history' ? 'GET' : 'POST',
              'teacher-a',
              operation === 'replay' ? data : undefined,
            ),
        );
        check(
          result.status,
          operation === 'history' ? 200 : 409,
          'Actual historical pupil scope excludes transferred batch',
        );
        const value = await result.json();
        if (operation === 'history') {
          check(value.total, 0, 'Transferred historical batch is excluded from exact count');
          check(value.items, [], 'Transferred historical batch is excluded from payload');
        } else keys(value, ['error'], 'Transferred replay reveals no immutable evidence');
        check(count('assessment_reviews'), 1, 'Transfer retains original immutable review');
      },
    );

  for (const score of [-1, 1.5, 'synthetic-invalid-score'])
    await scenario(
      'Explicit repair preserves exact invalid saved score ' + score,
      async ({ legacy, sqlite, saved, editor, input, save }) => {
        check(
          (await legacy([{ studentId: 'student-a', score: 4, grade: 'Saved supplied grade', feedback: '' }]))
            .status,
          200,
          'Original confirmed result exists',
        );
        sqlite.prepare("UPDATE assessment_results SET score=? WHERE assessment_id='assessment-a'").run(score);
        const before = saved();
        const value = await editor();
        check(value.roster.items[0].invalidResult, true, 'Invalid single saved score is disclosed');
        check(value.canReview, true, 'Unique serializable invalid score can be explicitly repaired');
        const repaired = await save(
          input([
            {
              studentId: 'student-a',
              score: 0,
              grade: before.grade,
              feedback: before.feedback,
              expectedRecord: before,
            },
          ]),
        );
        check(
          repaired.review.changes[0].beforeRecord,
          before,
          'Repair retains raw original type and value as immutable evidence',
        );
        check(saved().score, 0, 'Explicit reviewed repair saves legitimate zero');
        check(saved().scoreType, 'integer', 'Repair stores normalized integer score');
      },
    );

  for (const column of ['max_score', 'score'])
    await scenario(
      'Opaque legacy numeric blob blocks reviewed mutation ' + column,
      async ({ sqlite, legacy, editor, input, call, count }) => {
        if (column === 'score')
          check(
            (await legacy([{ studentId: 'student-a', score: 4 }])).status,
            200,
            'Saved result exists before opaque legacy control',
          );
        sqlite.exec(
          column === 'max_score'
            ? "UPDATE assessments SET max_score=x'0102' WHERE id='assessment-a'"
            : "UPDATE assessment_results SET score=x'0102' WHERE assessment_id='assessment-a'",
        );
        const value = await editor();
        check(value.canReview, false, 'Opaque numeric evidence blocks review without coercing blob to zero');
        if (column === 'max_score') {
          check(value.assessment.maxScoreType, 'blob', 'Maximum exposes opaque storage type');
          check(value.assessment.maxScore, null, 'Maximum blob is safely represented as null');
        } else {
          check(value.roster.items[0].record.scoreType, 'blob', 'Saved result exposes opaque storage type');
          check(value.roster.items[0].record.score, null, 'Saved result blob is safely represented as null');
        }
        check(
          (await call(editorRoute, 'POST', 'teacher-a', input())).status,
          409,
          'Opaque original blocks actual reviewed mutation',
        );
        check(count('assessment_reviews'), 0, 'Opaque original remains without fabricated review');
      },
    );

  for (const unsafe of ['9007199254740993', '-9007199254740993'])
    await scenario(
      'Unsafe legacy integer is explicitly read-only without rounded CAS evidence ' + unsafe,
      async ({ sqlite, legacy, editor, input, call, count }) => {
        check(
          (await legacy([{ studentId: 'student-a', score: 0 }])).status,
          200,
          'Original result exists before unsafe legacy control',
        );
        sqlite.exec('UPDATE assessment_results SET score=' + unsafe + " WHERE assessment_id='assessment-a'");
        const exact = sqlite
          .prepare(
            "SELECT CAST(score AS TEXT) value FROM assessment_results WHERE assessment_id='assessment-a'",
          )
          .get().value;
        check(exact, unsafe, 'SQLite preserves original integer beyond JavaScript safe range');
        const value = await editor();
        check(
          value.roster.items[0].record.score,
          exact,
          'Snapshot exposes unsafe integer as exact string rather than rounded JavaScript number',
        );
        check(
          value.roster.items[0].record.scoreType,
          'integer',
          'Exact string representation retains original integer storage type',
        );
        check(value.roster.items[0].invalidResult, true, 'Unsafe legacy integer is invalid saved evidence');
        check(value.canReview, false, 'Unrepresentable original must not offer a reviewable CAS');
        check(
          value.roster.items[0].needsReview,
          true,
          'Unsafe saved numeric evidence explicitly needs separate review',
        );
        check(
          (await call(editorRoute, 'POST', 'teacher-a', input())).status,
          409,
          'Unsafe original blocks actual reviewed mutation',
        );
        check(count('assessment_reviews'), 0, 'Unrepresentable evidence creates no fabricated review');
        check(
          sqlite
            .prepare(
              "SELECT CAST(score AS TEXT) value FROM assessment_results WHERE assessment_id='assessment-a'",
            )
            .get().value,
          exact,
          'Unsafe original remains exact and unchanged',
        );
      },
    );

  await scenario(
    'Unsafe integer injected after preview is blocked by actual trigger',
    async ({ sqlite, legacy, saved, input, atSql, call, denied, count }) => {
      check(
        (await legacy([{ studentId: 'student-a', score: 5 }])).status,
        200,
        'Original safe result exists',
      );
      const data = input([
        { studentId: 'student-a', score: 6, grade: null, feedback: null, expectedRecord: saved() },
      ]);
      const { result } = await atSql(
        insertSql,
        1,
        () =>
          sqlite.exec(
            "UPDATE assessment_results SET score=9007199254740993 WHERE assessment_id='assessment-a'",
          ),
        () => call(editorRoute, 'POST', 'teacher-a', data),
      );
      await denied(result, 409, 'Actual trigger blocks newly unrepresentable evidence');
      check(
        sqlite
          .prepare(
            "SELECT CAST(score AS TEXT) value FROM assessment_results WHERE assessment_id='assessment-a'",
          )
          .get().value,
        '9007199254740993',
        'Unsafe concurrent original is preserved exactly',
      );
      check(count('assessment_reviews'), 0, 'Late unsafe integer creates no receipt');
    },
  );

  await scenario(
    'Unsafe untouched classmate blocks the actual whole-roster write',
    async ({ secondPupil, sqlite, legacy, saved, input, atSql, call, denied, count }) => {
      await secondPupil();
      check(
        (
          await legacy([
            { studentId: 'student-a', score: 5 },
            { studentId: 'student-other', score: 4 },
          ])
        ).status,
        200,
        'Both safe original results exist',
      );
      const before = saved();
      const data = input([
        { studentId: 'student-a', score: 6, grade: null, feedback: null, expectedRecord: before },
      ]);
      const { result } = await atSql(
        insertSql,
        1,
        () =>
          sqlite.exec(
            "UPDATE assessment_results SET score=9007199254740993 WHERE assessment_id='assessment-a' AND student_id='student-other'",
          ),
        () => call(editorRoute, 'POST', 'teacher-a', data),
      );
      await denied(result, 409, 'Actual global numeric guard rejects unsafe untouched pupil after preview');
      check(saved(), before, 'Valid dirty pupil is not partially rewritten');
      check(count('assessment_reviews'), 0, 'Unsafe classmate creates no misleading reviewed evidence');
    },
  );

  for (const column of ['max_score', 'score'])
    for (const sign of ['', '-'])
      await scenario(
        'Nonfinite REAL disclosure is exact and read-only ' + column + sign,
        async ({ sqlite, legacy, editor, input, call, count }) => {
          if (column === 'score')
            check(
              (await legacy([{ studentId: 'student-a', score: 4 }])).status,
              200,
              'Original result exists before nonfinite legacy control',
            );
          sqlite.exec(
            column === 'max_score'
              ? 'UPDATE assessments SET max_score=' + sign + "1e999 WHERE id='assessment-a'"
              : 'UPDATE assessment_results SET score=' + sign + "1e999 WHERE assessment_id='assessment-a'",
          );
          const value = await editor();
          const record = column === 'max_score' ? value.assessment : value.roster.items[0].record;
          check(
            record[column === 'max_score' ? 'maxScore' : 'score'],
            sign + 'Inf',
            'Nonfinite SQL REAL displays exact CAST text rather than HTTP null',
          );
          check(
            record[column === 'max_score' ? 'maxScoreType' : 'scoreType'],
            'real',
            'Nonfinite projection retains original REAL storage type',
          );
          check(value.canReview, false, 'Nonfinite active evidence requires separate review');
          if (column === 'score')
            check(
              value.roster.items[0].needsReview,
              true,
              'Nonfinite pupil evidence is explicitly read-only',
            );
          check(
            (await call(editorRoute, 'POST', 'teacher-a', input())).status,
            409,
            'Nonfinite evidence cannot create a reviewed mutation',
          );
          check(count('assessment_reviews'), 0, 'Nonfinite original receives no fabricated receipt');
        },
      );

  await scenario(
    'Historical duplicate outside current active roster is retained without blocking valid review',
    async ({ editor, input, save, count, sqlite }) => {
      const value = await editor();
      check(value.roster.total, 1, 'Historical non-roster pupil is not displayed as editable');
      check(
        value.canReview,
        true,
        'Historical duplicates outside editable roster do not imply current ambiguity',
      );
      const originals = sqlite
        .prepare("SELECT * FROM assessment_results WHERE student_id='student-other' ORDER BY id")
        .all();
      await save(input());
      check(
        sqlite.prepare("SELECT * FROM assessment_results WHERE student_id='student-other' ORDER BY id").all(),
        originals,
        'Every historical duplicate remains untouched',
      );
      check(count('assessment_results'), 3, 'Only requested active result is added');
    },
    ({ sqlite }) => {
      for (const id of ['legacy-historical-one', 'legacy-historical-two'])
        sqlite
          .prepare(
            'INSERT INTO assessment_results(id,assessment_id,student_id,score,grade,feedback,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
          )
          .run(
            id,
            'assessment-a',
            'student-other',
            4,
            'Legacy historical grade',
            'Legacy historical feedback',
            stamp,
            stamp,
          );
    },
  );

  await scenario(
    'Late preserved ambiguity activation blocks actual reviewed insert',
    async ({ sqlite, input, atSql, call, denied, count }) => {
      const { result } = await atSql(
        insertSql,
        1,
        () => sqlite.prepare("UPDATE enrolments SET status='active' WHERE id='legacy-inactive-one'").run(),
        () => call(editorRoute, 'POST', 'teacher-a', input()),
      );
      await denied(result, 409, 'Actual trigger rechecks ambiguity activated after snapshot');
      check(count('assessment_results'), 0, 'Late ambiguity creates no partial result');
      check(count('assessment_reviews'), 0, 'Late ambiguity creates no receipt');
    },
    ({ sqlite }) =>
      sqlite.exec(
        "INSERT INTO enrolments(id,student_id,class_id,status,enrolled_at,created_at,updated_at) VALUES ('legacy-inactive-one','student-other','class-a','withdrawn','" +
          stamp +
          "','" +
          stamp +
          "','" +
          stamp +
          "'),('legacy-inactive-two','student-other','class-a','withdrawn','" +
          stamp +
          "','" +
          stamp +
          "','" +
          stamp +
          "')",
      ),
  );

  await scenario(
    'Roster growth after preview is checked by actual mutation',
    async ({ db, schema, input, atSql, call, denied, count }) => {
      const { result } = await atSql(
        insertSql,
        1,
        async () => {
          const pupils = Array.from({ length: 100 }, (_, index) => ({
            id: 'late-pupil-' + index,
            schoolId: 'a',
            firstName: 'Synthetic late',
            lastName: String(index),
            admissionNumber: 'late-pupil-' + index,
            dateOfBirth: '2012-01-01',
            gradeLevel: '8',
            createdAt: stamp,
            updatedAt: stamp,
          }));
          await db.insert(schema.students).values(pupils);
          await db.insert(schema.enrolments).values(
            pupils.map((pupil) => ({
              id: pupil.id + '-enrolment',
              studentId: pupil.id,
              classId: 'class-a',
              status: 'active',
              enrolledAt: stamp,
              createdAt: stamp,
              updatedAt: stamp,
            })),
          );
        },
        () => call(editorRoute, 'POST', 'teacher-a', input()),
      );
      await denied(result, 409, 'Actual trigger rejects whole roster over cap after preview');
      check(count('assessment_results'), 0, 'Late cap creates no partial results');
      check(count('assessment_reviews'), 0, 'Late cap creates no receipt');
    },
  );

  await scenario(
    'History exact latest100 and filters no legacy backfill',
    async ({ input, save, saved, history, sqlite, count }) => {
      for (let index = 0; index < 102; index++)
        await save(
          input([
            {
              studentId: 'student-a',
              score: index % 2,
              grade: null,
              feedback: 'Synthetic history entry ' + index,
              expectedRecord: saved(),
            },
          ]),
        );
      const value = await history();
      check(value.total, 102, 'History total remains exact');
      check(value.items.length, 100, 'History preview caps latest100');
      check(value.truncated, true, 'Omitted older reviews are explicit');
      check(
        value.items.map((row) => row.id),
        sqlite
          .prepare('SELECT id FROM assessment_reviews ORDER BY created_at DESC,id DESC LIMIT 100')
          .all()
          .map((row) => row.id),
        'Newest-first ordering is deterministic',
      );
      check(
        (await history('teacher-a', '?studentId=student-other')).total,
        0,
        'Exact pupil filter excludes other history',
      );
      check(
        (await history('teacher-a', '?studentId=student-a')).total,
        102,
        'Exact requested pupil retains only its own current-scoped review inventory',
      );
      check(
        count('assessment_review_entries'),
        102,
        'Every reviewed replacement has exact attributable evidence',
      );
    },
  );

  await scenario(
    'Legacy concurrent200 omitted fields clear and no synthetic reviewed backfill',
    async ({ legacy, saved, count }) => {
      check(
        (
          await legacy([
            {
              studentId: 'student-a',
              score: 4,
              grade: 'Original supplied grade',
              feedback: 'Original supplied feedback',
            },
          ])
        ).status,
        200,
        'Legacy baseline persists',
      );
      const replies = await Promise.all([
        legacy([{ studentId: 'student-a', score: 5 }]),
        legacy([{ studentId: 'student-a', score: 6, grade: 'Concurrent supplied grade' }]),
      ]);
      check(
        replies.map((reply) => reply.status),
        [200, 200],
        'Legacy concurrent replacement statuses remain200',
      );
      check(count('assessment_results'), 1, 'Legacy concurrent replacement preserves pair uniqueness');
      check(
        (await legacy([{ studentId: 'student-a', score: 0 }])).status,
        200,
        'Legacy explicit zero remains supported',
      );
      check([saved().grade, saved().feedback], [null, null], 'Legacy omitted grade and feedback still clear');
      check(count('assessment_reviews'), 0, 'Legacy saves receive no invented review receipts');
    },
  );

  check(externalCalls, 0, 'No providers real records notifications or external calls');
  console.log(
    'Assessment review independent access contract: ' +
      checks +
      ' checks passed across ' +
      scenarios +
      ' fresh authenticated production-D1/SQLite scenarios.',
  );
  console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0, scenarios, externalCalls }));
} finally {
  globalThis.fetch = previousFetch;
}
