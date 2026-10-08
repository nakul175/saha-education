// Shared synthetic harness for school/student/guardian record contracts: actual opaque sessions, actual route
// handlers, production Drizzle D1 over final migrated SQLite, SQL-time mutation hooks. No browser, provider or network.
import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/d1';
import { freshDatabase, seedSecurityData, load, bindings, stamp } from './security-db.mjs';

export const origin = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = origin;
export const sessions = await load('lib/education/session.ts');
export const identity = await load('lib/education/identity.ts');
const routeModules = {
  setup: await load('app/api/schools/[id]/setup/route.ts'),
  terms: await load('app/api/schools/[id]/terms/route.ts'),
  term: await load('app/api/schools/[id]/terms/[termId]/route.ts'),
  school: await load('app/api/schools/[id]/route.ts'),
  schools: await load('app/api/schools/route.ts'),
  recStudents: await load('app/api/records/students/route.ts'),
  recStudent: await load('app/api/records/students/[id]/route.ts'),
  recStatus: await load('app/api/records/students/[id]/status/route.ts'),
  recLinks: await load('app/api/records/students/[id]/guardian-links/route.ts'),
  recGuardians: await load('app/api/records/guardians/route.ts'),
  recGuardian: await load('app/api/records/guardians/[id]/route.ts'),
  students: await load('app/api/students/route.ts'),
  student: await load('app/api/students/[id]/route.ts'),
  studentGuardians: await load('app/api/students/[id]/guardians/route.ts'),
  guardians: await load('app/api/guardians/route.ts'),
  reportCards: await load('app/api/report-cards/route.ts'),
};
export const modules = routeModules;
const table = [
  [/^\/api\/schools\/([^/]+)\/setup$/, 'setup', ['id']],
  [/^\/api\/schools\/([^/]+)\/terms\/([^/]+)$/, 'term', ['id', 'termId']],
  [/^\/api\/schools\/([^/]+)\/terms$/, 'terms', ['id']],
  [/^\/api\/schools\/([^/]+)$/, 'school', ['id']],
  [/^\/api\/schools$/, 'schools', []],
  [/^\/api\/records\/students\/([^/]+)\/status$/, 'recStatus', ['id']],
  [/^\/api\/records\/students\/([^/]+)\/guardian-links$/, 'recLinks', ['id']],
  [/^\/api\/records\/students\/([^/]+)$/, 'recStudent', ['id']],
  [/^\/api\/records\/students$/, 'recStudents', []],
  [/^\/api\/records\/guardians\/([^/]+)$/, 'recGuardian', ['id']],
  [/^\/api\/records\/guardians$/, 'recGuardians', []],
  [/^\/api\/students\/([^/]+)\/guardians$/, 'studentGuardians', ['id']],
  [/^\/api\/students\/([^/]+)$/, 'student', ['id']],
  [/^\/api\/students$/, 'students', []],
  [/^\/api\/guardians$/, 'guardians', []],
  [/^\/api\/report-cards$/, 'reportCards', []],
];

export function counters() {
  return { checks: 0, scenarios: 0, requests: 0, externalRequests: 0 };
}

