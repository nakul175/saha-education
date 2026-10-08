// Independent reviewed registry API contracts: actual synthetic opaque sessions,
// final SQLite migrations and production Drizzle D1. No substituted UI/browser.
import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/d1';
import { freshDatabase, seedSecurityData, load, bindings, stamp } from '../support/security-db.mjs';
const sessions = await load('lib/education/session.ts');
const profileLinks = await load('lib/education/profile-links.ts');
const auth = await load('lib/education/auth.ts');
const identity = await load('lib/education/identity.ts');
const routes = {
  student: await load('app/api/registry/students/route.ts'),
  guardian: await load('app/api/registry/guardians/route.ts'),
  receipt: await load('app/api/registry/creations/[requestId]/route.ts'),
  legacyStudent: await load('app/api/students/route.ts'),
  legacyGuardian: await load('app/api/guardians/route.ts'),
};
const origin = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = origin;
const oldFetch = globalThis.fetch;
let checks = 0,
  scenarios = 0,
  requests = 0,
  externalRequests = 0;
globalThis.fetch = async () => {
  externalRequests++;
  throw new Error('Reviewed registry tests remain offline and synthetic');
};
const check = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  checks++;
};
const okay = (actual, message) => {
  assert.ok(actual, message);
  checks++;
};
const profile = (kind) =>
  kind === 'student'
    ? {
        firstName: 'Synthetic Reviewed',
        lastName: 'Registry',
        dateOfBirth: '2012-01-01',
        admissionNumber: 'REVIEWED-REGISTRY-ONE',
        gradeLevel: '8',
      }
    : { name: 'Synthetic Reviewed Guardian', relationship: 'parent' };
