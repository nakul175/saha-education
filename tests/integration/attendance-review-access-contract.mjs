// Independent authenticated-route contracts over real SQLite and final migrations.
// Each authority mutation happens at the actual awaited SQL boundary. All data is synthetic.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { bindings, freshDatabase, seedSecurityData, load, root, stamp } from '../support/security-db.mjs';

const editorRoute = await load('app/api/classes/[id]/attendance-editor/route.ts');
const historyRoute = await load('app/api/classes/[id]/attendance-editor/history/route.ts');
const legacyRoute = await load('app/api/attendance/route.ts');
const sessions = await load('lib/education/session.ts');
const auth = await load('lib/education/auth.ts');
const profiles = await load('lib/education/profile-links.ts');
const origin = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = origin;
let checks = 0, scenarios = 0, externalCalls = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const keys = (value, fields, message) => check(Object.keys(value).sort(), [...fields].sort(), message);
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => { externalCalls++; throw new Error('Independent attendance contracts must remain offline.'); };
const actors = ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'teacher-b', 'guardian-a', 'student-user-a'];
const date = '2026-10-05';
const snapshotSql = /from "classes" where/i;
const retrySql = /from "attendance_reviews" where/i;
const insertSql = /^insert into "attendance_reviews"/i;
const historySql = /with visible as[\s\S]*from "classes" where/i;

function input(entries = [{ studentId: 'student-a', status: 'present', note: null, expectedRecord: null }], extra = {}) {
  return { date, clientRequestId: crypto.randomUUID(), reviewConfirmed: true,
    reason: 'Synthetic independently reviewed attendance evidence.', entries, ...extra };
}
function publicReview(value) {
  keys(value, ['id', 'classId', 'date', 'reviewedBy', 'reason', 'createdAt', 'changes'], 'Review omits internal request hash, JSON envelope and school storage columns');
  check(value.classId, 'class-a', 'Review retains the authorized original class');
  for (const change of value.changes) {
    keys(change, ['studentId', 'beforeRecord', 'afterRecord'], 'History exposes only attributable mark changes');
    for (const record of [change.beforeRecord, change.afterRecord].filter(Boolean)) keys(record, ['id', 'status', 'note', 'recordedBy', 'createdAt', 'updatedAt'], 'Record evidence preserves only saved attendance fields');
  }
  for (const privateValue of ['@example.invalid', 'identity.example.invalid', 'sub-teacher', '2012-01-01', 'guardian-profile', 'SECRET_FOREIGN_MARK']) check(JSON.stringify(value).includes(privateValue), false, 'Review excludes private identity, birth date and unrelated marks');
}
async function scenario(name, action, legacySetup) {
  const fixture = freshDatabase(legacySetup ? { beforeMigration: '0009_academic_integrity.sql' } : undefined);
  const { db, sqlite, schema } = fixture;
  await seedSecurityData(db, schema);
  if (legacySetup) {
    await legacySetup(fixture);
    const files = readdirSync(join(root, 'drizzle')).filter(file => /^\d.*\.sql$/.test(file)).sort();
    for (const file of files.slice(files.indexOf('0009_academic_integrity.sql'))) sqlite.exec(readFileSync(join(root, 'drizzle', file), 'utf8').replaceAll('--> statement-breakpoint', ''));
  }
  const cookies = {};
  for (const actor of actors) cookies[actor] = (await sessions.createSession(actor)).split(';')[0];
  function request(actor, method, payload, path = '/api/classes/class-a/attendance-editor', suppliedOrigin = origin, raw = false) {
    const headers = { origin: suppliedOrigin };
    if (actor) headers.cookie = cookies[actor];
    const init = { method, headers };
    if (payload !== undefined) { headers['content-type'] = 'application/json'; init.body = raw ? payload : JSON.stringify(payload); }
    return new Request(origin + path, init);
  }
  async function call(route = editorRoute, method = 'GET', actor = 'teacher-a', payload, classId = 'class-a', suffix = '?date=' + date, suppliedOrigin = origin, raw = false) {
    return route[method](request(actor, method, payload, '/api/classes/' + classId + '/attendance-editor' + suffix, suppliedOrigin, raw), { params: Promise.resolve({ id: classId }) });
  }
  async function editor(actor = 'teacher-a', selectedDate = date) {
    const response = await call(editorRoute, 'GET', actor, undefined, 'class-a', '?date=' + selectedDate);
    check(response.status, 200, name + ': authorized editor snapshot succeeds');
    check(response.headers.get('cache-control'), 'no-store', 'Editor snapshots are not cached');
    return response.json();
  }
  async function save(data = input(), actor = 'teacher-a', status = 201) {
    const response = await call(editorRoute, 'POST', actor, data, 'class-a', '');
    check(response.status, status, name + ': reviewed save has expected status');
    check(response.headers.get('cache-control'), 'no-store', 'Review acknowledgements are not cached');
    const result = await response.json();
    if (status === 201 || status === 200) { keys(result, ['review', 'replayed'], 'Save returns only immutable review and exact-replay indicator'); publicReview(result.review); }
    return result;
  }
  async function history(actor = 'teacher-a', query = '?date=' + date) {
    const response = await call(historyRoute, 'GET', actor, undefined, 'class-a', query);
    check(response.status, 200, name + ': current staff history succeeds');
    check(response.headers.get('cache-control'), 'no-store', 'History is not cached');
    const value = await response.json();
    keys(value, ['items', 'total', 'limit', 'truncated'], 'History reports its exact total and bounded list');
    check(value.limit, 100, 'History cap is explicit');
    check(value.truncated, value.total > 100, 'History reports honest truncation');
    for (const review of value.items) publicReview(review);
    return value;
  }
  async function legacy(entries, selectedDate = date, actor = 'teacher-a') {
    return legacyRoute.POST(request(actor, 'POST', { classId: 'class-a', date: selectedDate, entries }, '/api/attendance'));
  }
  function count(table) { return sqlite.prepare('SELECT count(*) n FROM ' + table).get().n; }
  function saved(studentId = 'student-a', selectedDate = date) {
    const row = sqlite.prepare('SELECT id,status,note,recorded_by recordedBy,created_at createdAt,updated_at updatedAt FROM attendance WHERE class_id=? AND student_id=? AND date=?').get('class-a', studentId, selectedDate);
    return row ? { ...row } : null;
  }
  async function secondPupil() {
    await db.insert(schema.enrolments).values({ id: 'second-pupil-class-a', classId: 'class-a', studentId: 'student-other', status: 'active', enrolledAt: stamp, createdAt: stamp, updatedAt: stamp });
  }
  // Intercept the promise boundary rather than service validation or statement construction.
  async function atSql(pattern, occurrence, mutate, action) {
    let matches = 0, injected = false; const executed = [];
    const chain = new Set(['from', 'select', 'where', 'limit', 'orderBy', 'offset', 'leftJoin', 'innerJoin', 'groupBy', 'having', 'values', 'set', 'onConflictDoNothing', 'onConflictDoUpdate', 'returning']);
    let observed;
    function wrap(query) {
      return new Proxy(query, { get(target, member) {
        if (member === 'then') return (fulfilled, rejected) => (async () => {
          const sql = target.toSQL().sql;
          if (pattern.test(sql) && ++matches === occurrence) {
            injected = true; globalThis.__sahaTestDb = db;
            try { await mutate(); } finally { globalThis.__sahaTestDb = observed; }
          }
          executed.push(sql); return await target;
        })().then(fulfilled, rejected);
        const value = Reflect.get(target, member, target);
        if (typeof value !== 'function') return value;
        return (...args) => { const result = value.apply(target, args); return chain.has(member) && result && typeof result === 'object' ? wrap(result) : result; };
      } });
    }
    observed = new Proxy(db, { get(target, member) {
      if (['select', 'selectDistinct', 'insert', 'update', 'delete'].includes(member)) return (...args) => wrap(target[member](...args));
      const value = Reflect.get(target, member, target); return typeof value === 'function' ? value.bind(target) : value;
    } });
    globalThis.__sahaTestDb = observed;
    let result;
    try { result = await action(); } finally { globalThis.__sahaTestDb = db; }
    check(injected, true, name + ': adversarial mutation reached the actual awaited SQL statement');
    return { result, executed, matches };
  }
  async function denied(response, status, message) {
    check(response.status, status, message);
    const value = await response.json();
    keys(value, ['error'], 'Denied response contains only safe error text');
    check(JSON.stringify(value).includes('SECRET'), false, 'Denied response discloses no attendance evidence');
  }
  try { await action({ ...fixture, cookies, request, call, editor, save, history, legacy, count, saved, secondPupil, atSql, denied }); scenarios++; }
  finally { globalThis.__sahaTestDb = db; sqlite.close(); }
}

