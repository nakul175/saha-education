// NFR-01 adversarial authorization matrix (requirements NFR-01, FR-02, FR-03; designed cases TC-012, TC-017, TC-019,
// TC-115, TC-139, TC-182, TC-206, TC-266). Every route handler under app/api is exercised through the REAL handlers,
// real opaque sessions and a real (synthetic, in-memory) SQLite database for each credential state, role, school and
// object scope. Expected behaviour is transcribed in tests/support/authorization-matrix-spec.mjs from
// docs/specification/API-CONTRACTS.md, not read from the code under test. Offline; no provider, no network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildFixture } from '../support/authorization-fixture.mjs';
import {
  discoverRoutes,
  dispatch,
  exportedMethods,
  origin as baseOrigin,
} from '../support/route-dispatch.mjs';
import { rows, roleLetter } from '../support/authorization-matrix-spec.mjs';
import { root } from '../support/security-db.mjs';

let checks = 0;
const observations = new Map();
const check = (condition, message) => {
  assert.ok(condition, message);
  checks++;
};
const equal = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  checks++;
};
const observe = (key, actor) => {
  if (!observations.has(key)) observations.set(key, new Set());
  observations.get(key).add(actor);
};
let externalRequests = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async () => {
  externalRequests++;
  throw new Error('The authorization matrix is offline');
};

// ---------------------------------------------------------------------------------------------------------------
// Section 1: the matrix covers exactly the documented inventory (103 route files / 150 handlers).
// ---------------------------------------------------------------------------------------------------------------
function parseCsv(text) {
  const records = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      records.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field || row.length) {
    row.push(field);
    records.push(row);
  }
  const [header, ...body] = records;
  return body.map((values) => Object.fromEntries(header.map((name, index) => [name, values[index]])));
}
const contract = parseCsv(readFileSync(join(root, 'docs/specification/API-CONTRACTS.csv'), 'utf8'));
const contractRoutes = contract.map((record) =>
  record.route.replaceAll('`', '').replace('[requestId]', '[requestId]'),
);
const contractMethods = new Map(
  contract.map((record) => [
    record.route.replaceAll('`', ''),
    [...new Set(record.exported_methods_input.match(/\b(GET|POST|PATCH|PUT|DELETE)\b/g) ?? [])].sort(),
  ]),
);
const discovered = discoverRoutes();
equal(discovered.length, 103, 'v2.13 merged inventory is 103 route files');
equal(
  discovered.map((route) => route.pattern).sort(),
  [...contractRoutes].sort(),
  'Route files on disk equal the contract inventory exactly',
);
let handlerCount = 0;
for (const route of discovered) {
  const methods = await exportedMethods(route);
  handlerCount += methods.length;
  equal(
    [...methods].sort(),
    contractMethods.get(route.pattern),
    `${route.pattern}: exported methods equal the contract (no undocumented PUT/DELETE/HEAD/OPTIONS)`,
  );
}
equal(handlerCount, 150, 'v2.13 merged inventory is 150 exported method handlers');
const matrixKeys = rows.map((row) => `${row.method} ${row.route}`);
equal(new Set(matrixKeys).size, matrixKeys.length, 'No duplicate matrix rows');
const handlerKeys = [];
for (const route of discovered)
  for (const method of await exportedMethods(route)) handlerKeys.push(`${method} ${route.pattern}`);
equal(
  [...matrixKeys].sort(),
  handlerKeys.sort(),
  'The authorization matrix has one row for every one of the 150 handlers and no extra rows',
);

// ---------------------------------------------------------------------------------------------------------------
// Fixture and request helpers.
// ---------------------------------------------------------------------------------------------------------------
const f = await buildFixture();
const { ids } = f;
const idMap = {
  schoolA: 'a',
  schoolB: 'b',
  courseA: 'course-a',
  courseB: 'course-b',
  reportA: 'published-a',
  reportB: 'published-b',
  userTeacher: 'teacher-a',
  orf: 'oral-reading-fluency',
  guardianA: 'guardian-profile-a',
  guardianB: 'guardian-profile-b',
  studentB: 'student-b',
  ...ids,
};
function pathFor(row, { foreign = false } = {}) {
  let path = row.route;
  const param = foreign && row.foreign ? row.foreign : row.param;
  path = path
    .replace('[submissionId]', idMap[row.param2] ?? 'x')
    .replace('[termId]', idMap[row.param3] ?? 'x')
    .replace('[sourceId]', encodeURIComponent(idMap.auditEntry))
    .replace('[source]', idMap.auditSource)
    .replace('[requestId]', idMap[param] ?? 'x')
    .replace('[id]', idMap[param] ?? 'x');
  let query = row.query ?? '';
  if (row.route === '/api/curriculum/[id]/snapshot') query = `?versionId=${ids.curriculumVersion}`;
  if (row.route === '/api/notifications' && row.method === 'PATCH') query = '?id=missing-notice';
  return path + query;
}
const protectedRows = rows.filter(
  (row) => !String(row.kind ?? '').startsWith('public') && row.kind !== 'session-get',
);
const mutating = (row) => row.method !== 'GET';