/** Runs `action` against a fresh migrated, seeded database. Returns nothing; throws on any failed assertion. */
export async function recordScenario(state, name, action) {
  const f = freshDatabase();
  await seedSecurityData(f.db, f.schema);
  const { sqlite } = f;
  const extraUsers = [
    ['admin-second-a', 'admin', 'a'],
    ['teacher-b2', 'teacher', 'b'],
  ];
  for (const [id, role, schoolId] of extraUsers)
    sqlite
      .prepare(
        'INSERT INTO users (id,name,email,role,identity_issuer,identity_subject,school_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        id,
        id + '@example.invalid',
        role,
        'https://identity.example.invalid',
        'sub-' + id,
        schoolId,
        stamp,
        stamp,
      );
  let hook,
    fired = false;
  const queries = [];
  function prepare(query, params = []) {
    async function intercept(phase) {
      if (!fired && hook?.phase === phase && hook.match(query)) {
        fired = true;
        await hook.run(query);
      }
    }
    return {
      bind(...values) {
        return prepare(query, values);
      },
      async raw() {
        queries.push(query);
        await intercept('before');
        const s = sqlite.prepare(query);
        s.setReturnArrays(true);
        const result = s.all(...params);
        await intercept('after');
        return result;
      },
      async all() {
        queries.push(query);
        await intercept('before');
        const results = sqlite.prepare(query).all(...params);
        await intercept('after');
        return { success: true, results, meta: {} };
      },
      async run() {
        queries.push(query);
        await intercept('before');
        const s = sqlite.prepare(query);
        const result = s.columns().length
          ? { success: true, results: s.all(...params), meta: {} }
          : { success: true, results: [], meta: { changes: Number(s.run(...params).changes) } };
        await intercept('after');
        return result;
      },
    };
  }
  const db = drizzle(
    {
      prepare,
      async batch(statements) {
        sqlite.exec('BEGIN');
        try {
          const out = [];
          for (const s of statements) out.push(await s.run());
          sqlite.exec('COMMIT');
          return out;
        } catch (error) {
          sqlite.exec('ROLLBACK');
          throw error;
        }
      },
    },
    { schema: f.schema },
  );
  globalThis.__sahaTestDb = db;
  const cookies = {},
    hashes = {};
  for (const actor of [
    'admin-a',
    'admin-b',
    'admin-second-a',
    'teacher-a',
    'teacher-other',
    'teacher-b',
    'guardian-a',
    'guardian-other',
    'guardian-b',
    'student-user-a',
    'student-user-other',
    'student-user-b',
  ]) {
    cookies[actor] = (await sessions.createSession(actor)).split(';')[0];
    hashes[actor] = sqlite
      .prepare('SELECT token_hash FROM auth_sessions WHERE user_id=?')
      .get(actor).token_hash;
  }
  const check = (actual, expected, message) => {
    assert.deepEqual(actual, expected, name + ': ' + message);
    state.checks++;
  };
  const okay = (actual, message) => {
    assert.ok(actual, name + ': ' + message);
    state.checks++;
  };
  async function call(method, path, actor = 'admin-a', payload, opts = {}) {
    const url = new URL(path, origin);
    if (url.origin !== origin) {
      state.externalRequests++;
      throw new Error('Contracts are local synthetic only');
    }
    const route = table.find(([pattern]) => pattern.test(url.pathname));
    assert.ok(route, 'Known route ' + url.pathname);
    const match = route[0].exec(url.pathname),
      params = Object.fromEntries(route[2].map((key, index) => [key, decodeURIComponent(match[index + 1])]));
    state.requests++;
    const headers = {
      origin: opts.origin ?? origin,
      ...(actor && cookies[actor] ? { cookie: cookies[actor] } : {}),
    };
    if (payload !== undefined) headers['content-type'] = 'application/json';
    const request = new Request(url, {
      method,
      headers,
      ...(payload === undefined
        ? {}
        : { body: typeof payload === 'string' ? payload : JSON.stringify(payload) }),
    });
    const handler = routeModules[route[1]][method];
    if (!handler) return { status: 405, body: null, absent: true };
    const response = await handler(request, { params: Promise.resolve(params) });
    check(
      response.headers.get('cache-control'),
      'no-store',
      method + ' ' + url.pathname + ' is never cacheable',
    );
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null, text };
  }
  const get = (path, actor) => call('GET', path, actor);
  const send = (method, path, actor, payload, opts) => call(method, path, actor, payload, opts);
  const count = (tableName) => sqlite.prepare('SELECT count(*) n FROM ' + tableName).get().n;
  const row = (query, ...values) => {
    const found = sqlite.prepare(query).get(...values);
    return found ? { ...found } : found;
  };
  const rows = (query, ...values) =>
    sqlite
      .prepare(query)
      .all(...values)
      .map((item) => ({ ...item }));
  const arm = (phase, match, run) => {
    hook = { phase, match, run };
    fired = false;
  };
  const revoke = (actor) => sqlite.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(hashes[actor]);
  const snapshot = () =>
    Object.fromEntries(
      [
        'schools',
        'school_setup_settings',
        'school_setup_terms',
        'students',
        'guardians',
        'student_guardians',
        'student_guardian_details',
        'student_guardian_events',
        'student_record_status',
        'student_status_events',
        'enrolments',
      ].map((t) => [t, rows('SELECT * FROM ' + t + ' ORDER BY 1,2')]),
    );
  const uuid = () => crypto.randomUUID();
  try {
    await action({
      ...f,
      db,
      call,
      get,
      send,
      count,
      row,
      rows,
      arm,
      revoke,
      snapshot,
      check,
      okay,
      uuid,
      cookies,
      queries,
      fired: () => fired,
      state,
    });
    state.scenarios++;
  } finally {
    hook = undefined;
    sqlite.close();
  }
}
export { stamp };