try {
  await scenario('Authentication role ordering and private class scope', async ({ call, request, count, denied }) => {
    for (const [route, method] of [[editorRoute, 'GET'], [editorRoute, 'POST'], [historyRoute, 'GET']]) {
      await denied(await call(route, method, null, method === 'POST' ? input() : undefined), 401, 'Anonymous editor, review and history denied');
      for (const actor of ['guardian-a', 'student-user-a']) await denied(await call(route, method, actor, method === 'POST' ? '{invalid' : undefined, 'class-a', '?date=bad', origin, true), 403, 'Family role denied before malformed body or date parsing');
      for (const actor of ['admin-b', 'teacher-b', 'teacher-other']) await denied(await call(route, method, actor, method === 'POST' ? input() : undefined), 404, 'Foreign school and unassigned class remain private');
    }
    await denied(await call(editorRoute, 'POST', 'teacher-a', input(), 'class-a', '', 'https://attacker.example.invalid'), 403, 'Review requires the authorized request origin');
    const forged = new Request(origin + '/api/classes/class-a/attendance-editor?date=' + date, { headers: { cookie: 'saha_demo_role=admin', 'x-user-id': 'admin-a' } });
    await denied(await editorRoute.GET(forged, { params: Promise.resolve({ id: 'class-a' }) }), 401, 'Public role and account hints cannot authenticate');
    for (const raw of ['{invalid', ' '.repeat(128 * 1024 + 1)]) await denied(await editorRoute.POST(request('teacher-a', 'POST', raw, undefined, origin, true), { params: Promise.resolve({ id: 'class-a' }) }), 400, 'Malformed and over-limit bodies are safely rejected');
    check(count('attendance'), 0, 'Denied input creates no marks'); check(count('attendance_reviews'), 0, 'Denied input creates no review receipts');
  });

  await scenario('Strict calendar and explicit full review evidence', async ({ call, count, editor, save }) => {
    const dates = ['2026-02-30', '2025-02-29', '2026-04-31', '2026-2-01', '2026-10-05T00:00:00.000Z', '', 'not-a-date'];
    for (const value of dates) {
      check((await call(editorRoute, 'GET', 'teacher-a', undefined, 'class-a', '?date=' + encodeURIComponent(value))).status, 400, 'Snapshot requires an exact real calendar date');
      check((await call(editorRoute, 'POST', 'teacher-a', input(undefined, { date: value }), 'class-a', '')).status, 400, 'Review requires an exact real calendar date');
    }
    const row = { studentId: 'student-a', status: 'present', note: null, expectedRecord: null };
    const invalid = [
      { ...input(), reviewConfirmed: false }, { ...input(), reviewConfirmed: undefined }, { ...input(), clientRequestId: 'bad' },
      { ...input(), reason: 'short' }, { ...input(), reason: 'x'.repeat(501) }, { ...input(), reason: '😀'.repeat(5) }, { ...input(), reason: '😀'.repeat(501) },
      { ...input(), reason: 'Synthetic\nreview reason.' }, { ...input(), reason: 'Synthetic\u0000review reason.' },
      { ...input(), reviewedBy: 'admin-a' }, { ...input(), entries: [] }, { ...input(), entries: [row, row] },
      { ...input(), entries: [{ ...row, status: 'unknown' }] }, { ...input(), entries: [{ ...row, note: undefined }] },
      { ...input(), entries: [{ ...row, expectedRecord: undefined }] }, { ...input(), entries: [{ ...row, note: 'x'.repeat(2001) }] },
      { ...input(), entries: [{ ...row, id: 'spoof-mark-id' }] }, { ...input(), entries: [{ ...row, expectedRecord: { id: 'x', status: 'absent', note: null, recordedBy: 'teacher-a', createdAt: stamp } }] },
      { ...input(), entries: Array.from({ length: 101 }, (_, i) => ({ ...row, studentId: 'unmapped-' + i })) },
    ];
    for (const value of invalid) check((await call(editorRoute, 'POST', 'teacher-a', value, 'class-a', '')).status, 400, 'Strict reviewed envelope rejects missing, spoofed, duplicate, oversized or invalid fields');
    check(count('attendance_reviews'), 0, 'All invalid reviews remain unrecorded'); check(count('attendance'), 0, 'All invalid reviews preserve no-default-mark behavior');
    for (const selectedDate of ['2000-02-29', '2099-12-31']) {
      const value = await editor('teacher-a', selectedDate); check(value.roster.items[0].record, null, 'Unmarked past and future real dates have no fabricated present mark');
      await save(input(undefined, { date: selectedDate }));
    }
  });

  await scenario('No default present and minimal current snapshot', async ({ editor, atSql, call, secondPupil }) => {
    await secondPupil();
    const { result, executed } = await atSql(snapshotSql, 1, () => {}, () => call());
    check(result.status, 200, 'Current snapshot succeeds at the actual SQL boundary');
    check(executed.filter(sql => snapshotSql.test(sql)).length, 1, 'One current-scoped SELECT supplies class, roster, marks and inventory');
    const value = await result.json();
    keys(value, ['class', 'date', 'asOf', 'roster', 'canReview'], 'Snapshot has only explicit current editor fields');
    keys(value.class, ['id', 'name'], 'Class projection contains no staff or school identity');
    keys(value.roster, ['items', 'total', 'limit', 'truncated'], 'Roster includes an exact total and explicit bound');
    check(value.roster.total, 2, 'Only current same-school active pupils count'); check(value.roster.limit, 100, 'Editor cap is explicit'); check(value.canReview, true, 'Unambiguous bounded active roster can be reviewed');
    check(new Date(value.asOf).toISOString(), value.asOf, 'Snapshot carries a canonical database timestamp');
    for (const row of value.roster.items) {
      keys(row, ['student', 'record', 'enrolmentRows', 'needsReview'], 'Pupil row exposes only editor needs');
      keys(row.student, ['id', 'firstName', 'lastName', 'admissionNumber'], 'Roster excludes contacts, birth date and account mapping');
      check(row.record, null, 'No mark is invented for an unrecorded pupil'); check(row.needsReview, false, 'Unique enrolment is explicit');
    }
    const refreshed = await editor('admin-a'); check(refreshed.roster.total, 2, 'Current-school administrator sees the same current roster');
  });

  await scenario('Dirty marks preserve exact before and after note semantics', async ({ secondPupil, legacy, saved, save, editor, history, call, count }) => {
    await secondPupil();
    check((await legacy([{ studentId: 'student-a', status: 'absent', note: 'Original private synthetic note.' }, { studentId: 'student-other', status: 'excused', note: '' }])).status, 200, 'Legacy setup persists explicit saved notes');
    const before = saved(); const secondBefore = saved('student-other');
    const batch = input([{ studentId: 'student-a', status: 'late', note: '', expectedRecord: before }]);
    const result = await save(batch);
    check(result.replayed, false, 'First review is distinguished from a replay');
    check(result.review.id, batch.clientRequestId, 'Client review UUID is durable'); check(result.review.reviewedBy, 'teacher-a', 'Reviewer comes from authenticated staff');
    check(result.review.changes[0].beforeRecord, before, 'Review records every exact prior saved field');
    check(result.review.changes[0].afterRecord, saved(), 'Review records every committed saved field');
    check(saved().id, before.id, 'Reviewed replacement retains original attendance identity'); check(saved().createdAt, before.createdAt, 'Reviewed replacement retains original creation time');
    check(saved().note, '', 'Empty note remains distinct from null'); check(saved('student-other'), secondBefore, 'Unchanged pupil is not defaulted or rewritten');
    const empty = saved();
    const next = await save(input([{ studentId: 'student-a', status: 'late', note: null, expectedRecord: empty }]));
    check(next.review.changes[0].beforeRecord.note, '', 'Note-only review preserves earlier explicit empty note'); check(saved().note, null, 'Explicit null clears a note');
    const nullBefore = saved();
    check((await call(editorRoute, 'POST', 'teacher-a', input([{ studentId: 'student-a', status: 'late', note: null, expectedRecord: nullBefore }]), 'class-a', '')).status, 400, 'Strict no-op review is rejected without a new receipt');
    check((await call(editorRoute, 'POST', 'teacher-a', input([{ studentId: 'student-a', status: 'late', note: null, expectedRecord: nullBefore }, { studentId: 'student-other', status: 'present', note: null, expectedRecord: secondBefore }]), 'class-a', '')).status, 400, 'Mixed no-op and dirty entries do not create misleading reviewed evidence');
    check(count('attendance_reviews'), 2, 'Only two real dirty reviews exist');
    const current = await editor(); check(current.roster.items.find(row => row.student.id === 'student-a').record, saved(), 'Editor shows latest stored mark after review');
    const all = await history(); check(all.total, 2, 'History retains every reviewed change'); check(all.items.find(row => row.id === result.review.id), result.review, 'Earlier immutable reviewed evidence remains unchanged');
  });

  await scenario('Exact replay survives later legacy replacement and withdrawal', async ({ save, legacy, saved, sqlite, history, count, call }) => {
    const original = input(); const first = await save(original);
    check((await legacy([{ studentId: 'student-a', status: 'absent', note: 'Later legacy evidence.' }])).status, 200, 'Legacy replacement remains supported');
    const later = saved();
    const replay = await save(original, 'teacher-a', 200); check(replay.replayed, true, 'Exact replay is identified'); check(replay.review, first.review, 'Replay returns original immutable evidence'); check(saved(), later, 'Replay never reapplies its earlier mark');
    sqlite.prepare("UPDATE enrolments SET status='withdrawn' WHERE id='student-a-enrolment'").run();
    const withdrawn = await save(original, 'teacher-a', 200); check(withdrawn.review, first.review, 'Original class staff retains same-school withdrawn review history'); check(saved(), later, 'Withdrawal replay does not change later saved mark');
    check((await history()).total, 1, 'Withdrawal retains reviewed history');
    check((await call(editorRoute, 'POST', 'teacher-a', input(), 'class-a', '')).status, 409, 'Empty current active roster blocks a new review');
    check((await call(editorRoute, 'POST', 'teacher-a', { ...original, reason: 'Different synthetic retry reason.' }, 'class-a', '')).status, 409, 'Changed retry payload cannot claim the original UUID');
    check((await call(editorRoute, 'POST', 'admin-a', original, 'class-a', '')).status, 409, 'Another reviewer cannot claim the original UUID');
    check(count('attendance_reviews'), 1, 'Retries and withdrawn new reviews create no extra evidence');
  });

  await scenario('Concurrent reviewed CAS and identical UUID arbitration', async ({ call, count, saved, save }) => {
    const a = input(), b = input([{ studentId: 'student-a', status: 'absent', note: null, expectedRecord: null }]);
    const race = await Promise.all([call(editorRoute, 'POST', 'teacher-a', a, 'class-a', ''), call(editorRoute, 'POST', 'admin-a', b, 'class-a', '')]);
    check(race.map(response => response.status).sort(), [201, 409], 'Different reviewed UUIDs have exactly one full-evidence CAS winner');
    check(count('attendance_reviews'), 1, 'CAS race creates one review'); check(count('attendance_review_entries'), 1, 'CAS race creates one attributable change'); check(count('attendance'), 1, 'CAS race creates one mark');
    const before = saved();
    const identical = input([{ studentId: 'student-a', status: before.status === 'late' ? 'present' : 'late', note: 'Concurrent exact retry.', expectedRecord: before }]);
    const responses = await Promise.all([call(editorRoute, 'POST', 'teacher-a', identical, 'class-a', ''), call(editorRoute, 'POST', 'teacher-a', identical, 'class-a', '')]);
    check(responses.map(response => response.status).sort(), [200, 201], 'Concurrent identical UUID retries acknowledge one save and one original replay');
    const bodies = await Promise.all(responses.map(response => response.json())); check(bodies[0].review, bodies[1].review, 'Identical retries return one immutable review'); check(count('attendance_reviews'), 2, 'Identical UUID race creates exactly one additional review');
    await save(identical, 'teacher-a', 200);
  });

  await scenario('Reordered batch exact UUID replay', async ({ secondPupil, save, saved, count }) => {
    await secondPupil();
    const items = [{ studentId: 'student-other', status: 'absent', note: null, expectedRecord: null }, { studentId: 'student-a', status: 'present', note: '', expectedRecord: null }];
    const original = input(items); const first = await save(original);
    const replay = await save({ ...original, entries: [...items].reverse() }, 'teacher-a', 200);
    check(replay.review, first.review, 'Equivalent changed-row order replays the exact same immutable batch'); check(count('attendance'), 2, 'Ordered retry does not create new marks'); check(saved().note, '', 'Ordering keeps explicit empty note');
  });

  const actorChanges = [
    ['disabled', actor => "UPDATE users SET disabled_at='synthetic-disabled' WHERE id='" + actor + "'"],
    ['demoted', actor => "UPDATE users SET role='guardian' WHERE id='" + actor + "'"],
    ['school moved', actor => "UPDATE users SET school_id='b' WHERE id='" + actor + "'"],
    ['issuer removed', actor => "UPDATE users SET identity_issuer=NULL WHERE id='" + actor + "'"],
    ['subject blanked', actor => "UPDATE users SET identity_subject='' WHERE id='" + actor + "'"],
  ];
  for (const actor of ['admin-a', 'teacher-a']) for (const [label, sql] of actorChanges) for (const operation of ['snapshot', 'write', 'history', 'replay']) await scenario(actor + ' late ' + label + ' at ' + operation, async ({ sqlite, save, atSql, call, denied, count }) => {
    let original;
    if (operation === 'history' || operation === 'replay') { original = input(); await save(original, actor); }
    const pattern = operation === 'write' ? insertSql : operation === 'replay' ? retrySql : snapshotSql;
    const route = operation === 'history' ? historyRoute : editorRoute;
    const method = operation === 'write' || operation === 'replay' ? 'POST' : 'GET';
    const { result } = await atSql(pattern, 1, () => sqlite.exec(sql(actor)), () => call(route, method, actor, method === 'POST' ? (original ?? input()) : undefined));
    await denied(result, operation === 'write' || operation === 'replay' ? 409 : 404, 'Late actor authority is rechecked by actual ' + operation + ' SQL');
    check(count('attendance_reviews'), original ? 1 : 0, 'Late denied operation adds no review'); check(count('attendance'), original ? 1 : 0, 'Late denied operation adds no mark');
  });

  for (const [label, change] of [
    ['class reassignment', "UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'"],
    ['class school transfer', "UPDATE classes SET school_id='b' WHERE id='class-a'"],
  ]) for (const operation of ['snapshot', 'write', 'history', 'replay']) await scenario(label + ' at ' + operation, async ({ sqlite, save, atSql, call, denied, count }) => {
    let original;
    if (operation === 'history' || operation === 'replay') { original = input(); await save(original); }
    const pattern = operation === 'write' ? insertSql : operation === 'replay' ? retrySql : snapshotSql;
    const { result } = await atSql(pattern, 1, () => sqlite.exec(change), () => call(operation === 'history' ? historyRoute : editorRoute, operation === 'write' || operation === 'replay' ? 'POST' : 'GET', 'teacher-a', operation === 'write' ? input() : operation === 'replay' ? original : undefined));
    await denied(result, operation === 'write' || operation === 'replay' ? 409 : 404, 'Actual class scope rejects the former teacher without evidence disclosure');
    check(count('attendance_reviews'), original ? 1 : 0, 'Class race creates no new review');
  });

  for (const [label, change] of [
    ['pupil withdrawal', "UPDATE enrolments SET status='withdrawn' WHERE id='student-a-enrolment'"],
    ['pupil school transfer', "UPDATE students SET school_id='b' WHERE id='student-a'"],
    ['pupil class move', "UPDATE enrolments SET class_id='class-other' WHERE id='student-a-enrolment'"],
  ]) await scenario(label + ' before actual reviewed insert', async ({ sqlite, atSql, call, count, denied }) => {
    const { result } = await atSql(insertSql, 1, () => sqlite.exec(change), () => call(editorRoute, 'POST', 'teacher-a', input(), 'class-a', ''));
    await denied(result, 409, 'Changed active same-school membership blocks the actual batch write');
    for (const table of ['attendance', 'attendance_reviews', 'attendance_review_entries']) check(count(table), 0, 'Changed membership leaves no partial marks or evidence');
  });

  await scenario('Concurrent legacy replacement changes any full prior field', async ({ legacy, saved, atSql, call, count, denied, sqlite }) => {
    check((await legacy([{ studentId: 'student-a', status: 'absent', note: 'Original note.' }])).status, 200, 'Legacy setup succeeds');
    const before = saved(); const data = input([{ studentId: 'student-a', status: 'late', note: null, expectedRecord: before }]);
    const { result } = await atSql(insertSql, 1, async () => { check((await legacy([{ studentId: 'student-a', status: 'absent', note: 'Changed by legacy save.' }])).status, 200, 'Concurrent legacy replacement actually commits'); }, () => call(editorRoute, 'POST', 'teacher-a', data, 'class-a', ''));
    await denied(result, 409, 'Full saved-record CAS rejects a changed note even when status is unchanged'); check(saved().note, 'Changed by legacy save.', 'Denied review retains winning legacy note'); check(count('attendance_reviews'), 0, 'Stale review adds no audit evidence');
    const refreshed = saved(); const retry = input([{ studentId: 'student-a', status: 'late', note: null, expectedRecord: refreshed }]);
    const second = await atSql(insertSql, 1, () => sqlite.prepare("UPDATE attendance SET recorded_by='admin-a',updated_at=? WHERE id=?").run('2026-10-05T01:00:00.000Z', refreshed.id), () => call(editorRoute, 'POST', 'teacher-a', retry, 'class-a', ''));
    await denied(second.result, 409, 'Full saved-record CAS also binds actor and timestamp'); check(saved().recordedBy, 'admin-a', 'Winning attribution is never overwritten by stale review');
  });

  await scenario('A single stale entry rolls back the whole dirty batch', async ({ secondPupil, legacy, saved, atSql, call, count, denied }) => {
    await secondPupil();
    check((await legacy([{ studentId: 'student-a', status: 'absent' }, { studentId: 'student-other', status: 'absent' }])).status, 200, 'Both synthetic prior marks exist');
    const first = saved(); const second = saved('student-other');
    const data = input([{ studentId: 'student-a', status: 'present', note: null, expectedRecord: first }, { studentId: 'student-other', status: 'late', note: '', expectedRecord: second }]);
    const { result } = await atSql(insertSql, 1, () => legacy([{ studentId: 'student-other', status: 'excused', note: 'Concurrent second pupil.' }]), () => call(editorRoute, 'POST', 'teacher-a', data, 'class-a', ''));
    await denied(result, 409, 'Any stale row rejects the full reviewed batch'); check(saved(), first, 'Uncontested first pupil is not partially updated'); check(saved('student-other').status, 'excused', 'Contested pupil retains concurrent winner'); check(count('attendance_reviews'), 0, 'Failed CAS adds no receipt'); check(count('attendance_review_entries'), 0, 'Failed CAS adds no audit entry');
  });

  await scenario('Injected audit failure atomically rolls back marks and receipt', async ({ secondPupil, legacy, saved, sqlite, call, count, denied }) => {
    await secondPupil();
    check((await legacy([{ studentId: 'student-a', status: 'absent', note: 'Before one.' }, { studentId: 'student-other', status: 'late', note: 'Before two.' }])).status, 200, 'Prior marks establish rollback evidence');
    const before = [saved(), saved('student-other')];
    sqlite.exec("CREATE TRIGGER synthetic_review_audit_failure BEFORE INSERT ON attendance_review_entries WHEN NEW.student_id='student-other' BEGIN SELECT RAISE(ABORT,'synthetic_forced_audit_rollback'); END");
    const data = input(before.map((record, index) => ({ studentId: index ? 'student-other' : 'student-a', status: 'present', note: null, expectedRecord: record })));
    await denied(await call(editorRoute, 'POST', 'teacher-a', data, 'class-a', ''), 500, 'Injected internal audit failure gives only safe error');
    check([saved(), saved('student-other')], before, 'Failure after attendance upserts rolls back every mark'); check(count('attendance_reviews'), 0, 'Forced rollback removes receipt'); check(count('attendance_review_entries'), 0, 'Forced rollback removes all audit entries');
  });

  await scenario('Review and change immutability preserves original evidence', async ({ save, sqlite, count, saved, legacy }) => {
    const first = await save(); const record = saved();
    for (const [sql, parameter] of [
      ['UPDATE attendance_reviews SET reason=? WHERE id=?', first.review.id],
      ['DELETE FROM attendance_reviews WHERE id=?', first.review.id],
      ['UPDATE attendance_review_entries SET after_record=? WHERE review_id=?', first.review.id],
      ['DELETE FROM attendance_review_entries WHERE review_id=?', first.review.id],
    ]) {
      assert.throws(() => sql.startsWith('UPDATE') ? sqlite.prepare(sql).run(sql.includes('after_record') ? '{}' : 'Changed synthetic reason.', parameter) : sqlite.prepare(sql).run(parameter), /immutable/i, 'Immutable receipt and change triggers reject rewriting'); checks++;
    }
    check(count('attendance_reviews'), 1, 'Original receipt persists'); check(count('attendance_review_entries'), 1, 'Original change persists');
    check((await legacy([{ studentId: 'student-a', status: 'absent' }])).status, 200, 'Legacy mutable mark replacement remains available');
    check(saved().id, record.id, 'Legacy replacement preserves original attendance identity'); check(saved().note, null, 'Legacy omitted note still clears rather than preserves note');
  });

  await scenario('Whole original batch history hides transferred pupil evidence', async ({ secondPupil, save, sqlite, history, call, count }) => {
    await secondPupil(); const data = input([{ studentId: 'student-a', status: 'present', note: 'Private first note.', expectedRecord: null }, { studentId: 'student-other', status: 'absent', note: 'Private second note.', expectedRecord: null }]);
    await save(data);
    sqlite.prepare("UPDATE students SET school_id='b' WHERE id='student-other'").run();
    const value = await history(); check(value.items, [], 'One transferred pupil hides the entire original receipt rather than partial evidence'); check(value.total, 0, 'History count also excludes the unavailable batch');
    const filtered = await history('teacher-a', '?date=' + date + '&studentId=student-a'); check(filtered.items, [], 'Filtering a remaining pupil cannot recover foreign batch content');
    check((await call(editorRoute, 'POST', 'teacher-a', data, 'class-a', '')).status, 409, 'UUID replay cannot disclose unavailable original batch'); check(count('attendance_reviews'), 1, 'Transfer retains immutable receipt without publishing it');
  });

  await scenario('Late historical pupil transfer at actual history and retry reads', async ({ save, atSql, sqlite, call, count }) => {
    const data = input(); await save(data);
    const { result } = await atSql(historySql, 1, () => sqlite.prepare("UPDATE students SET school_id='b' WHERE id='student-a'").run(), () => call(historyRoute));
    check(result.status, 200, 'Authorized class history remains a safe empty inventory'); const value = await result.json(); check(value.items, [], 'SQL-time transfer hides historical receipt'); check(value.total, 0, 'SQL-time transfer hides receipt count'); check(count('attendance_reviews'), 1, 'No immutable history is destroyed');
  });

  for (const [label, mutate] of [
    ['actor disabled', sqlite => sqlite.prepare("UPDATE users SET disabled_at='synthetic-disabled' WHERE id='teacher-a'").run()],
    ['class reassigned', sqlite => sqlite.prepare("UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'").run()],
    ['pupil transferred', sqlite => sqlite.prepare("UPDATE students SET school_id='b' WHERE id='student-a'").run()],
  ]) await scenario('Committed save late ' + label + ' before result readback', async ({ sqlite, atSql, call, denied, count }) => {
    const { result } = await atSql(retrySql, 2, () => mutate(sqlite), () => call(editorRoute, 'POST', 'teacher-a', input(), 'class-a', ''));
    await denied(result, 404, 'Readback rechecks current authority and never releases committed evidence after scope loss');
    check(count('attendance_reviews'), 1, 'Committed receipt is durable despite denied readback'); check(count('attendance'), 1, 'Committed mark remains durable for exact-UUID recovery'); check(count('attendance_review_entries'), 1, 'Committed audit evidence remains durable');
  });

  await scenario('Reviewed learner unlink does not invent staff history ownership', async ({ cookies, save, atSql, call, history }) => {
    const data = input(); const first = await save(data);
    const { result } = await atSql(retrySql, 1, () => profiles.reviewProfileLink({ id: 'admin-a', role: 'admin', schoolId: 'a' }, { profileType: 'student', profileId: 'student-a', userId: null, expectedVersion: 0, clientRequestId: crypto.randomUUID(), reviewConfirmed: true, reason: 'Synthetic independently reviewed learner account unlink.' }), () => call(editorRoute, 'POST', 'teacher-a', data, 'class-a', ''));
    check(result.status, 200, 'Staff history relies on current class and pupil school, not a pupil login binding'); check((await result.json()).review, first.review, 'Unlink leaves original immutable staff history');
    check(await auth.getPrincipal(new Request(origin, { headers: { cookie: cookies['student-user-a'] } })), null, 'Actual reviewed unlink separately revokes the learner session'); check((await history()).total, 1, 'Current school staff retains linked-pupil attendance evidence');
  });

  await scenario('Empty roster and exact 100-row cap', async ({ sqlite, db, schema, editor, call, count }) => {
    sqlite.prepare("UPDATE enrolments SET status='withdrawn' WHERE id='student-a-enrolment'").run();
    let value = await editor(); check(value.roster.total, 0, 'Empty roster is explicit'); check(value.roster.items, [], 'Empty roster has no default marks'); check(value.canReview, false, 'Empty roster cannot produce a reviewed batch');
    check((await call(editorRoute, 'POST', 'teacher-a', input(), 'class-a', '')).status, 409, 'New review requires an active roster');
    const pupils = Array.from({ length: 101 }, (_, index) => ({ id: 'bounded-' + String(index).padStart(3, '0'), schoolId: 'a', firstName: 'Bounded', lastName: String(index).padStart(3, '0'), admissionNumber: 'bounded-' + index, dateOfBirth: '2012-01-01', gradeLevel: '8', createdAt: stamp, updatedAt: stamp }));
    await db.insert(schema.students).values(pupils); await db.insert(schema.enrolments).values(pupils.map(pupil => ({ id: pupil.id + '-enrolment', studentId: pupil.id, classId: 'class-a', status: 'active', enrolledAt: stamp, createdAt: stamp, updatedAt: stamp })));
    value = await editor(); check(value.roster.total, 101, 'Exact roster total is independent of displayed rows'); check(value.roster.items.length, 100, 'Roster preview is bounded'); check(value.roster.truncated, true, 'Oversize roster is visibly truncated'); check(value.canReview, false, 'Truncation blocks reviewed writes');
    check((await call(editorRoute, 'POST', 'teacher-a', input([{ studentId: pupils[0].id, status: 'present', note: null, expectedRecord: null }]), 'class-a', '')).status, 409, 'A subset cannot bypass whole-roster truncation'); check(count('attendance_reviews'), 0, 'Cap denial creates no receipt');
    sqlite.prepare('UPDATE enrolments SET status=? WHERE id=?').run('withdrawn', pupils[100].id + '-enrolment');
    value = await editor(); check(value.roster.total, 100, 'Exact 100-row roster stays in bounds'); check(value.roster.truncated, false, 'Exact cap is not truncated'); check(value.canReview, true, 'Exact bounded unambiguous roster can be reviewed');
    check((await call(editorRoute, 'POST', 'teacher-a', input([{ studentId: pupils[0].id, status: 'present', note: null, expectedRecord: null }]), 'class-a', '')).status, 201, 'A dirty subset succeeds within the fully checked 100-row roster');
  });

  await scenario('Roster grows after snapshot beyond cap', async ({ db, schema, atSql, call, count, denied }) => {
    const { result } = await atSql(insertSql, 1, async () => {
      const pupils = Array.from({ length: 100 }, (_, index) => ({ id: 'late-roster-' + index, schoolId: 'a', firstName: 'Late', lastName: String(index), admissionNumber: 'late-roster-' + index, dateOfBirth: '2012-01-01', gradeLevel: '8', createdAt: stamp, updatedAt: stamp }));
      await db.insert(schema.students).values(pupils); await db.insert(schema.enrolments).values(pupils.map(pupil => ({ id: pupil.id + '-enrolment', studentId: pupil.id, classId: 'class-a', status: 'active', enrolledAt: stamp, createdAt: stamp, updatedAt: stamp })));
    }, () => call(editorRoute, 'POST', 'teacher-a', input(), 'class-a', ''));
    await denied(result, 409, 'Actual SQL rechecks whole-roster cap after the preview'); check(count('attendance'), 0, 'Late roster cap persists no marks'); check(count('attendance_reviews'), 0, 'Late roster cap persists no receipt');
  });

  for (const duplicateStatus of ['active', 'withdrawn']) await scenario('Preserved legacy ' + duplicateStatus + ' enrolment ambiguity', async ({ editor, call, count }) => {
    const value = await editor(); check(value.roster.total, 1, 'Roster counts each current pupil once despite legacy duplicate pair'); check(value.roster.items[0].enrolmentRows, 2, 'Legacy pair ambiguity is explicit'); check(value.roster.items[0].needsReview, true, 'Legacy duplicate pair requires review outside this editor'); check(value.canReview, false, 'Ambiguity blocks new reviewed marks');
    check((await call(editorRoute, 'POST', 'teacher-a', input(), 'class-a', '')).status, 409, 'Legacy duplicates are preserved without silently choosing a row'); check(count('attendance_reviews'), 0, 'Ambiguous roster creates no invented review');
  }, ({ sqlite }) => sqlite.prepare('INSERT INTO enrolments(id,student_id,class_id,status,enrolled_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run('legacy-duplicate', 'student-a', 'class-a', duplicateStatus, stamp, stamp, stamp));

  await scenario('Global ambiguity outside displayed dirty entry blocks the batch', async ({ editor, call, count }) => {
    const value = await editor(); check(value.roster.total, 2, 'Both active current pupils appear'); check(value.roster.items.find(row => row.student.id === 'student-a').needsReview, false, 'Chosen pupil alone is unambiguous'); check(value.canReview, false, 'Other pupil ambiguity still blocks a whole-roster review');
    check((await call(editorRoute, 'POST', 'teacher-a', input(), 'class-a', '')).status, 409, 'Dirty subset cannot bypass ambiguity elsewhere in current roster'); check(count('attendance'), 0, 'Global ambiguity persists no partial mark');
  }, ({ sqlite }) => sqlite.exec(`INSERT INTO enrolments(id,student_id,class_id,status,enrolled_at,created_at,updated_at) VALUES ('legacy-second-active','student-other','class-a','active','${stamp}','${stamp}','${stamp}'),('legacy-second-withdrawn','student-other','class-a','withdrawn','${stamp}','${stamp}','${stamp}')`));


  await scenario('Unicode bounds and unchanged long legacy note preservation', async ({ legacy, saved, save, call, count }) => {
    const longNote = 'Synthetic legacy note. ' + '😀'.repeat(2100);
    check((await legacy([{ studentId: 'student-a', status: 'absent', note: longNote }])).status, 200, 'Legacy note above new-note limit remains confirmed evidence');
    const original = saved();
    const preserved = await save(input([{ studentId: 'student-a', status: 'late', note: longNote, expectedRecord: original }], { reason: '😀'.repeat(10) }));
    check(preserved.review.reason, '😀'.repeat(10), 'Ten Unicode code points satisfy the reviewed reason minimum');
    check(saved().note, longNote, 'Unchanged long legacy note is preserved without forced shortening');
    check(preserved.review.changes[0].beforeRecord.note, longNote, 'Long prior note remains exact historical evidence');
    check((await call(editorRoute, 'POST', 'teacher-a', input([{ studentId: 'student-a', status: 'present', note: longNote + 'replacement', expectedRecord: saved() }]), 'class-a', '')).status, 400, 'A changed long note cannot use the preservation exception');
    const maximum = await save(input([{ studentId: 'student-a', status: 'present', note: '😀'.repeat(2000), expectedRecord: saved() }], { reason: '😀'.repeat(500) }));
    check(maximum.review.reason, '😀'.repeat(500), 'Five hundred Unicode code points satisfy the reviewed reason maximum');
    check(saved().note, '😀'.repeat(2000), 'Two thousand Unicode code points satisfy the new-note maximum');
    check((await call(editorRoute, 'POST', 'teacher-a', input([{ studentId: 'student-a', status: 'late', note: '😀'.repeat(2001), expectedRecord: saved() }]), 'class-a', '')).status, 400, 'New note above Unicode limit gives validation failure');
    check(count('attendance_reviews'), 2, 'Unicode boundaries and preservation create only valid reviewed evidence');
  });

  await scenario('Late transferred pupil cannot replay original receipt', async ({ save, atSql, sqlite, call, count }) => {
    const data = input(); await save(data);
    const { result } = await atSql(retrySql, 1, () => sqlite.prepare("UPDATE students SET school_id='b' WHERE id='student-a'").run(), () => call(editorRoute, 'POST', 'teacher-a', data, 'class-a', ''));
    check(result.status, 409, 'Actual replay SELECT refuses an original receipt after pupil school transfer');
    check(count('attendance_reviews'), 1, 'Denied replay leaves original immutable receipt intact');
  });

  await scenario('Legacy ambiguity activated after preview blocks actual review', async ({ atSql, call, sqlite, count, denied }) => {
    const { result } = await atSql(insertSql, 1, () => sqlite.prepare("UPDATE enrolments SET status='active' WHERE id='legacy-inactive-one'").run(), () => call(editorRoute, 'POST', 'teacher-a', input(), 'class-a', ''));
    await denied(result, 409, 'Actual INSERT rechecks global roster ambiguity after current preview');
    check(count('attendance'), 0, 'Late legacy ambiguity creates no partial marks'); check(count('attendance_reviews'), 0, 'Late legacy ambiguity creates no receipt');
  }, ({ sqlite }) => sqlite.exec(`INSERT INTO enrolments(id,student_id,class_id,status,enrolled_at,created_at,updated_at) VALUES ('legacy-inactive-one','student-other','class-a','withdrawn','${stamp}','${stamp}','${stamp}'),('legacy-inactive-two','student-other','class-a','withdrawn','${stamp}','${stamp}','${stamp}')`));

  await scenario('History exact totals filtering and 100-row cap', async ({ save, saved, history, count, sqlite }) => {
    for (let index = 0; index < 102; index++) await save(input([{ studentId: 'student-a', status: index % 2 ? 'absent' : 'present', note: 'Synthetic history row ' + index, expectedRecord: saved() }]));
    const value = await history(); check(value.total, 102, 'History exact total includes all reviewed rows'); check(value.items.length, 100, 'History displays latest 100 immutable reviews'); check(value.truncated, true, 'History reports omitted earlier rows');
    const expectedIds = sqlite.prepare('SELECT id FROM attendance_reviews ORDER BY created_at DESC,id DESC LIMIT 100').all().map(row => row.id);
    check(value.items.map(row => row.id), expectedIds, 'Bounded history is newest-first with deterministic UUID tie ordering');
    const filtered = await history('teacher-a', '?date=' + date + '&studentId=student-other'); check(filtered.total, 0, 'Pupil filter reveals no other learner history'); check(filtered.items, [], 'Pupil filter does not fabricate rows');
    const otherDate = await history('teacher-a', '?date=2026-10-04'); check(otherDate.total, 0, 'History date is exact'); check(count('attendance_review_entries'), 102, 'Every reviewed replacement retains one attributable immutable change');
  });

  await scenario('Legacy concurrent 200 and omitted-note-clears regression', async ({ legacy, saved, count }) => {
    check((await legacy([{ studentId: 'student-a', status: 'present', note: 'Legacy note before concurrency.' }])).status, 200, 'Legacy baseline mark succeeds');
    const responses = await Promise.all([legacy([{ studentId: 'student-a', status: 'absent' }]), legacy([{ studentId: 'student-a', status: 'late', note: 'Concurrent second note.' }])]);
    check(responses.map(response => response.status), [200, 200], 'Legacy concurrent replacements both retain their accepted 200 semantics'); check(count('attendance'), 1, 'Legacy concurrency still preserves tuple uniqueness');
    check((await legacy([{ studentId: 'student-a', status: 'excused' }])).status, 200, 'Omitted legacy note is accepted'); check(saved().note, null, 'Omitted legacy note clears prior note exactly as before'); check(saved().status, 'excused', 'Legacy status replacement persists'); check(count('attendance_reviews'), 0, 'Legacy writes receive no fabricated review receipts or historical backfill');
  });

  check(externalCalls, 0, 'No real identities, providers, notifications or external requests');
  console.log(`Attendance review independent access contract: ${checks} checks passed across ${scenarios} fresh authenticated SQLite scenarios (actual-query authority, full-evidence CAS, immutable reviewed history, rollback, exact replay and legacy compatibility; synthetic only).`);
  console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0, scenarios, externalCalls }));
} finally { globalThis.fetch = previousFetch; }