/** A request body that records whether any handler pulled bytes from it (denial must happen before body parsing). */
function trapBody(text = '{') {
  let pulled = false;
  const stream = new ReadableStream(
    {
      pull(controller) {
        pulled = true;
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, wasRead: () => pulled };
}
const ERROR_BODIES = new Set([
  'Authentication required',
  'Forbidden',
  'Not found',
  'Invalid request',
  'Conflict',
  'Internal server error',
  'Service unavailable',
  'Request origin is not allowed',
  'Reading check conflict',
  'Resource conflict',
  'Identity administration conflict',
  'Profile link conflict',
  'Curriculum reference conflict',
  'Submission conflict',
  'Reading import conflict',
  'Reading correction conflict',
  'Attendance review conflict',
  'Submission window closed',
  'Use reviewed profile link administration at /admin/profile-links',
]);
const LEAK_PATTERN =
  /SQLITE|SQLITE_|drizzle|node_modules|\.ts:\d+|\bat\s+\S+\s+\(|select\s+.+\s+from\s|insert\s+into|constraint failed|stack/i;
const seen = [];
async function send(actor, row, options = {}) {
  const { foreign = false, cookie, headers = {}, origin, noOrigin } = options;
  const path = pathFor(row, { foreign });
  const carriesBody = mutating(row) && row.route !== '/api/notifications';
  const body = carriesBody ? trapBody() : null;
  const requestHeaders = { ...headers };
  if (carriesBody) requestHeaders['content-type'] = 'application/json';
  if (!noOrigin) requestHeaders.origin = origin === undefined ? baseOrigin : origin;
  const sent = cookie !== undefined ? cookie : actor ? f.cookies[actor] : null;
  if (sent) requestHeaders.cookie = sent;
  const init = { method: row.method, headers: requestHeaders };
  if (body) {
    init.body = body.stream;
    init.duplex = 'half';
  }
  const response = await dispatch(new Request(baseOrigin + path, init));
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  const result = {
    status: response.status,
    headers: response.headers,
    text,
    json,
    response,
    bodyRead: body ? body.wasRead() : false,
    row,
    actor,
    path,
  };
  seen.push(result);
  return result;
}
const where = (result) =>
  `${result.row.method} ${result.row.route} as ${result.actor ?? 'anonymous'} (${result.row.clause})`;
function expectDenied(result, status, label) {
  equal(result.status, status, `${label}: ${where(result)} -> ${result.status} ${result.text.slice(0, 120)}`);
  check(
    result.json && Object.keys(result.json).length >= 1 && typeof result.json.error === 'string',
    `${label}: denial body is a safe {error}: ${where(result)}`,
  );
}
// A denial body is `{error}` or, for the lifecycle handlers, `{error, code}` where code is the documented stable machine-readable
// outcome (API-CONTRACTS: it "never carries record contents"): a short lowercase token, never free text or an id.
function safeDenial(result, message) {
  const keys = Object.keys(result.json ?? {}).sort();
  check(
    keys.join() === 'error' ||
      (keys.join() === 'code,error' && /^[a-z][a-z0-9_-]{1,40}$/.test(result.json.code)),
    `${message} (${result.text.slice(0, 120)})`,
  );
}
const unchanged = (before, message) => equal(f.changedTables(before, f.fingerprint()), [], message);

// ---------------------------------------------------------------------------------------------------------------
// Section 2: authentication states. Every protected handler answers 401, before the body is read, and writes nothing.
// ---------------------------------------------------------------------------------------------------------------
const goodToken = f.token('admin-a');
const unknownToken = 'A'.repeat(43);
const states = {
  'no cookie': { cookie: null },
  'malformed token': { cookie: '__Host-saha_session=not-a-token' },
  'unknown well-formed token': { cookie: `__Host-saha_session=${unknownToken}` },
  'duplicate session cookie': {
    cookie: `__Host-saha_session=${goodToken}; __Host-saha_session=${goodToken}`,
  },
  'valid token under a non-__Host name': { cookie: `saha_session=${goodToken}` },
  'legacy role cookie': { cookie: 'saha_demo_role=admin' },
  'identity headers instead of a session': {
    cookie: null,
    headers: {
      'x-user-id': 'admin-a',
      'x-user-role': 'admin',
      'x-school-id': 'a',
      'x-forwarded-user': 'admin-a',
    },
  },
  'bearer token instead of cookie': { cookie: null, headers: { authorization: `Bearer ${goodToken}` } },
  'expired session': { actor: 'teacher-expired' },
  'disabled account': { actor: 'teacher-disabled' },
  'account without identity mapping': { actor: 'teacher-unmapped' },
};
let before = f.fingerprint();
for (const row of protectedRows) {
  for (const [name, state] of Object.entries(states)) {
    const result = await send(state.actor ?? null, row, { cookie: state.cookie, headers: state.headers });
    expectDenied(result, 401, `credential state "${name}"`);
    equal(
      result.json,
      { error: 'Authentication required' },
      `${name}: only the generic authentication message: ${where(result)}`,
    );
    equal(
      result.headers.get('cache-control'),
      'no-store',
      `${name}: 401 is never cacheable: ${where(result)}`,
    );
    equal(
      result.headers.get('set-cookie'),
      null,
      `${name}: a failed request sets no cookie: ${where(result)}`,
    );
    equal(result.bodyRead, false, `${name}: request body never read before authentication: ${where(result)}`);
  }
}
unchanged(before, 'Unauthenticated attempts changed no table');
// The token query parameter is also not an authentication channel.
{
  const result = await f.call(null, 'GET', `/api/students?token=${goodToken}&session=${goodToken}`);
  equal(result.status, 401, 'A session token in the URL query authenticates nothing');
}

// ---------------------------------------------------------------------------------------------------------------
// Section 3: same-origin mutation protection. Valid session, role allowed, hostile Origin => 403, body unread, no write.
// ---------------------------------------------------------------------------------------------------------------
const actorForRoles = (roles) =>
  ({ A: 'admin-a', T: 'teacher-a', S: 'student-user-a', G: 'guardian-a' })[[...(roles || 'A')][0]];
const hostileOrigins = {
  'cross-site origin': { origin: 'https://attacker.example.invalid' },
  'missing origin': { noOrigin: true },
  'null origin': { origin: 'null' },
  'same host over http': { origin: 'http://education.example.invalid' },
  'origin with trailing slash': { origin: 'https://education.example.invalid/' },
  'origin with path': { origin: 'https://education.example.invalid/api' },
  'subdomain of the allowed origin': { origin: 'https://evil.education.example.invalid' },
  'allowed origin with fetch metadata cross-site': {
    origin: 'https://education.example.invalid',
    headers: { 'sec-fetch-site': 'cross-site' },
  },
};
before = f.fingerprint();
for (const row of protectedRows.filter(mutating)) {
  const actor = row.route === '/api/schools' && row.method === 'POST' ? 'admin-a' : actorForRoles(row.roles);
  for (const [name, variant] of Object.entries(hostileOrigins)) {
    const result = await send(actor, row, variant);
    expectDenied(result, 403, `origin variant "${name}"`);
    equal(result.json, { error: 'Forbidden' }, `${name}: no origin policy detail: ${where(result)}`);
    equal(result.bodyRead, false, `${name}: origin denial precedes body parsing: ${where(result)}`);
  }
}
unchanged(before, 'Hostile-origin attempts changed no table');
// Origin is not required for reads (documented: only mutations).
equal(
  (await f.call('admin-a', 'GET', '/api/schools', { noOrigin: true })).status,
  200,
  'Reads do not require an Origin header',
);

// ---------------------------------------------------------------------------------------------------------------
// Section 4: role matrix. Four roles in school a and four in school b against every handler.
// ---------------------------------------------------------------------------------------------------------------
const sameSchool = ['admin-a', 'teacher-a', 'guardian-a', 'student-user-a'];
const otherSchool = ['admin-b', 'teacher-b', 'guardian-b', 'student-user-b'];
let denials = 0,
  allowances = 0;
before = f.fingerprint();
for (const row of protectedRows) {
  for (const actor of [...sameSchool, ...otherSchool]) {
    const letter =
      roleLetter[
        actor.startsWith('admin')
          ? 'admin'
          : actor.startsWith('teacher')
            ? 'teacher'
            : actor.startsWith('guardian')
              ? 'guardian'
              : 'student'
      ];
    const roleAllowed = row.roles.includes(letter);
    const result = await send(actor, row);
    if (!roleAllowed) {
      denials++;
      if (result.status === 403) {
        expectDenied(result, 403, 'role denial');
        if (result.bodyRead) {
          if (row.order === 'before')
            check(false, `role denial must precede body parsing but the body was read: ${where(result)}`);
          observe(
            `${row.method} ${row.route} [${row.clause}] reads the body before the role gate (denied role gets ${result.status})`,
            actor,
          );
        }
      } else if (result.status === 400 && result.bodyRead && row.order !== 'before') {
        // The contract is silent on ordering for this row: the denied role reaches body validation (400) instead of 403.
        observe(
          `${row.method} ${row.route} [${row.clause}] validates the body before the role gate (denied role gets ${result.status} not 403)`,
          actor,
        );
      } else {
        check(false, `role denial expected 403 but got ${result.status}: ${where(result)}`);
      }
    } else {
      allowances++;
      check(result.status !== 401, `an authenticated allowed role is never 401: ${where(result)}`);
      if (actor.endsWith('-a') || actor.endsWith('user-a')) {
        check(
          result.status !== 403,
          `allowed role in the owning school is not forbidden: ${where(result)} -> ${result.status} ${result.text.slice(0, 100)}`,
        );
        if (mutating(row) && row.route !== '/api/notifications')
          check(
            [400, 404].includes(result.status),
            `allowed role with a malformed body reaches validation (400): ${where(result)} -> ${result.status}`,
          );
      } else {
        // Allowed role in the OTHER school: it must never succeed against school a's objects.
        check(
          result.status < 200 || result.status >= 300 || !row.param,
          `other-school ${actor} must not succeed on a school a object: ${where(result)} -> ${result.status}`,
        );
      }
    }
  }
}
unchanged(before, 'Role-matrix probes changed no table (malformed bodies and denials write nothing)');
// Role gate before query parsing: a denied signed-in role that also sends a hostile query string must still be told 403.
// Rows marked queryOrder 'before' carry that promise in the contract ("role checked before query/body", "403 before filters");
// for every other GET row with denied roles the ordering is only recorded as an observation.
let queryOrderChecks = 0;
for (const row of protectedRows.filter((candidate) => candidate.method === 'GET')) {
  for (const actor of sameSchool) {
    const letter =
      roleLetter[
        actor.startsWith('admin')
          ? 'admin'
          : actor.startsWith('teacher')
            ? 'teacher'
            : actor.startsWith('guardian')
              ? 'guardian'
              : 'student'
      ];
    if (row.roles.includes(letter)) continue;
    const hostile = {
      ...row,
      query:
        '?limit=0&cursor=%00bad&from=nope&to=nope&source=bogus&classId=&roles=x&studentId=&date=zzz&q=%25&unknown=1',
    };
    const result = await send(actor, hostile);
    if (result.status === 403) {
      expectDenied(result, 403, 'role gate before query parsing');
      queryOrderChecks++;
    } else if (row.queryOrder === 'before')
      check(
        false,
        `role denial must precede query parsing but ${actor} got ${result.status}: ${where(result)}`,
      );
    else
      observe(
        `GET ${row.route} [${row.clause}] parses the query before the role gate (denied role gets ${result.status} not 403)`,
        actor,
      );
  }
}
check(queryOrderChecks >= 40, `role-before-query probes exercised ${queryOrderChecks} denials`);
unchanged(before, 'Hostile-query role probes changed no table');
check(
  denials >= 300 && allowances >= 350,
  `role matrix exercised ${denials} denials and ${allowances} allowances`,
);

// ---------------------------------------------------------------------------------------------------------------
// Section 5: object scope. Cross-school and same-school-but-unrelated actors get 404/403 and zero foreign data.
// ---------------------------------------------------------------------------------------------------------------
// Contract: "Detail routes using found() return 404 for an inaccessible object"; scoped lists never widen.
const scopedReads = [
  // [route, path, allowed actors that must receive 200, actors that must NOT receive the object]
  [
    'student',
    '/api/students/student-a',
    ['admin-a', 'teacher-a', 'guardian-a', 'student-user-a'],
    [
      'teacher-other',
      'guardian-other',
      'student-user-other',
      'guardian-peer',
      'student-user-peer',
      'admin-b',
      'teacher-b',
      'guardian-b',
      'student-user-b',
    ],
  ],
  [
    'peer student',
    '/api/students/student-peer',
    ['admin-a', 'teacher-a', 'guardian-peer', 'student-user-peer'],
    ['teacher-other', 'guardian-a', 'student-user-a', 'guardian-other', 'admin-b'],
  ],
  [
    'class',
    '/api/classes/class-a',
    ['admin-a', 'teacher-a', 'guardian-a', 'student-user-a', 'guardian-peer', 'student-user-peer'],
    [
      'teacher-other',
      'guardian-other',
      'student-user-other',
      'admin-b',
      'teacher-b',
      'guardian-b',
      'student-user-b',
    ],
  ],
  [
    'attendance summary',
    '/api/classes/class-a/attendance-summary',
    ['admin-a', 'teacher-a', 'guardian-a', 'student-user-a'],
    ['teacher-other', 'guardian-other', 'student-user-other', 'admin-b', 'teacher-b'],
  ],
  [
    'attendance editor',
    '/api/classes/class-a/attendance-editor?date=2026-10-02',
    ['admin-a', 'teacher-a'],
    ['teacher-other', 'admin-b', 'teacher-b'],
  ],
  [
    'attendance history',
    '/api/classes/class-a/attendance-editor/history?date=2026-10-02',
    ['admin-a', 'teacher-a'],
    ['teacher-other', 'admin-b', 'teacher-b'],
  ],
  [
    'assessment',
    '/api/assessments/assessment-a',
    ['admin-a', 'teacher-a', 'guardian-a', 'student-user-a'],
    ['teacher-other', 'guardian-other', 'student-user-other', 'admin-b', 'teacher-b'],
  ],
  [
    'results',
    '/api/assessments/assessment-a/results',
    ['admin-a', 'teacher-a'],
    ['teacher-other', 'admin-b', 'teacher-b'],
  ],
  [
    'result editor',
    '/api/assessments/assessment-a/result-editor',
    ['admin-a', 'teacher-a'],
    ['teacher-other', 'admin-b', 'teacher-b'],
  ],
  [
    'result history',
    '/api/assessments/assessment-a/result-editor/history',
    ['admin-a', 'teacher-a'],
    ['teacher-other', 'admin-b', 'teacher-b'],
  ],
  [
    'published report',
    '/api/report-cards/published-a',
    ['admin-a', 'teacher-a', 'guardian-a', 'student-user-a'],
    ['teacher-other', 'guardian-other', 'student-user-other', 'guardian-peer', 'admin-b', 'guardian-b'],
  ],
  [
    'draft report',
    `/api/report-cards/${ids.reportDraft}`,
    ['admin-a'],
    ['guardian-a', 'student-user-a', 'guardian-other', 'admin-b', 'guardian-b'],
  ],
  [
    'resource',
    `/api/resources/${ids.resource}`,
    ['admin-a', 'teacher-a'],
    ['teacher-other', 'admin-b', 'teacher-b'],
  ],
  [
    'other teacher resource',
    `/api/resources/${ids.resourceOther}`,
    ['admin-a', 'teacher-other'],
    ['teacher-a', 'admin-b', 'teacher-b'],
  ],
  [
    'resource versions',
    `/api/resources/${ids.resource}/versions`,
    ['admin-a', 'teacher-a'],
    ['teacher-other', 'admin-b', 'teacher-b'],
  ],
  [
    'draft curriculum of another teacher',
    `/api/curriculum/${ids.curriculumOther}`,
    ['admin-a', 'teacher-other'],
    ['teacher-a', 'admin-b', 'teacher-b'],
  ],
  [
    'approved curriculum',
    `/api/curriculum/${ids.curriculum}`,
    ['admin-a', 'teacher-a', 'teacher-other'],
    ['admin-b', 'teacher-b'],
  ],
  [
    'assignment submissions',
    `/api/assignments/${ids.assignment}/submissions`,
    ['admin-a', 'teacher-a', 'student-user-a', 'student-user-peer'],
    ['teacher-other', 'guardian-a', 'student-user-other', 'admin-b', 'student-user-b'],
  ],
  [
    'submission feedback',
    `/api/assignments/${ids.assignment}/submissions/${ids.submission}/feedback`,
    ['admin-a', 'teacher-a', 'student-user-a'],
    ['teacher-other', 'student-user-peer', 'guardian-a', 'student-user-other', 'admin-b'],
  ],
  [
    'submission window',
    `/api/assignments/${ids.assignment}/submission-window`,
    ['admin-a', 'teacher-a', 'student-user-a', 'student-user-peer'],
    ['teacher-other', 'guardian-a', 'student-user-other', 'admin-b'],
  ],
  [
    'submission window history',
    `/api/assignments/${ids.assignment}/submission-window/history`,
    ['admin-a', 'teacher-a'],
    ['teacher-other', 'student-user-a', 'admin-b'],
  ],
  [
    'reading corrections',
    `/api/reading-checks/${ids.reading}/corrections`,
    ['admin-a', 'teacher-a'],
    ['teacher-other', 'admin-b', 'teacher-b'],
  ],
  [
    'reading import',
    `/api/reading-imports/${ids.import}`,
    ['admin-a', 'teacher-a'],
    ['teacher-other', 'admin-b', 'teacher-b'],
  ],
  [
    'registry receipt',
    `/api/registry/creations/${ids.registryRequest}`,
    ['admin-a'],
    ['admin-b', 'teacher-a', 'guardian-a'],
  ],
  [
    'school',
    '/api/schools/a',
    ['admin-a', 'teacher-a', 'guardian-a', 'student-user-a'],
    ['admin-b', 'teacher-b', 'guardian-b', 'student-user-b'],
  ],
  [
    'other school',
    '/api/schools/b',
    ['admin-b', 'teacher-b', 'guardian-b', 'student-user-b'],
    ['admin-a', 'teacher-a', 'guardian-a', 'student-user-a'],
  ],
  [
    'course',
    '/api/courses/course-a',
    ['admin-a', 'teacher-a', 'guardian-a', 'student-user-a'],
    ['admin-b', 'teacher-b'],
  ],
  [
    'foreign class',
    '/api/classes/class-b',
    ['admin-b', 'teacher-b'],
    ['admin-a', 'teacher-a', 'guardian-a', 'student-user-a', 'teacher-other'],
  ],
  [
    'other class',
    '/api/classes/class-other',
    ['admin-a', 'teacher-other', 'guardian-other', 'student-user-other'],
    ['teacher-a', 'guardian-a', 'student-user-a', 'guardian-peer', 'admin-b'],
  ],
  // v2.13 handlers: every new object read is scoped like the contract says (API-CONTRACTS.csv role_scope column).
  [
    'sent notice',
    `/api/notices/${ids.notice}`,
    ['admin-a', 'teacher-a'],
    ['teacher-other', 'guardian-a', 'student-user-a', 'admin-b', 'teacher-b', 'guardian-b'],
  ],
  [
    'notice audience preview',
    '/api/notices/audience?classId=class-a&roles=guardians',
    ['admin-a', 'teacher-a'],
    ['teacher-other', 'guardian-a', 'student-user-a', 'admin-b', 'teacher-b'],
  ],
  [
    'student record',
    '/api/records/students/student-a',
    ['admin-a'],
    ['teacher-a', 'guardian-a', 'student-user-a', 'teacher-other', 'admin-b'],
  ],
  [
    'student guardian links',
    '/api/records/students/student-a/guardian-links',
    ['admin-a'],
    ['teacher-a', 'guardian-a', 'student-user-a', 'admin-b'],
  ],
  [
    'guardian record',
    '/api/records/guardians/guardian-profile-a',
    ['admin-a', 'guardian-a', 'teacher-a', 'student-user-a'],
    ['teacher-other', 'guardian-other', 'guardian-peer', 'student-user-other', 'admin-b', 'guardian-b'],
  ],
  [
    'class lifecycle',
    '/api/classes/class-a/lifecycle',
    ['admin-a', 'teacher-a', 'guardian-a', 'student-user-a'],
    ['teacher-other', 'guardian-other', 'student-user-other', 'admin-b', 'teacher-b'],
  ],
  [
    'class roster',
    '/api/classes/class-a/roster',
    ['admin-a', 'teacher-a'],
    ['teacher-other', 'guardian-a', 'student-user-a', 'admin-b', 'teacher-b'],
  ],
  [
    'class history',
    '/api/classes/class-a/history',
    ['admin-a', 'teacher-a'],
    ['teacher-other', 'guardian-a', 'student-user-a', 'admin-b', 'teacher-b'],
  ],
  [
    'class attendance changes',
    '/api/classes/class-a/attendance-changes?date=2026-10-02',
    ['admin-a', 'teacher-a'],
    ['teacher-other', 'guardian-a', 'student-user-a', 'admin-b', 'teacher-b'],
  ],
  [
    'class attendance report',
    '/api/classes/class-a/attendance-report',
    ['admin-a', 'teacher-a'],
    ['teacher-other', 'guardian-a', 'student-user-a', 'admin-b', 'teacher-b'],
  ],
  [
    'course lifecycle',
    '/api/courses/course-a/lifecycle',
    ['admin-a', 'teacher-a', 'guardian-a', 'student-user-a'],
    ['admin-b', 'teacher-b', 'guardian-b', 'student-user-b'],
  ],
  [
    'course history',
    '/api/courses/course-a/history',
    ['admin-a'],
    ['teacher-a', 'guardian-a', 'student-user-a', 'admin-b'],
  ],
  [
    'assessment lifecycle',
    '/api/assessments/assessment-a/lifecycle',
    ['admin-a', 'teacher-a'],
    ['teacher-other', 'guardian-a', 'student-user-a', 'admin-b', 'teacher-b'],
  ],
  [
    'published report detail',
    '/api/report-cards/published-a/detail',
    ['admin-a', 'teacher-a', 'guardian-a', 'student-user-a'],
    ['teacher-other', 'guardian-other', 'student-user-other', 'guardian-peer', 'admin-b', 'guardian-b'],
  ],
  [
    'draft report detail',
    `/api/report-cards/${ids.reportDraft}/detail`,
    ['admin-a'],
    ['guardian-a', 'student-user-a', 'guardian-other', 'admin-b', 'guardian-b'],
  ],
  [
    'eligible results of a pupil',
    '/api/report-cards/eligible?studentId=student-a',
    ['admin-a'],
    ['teacher-a', 'guardian-a', 'student-user-a', 'admin-b'],
  ],
  [
    'eligible results of a foreign pupil',
    '/api/report-cards/eligible?studentId=student-b',
    ['admin-b'],
    ['admin-a', 'teacher-a', 'guardian-a', 'teacher-b'],
  ],
  [
    'pupil attendance',
    '/api/students/student-a/attendance',
    ['admin-a', 'teacher-a', 'guardian-a', 'student-user-a'],
    [
      'teacher-other',
      'guardian-other',
      'student-user-other',
      'guardian-peer',
      'student-user-peer',
      'admin-b',
    ],
  ],
  [
    'enrolment history',
    '/api/enrolments/history?studentId=student-a',
    ['admin-a', 'teacher-a', 'guardian-a', 'student-user-a'],
    [
      'teacher-other',
      'guardian-other',
      'student-user-other',
      'guardian-peer',
      'student-user-peer',
      'admin-b',
    ],
  ],
  [
    'assignment progress roster',
    `/api/assignments/${ids.assignment}/progress`,
    ['admin-a', 'teacher-a'],
    ['teacher-other', 'student-user-a', 'student-user-peer', 'guardian-a', 'admin-b', 'teacher-b'],
  ],
  [
    'curriculum status history',
    `/api/curriculum/${ids.curriculumOther}/status`,
    ['admin-a', 'teacher-other'],
    ['teacher-a', 'guardian-a', 'student-user-a', 'admin-b', 'teacher-b'],
  ],
  [
    'curriculum usage',
    `/api/curriculum/${ids.curriculumOther}/usage`,
    ['admin-a', 'teacher-other'],
    ['teacher-a', 'guardian-a', 'student-user-a', 'admin-b', 'teacher-b'],
  ],
  [
    'resource source',
    `/api/resources/${ids.resourceOther}/source`,
    ['admin-a', 'teacher-other'],
    ['teacher-a', 'guardian-a', 'student-user-a', 'admin-b', 'teacher-b'],
  ],
  [
    'school setup',
    '/api/schools/a/setup',
    ['admin-a', 'teacher-a', 'guardian-a', 'student-user-a'],
    ['admin-b', 'teacher-b', 'guardian-b', 'student-user-b'],
  ],
  [
    'other school setup',
    '/api/schools/b/setup',
    ['admin-b', 'teacher-b', 'guardian-b', 'student-user-b'],
    ['admin-a', 'teacher-a', 'guardian-a', 'student-user-a'],
  ],
  [
    'academic change receipt',
    `/api/academic-changes/${ids.academicChange}`,
    ['admin-a'],
    ['admin-b', 'teacher-a', 'guardian-a', 'student-user-a'],
  ],
  [
    'audit entry detail',
    `/api/admin/audit/attendance/${ids.auditEntry}`,
    ['admin-a'],
    ['admin-b', 'teacher-a', 'guardian-a', 'student-user-a'],
  ],
  ['audit trail', '/api/admin/audit', ['admin-a', 'admin-b'], ['teacher-a', 'guardian-a', 'student-user-a']],
  [
    'identity account detail',
    '/api/admin/users/teacher-a',
    ['admin-a'],
    ['admin-b', 'teacher-a', 'guardian-a', 'student-user-a'],
  ],
  [
    'identity change history',
    '/api/admin/users/changes',
    ['admin-a', 'admin-b'],
    ['teacher-a', 'teacher-b', 'guardian-a', 'student-user-a'],
  ],
];
let scopeChecks = 0;
for (const [name, path, allowed, hidden] of scopedReads) {
  for (const actor of allowed) {
    const result = await f.call(actor, 'GET', path);
    seen.push({
      ...result,
      row: { method: 'GET', route: path, clause: `scope: ${name}` },
      actor,
      path,
      bodyRead: false,
    });
    equal(
      result.status,
      200,
      `${name}: ${actor} is in scope and receives it (${result.status} ${result.text.slice(0, 100)})`,
    );
    scopeChecks++;
  }
  for (const actor of hidden) {
    const result = await f.call(actor, 'GET', path);
    seen.push({
      ...result,
      row: { method: 'GET', route: path, clause: `scope: ${name}` },
      actor,
      path,
      bodyRead: false,
    });
    check(
      [403, 404].includes(result.status),
      `${name}: ${actor} is out of scope and must not see it (got ${result.status} ${result.text.slice(0, 100)})`,
    );
    safeDenial(result, `${name}: ${actor} denial reveals only a safe error`);
    scopeChecks++;
  }
}
check(scopeChecks >= 200, `object-scope matrix exercised ${scopeChecks} cells`);

// Administrator-only timelines are scoped to the administrator's own school: school b sees none of school a's evidence.
{
  const own = await f.call('admin-a', 'GET', '/api/admin/audit');
  check(
    own.json.items.length > 0 && own.json.items.some((item) => item.sourceId === ids.auditEntry),
    'positive control: the school a audit trail lists the real attendance review entry',
  );
  const foreign = await f.call('admin-b', 'GET', '/api/admin/audit');
  equal(
    foreign.json.items.filter(
      (item) =>
        item.sourceId === ids.auditEntry || /student-a|student-peer|class-a/.test(JSON.stringify(item)),
    ),
    [],
    'School b administrator receives no school a audit entry',
  );
  const changesA = await f.call('admin-a', 'GET', '/api/admin/users/changes');
  const changesB = await f.call('admin-b', 'GET', '/api/admin/users/changes');
  check(Array.isArray(changesA.json) && Array.isArray(changesB.json), 'Identity change lists are arrays');
  equal(
    changesB.json.filter((event) => event.schoolId !== 'b'),
    [],
    'School b identity change list contains only school b events',
  );
}

// Family roster privacy: a guardian/student sees the class but never classmates; staff see the roster.
{
  const rosterOf = async (actor) =>
    (await f.call(actor, 'GET', '/api/classes/class-a')).json.enrolledStudents
      .map((student) => student.id)
      .sort();
  equal(
    await rosterOf('guardian-a'),
    ['student-a'],
    'Guardian sees only the linked pupil in the class roster',
  );
  equal(
    await rosterOf('guardian-peer'),
    ['student-peer'],
    'Peer guardian sees only their pupil in the same class',
  );
  equal(await rosterOf('student-user-a'), ['student-a'], 'Student sees only themselves in the roster');
  equal(
    await rosterOf('teacher-a'),
    ['student-a', 'student-peer'],
    'Assigned teacher sees the active roster',
  );
  equal(
    await rosterOf('admin-a'),
    ['student-a', 'student-peer'],
    'School administrator sees the active roster',
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Section 6: every response from sections 2-5 leaks nothing outside the actor's scope.
// ---------------------------------------------------------------------------------------------------------------
const markers = {
  // marker -> predicate(actor) says whether the actor may legitimately see it
  'student-b': (actor) => actor.endsWith('-b') || actor.endsWith('user-b'),
  'class-b': (actor) => actor.endsWith('-b') || actor.endsWith('user-b'),
  'course-b': (actor) => actor.endsWith('-b') || actor.endsWith('user-b'),
  'assessment-b': (actor) => actor.endsWith('-b') || actor.endsWith('user-b'),
  'published-b': (actor) => actor.endsWith('-b') || actor.endsWith('user-b'),
  'guardian-profile-b': (actor) => actor.endsWith('-b') || actor.endsWith('user-b'),
  'notice-guardian-b': (actor) => actor === 'guardian-b',
  'Synthetic school b': (actor) => actor.endsWith('-b') || actor.endsWith('user-b'),
  'admin-b': (actor) => actor.endsWith('-b') || actor.endsWith('user-b'),
  'teacher-b': (actor) => actor.endsWith('-b') || actor.endsWith('user-b'),
  'guardian-b': (actor) => actor.endsWith('-b') || actor.endsWith('user-b'),
  'student-user-b': (actor) => actor.endsWith('-b') || actor.endsWith('user-b'),
  'student-other': (actor) =>
    ['admin-a', 'teacher-other', 'guardian-other', 'student-user-other'].includes(actor),
  'class-other': (actor) =>
    ['admin-a', 'teacher-other', 'guardian-other', 'student-user-other'].includes(actor),
  'guardian-profile-other': (actor) => ['admin-a', 'teacher-other', 'guardian-other'].includes(actor),
  'notice-guardian-other': (actor) => actor === 'guardian-other',
  'guardian-other': (actor) =>
    ['admin-a', 'guardian-other', 'teacher-other', 'student-user-other'].includes(actor),
  'student-user-other': (actor) =>
    ['admin-a', 'student-user-other', 'teacher-other', 'guardian-other'].includes(actor),
  'student-peer': (actor) => ['admin-a', 'teacher-a', 'guardian-peer', 'student-user-peer'].includes(actor),
  'guardian-profile-peer': (actor) => ['admin-a', 'teacher-a', 'guardian-peer'].includes(actor),
  'guardian-peer': (actor) => ['admin-a', 'teacher-a', 'guardian-peer', 'student-user-peer'].includes(actor),
  'student-user-peer': (actor) =>
    ['admin-a', 'teacher-a', 'student-user-peer', 'guardian-peer'].includes(actor),
  'PRIVATE-NOTES-MARKER': (actor) => ['admin-a', 'teacher-a'].includes(actor),
  'PRIVATE-ANSWER-MARKER': (actor) => ['admin-a', 'teacher-a'].includes(actor),
  'PRIVATE-NOTES-OTHER': (actor) => ['admin-a', 'teacher-other'].includes(actor),
  'PRIVATE-ANSWER-OTHER': (actor) => ['admin-a', 'teacher-other'].includes(actor),
  'PRIVATE-DRAFT-MARKER': (actor) => ['admin-a', 'teacher-a'].includes(actor), // contract: only G/S are limited to published reports
  [ids.resourceOther]: (actor) => ['admin-a', 'teacher-other'].includes(actor),
  [ids.curriculumOther]: (actor) => ['admin-a', 'teacher-other'].includes(actor),
  [ids.submission]: (actor) => ['admin-a', 'teacher-a', 'student-user-a'].includes(actor),
  [ids.feedback]: (actor) => ['admin-a', 'teacher-a', 'student-user-a'].includes(actor),
  [ids.reading]: (actor) => ['admin-a', 'teacher-a'].includes(actor),
  [ids.import]: (actor) => ['admin-a', 'teacher-a'].includes(actor),
  [ids.registryRequest]: (actor) => actor === 'admin-a',
  [ids.academicChange]: (actor) => actor === 'admin-a',
};
const boundary = (marker) =>
  new RegExp(`(?<![A-Za-z0-9-])${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9-])`);
let leakChecks = 0;
for (const result of seen) {
  if (!result.actor || /^teacher-(disabled|unmapped|expired)$/.test(result.actor)) continue;
  for (const [marker, visible] of Object.entries(markers)) {
    if (visible(result.actor)) continue;
    if (boundary(marker).test(result.text)) {
      // Plain administrator-only evidence about the actor's own pupil may carry the peer's id only when the actor is staff.
      check(
        false,
        `LEAK: "${marker}" visible to ${result.actor} in ${result.row.method} ${result.path} (${result.row.clause}): ${result.text.slice(0, 160)}`,
      );
    }
    leakChecks++;
  }
}
check(
  leakChecks > 20000,
  `leak scan examined ${seen.length} responses x markers (${leakChecks} marker checks)`,
);

// ---------------------------------------------------------------------------------------------------------------
// Section 7: response invariants over every recorded response.
// ---------------------------------------------------------------------------------------------------------------
let invariantChecks = 0;
for (const result of seen) {
  if (result.status === 204 || result.status === 405) continue;
  check(
    result.headers.get('cache-control') === 'no-store',
    `no-store on ${result.row.method} ${result.path} as ${result.actor} (${result.status})`,
  );
  check(
    /^application\/json/.test(result.headers.get('content-type') ?? ''),
    `JSON content type on ${result.path} (${result.status})`,
  );
  check(result.headers.get('set-cookie') === null, `no cookie set by ${result.row.method} ${result.path}`);
  if (result.status >= 400) {
    check(
      result.json && typeof result.json.error === 'string' && ERROR_BODIES.has(result.json.error),
      `known safe error text on ${result.row.method} ${result.path} as ${result.actor} (${result.status}): ${result.text.slice(0, 120)}`,
    );
    check(
      !LEAK_PATTERN.test(result.text),
      `no SQL/stack/internal detail in ${result.path}: ${result.text.slice(0, 160)}`,
    );
  }
  invariantChecks++;
}
check(invariantChecks >= 2000, `invariants verified on ${invariantChecks} responses`);

// Teacher notes and answer key never appear in any student/guardian response, including the assignment feeds.
for (const actor of ['student-user-a', 'student-user-peer', 'guardian-a']) {
  for (const path of [
    '/api/resource-assignments',
    '/api/classes/class-a',
    '/api/assessments',
    '/api/students/student-a',
  ]) {
    const result = await f.call(actor, 'GET', path);
    check(
      !/PRIVATE-NOTES-MARKER|PRIVATE-ANSWER-MARKER|teacherNotes|answerKey/.test(result.text),
      `private staff fields absent from ${actor} ${path}`,
    );
  }
}
for (const actor of ['admin-a', 'teacher-a']) {
  const feed = await f.call(actor, 'GET', '/api/resource-assignments');
  check(
    !/PRIVATE-NOTES-MARKER|PRIVATE-ANSWER-MARKER/.test(feed.text),
    `contract: notes/key omitted for ALL roles in the assignment feed (${actor})`,
  );
}
{
  const versions = await f.call('teacher-a', 'GET', `/api/resources/${ids.resource}/versions`);
  check(
    /PRIVATE-NOTES-MARKER/.test(versions.text) && /PRIVATE-ANSWER-MARKER/.test(versions.text),
    'positive control: owner staff version history does carry the private fields (the scan is not vacuous)',
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Section 8: hostile writes with VALID bodies from out-of-scope actors change nothing; an in-scope actor's same
// request succeeds on a second, identical fixture (so the denial is not caused by a malformed payload).
// ---------------------------------------------------------------------------------------------------------------
const uuid = () => crypto.randomUUID();
function writeCases(g) {
  const g_ids = g.ids;
  const row = (sql, ...params) => g.sqlite.prepare(sql).get(...params);
  const updatedAt = (table, id) => row(`SELECT updated_at AS value FROM ${table} WHERE id = ?`, id).value;
  return [
    [
      'attendance review',
      'POST',
      '/api/classes/class-a/attendance-editor',
      () => ({
        date: '2026-10-03',
        clientRequestId: uuid(),
        reviewConfirmed: true,
        reason: 'Synthetic reviewed attendance change.',
        entries: [{ studentId: 'student-a', status: 'late', note: null, expectedRecord: null }],
      }),
      'teacher-a',
      ['teacher-other', 'admin-b', 'teacher-b', 'guardian-a', 'student-user-a'],
      [201],
    ],
    [
      'legacy attendance',
      'POST',
      '/api/attendance',
      () => ({
        classId: 'class-a',
        date: '2026-10-04',
        entries: [{ studentId: 'student-a', status: 'present' }],
      }),
      'teacher-a',
      ['teacher-other', 'admin-b', 'teacher-b', 'guardian-a'],
      [200],
    ],
    [
      'legacy results',
      'POST',
      '/api/assessments/assessment-a/results',
      () => ({ results: [{ studentId: 'student-a', score: 3, grade: 'C', feedback: 'Synthetic.' }] }),
      'teacher-a',
      ['teacher-other', 'admin-b', 'teacher-b', 'student-user-a'],
      [200],
    ],
    [
      'assessment create',
      'POST',
      '/api/assessments',
      () => ({ classId: 'class-a', title: 'Hostile quiz', kind: 'quiz', maxScore: 10, date: '2026-10-06' }),
      'teacher-a',
      ['teacher-other', 'admin-b', 'teacher-b', 'guardian-a'],
      [201],
    ],
    [
      'resource revision',
      'PATCH',
      `/api/resources/${g_ids.resource}`,
      () => ({
        expectedVersion: 1,
        content: {
          title: 'Hijacked',
          type: 'worksheet',
          curriculum: 'x',
          gradeLevel: '8',
          subject: 'Maths',
          language: 'en-IN',
          objectives: 'x',
          body: 'x',
          teacherNotes: '',
          answerKey: '',
        },
      }),
      'teacher-a',
      ['teacher-other', 'admin-b', 'teacher-b', 'student-user-a'],
      [200],
    ],
    [
      'resource approval',
      'POST',
      `/api/resources/${g_ids.resourceOther}/approve`,
      () => ({ versionId: g_ids.versionOther }),
      'teacher-other',
      ['teacher-a', 'admin-b', 'teacher-b', 'student-user-a'],
      [200],
    ],
    [
      'resource assignment to another teacher class',
      'POST',
      `/api/resources/${g_ids.resource}/assign`,
      () => ({ versionId: g_ids.version, classId: 'class-other' }),
      'admin-a',
      ['teacher-a', 'teacher-other', 'admin-b', 'student-user-a'],
      [201],
    ],
    [
      'curriculum copy of a foreign source',
      'POST',
      `/api/curriculum/${g_ids.curriculum}/draft`,
      () => ({ versionId: g_ids.curriculumVersion, type: 'worksheet', clientResourceId: uuid() }),
      'teacher-a',
      ['admin-b', 'teacher-b', 'guardian-a', 'student-user-a'],
      [201],
    ],
    [
      'curriculum approval of another author draft',
      'POST',
      `/api/curriculum/${g_ids.curriculumOther}/approve`,
      () => ({ versionId: g_ids.curriculumOtherVersion, confirmReview: true }),
      'teacher-other',
      ['teacher-a', 'admin-b', 'teacher-b', 'guardian-a'],
      [200],
    ],
    [
      'submission by an unenrolled student',
      'POST',
      `/api/assignments/${g_ids.assignment}/submissions`,
      () => ({ response: 'Hostile answer', expectedAttempt: 0, clientSubmissionId: uuid() }),
      'student-user-peer',
      ['student-user-other', 'student-user-b', 'guardian-a', 'teacher-a', 'admin-a'],
      [201],
    ],
    [
      'feedback by an unassigned teacher',
      'POST',
      `/api/assignments/${g_ids.assignment}/submissions/${g_ids.submission}/feedback`,
      () => ({ feedback: 'Hostile feedback', reviewed: true, expectedRevision: 1, clientFeedbackId: uuid() }),
      'teacher-a',
      ['teacher-other', 'admin-b', 'student-user-a', 'guardian-a'],
      [201],
    ],
    [
      'submission window by an unassigned teacher',
      'POST',
      `/api/assignments/${g_ids.assignment}/submission-window`,
      () => ({
        clientPolicyId: uuid(),
        expectedRevision: 1,
        state: 'closed',
        closesAt: null,
        reviewConfirmed: true,
        reason: 'Hostile closing of learner access.',
      }),
      'teacher-a',
      ['teacher-other', 'admin-b', 'student-user-a', 'guardian-a'],
      [201],
    ],
    [
      'reading check for a foreign pupil',
      'POST',
      '/api/reading-checks',
      () => ({
        clientCheckId: uuid(),
        classId: 'class-other',
        studentId: 'student-other',
        language: 'en-IN',
        passageReference: 'Hostile passage',
        readingDate: '2026-10-01',
        durationSeconds: 30,
        wordsAttempted: 20,
        wordsCorrect: 10,
      }),
      'teacher-other',
      ['teacher-a', 'admin-b', 'guardian-a', 'student-user-other'],
      [201],
    ],
    [
      'reading correction by an unassigned teacher',
      'POST',
      `/api/reading-checks/${g_ids.reading}/corrections`,
      () => ({
        clientCorrectionId: uuid(),
        expectedRevision: 1,
        confirmReviewed: true,
        reason: 'Hostile correction.',
        language: 'en-IN',
        passageReference: 'Synthetic passage',
        readingDate: '2026-10-01',
        durationSeconds: 45,
        wordsAttempted: 40,
        wordsCorrect: 1,
      }),
      'teacher-a',
      ['teacher-other', 'admin-b', 'guardian-a', 'student-user-a'],
      [201],
    ],
    [
      'reading import decision by an unassigned teacher',
      'POST',
      `/api/reading-imports/${g_ids.import}/decision`,
      () => ({
        clientDecisionId: uuid(),
        expectedRevision: 0,
        action: 'reject',
        confirmReviewed: true,
        reason: 'Hostile rejection of staged evidence.',
      }),
      'teacher-a',
      ['teacher-other', 'admin-b', 'guardian-a', 'student-user-a'],
      [200],
    ],
    [
      'class edit across schools',
      'PATCH',
      '/api/classes/class-a',
      () => ({
        schoolId: 'a',
        courseId: 'course-a',
        teacherId: 'teacher-a',
        name: 'Hijacked class',
        term: 'T1',
      }),
      'admin-a',
      ['admin-b', 'teacher-a', 'teacher-b', 'guardian-a'],
      [200],
    ],
    [
      'school edit across schools',
      'PATCH',
      '/api/schools/a',
      () => ({ name: 'Hijacked school' }),
      'admin-a',
      ['admin-b', 'teacher-a', 'guardian-a'],
      [200],
    ],
    [
      'student edit across schools',
      'PATCH',
      '/api/students/student-a',
      () => ({
        schoolId: 'a',
        firstName: 'Hijacked',
        lastName: 'Synthetic',
        dateOfBirth: '2012-01-01',
        admissionNumber: 'student-a',
        gradeLevel: '8',
      }),
      'admin-a',
      ['admin-b', 'teacher-a', 'guardian-a', 'student-user-a'],
      [200],
    ],
    [
      'course edit across schools',
      'PATCH',
      '/api/courses/course-a',
      () => ({ schoolId: 'a', code: 'course-a', title: 'Hijacked course', gradeLevel: '8' }),
      'admin-a',
      ['admin-b', 'teacher-a', 'guardian-a'],
      [200],
    ],
    [
      'enrolment of a foreign pupil',
      'POST',
      '/api/enrolments',
      () => ({ studentId: 'student-b', classId: 'class-a' }),
      null,
      ['admin-a', 'admin-b', 'teacher-a'],
      null,
    ],
    [
      'guardian link across schools',
      'POST',
      '/api/students/student-a/guardians',
      () => ({ guardianId: 'guardian-profile-b' }),
      null,
      ['admin-a', 'admin-b', 'teacher-a'],
      null,
    ],
    [
      'report publish across schools',
      'PATCH',
      `/api/report-cards/${g_ids.reportDraft}`,
      () => ({ publish: true }),
      'admin-a',
      ['admin-b', 'teacher-a', 'guardian-a'],
      [200],
    ],
    [
      'notice to a foreign recipient',
      'POST',
      '/api/notifications',
      () => ({ userId: 'guardian-b', channel: 'in_app', title: 'Hostile notice', body: 'Hostile body.' }),
      null,
      ['admin-a', 'teacher-a'],
      null,
    ],
    [
      'notice to an unrelated family by a teacher',
      'POST',
      '/api/notifications',
      () => ({ userId: 'guardian-other', channel: 'in_app', title: 'Hostile notice', body: 'Hostile body.' }),
      null,
      ['teacher-a'],
      null,
    ],
    [
      'notice read acknowledgement of another recipient',
      'PATCH',
      '/api/notifications?id=notice-guardian-other',
      () => undefined,
      'guardian-other',
      ['guardian-a', 'admin-a', 'teacher-a', 'admin-b'],
      [200],
    ],
    [
      'identity status change across schools',
      'PATCH',
      '/api/admin/users/teacher-a',
      () => ({
        clientRequestId: uuid(),
        expectedVersion: 0,
        enabled: false,
        reviewConfirmed: true,
        reason: 'Hostile disablement of another school staff.',
      }),
      null,
      ['admin-b', 'teacher-a'],
      null,
    ],
    [
      'profile link across schools',
      'POST',
      '/api/admin/profile-links',
      () => ({
        profileType: 'student',
        profileId: 'student-a',
        userId: null,
        expectedVersion: 0,
        clientRequestId: uuid(),
        reviewConfirmed: true,
        reason: 'Hostile unlink of a foreign pupil.',
      }),
      null,
      ['admin-b', 'teacher-a'],
      null,
    ],
    // Role denials with a VALID body: the 400-before-403 ordering above must never turn into an allowed write.
    [
      'student profile created by a non-administrator',
      'POST',
      '/api/students',
      () => ({
        schoolId: 'a',
        firstName: 'Hostile',
        lastName: 'Synthetic',
        dateOfBirth: '2012-01-01',
        admissionNumber: 'HOSTILE-' + uuid(),
        gradeLevel: '8',
      }),
      'admin-a',
      ['teacher-a', 'guardian-a', 'student-user-a'],
      [201],
    ],
    [
      'guardian profile created by a non-administrator',
      'POST',
      '/api/guardians',
      () => ({ name: 'Hostile guardian', relationship: 'parent' }),
      'admin-a',
      ['teacher-a', 'guardian-a', 'student-user-a'],
      [201],
    ],
    [
      'class created by a teacher',
      'POST',
      '/api/classes',
      () => ({
        schoolId: 'a',
        courseId: 'course-a',
        teacherId: 'teacher-a',
        name: 'Hostile class',
        term: 'T1',
      }),
      'admin-a',
      ['teacher-a', 'guardian-a', 'student-user-a'],
      [201],
    ],
    [
      'course created by a teacher',
      'POST',
      '/api/courses',
      () => ({
        schoolId: 'a',
        code: 'hostile-' + uuid().slice(0, 8),
        title: 'Hostile course',
        gradeLevel: '8',
      }),
      'admin-a',
      ['teacher-a', 'guardian-a', 'student-user-a'],
      [201],
    ],
    [
      'school provisioning is closed to everyone',
      'POST',
      '/api/schools',
      () => ({ name: 'Hostile school' }),
      null,
      ['admin-a', 'admin-b', 'teacher-a', 'guardian-a'],
      null,
    ],
    [
      'report created by a teacher',
      'POST',
      '/api/report-cards',
      () => ({ studentId: 'student-a', term: 'Hostile', overallGrade: 'A' }),
      'admin-a',
      ['teacher-a', 'guardian-a', 'student-user-a'],
      [201],
    ],
    [
      'resource created by family',
      'POST',
      '/api/resources',
      () => ({
        clientResourceId: uuid(),
        content: {
          title: 'Hostile',
          type: 'worksheet',
          curriculum: 'x',
          gradeLevel: '8',
          subject: 'Maths',
          language: 'en-IN',
          objectives: 'x',
          body: 'x',
          teacherNotes: '',
          answerKey: '',
        },
      }),
      'teacher-a',
      ['guardian-a', 'student-user-a'],
      [201],
    ],
    [
      'resource approved by family',
      'POST',
      `/api/resources/${g_ids.resourceOther}/approve`,
      () => ({ versionId: g_ids.versionOther }),
      'teacher-other',
      ['guardian-a', 'student-user-a', 'guardian-other'],
      [200],
    ],
    [
      'resource assigned by family',
      'POST',
      `/api/resources/${g_ids.resource}/assign`,
      () => ({ versionId: g_ids.version, classId: 'class-other' }),
      'admin-a',
      ['guardian-a', 'student-user-a'],
      [201],
    ],
    [
      'curriculum created by family',
      'POST',
      '/api/curriculum',
      () => ({
        clientReferenceId: uuid(),
        content: {
          title: 'Hostile',
          curriculum: 'x',
          gradeLevel: '8',
          subject: 'Maths',
          language: 'en-IN',
          objectives: 'x',
          body: 'x',
          rightsStatement: 'Original synthetic content.',
        },
      }),
      'teacher-a',
      ['guardian-a', 'student-user-a'],
      [201],
    ],
    [
      'curriculum approved by family',
      'POST',
      `/api/curriculum/${g_ids.curriculumOther}/approve`,
      () => ({ versionId: g_ids.curriculumOtherVersion, confirmReview: true }),
      'teacher-other',
      ['guardian-a', 'student-user-a'],
      [200],
    ],
    [
      'reading check by family',
      'POST',
      '/api/reading-checks',
      () => ({
        clientCheckId: uuid(),
        classId: 'class-a',
        studentId: 'student-a',
        language: 'en-IN',
        passageReference: 'Hostile passage',
        readingDate: '2026-10-01',
        durationSeconds: 30,
        wordsAttempted: 20,
        wordsCorrect: 10,
      }),
      'teacher-a',
      ['guardian-a', 'student-user-a'],
      [201],
    ],
    [
      'external launch by family',
      'POST',
      '/api/external-apps/oral-reading-fluency/launch',
      () => ({}),
      null,
      ['guardian-a', 'student-user-a'],
      null,
    ],
    [
      'identity provisioned by a teacher',
      'POST',
      '/api/admin/users',
      () => ({
        clientRequestId: uuid(),
        name: 'Hostile account',
        email: 'hostile@example.invalid',
        role: 'admin',
        identityIssuer: 'https://identity.example.invalid',
        identitySubject: 'hostile-' + uuid(),
        reviewConfirmed: true,
        reason: 'Hostile attempt to mint an administrator.',
      }),
      'admin-a',
      ['teacher-a', 'guardian-a', 'student-user-a'],
      [201],
    ],
    [
      'registry student created by a teacher',
      'POST',
      '/api/registry/students',
      () => ({
        clientRequestId: uuid(),
        reviewConfirmed: true,
        reason: 'Hostile registry creation attempt',
        profile: {
          firstName: 'Hostile',
          lastName: 'Registry',
          dateOfBirth: '2012-01-01',
          admissionNumber: 'H-' + uuid(),
          gradeLevel: '8',
        },
      }),
      'admin-a',
      ['teacher-a', 'guardian-a', 'student-user-a'],
      [201],
    ],
    [
      'registry guardian created by a teacher',
      'POST',
      '/api/registry/guardians',
      () => ({
        clientRequestId: uuid(),
        reviewConfirmed: true,
        reason: 'Hostile registry creation attempt',
        profile: { name: 'Hostile guardian', relationship: 'parent' },
      }),
      'admin-a',
      ['teacher-a', 'guardian-a', 'student-user-a'],
      [201],
    ],
    [
      'profile ownership changed by a teacher',
      'POST',
      '/api/admin/profile-links',
      () => ({
        profileType: 'student',
        profileId: 'student-a',
        userId: null,
        expectedVersion: 0,
        clientRequestId: uuid(),
        reviewConfirmed: true,
        reason: 'Hostile unlink attempt by staff.',
      }),
      'admin-a',
      ['teacher-a', 'guardian-a', 'student-user-a'],
      [200],
    ],
    [
      'external launch for an inaccessible pupil',
      'POST',
      '/api/external-apps/oral-reading-fluency/launch',
      () => ({ studentId: 'student-b' }),
      null,
      ['teacher-a', 'admin-a'],
      null,
    ],
    // ---- v2.13 handlers (merged inventory): valid bodies from out-of-scope actors must be denied and change nothing.
    [
      'academic change by a non-administrator',
      'POST',
      '/api/academic-changes',
      () => ({
        clientRequestId: uuid(),
        changes: [
          {
            kind: 'course.create',
            code: 'HOSTILE-' + uuid().slice(0, 8),
            title: 'Hostile lifecycle course',
            description: null,
            gradeLevel: '8',
          },
        ],
      }),
      'admin-a',
      ['teacher-a', 'guardian-a', 'student-user-a'],
      [201],
    ],
    [
      'notice sent by family',
      'POST',
      '/api/notices',
      () => ({
        clientRequestId: uuid(),
        title: 'Hostile notice',
        body: 'Hostile body.',
        audience: { kind: 'class', classId: 'class-a', roles: 'both' },
        reviewConfirmed: true,
      }),
      'teacher-a',
      ['guardian-a', 'student-user-a'],
      [201],
    ],
    [
      'notice to a class the teacher does not teach',
      'POST',
      '/api/notices',
      () => ({
        clientRequestId: uuid(),
        title: 'Hostile notice',
        body: 'Hostile body.',
        audience: { kind: 'class', classId: 'class-a', roles: 'both' },
        reviewConfirmed: true,
      }),
      'teacher-a',
      ['teacher-other', 'admin-b', 'teacher-b'],
      [201],
    ],
    [
      'notice to a foreign person',
      'POST',
      '/api/notices',
      () => ({
        clientRequestId: uuid(),
        title: 'Hostile notice',
        body: 'Hostile body.',
        audience: { kind: 'recipients', userIds: ['guardian-b'] },
        reviewConfirmed: true,
      }),
      null,
      ['admin-a', 'teacher-a'],
      null,
    ],
    [
      'notice correction by an unrelated actor',
      'POST',
      `/api/notices/${g_ids.notice}/corrections`,
      () => ({
        clientRequestId: uuid(),
        title: 'Hostile correction',
        body: 'Hostile corrected body.',
        reason: 'Hostile correction attempt.',
        reviewConfirmed: true,
      }),
      'teacher-a',
      ['teacher-other', 'admin-b', 'teacher-b', 'guardian-a', 'student-user-a'],
      [201],
    ],
    [
      'audit note by a non-administrator',
      'POST',
      '/api/admin/audit/annotations',
      () => ({
        clientRequestId: uuid(),
        source: 'attendance',
        sourceId: g_ids.auditEntry,
        note: 'Hostile note on the audit trail.',
        reviewConfirmed: true,
      }),
      'admin-a',
      ['teacher-a', 'guardian-a', 'student-user-a', 'admin-b'],
      [201],
    ],
    [
      'assessment details edited by an unassigned teacher',
      'PATCH',
      '/api/assessments/assessment-a',
      () => ({
        clientRequestId: uuid(),
        expected: {
          title: 'Synthetic quiz',
          kind: 'quiz',
          maxScore: 20,
          date: '2026-10-05',
          updatedAt: updatedAt('assessments', 'assessment-a'),
        },
        details: { title: 'Hijacked quiz', kind: 'quiz', maxScore: 20, date: '2026-10-05' },
        reason: 'Hostile edit of assessment details.',
      }),
      'teacher-a',
      ['teacher-other', 'admin-b', 'teacher-b', 'guardian-a', 'student-user-a'],
      [201],
    ],
    [
      'assessment results published by an unassigned teacher',
      'POST',
      '/api/assessments/assessment-a/lifecycle',
      () => ({ clientRequestId: uuid(), action: 'publish', partialConfirmed: true }),
      'teacher-a',
      ['teacher-other', 'admin-b', 'teacher-b', 'guardian-a', 'student-user-a'],
      [201],
    ],
    [
      'student record edited by a non-administrator',
      'PATCH',
      '/api/records/students/student-a',
      () => ({
        firstName: 'Hijacked',
        lastName: 'Synthetic',
        dateOfBirth: '2012-01-01',
        admissionNumber: 'student-a',
        gradeLevel: '8',
        expectedUpdatedAt: updatedAt('students', 'student-a'),
      }),
      'admin-a',
      ['teacher-a', 'guardian-a', 'student-user-a', 'admin-b'],
      [200],
    ],
    [
      'guardian link by a non-administrator',
      'POST',
      '/api/records/students/student-a/guardian-links',
      () => ({
        action: 'link',
        guardianId: 'guardian-profile-other',
        relationship: 'aunt',
        isPrimary: false,
        reason: 'Hostile guardian link attempt.',
        clientRequestId: uuid(),
        expectedVersion: 0,
      }),
      'admin-a',
      ['teacher-a', 'guardian-a', 'student-user-a', 'admin-b'],
      [201],
    ],
    [
      'guardian record edited by a non-administrator',
      'PATCH',
      '/api/records/guardians/guardian-profile-a',
      () => ({
        name: 'Hijacked guardian',
        phone: null,
        email: null,
        relationship: 'parent',
        expectedUpdatedAt: updatedAt('guardians', 'guardian-profile-a'),
      }),
      'admin-a',
      ['teacher-a', 'guardian-a', 'student-user-a', 'admin-b'],
      [200],
    ],
    [
      'school setup edited by a non-administrator',
      'PATCH',
      '/api/schools/a/setup',
      () => ({
        name: 'Hijacked school',
        address: null,
        academicYear: null,
        contactEmail: null,
        contactPhone: null,
        currentTermId: null,
        expectedVersion: row(
          'SELECT coalesce((SELECT version FROM school_setup_settings WHERE school_id = ?), 0) AS value',
          'a',
        ).value,
        expectedUpdatedAt: updatedAt('schools', 'a'),
      }),
      'admin-a',
      ['teacher-a', 'guardian-a', 'student-user-a', 'admin-b'],
      [200],
    ],
    [
      'school term created by a non-administrator',
      'POST',
      '/api/schools/a/terms',
      () => ({
        clientRequestId: uuid(),
        academicYear: '2027-28',
        name: 'Hostile term',
        startsOn: '2027-04-01',
        endsOn: '2027-09-30',
      }),
      'admin-a',
      ['teacher-a', 'guardian-a', 'student-user-a', 'admin-b'],
      [201],
    ],
    [
      'school term edited by a non-administrator',
      'PATCH',
      `/api/schools/a/terms/${g_ids.term}`,
      () => ({
        academicYear: '2026-27',
        name: 'Hijacked term',
        startsOn: '2026-04-01',
        endsOn: '2026-09-30',
        expectedVersion: row('SELECT version AS value FROM school_setup_terms WHERE id = ?', g_ids.term)
          .value,
      }),
      'admin-a',
      ['teacher-a', 'guardian-a', 'student-user-a', 'admin-b'],
      [200],
    ],
    [
      'attendance calendar changed by a non-administrator',
      'PUT',
      '/api/attendance/calendar',
      () => ({ timezone: 'Asia/Kolkata', futureDatesAllowed: true }),
      'admin-a',
      ['teacher-a', 'guardian-a', 'student-user-a'],
      [200],
    ],
    [
      'curriculum retired by an unrelated actor',
      'POST',
      `/api/curriculum/${g_ids.curriculumOther}/status`,
      () => ({
        clientEventId: uuid(),
        expectedRevision: 0,
        status: 'retired',
        reason: 'Hostile retirement of a draft.',
      }),
      'teacher-other',
      ['teacher-a', 'admin-b', 'teacher-b', 'guardian-a', 'student-user-a'],
      [201],
    ],
    [
      'identity role changed by a non-administrator',
      'PATCH',
      '/api/admin/users/teacher-disabled/role',
      () => ({
        clientRequestId: uuid(),
        reviewConfirmed: true,
        reason: 'Hostile role escalation attempt.',
        expectedVersion: 0,
        role: 'admin',
      }),
      'admin-a',
      ['teacher-a', 'guardian-a', 'student-user-a', 'admin-b'],
      [200],
    ],
    [
      'identity linked by a non-administrator',
      'PATCH',
      '/api/admin/users/teacher-unmapped/identity',
      () => ({
        clientRequestId: uuid(),
        reviewConfirmed: true,
        reason: 'Hostile identity link attempt.',
        expectedVersion: 0,
        action: 'link',
        identityIssuer: 'https://identity.example.invalid',
        identitySubject: 'hostile-' + uuid(),
      }),
      'admin-a',
      ['teacher-a', 'guardian-a', 'student-user-a', 'admin-b'],
      [200],
    ],
    [
      'pupil deactivated by a non-administrator',
      'POST',
      '/api/records/students/student-peer/status',
      () => ({
        action: 'deactivate',
        reason: 'Hostile deactivation attempt.',
        expectedVersion: 0,
        clientRequestId: uuid(),
      }),
      'admin-a',
      ['teacher-a', 'guardian-a', 'student-user-a', 'admin-b'],
      [201],
    ],
    // Last on purpose: its positive control withdraws a pupil, which later controls would need active.
    [
      'enrolment withdrawn by a non-administrator',
      'PATCH',
      '/api/enrolments',
      () => ({ id: 'student-a-enrolment', status: 'withdrawn' }),
      'admin-a',
      ['teacher-a', 'guardian-a', 'student-user-a', 'admin-b'],
      [200],
    ],
  ];
}
let hostileWrites = 0,
  positiveControls = 0;
const pending = writeCases(f);
const v213Start = pending.findIndex((entry) => entry[0] === 'academic change by a non-administrator');
const V213_CASES = 19;
equal(
  pending.findIndex((entry) => entry[0] === 'enrolment withdrawn by a non-administrator') - v213Start,
  V213_CASES,
  'The strict v2.13 hostile-write block covers exactly its 19 cases',
);
for (const [index, [name, method, path, payload, , hostile]] of pending.entries()) {
  before = f.fingerprint();
  for (const actor of hostile) {
    const body = payload();
    const result = await f.call(actor, method, path, body === undefined ? {} : { body });
    seen.push({
      ...result,
      row: { method, route: path, clause: `hostile write: ${name}` },
      actor,
      path,
      bodyRead: false,
    });
    // Strictly never a success; a denial writes nothing at all.
    check(
      [400, 403, 404, 409].includes(result.status),
      `${name}: ${actor} got ${result.status} ${result.text.slice(0, 100)}; must be a denial`,
    );
    // The v2.13 cases carry a fully valid body, so the only acceptable answer is a role or scope denial (403/404), never a
    // validation (400) or state conflict (409) answer that would show the request got past the authority gate.
    if (v213Start >= 0 && index >= v213Start && index < v213Start + V213_CASES)
      check(
        [403, 404].includes(result.status),
        `${name}: ${actor} must be stopped by the role/scope gate (403/404), got ${result.status} ${result.text.slice(0, 100)}`,
      );
    safeDenial(result, `${name}: ${actor} denial is a safe {error}`);
    equal(f.changedTables(before, f.fingerprint()), [], `${name}: denied write by ${actor} changed no table`);
    hostileWrites++;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Section 9: methods and the unauthenticated public surface.
// ---------------------------------------------------------------------------------------------------------------
for (const route of discovered) {
  const methods = await exportedMethods(route);
  const path = route.pattern.replace(/\[[^\]]+\]/g, 'x');
  for (const method of ['PUT', 'DELETE']) {
    if (methods.includes(method)) continue;
    const result = await f.call('admin-a', method, path);
    equal(result.status, 405, `${method} ${route.pattern} is not implemented (405)`);
    check(
      (result.headers.get('allow') ?? '').includes('OPTIONS'),
      `${route.pattern}: 405 lists allowed methods`,
    );
  }
}
{
  // HEAD on a protected GET must run the same authentication (framework falls back to GET) and expose no body to anonymous callers.
  const anonymous = await f.call(null, 'HEAD', '/api/students');
  equal(anonymous.status, 401, 'HEAD without a session is 401, like GET');
}
{
  const session = await f.call(null, 'GET', '/api/session');
  equal(session.status, 401, 'Anonymous session lookup is 401');
  equal(session.json, { error: 'Not authenticated' }, 'Anonymous session lookup reveals nothing');
  const own = await f.call('guardian-a', 'GET', '/api/session');
  equal(
    Object.keys(own.json).sort(),
    ['id', 'role', 'schoolId'],
    'Public session GET exposes only id, role and school',
  );
  const wrongOrigin = await f.call('guardian-a', 'DELETE', '/api/session', {
    origin: 'https://attacker.example.invalid',
  });
  equal(wrongOrigin.status, 403, 'Logout is a mutation and requires the matching origin');
  equal(
    (await f.call('guardian-a', 'GET', '/api/session')).status,
    200,
    'A cross-origin logout attempt did not revoke the session',
  );
  const posted = await f.call('guardian-a', 'POST', '/api/session', { body: { role: 'admin' } });
  equal(posted.status, 400, 'Role selection through POST /api/session is disabled');
  const pinned = await f.call('guardian-a', 'GET', '/api/session', {
    headers: { 'x-user-role': 'admin', 'x-school-id': 'b' },
  });
  equal(pinned.json.role, 'guardian', 'Role headers and legacy cookies cannot change the resolved role');
  const login = await f.call(null, 'POST', '/api/auth/login', { origin: 'https://attacker.example.invalid' });
  equal(login.status, 403, 'Login start requires the matching origin');
  const callback = await f.call(null, 'GET', '/api/auth/callback?state=x&code=y');
  equal(callback.status, 303, 'Callback failure redirects');
  equal(
    callback.response.headers.get('location'),
    '/login?error=signin_failed',
    'Callback failure reveals no provider detail',
  );
  equal(callback.text, '', 'Callback failure has no body');
}
{
  const loggedOut = await f.call('student-user-a', 'DELETE', '/api/session');
  equal(loggedOut.status, 200, 'Logout succeeds');
  equal(
    (await f.call('student-user-a', 'GET', '/api/session')).status,
    401,
    'The server-side session is revoked by logout, not merely the cookie',
  );
  const clear = loggedOut.headers.get('set-cookie') ?? '';
  check(/__Host-saha_session=; /.test(clear) && /Max-Age=0/.test(clear), 'Logout clears the session cookie');
}

// The same payloads, from the in-scope actor, succeed on a second identical fixture (installed only now because the
// test database handle is process-global): the hostile denials above were not caused by malformed payloads.
const control = await buildFixture();
for (const [name, method, , , owner, , success] of writeCases(control)) {
  if (!owner) continue;
  const entry = writeCases(control).find((candidate) => candidate[0] === name);
  const body = entry[3]();
  const result = await control.call(owner, method, entry[2], body === undefined ? {} : { body });
  check(
    success.includes(result.status),
    `${name}: positive control by ${owner} succeeds with the same payload shape (${result.status} ${result.text.slice(0, 160)})`,
  );
  positiveControls++;
}
check(
  hostileWrites >= 90 && positiveControls >= 20,
  `${hostileWrites} hostile writes and ${positiveControls} positive controls`,
);
check(externalRequests === 0, `no external request during the matrix (${externalRequests})`);
globalThis.fetch = realFetch;
console.log(
  `Authorization matrix: ${checks} checks; ${protectedRows.length} protected handlers; ${seen.length} recorded responses; ${observations.size} ordering observations.`,
);
for (const [line, actors] of [...observations].sort())
  console.log(`  ordering observation: ${line}; roles: ${[...actors].sort().join(', ')}`);
console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0 }));