const input = (kind, override = {}) => ({
  clientRequestId: crypto.randomUUID(),
  reviewConfirmed: true,
  reason: 'Synthetic administrator creation review',
  profile: profile(kind),
  ...override,
});
const context = (requestId) => ({ params: Promise.resolve({ requestId }) });
function receiptShape(receipt, kind, original, actor = 'admin-a', schoolId = 'a') {
  check(
    Object.keys(receipt).sort(),
    ['createdAt', 'createdBy', 'id', 'kind', 'profile', 'reason', 'schoolId'],
    'Receipt has only the private original creation DTO fields',
  );
  check(receipt.kind, kind, 'Receipt retains original registry kind');
  check(receipt.id, original.clientRequestId.toLowerCase(), 'Request UUID is canonicalized consistently');
  check(receipt.createdBy, actor, 'Creator is authenticated rather than caller supplied');
  check(receipt.schoolId, schoolId, 'School is derived from current administrator');
  check(receipt.reason, original.reason.trim(), 'Review reason is attributable and retained');
  okay(Number.isFinite(Date.parse(receipt.createdAt)), 'Receipt has a real timestamp');
  check(receipt.profile.userId, null, 'Created profile is explicitly unlinked');
  check(receipt.profile.schoolId, schoolId, 'Original profile school agrees with receipt');
  check(
    receipt.profile.createdAt,
    receipt.createdAt,
    'Receipt and profile are created in the same statement outcome',
  );
  check(receipt.profile.updatedAt, receipt.createdAt, 'Original profile update time is preserved');
  for (const [key, value] of Object.entries(original.profile))
    check(receipt.profile[key], value, 'Original submitted profile evidence is preserved exactly: ' + key);
  if (kind === 'guardian') {
    check(
      receipt.profile.phone,
      original.profile.phone ?? null,
      'Omitted optional guardian phone becomes null',
    );
    check(
      receipt.profile.email,
      original.profile.email ?? null,
      'Omitted optional guardian email becomes null',
    );
  }
  const serialized = JSON.stringify(receipt);
  for (const key of ['requestHash', 'profileSnapshot', 'identityIssuer', 'identitySubject', 'tokenHash'])
    check(serialized.includes(key), false, 'Receipt excludes hashes and provider/session metadata');
}
async function scenario(name, action) {
  const f = freshDatabase();
  await seedSecurityData(f.db, f.schema);
  assert.ok(
    f.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='registry_creation_receipts'")
      .get(),
    'Apply the numbered registry creation migration before executing the final contract',
  );
  await f.db.insert(f.schema.users).values({
    id: 'admin-second-a',
    name: 'Synthetic second administrator',
    email: 'second-admin@example.invalid',
    role: 'admin',
    schoolId: 'a',
    identityIssuer: 'https://identity.example.invalid',
    identitySubject: 'sub-second-admin-a',
    createdAt: stamp,
    updatedAt: stamp,
  });
  let hook,
    fired = false;
  const queries = [];
  function prepare(query, params = []) {
    async function intercept(phase) {
      if (!fired && hook?.phase === phase && hook.match(query)) {
        fired = true;
        await hook.run();
      }
    }
    return {
      bind(...values) {
        return prepare(query, values);
      },
      async raw() {
        queries.push(query);
        await intercept('before');
        const s = f.sqlite.prepare(query);
        s.setReturnArrays(true);
        const result = s.all(...params);
        await intercept('after');
        return result;
      },
      async all() {
        queries.push(query);
        await intercept('before');
        const results = f.sqlite.prepare(query).all(...params);
        await intercept('after');
        return { success: true, results, meta: {} };
      },
      async run() {
        queries.push(query);
        await intercept('before');
        const s = f.sqlite.prepare(query);
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
      async batch(ss) {
        f.sqlite.exec('BEGIN');
        try {
          const out = [];
          for (const s of ss) out.push(await s.run());
          f.sqlite.exec('COMMIT');
          return out;
        } catch (error) {
          f.sqlite.exec('ROLLBACK');
          throw error;
        }
      },
    },
    { schema: f.schema },
  );
  globalThis.__sahaTestDb = db;
  const cookies = {},
    hashes = {};
  for (const actor of ['admin-a', 'admin-b', 'admin-second-a', 'teacher-a', 'guardian-a', 'student-user-a']) {
    cookies[actor] = (await sessions.createSession(actor)).split(';')[0];
    hashes[actor] = f.sqlite
      .prepare('SELECT token_hash FROM auth_sessions WHERE user_id=?')
      .get(actor).token_hash;
  }
  async function api(kind, actor = 'admin-a', payload, options = {}) {
    requests++;
    const method = kind === 'receipt' ? 'GET' : 'POST';
    const headers = {
      origin: options.origin ?? origin,
      ...(cookies[actor] ? { cookie: cookies[actor] } : {}),
      ...(options.headers ?? {}),
    };
    if (method === 'POST') headers['content-type'] = 'application/json';
    const request = new Request(
      origin +
        '/api/' +
        (kind === 'receipt'
          ? 'registry/creations/' + (options.requestId ?? payload)
          : kind === 'student'
            ? 'registry/students'
            : kind === 'guardian'
              ? 'registry/guardians'
              : kind === 'legacyStudent'
                ? 'students'
                : 'guardians'),
      { method, headers, ...(method === 'POST' ? { body: options.rawBody ?? JSON.stringify(payload) } : {}) },
    );
    const response = await routes[kind][method](request, context(options.requestId ?? payload));
    check(
      response.headers.get('cache-control'),
      'no-store',
      'Creation and original private receipt responses are never cacheable',
    );
    const body = await response.json();
    check(response.bodyUsed, true, 'Every actual response is consumed');
    return { status: response.status, body };
  }
  const counts = () =>
    Object.fromEntries(
      ['registry_creation_receipts', 'students', 'guardians', 'profile_link_events', 'student_guardians'].map(
        (table) => [table, f.sqlite.prepare('SELECT count(*) n FROM ' + table).get().n],
      ),
    );
  const arm = (phase, match, run) => {
    hook = { phase, match, run };
    fired = false;
  };
  const revoke = (actor) =>
    f.sqlite.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(hashes[actor]);
  async function renew(actor) {
    cookies[actor] = (await sessions.createSession(actor)).split(';')[0];
    hashes[actor] = await identity.digest(cookies[actor].split('=')[1]);
  }
  try {
    await action({ ...f, db, api, counts, arm, revoke, renew, cookies, hashes, queries, fired: () => fired });
    scenarios++;
  } finally {
    hook = undefined;
    f.sqlite.close();
  }
}
try {
  for (const kind of ['student', 'guardian'])
    await scenario(
      kind + ' creates once and exact replay returns original receipt',
      async ({ api, sqlite, counts }) => {
        const original = input(kind),
          before = counts();
        const first = await api(kind, 'admin-a', original);
        check(first.status, 201, 'Fresh reviewed creation is acknowledged');
        check(first.body.replayed, false, 'Fresh response is not a replay');
        receiptShape(first.body.receipt, kind, original);
        const second = await api(kind, 'admin-a', original);
        check(second.status, 200, 'Exact committed UUID retry is a replay');
        check(second.body.replayed, true, 'Retry is explicitly identified');
        check(second.body.receipt, first.body.receipt, 'Exact retry returns immutable original evidence');
        const read = await api('receipt', 'admin-a', original.clientRequestId);
        check(read.status, 200, 'Original creator can read receipt');
        check(read.body, first.body.receipt, 'GET returns the same original receipt DTO');
        const after = counts();
        check(
          after.registry_creation_receipts,
          before.registry_creation_receipts + 1,
          'One UUID creates one durable receipt',
        );
        check(
          after[kind === 'student' ? 'students' : 'guardians'],
          before[kind === 'student' ? 'students' : 'guardians'] + 1,
          'Exactly one profile exists',
        );
        check(
          after.profile_link_events,
          before.profile_link_events,
          'Creation does not create reviewed login bindings',
        );
        check(
          after.student_guardians,
          before.student_guardians,
          'Creation does not invent family relationships',
        );
        check(
          sqlite
            .prepare('SELECT user_id FROM ' + (kind === 'student' ? 'students' : 'guardians') + ' WHERE id=?')
            .get(first.body.receipt.profile.id).user_id,
          null,
          'Persisted new profile is unlinked',
        );
      },
    );
  for (const kind of ['student', 'guardian'])
    await scenario(
      kind + ' exact replay remains original after legitimate edit and reviewed link',
      async ({ api, sqlite, cookies, counts }) => {
        const original = input(kind),
          first = await api(kind, 'admin-a', original),
          id = first.body.receipt.profile.id;
        const table = kind === 'student' ? 'students' : 'guardians';
        const route = await load(
          kind === 'student' ? 'app/api/students/[id]/route.ts' : 'lib/education/guardians.ts',
        );
        const resolved = await auth.getPrincipal(
          new Request(origin, { headers: { cookie: cookies['admin-a'] } }),
        );
        if (kind === 'student') {
          requests++;
          const response = await route.PATCH(
            new Request(origin + '/api/students/' + id, {
              method: 'PATCH',
              headers: { origin, cookie: cookies['admin-a'], 'content-type': 'application/json' },
              body: JSON.stringify({ ...original.profile, firstName: 'Synthetic Later Name', schoolId: 'a' }),
            }),
            { params: Promise.resolve({ id }) },
          );
          check(response.status, 200, 'Legitimate current student edit succeeds');
          await response.arrayBuffer();
        } else {
          const edited = await route.updateGuardian(resolved, id, {
            ...original.profile,
            name: 'Synthetic Later Name',
          });
          check(edited.name, 'Synthetic Later Name', 'Legitimate current guardian edit succeeds');
        }
        const userId = kind === 'student' ? 'student-unlinked-a' : 'guardian-unlinked-a';
        await globalThis.__sahaTestDb.insert((await load('db/schema.ts')).users).values({
          id: userId,
          name: 'Synthetic unlinked account',
          email: userId + '@example.invalid',
          role: kind,
          schoolId: 'a',
          identityIssuer: 'https://identity.example.invalid',
          identitySubject: 'sub-' + userId,
          createdAt: stamp,
          updatedAt: stamp,
        });
        await profileLinks.reviewProfileLink(resolved, {
          clientRequestId: crypto.randomUUID(),
          profileType: kind,
          profileId: id,
          userId,
          expectedVersion: 0,
          reviewConfirmed: true,
          reason: 'Synthetic reviewed current account binding',
        });
        const before = counts(),
          replay = await api(kind, 'admin-a', original);
        check(replay.status, 200, 'Committed UUID replays after later legitimate changes');
        check(
          replay.body.receipt,
          first.body.receipt,
          'Original receipt never returns later edited or linked profile',
        );
        check(replay.body.receipt.profile.userId, null, 'Original unlinked evidence is retained');
        check(
          sqlite.prepare('SELECT user_id FROM ' + table + ' WHERE id=?').get(id).user_id,
          userId,
          'Replay does not undo reviewed current link',
        );
        check(
          sqlite
            .prepare(
              'SELECT ' +
                (kind === 'student' ? 'first_name' : 'name') +
                ' value FROM ' +
                table +
                ' WHERE id=?',
            )
            .get(id).value,
          'Synthetic Later Name',
          'Replay does not reapply original name',
        );
        check(counts(), before, 'Replay appends no profile/link/relationship evidence');
      },
    );
  for (const kind of ['student', 'guardian'])
    await scenario(
      kind + ' concurrent exact UUID requests arbitrate one outcome',
      async ({ api, counts }) => {
        const original = input(kind),
          before = counts();
        const results = await Promise.all([api(kind, 'admin-a', original), api(kind, 'admin-a', original)]);
        check(
          results.map((v) => v.status).sort(),
          [200, 201],
          'Concurrent exact requests have one creation and one original replay',
        );
        check(
          results[0].body.receipt,
          results[1].body.receipt,
          'Concurrent callers receive one immutable outcome',
        );
        check(
          counts().registry_creation_receipts,
          before.registry_creation_receipts + 1,
          'Concurrent receipts are unique',
        );
        check(
          counts()[kind === 'student' ? 'students' : 'guardians'],
          before[kind === 'student' ? 'students' : 'guardians'] + 1,
          'Concurrent requests create exactly one profile',
        );
      },
    );
  for (const kind of ['student', 'guardian'])
    await scenario(
      kind + ' changed payload or reason cannot reuse committed UUID',
      async ({ api, counts }) => {
        const original = input(kind),
          first = await api(kind, 'admin-a', original),
          before = counts();
        const variants = [
          { ...original, reason: 'Different synthetic administrator review reason' },
          {
            ...original,
            profile: {
              ...original.profile,
              [kind === 'student' ? 'firstName' : 'name']: 'Different synthetic name',
            },
          },
        ];
        for (const changed of variants) {
          const denied = await api(kind, 'admin-a', changed);
          check(denied.status, 409, 'Changed reviewed payload cannot reuse original UUID');
          check(denied.body, { error: 'Conflict' }, 'Conflict reveals no original private receipt');
        }
        check(counts(), before, 'Conflicting retries persist no evidence');
        check(
          (await api('receipt', 'admin-a', original.clientRequestId)).body,
          first.body.receipt,
          'Original receipt is still intact',
        );
      },
    );
  for (const kind of ['student', 'guardian'])
    await scenario(
      kind + ' another administrator and foreign school cannot read or consume original UUID',
      async ({ api, counts }) => {
        const original = input(kind);
        await api(kind, 'admin-a', original);
        const before = counts();
        for (const actor of ['admin-second-a', 'admin-b']) {
          const denied = await api(kind, actor, original);
          check(denied.status, 409, 'Global UUID cannot be consumed by another current administrator');
          check(denied.body, { error: 'Conflict' }, 'Other-owner collision is generic');
          const read = await api('receipt', actor, original.clientRequestId);
          check(read.status, 404, 'Other administrator cannot read original private receipt');
          check(
            JSON.stringify(read.body).includes('Synthetic Reviewed'),
            false,
            'Unavailable lookup discloses no original profile',
          );
        }
        check(counts(), before, 'Ownership collisions create no new profile');
      },
    );
  await scenario('Global UUID is shared across student and guardian kinds', async ({ api, counts }) => {
    const original = input('guardian');
    await api('guardian', 'admin-a', original);
    const before = counts();
    const other = await api(
      'student',
      'admin-a',
      input('student', { clientRequestId: original.clientRequestId }),
    );
    check(other.status, 409, 'Different profile kind cannot reuse original UUID');
    check(counts(), before, 'Cross-kind collision rolls back any prospective profile');
  });
  for (const kind of ['student', 'guardian'])
    await scenario(
      kind + ' different concurrent payloads retain one exact winner',
      async ({ api, counts }) => {
        const original = input(kind),
          changed = { ...original, reason: 'Different concurrent synthetic review' },
          before = counts();
        const responses = await Promise.all([api(kind, 'admin-a', original), api(kind, 'admin-a', changed)]);
        check(
          responses.map((v) => v.status).sort(),
          [201, 409],
          'Different concurrent payloads have one winner and one safe conflict',
        );
        check(
          counts().registry_creation_receipts,
          before.registry_creation_receipts + 1,
          'Only winner receipt persists',
        );
        check(
          counts()[kind === 'student' ? 'students' : 'guardians'],
          before[kind === 'student' ? 'students' : 'guardians'] + 1,
          'Only winner profile persists',
        );
      },
    );
  for (const kind of ['student', 'guardian'])
    for (const actor of [null, 'teacher-a', 'guardian-a', 'student-user-a'])
      await scenario(
        kind + ' denied actor precedes malformed/oversized body parsing',
        async ({ api, counts }) => {
          const before = counts();
          for (const rawBody of ['{invalid', 'x'.repeat(128 * 1024 + 1)]) {
            const denied = await api(kind, actor, undefined, { rawBody });
            check(
              denied.status,
              actor === null ? 401 : 403,
              'Authentication and administrator role reject before parsing body',
            );
          }
          check(counts(), before, 'Role denial creates no profile or receipt');
        },
      );
  await scenario(
    'Private original receipt role/lookup denials reveal no existence or details',
    async ({ api, counts }) => {
      const original = input('guardian');
      await api('guardian', 'admin-a', original);
      const before = counts();
      for (const actor of [null, 'teacher-a', 'guardian-a', 'student-user-a'])
        for (const id of [original.clientRequestId, 'not-a-uuid']) {
          const denied = await api('receipt', actor, id);
          check(
            denied.status,
            actor === null ? 401 : 403,
            'Original receipt requires authenticated administrator before parsing identifier',
          );
          check(
            JSON.stringify(denied.body).includes('Synthetic Reviewed'),
            false,
            'Role/invalid identifier denial reveals no original profile',
          );
        }
      check(
        (await api('receipt', 'admin-a', 'not-a-uuid')).status,
        400,
        'Authorized invalid UUID is a safe validation failure',
      );
      check(
        (await api('receipt', 'admin-a', crypto.randomUUID())).status,
        404,
        'Authorized missing receipt is unavailable',
      );
      check(counts(), before, 'Read denials cannot fabricate or mutate original receipt');
    },
  );
  for (const kind of ['student', 'guardian'])
    await scenario(
      kind + ' wrong origin and bounded transport fail without persistence',
      async ({ api, counts }) => {
        const original = input(kind),
          before = counts();
        check(
          (await api(kind, 'admin-a', original, { origin: 'https://foreign.example.invalid' })).status,
          403,
          'Cross-origin create is denied',
        );
        check(
          (await api(kind, 'admin-a', original, { rawBody: '{invalid' })).status,
          400,
          'Malformed administrator JSON is rejected',
        );
        check(
          (await api(kind, 'admin-a', original, { rawBody: 'x'.repeat(128 * 1024 + 1) })).status,
          400,
          'Undeclared oversized body is rejected',
        );
        check(
          (await api(kind, 'admin-a', original, { headers: { 'content-length': String(128 * 1024 + 1) } }))
            .status,
          400,
          'Declared oversized body is rejected',
        );
        check(counts(), before, 'Origin/transport rejection is atomic');
      },
    );
  for (const kind of ['student', 'guardian'])
    await scenario(
      kind + ' strict reviewed envelope cannot spoof ownership or evidence',
      async ({ api, counts }) => {
        const original = input(kind),
          before = counts();
        const malformed = [
          { ...original, clientRequestId: 'invalid' },
          { ...original, reviewConfirmed: false },
          { ...original, reviewConfirmed: undefined },
          { ...original, reason: 'short' },
          { ...original, reason: 'x'.repeat(501) },
          { ...original, reason: 'A valid reason with\0NUL' },
          { ...original, schoolId: 'b' },
          { ...original, createdBy: 'admin-b' },
          { ...original, profile: { ...original.profile, userId: 'student-user-a' } },
          { ...original, profile: { ...original.profile, schoolId: 'b' } },
          { ...original, profile: { ...original.profile, id: crypto.randomUUID() } },
          { ...original, profile: { ...original.profile, createdAt: stamp } },
        ];
        for (const value of malformed)
          check(
            (await api(kind, 'admin-a', value)).status,
            400,
            'Strict reviewed contract rejects invalid/spoofed profile or review evidence',
          );
        check(counts(), before, 'Invalid envelopes append nothing');
      },
    );
  for (const kind of ['student', 'guardian'])
    await scenario(kind + ' Unicode reason bounds and canonical UUID are exact', async ({ api, counts }) => {
      const original = input(kind, {
        reason: '😀'.repeat(10),
        clientRequestId: crypto.randomUUID().toUpperCase(),
      });
      const first = await api(kind, 'admin-a', original);
      check(first.status, 201, 'Ten Unicode code points are valid despite twenty UTF-16 units');
      receiptShape(first.body.receipt, kind, original);
      const second = await api(kind, 'admin-a', {
        ...original,
        clientRequestId: original.clientRequestId.toLowerCase(),
      });
      check(second.status, 200, 'UUID case canonicalization preserves exact replay');
      const before = counts();
      check(
        (await api(kind, 'admin-a', input(kind, { reason: '😀'.repeat(9) }))).status,
        400,
        'Nine Unicode code points are rejected',
      );
      check(
        (await api(kind, 'admin-a', input(kind, { reason: '😀'.repeat(501) }))).status,
        400,
        'Overlong Unicode reason is rejected',
      );
      check(counts(), before, 'Unicode rejection leaves original receipt/profile intact');
    });
  await scenario(
    'Guardian optional values and trimmed review reason have explicit replay semantics',
    async ({ api, counts }) => {
      const original = input('guardian', { reason: '  Synthetic reviewed guardian creation  ' });
      const first = await api('guardian', 'admin-a', original);
      check(first.status, 201, 'Trimmed reason still creates an original receipt');
      check(
        first.body.receipt.reason,
        original.reason.trim(),
        'Receipt stores the reviewed normalized reason',
      );
      const replay = await api('guardian', 'admin-a', { ...original, reason: original.reason.trim() });
      check(replay.status, 200, 'Equivalent trimmed reason preserves original replay');
      check(replay.body.receipt, first.body.receipt, 'Normalized review hash returns same immutable receipt');
      const before = counts();
      const changed = await api('guardian', 'admin-a', {
        ...original,
        profile: { ...original.profile, phone: '' },
      });
      check(changed.status, 409, 'Explicit empty phone is distinct from omitted/null original evidence');
      check(counts(), before, 'Optional-value conflict creates nothing');
      const empty = await api(
        'guardian',
        'admin-a',
        input('guardian', { profile: { ...profile('guardian'), phone: '' } }),
      );
      check(empty.status, 201, 'Separate deliberate request may preserve legacy empty phone');
      check(
        empty.body.receipt.profile.phone,
        '',
        'Empty optional value is retained without invented normalization',
      );
    },
  );
  for (const kind of ['student', 'guardian'])
    await scenario(
      kind + ' upper Unicode review boundary and legacy date input remain exact',
      async ({ api }) => {
        const original = input(kind, {
          reason: '😀'.repeat(500),
          ...(kind === 'student'
            ? { profile: { ...profile(kind), dateOfBirth: 'legacy-nonempty-date-value' } }
            : {}),
        });
        const first = await api(kind, 'admin-a', original);
        check(
          first.status,
          201,
          'Five hundred Unicode code points meet service and actual SQLite reason constraints',
        );
        check(first.body.receipt.reason, original.reason, 'Upper-bound original review text is preserved');
        if (kind === 'student')
          check(
            first.body.receipt.profile.dateOfBirth,
            'legacy-nonempty-date-value',
            'Separate creation preserves existing nonempty birth-date contract without new calendar policy',
          );
        check(
          (await api(kind, 'admin-a', original)).status,
          200,
          'Boundary receipt remains exactly replayable',
        );
      },
    );
  await scenario('Student admission collision is safe whole-statement rollback', async ({ api, counts }) => {
    const original = input('student', { profile: { ...profile('student'), admissionNumber: 'student-b' } }),
      before = counts();
    const denied = await api('student', 'admin-a', original);
    check(denied.status, 409, 'Existing global admission collision remains a safe conflict');
    check(denied.body, { error: 'Conflict' }, 'Collision reveals no other-school details');
    check(counts(), before, 'Profile and receipt both roll back');
    check(
      (await api('receipt', 'admin-a', original.clientRequestId)).status,
      404,
      'Rejected UUID has no alleged receipt',
    );
  });
  for (const kind of ['student', 'guardian'])
    await scenario(
      kind + ' unrelated profile trigger failure leaves no partial commit',
      async ({ api, sqlite, counts }) => {
        const table = kind === 'student' ? 'students' : 'guardians',
          before = counts();
        sqlite.exec(
          'CREATE TEMP TRIGGER registry_contract_forced_failure AFTER INSERT ON ' +
            table +
            " BEGIN SELECT RAISE(ABORT,'synthetic unrelated storage failure'); END",
        );
        const denied = await api(kind, 'admin-a', input(kind));
        check(
          denied.status,
          500,
          'Unrelated database failure remains uncertain instead of false rejected/conflict guarantee',
        );
        check(
          counts(),
          before,
          'Atomic receipt/profile insertion fully rolls back on unrelated trigger failure',
        );
      },
    );
  for (const kind of ['student', 'guardian'])
    for (const change of ['session', 'expiry', 'disable', 'role', 'school', 'issuer', 'subject'])
      await scenario(
        kind + ' creation actual INSERT checks live ' + change,
        async ({ api, arm, revoke, sqlite, fired, counts }) => {
          const before = counts();
          arm(
            'before',
            (q) => q.includes('insert into "registry_creation_receipts"'),
            () => {
              if (change === 'session') revoke('admin-a');
              if (change === 'expiry')
                sqlite.exec("UPDATE auth_sessions SET expires_at=0 WHERE user_id='admin-a'");
              if (change === 'disable')
                sqlite.exec("UPDATE users SET disabled_at='2026-10-05T00:00:00.000Z' WHERE id='admin-a'");
              if (change === 'role') sqlite.exec("UPDATE users SET role='teacher' WHERE id='admin-a'");
              if (change === 'school') sqlite.exec("UPDATE users SET school_id='b' WHERE id='admin-a'");
              if (change === 'issuer')
                sqlite.exec(
                  "UPDATE users SET identity_issuer='https://changed.example.invalid' WHERE id='admin-a'",
                );
              if (change === 'subject')
                sqlite.exec("UPDATE users SET identity_subject='changed-subject' WHERE id='admin-a'");
            },
          );
          const denied = await api(kind, 'admin-a', input(kind));
          check(fired(), true, 'Authority changes immediately before awaited actual receipt INSERT');
          check(denied.status, 409, 'Zero-row late-denied creation safely conflicts');
          check(denied.body, { error: 'Conflict' }, 'Late denial reveals no private candidate receipt');
          check(counts(), before, 'Session/account/mapping revocation leaves zero partial profile/receipt');
        },
      );
  for (const kind of ['student', 'guardian'])
    await scenario(
      kind + ' committed acknowledgement denial retains original recoverable evidence',
      async ({ api, arm, revoke, renew, fired, counts }) => {
        const original = input(kind),
          before = counts();
        arm(
          'after',
          (q) => q.includes('insert into "registry_creation_receipts"'),
          () => revoke('admin-a'),
        );
        const denied = await api(kind, 'admin-a', original);
        check(fired(), true, 'Session revoked after actual atomic commit before private receipt readback');
        check(
          denied.status,
          404,
          'Known inaccessible receipt is withheld without erasing committed evidence',
        );
        check(
          JSON.stringify(denied.body).includes('Synthetic Reviewed'),
          false,
          'Denied acknowledgement exposes no original private profile',
        );
        check(
          counts().registry_creation_receipts,
          before.registry_creation_receipts + 1,
          'Actual receipt remains committed',
        );
        check(
          counts()[kind === 'student' ? 'students' : 'guardians'],
          before[kind === 'student' ? 'students' : 'guardians'] + 1,
          'Actual profile remains committed once',
        );
        await renew('admin-a');
        const recovered = await api(kind, 'admin-a', original);
        check(recovered.status, 200, 'Fresh same-actor session recovers original UUID');
        check(recovered.body.replayed, true, 'Recovery is original exact replay');
        receiptShape(recovered.body.receipt, kind, original);
        check(
          counts().registry_creation_receipts,
          before.registry_creation_receipts + 1,
          'Recovery adds no receipt',
        );
      },
    );
  for (const kind of ['student', 'guardian'])
    await scenario(
      kind + ' original receipt reads and exact replay deny SQL-time revoked session',
      async ({ api, arm, revoke, renew, fired, counts }) => {
        const original = input(kind);
        await api(kind, 'admin-a', original);
        const before = counts();
        arm(
          'before',
          (q) => q.includes('from "registry_creation_receipts"'),
          () => revoke('admin-a'),
        );
        const denied = await api('receipt', 'admin-a', original.clientRequestId);
        check(fired(), true, 'Receipt GET loses session at actual private SELECT');
        check(denied.status, 404, 'Actual revoked receipt read safely denies');
        await renew('admin-a');
        arm(
          'before',
          (q) => q.includes('from "registry_creation_receipts"'),
          () => revoke('admin-a'),
        );
        const replay = await api(kind, 'admin-a', original);
        check(fired(), true, 'Exact replay loses current session at actual original receipt SELECT');
        check(replay.status, 409, 'Unauthorized exact replay cannot return receipt');
        check(counts(), before, 'Denied read/replay does not recreate existing profile');
      },
    );
  for (const kind of ['student', 'guardian'])
    for (const change of ['expiry', 'disable', 'role', 'school', 'identity'])
      for (const method of ['read', 'replay'])
        await scenario(
          kind + ' original receipt ' + method + ' actual SELECT checks late ' + change,
          async ({ api, arm, sqlite, fired, counts }) => {
            const original = input(kind);
            await api(kind, 'admin-a', original);
            const before = counts();
            arm(
              'before',
              (q) => q.includes('from "registry_creation_receipts"'),
              () => {
                if (change === 'expiry')
                  sqlite.exec("UPDATE auth_sessions SET expires_at=0 WHERE user_id='admin-a'");
                if (change === 'disable')
                  sqlite.exec("UPDATE users SET disabled_at='2026-10-05T00:00:00.000Z' WHERE id='admin-a'");
                if (change === 'role') sqlite.exec("UPDATE users SET role='teacher' WHERE id='admin-a'");
                if (change === 'school') sqlite.exec("UPDATE users SET school_id='b' WHERE id='admin-a'");
                if (change === 'identity')
                  sqlite.exec("UPDATE users SET identity_subject='new-valid-subject' WHERE id='admin-a'");
              },
            );
            const denied =
              method === 'read'
                ? await api('receipt', 'admin-a', original.clientRequestId)
                : await api(kind, 'admin-a', original);
            check(
              fired(),
              true,
              'Current authority changes immediately before original private evidence SELECT',
            );
            check(
              denied.status,
              method === 'read' ? 404 : 409,
              'Late-denied original receipt never claims authorized replay',
            );
            check(
              JSON.stringify(denied.body).includes('Synthetic Reviewed'),
              false,
              'Denied read/replay omits original profile details',
            );
            check(counts(), before, 'Late current read denial retains all previously confirmed rows');
          },
        );
  for (const kind of ['student', 'guardian'])
    await scenario(
      kind + ' receipt immutability is enforced by migrated SQLite guards',
      async ({ api, sqlite }) => {
        const original = input(kind),
          first = await api(kind, 'admin-a', original);
        assert.throws(
          () =>
            sqlite
              .prepare('UPDATE registry_creation_receipts SET reason=? WHERE id=?')
              .run('Synthetic replacement reason', original.clientRequestId),
          /immutable/,
        );
        checks++;
        assert.throws(
          () =>
            sqlite.prepare('DELETE FROM registry_creation_receipts WHERE id=?').run(original.clientRequestId),
          /immutable/,
        );
        checks++;
        check(
          (await api('receipt', 'admin-a', original.clientRequestId)).body,
          first.body.receipt,
          'Failed overwrite/delete preserves original receipt',
        );
      },
    );
  await scenario(
    'Distinct reviewed UUIDs retain deliberate guardian creation semantics',
    async ({ api, counts }) => {
      const before = counts();
      const first = await api('guardian', 'admin-a', input('guardian')),
        second = await api('guardian', 'admin-a', input('guardian'));
      check(
        [first.status, second.status],
        [201, 201],
        'Distinct reviewed requests do not auto-match or merge guardians',
      );
      okay(
        first.body.receipt.profile.id !== second.body.receipt.profile.id,
        'Deliberate separate UUID requests have distinct profiles',
      );
      check(
        counts().guardians,
        before.guardians + 2,
        'No new guardian identity/duplication policy is invented',
      );
    },
  );
  await scenario(
    'Legacy registry APIs retain existing non-idempotent compatibility',
    async ({ api, counts }) => {
      const before = counts();
      const guardian = profile('guardian');
      const first = await api('legacyGuardian', 'admin-a', guardian),
        second = await api('legacyGuardian', 'admin-a', guardian);
      check(
        [first.status, second.status],
        [201, 201],
        'Legacy guardian creation remains deliberate non-idempotent behavior',
      );
      const student = { ...profile('student'), schoolId: 'a' };
      const third = await api('legacyStudent', 'admin-a', student),
        fourth = await api('legacyStudent', 'admin-a', student);
      check(
        [third.status, fourth.status],
        [201, 500],
        'Legacy duplicate-admission status remains unchanged by separate reviewed API',
      );
      check(
        counts().registry_creation_receipts,
        before.registry_creation_receipts,
        'No historical/legacy creation receipt is fabricated',
      );
    },
  );
  check(externalRequests, 0, 'All registry route/persistence evidence remains local and synthetic');
  console.log(
    JSON.stringify({
      passed: checks,
      failed: 0,
      skipped: 0,
      scenarios,
      requests,
      externalRequests,
      scope:
        'actual sessions/routes/production Drizzle D1 over final migrated SQLite; SQL-time mutations/concurrent receipt arbitration/atomic rollback; no browser/provider/UAT evidence',
    }),
  );
} finally {
  globalThis.fetch = oldFetch;
}
