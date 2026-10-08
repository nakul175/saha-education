import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { bindings, freshDatabase, seedSecurityData, load, root, stamp } from '../support/security-db.mjs';
const { db, schema, sqlite } = freshDatabase();
await seedSecurityData(db, schema);
const service = await load('lib/education/profile-links.ts');
const domainSchema = await load('db/profile-links-schema.ts');
const students = await load('lib/education/students.ts');
const guardians = await load('lib/education/guardians.ts');
const collection = await load('app/api/admin/profile-links/route.ts');
const history = await load('app/api/admin/profile-links/history/route.ts');
const legacy = {
  students: await load('app/api/students/route.ts'),
  student: await load('app/api/students/[id]/route.ts'),
  guardians: await load('app/api/guardians/route.ts'),
};
const { createSession, principalForToken } = await load('lib/education/session.ts');
const studentRead = await load('app/api/students/[id]/route.ts');
const origin = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = origin;
const admin = { id: 'admin-a', role: 'admin', schoolId: 'a' };
let checks = 0;
const check = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  checks++;
};
const sessions = {};
for (const id of [
  'admin-a',
  'admin-b',
  'teacher-a',
  'guardian-a',
  'guardian-other',
  'student-user-a',
  'student-user-other',
])
  sessions[id] = (await createSession(id)).split(';')[0];
for (const [id, role] of [
  ['student-free', 'student'],
  ['student-next', 'student'],
  ['guardian-free', 'guardian'],
  ['guardian-next', 'guardian'],
]) {
  await db.insert(schema.users).values({
    id,
    name: id,
    email: id + '@example.invalid',
    role,
    schoolId: 'a',
    identityIssuer: 'https://identity.example.invalid',
    identitySubject: 'sub-' + id,
    createdAt: stamp,
    updatedAt: stamp,
  });
  sessions[id] = (await createSession(id)).split(';')[0];
}
function request(
  user = 'admin-a',
  method = 'GET',
  payload,
  path = '/api/admin/profile-links',
  suppliedOrigin = origin,
) {
  const headers = { ...(sessions[user] ? { cookie: sessions[user] } : {}), origin: suppliedOrigin };
  return new Request(origin + path, {
    method,
    headers: { ...headers, ...(payload !== undefined ? { 'content-type': 'application/json' } : {}) },
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
  });
}
const review = (kind, id, userId, expectedVersion = 0) => ({
  profileType: kind,
  profileId: id,
  userId,
  expectedVersion,
  clientRequestId: crypto.randomUUID(),
  reviewConfirmed: true,
  reason: 'Synthetic explicit profile ownership review.',
});
const send = (input) => collection.POST(request('admin-a', 'POST', input));
const count = (table) => sqlite.prepare('SELECT count(*) n FROM ' + table).get().n;
const binding = (kind, id) =>
  sqlite
    .prepare('SELECT user_id FROM ' + (kind === 'student' ? 'students' : 'guardians') + ' WHERE id=?')
    .get(id).user_id;
const version = (kind, id) =>
  sqlite
    .prepare('SELECT version FROM profile_link_versions WHERE profile_type=? AND profile_id=?')
    .get(kind, id)?.version ?? 0;
const before = () => ({
  events: count('profile_link_events'),
  versions: count('profile_link_versions'),
  sessions: count('auth_sessions'),
});
const originalFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = async () => {
  networkCalls++;
  throw new Error('Profile administration must remain local');
};
const originalBatch = db.batch.bind(db);
async function denied(response, status, message) {
  check(response.status, status, message);
  check(Object.keys(await response.json()), ['error'], 'Denial exposes only a safe error');
}
const restoreAdmin = () =>
  sqlite
    .prepare(
      "UPDATE users SET role='admin',school_id='a',disabled_at=NULL,identity_subject='sub-admin-a' WHERE id='admin-a'",
    )
    .run();
try {
  await denied(await collection.GET(request('anonymous')), 401, 'Anonymous inventory denied');
  for (const id of ['teacher-a', 'guardian-a', 'student-user-a']) {
    await denied(await collection.GET(request(id)), 403, 'Only admin reads profile administration');
    await denied(
      await collection.POST(request(id, 'POST', review('student', 'student-a', null))),
      403,
      'Only admin reviews links',
    );
    await denied(await history.GET(request(id)), 403, 'Only admin reads private review reasons/history');
  }
  await denied(
    await collection.POST(
      request(
        'admin-a',
        'POST',
        review('student', 'student-a', null),
        undefined,
        'https://foreign.example.invalid',
      ),
    ),
    403,
    'Foreign-origin mutation denied',
  );
  let response = await collection.GET(request());
  check(response.status, 200, 'School inventory available');
  const inventory = await response.json();
  check(inventory.profiles.length, 4, 'Inventory retains linked student/guardian profiles');
  check(
    inventory.profiles.every((p) => !['student-b', 'guardian-profile-b'].includes(p.profileId)),
    true,
    'Inventory excludes foreign school',
  );
  check(
    inventory.accounts.every((a) => ['student', 'guardian'].includes(a.role)),
    true,
    'Only matching profile roles available',
  );
  check(
    inventory.profiles.every((p) => p.version === 0),
    true,
    'Legacy links are preserved without invented reviews',
  );
  check(count('profile_link_events'), 0, 'Migration performs no historical-review backfill');
  const input = review('student', 'student-a', 'student-free');
  for (const altered of [
    { schoolId: 'b' },
    { actorId: 'admin-b' },
    { previousUserId: 'student-user-a' },
    { resultingVersion: 20 },
    { profileType: 'teacher' },
    { profileId: '' },
    { userId: '' },
    { expectedVersion: -1 },
    { expectedVersion: 1.5 },
    { expectedVersion: 1000000 },
    { clientRequestId: 'invalid' },
    { reviewConfirmed: false },
    { reason: 'short' },
    { reason: 'Synthetic\nunsafe reason.' },
    { reason: '📖📖📖📖📖' },
  ]) {
    const snapshot = before();
    await denied(
      await send({ ...input, ...altered }),
      400,
      'Strict review rejects spoofed or malformed fields',
    );
    check(before(), snapshot, 'Invalid review changes no evidence/session state');
  }
  for (const path of [
    '/api/admin/profile-links/history?profileId=student-a',
    '/api/admin/profile-links/history?profileType=student',
    '/api/admin/profile-links/history?profileType=student&profileId=student-a&profileId=student-other',
    '/api/admin/profile-links/history?schoolId=b',
  ])
    await denied(
      await history.GET(request('admin-a', 'GET', undefined, path)),
      400,
      'History rejects incomplete/duplicate/spoofed filters',
    );
  await denied(
    await collection.POST(request('admin-b', 'POST', input)),
    404,
    'Foreign-school profile cannot be reviewed',
  );
  for (const userId of ['teacher-a', 'guardian-a', 'student-user-b', 'student-user-other', 'missing-user']) {
    const snapshot = before();
    await denied(
      await send({ ...input, userId, clientRequestId: crypto.randomUUID() }),
      409,
      'Wrong role/school/occupied/unknown account cannot bind',
    );
    check(before(), snapshot, 'Denied binding preserves reviewed evidence and sessions');
  }
  response = await send(input);
  check(response.status, 200, 'Reviewed replacement succeeds');
  const saved = await response.json();
  check(saved.profile.userId, 'student-free', 'Exact reviewed student login bound');
  check(saved.profile.version, 1, 'First revision created');
  check(saved.event.previousUserId, 'student-user-a', 'Prior confirmed account preserved in event');
  check(saved.event.nextUserId, 'student-free', 'New account attributed');
  check(saved.event.actorId, 'admin-a', 'Review actor server-derived');
  check(saved.event.reason, input.reason, 'Review reason retained');
  check(
    Object.keys(saved.event).sort(),
    [
      'id',
      'schoolId',
      'actorId',
      'profileType',
      'profileId',
      'previousUserId',
      'nextUserId',
      'expectedVersion',
      'resultingVersion',
      'reason',
      'reviewedAt',
    ].sort(),
    'Private hash/attempt marker omitted',
  );
  check(
    await principalForToken(sessions['student-user-a'].split('=')[1]),
    null,
    'Previous account sessions revoked',
  );
  check(
    await principalForToken(sessions['student-free'].split('=')[1]),
    null,
    'New account sessions revoked before acquiring ownership',
  );
  check(
    (await principalForToken(sessions['admin-a'].split('=')[1])).id,
    'admin-a',
    'Administrator session retained',
  );
  check(await (await send(input)).json(), saved, 'Exact payload retry preserves original review');
  check(count('profile_link_events'), 1, 'Retry appends no duplicate history');
  await denied(
    await send({ ...input, reason: 'Different synthetic ownership reason.' }),
    409,
    'Changed same-ID payload conflicts',
  );
  await denied(
    await send({ ...input, clientRequestId: crypto.randomUUID(), expectedVersion: 1 }),
    409,
    'Unchanged binding is no-op conflict without review',
  );
  sessions['student-free'] = (await createSession('student-free')).split(';')[0];
  check(
    (await studentRead.GET(request('student-free'), { params: Promise.resolve({ id: 'student-a' }) })).status,
    200,
    'Fresh linked learner sees own profile',
  );
  sessions['student-user-a'] = (await createSession('student-user-a')).split(';')[0];
  check(
    (await studentRead.GET(request('student-user-a'), { params: Promise.resolve({ id: 'student-a' }) }))
      .status,
    404,
    'Former linked learner loses profile scope',
  );
  const unlink = review('student', 'student-a', null, 1);
  response = await send(unlink);
  check(response.status, 200, 'Explicit reviewed unlink succeeds');
  check(binding('student', 'student-a'), null, 'Unlink clears account, preserves profile');
  check(version('student', 'student-a'), 2, 'Unlink advances revision');
  check(
    await principalForToken(sessions['student-free'].split('=')[1]),
    null,
    'Unlink revokes previous login sessions',
  );
  const replay = await (await send(input)).json();
  check(replay.profile.userId, null, 'Old link replay does not reapply old ownership');
  check(replay.profile.version, 2, 'Old link replay does not rewind version');
  check(replay.event, saved.event, 'Old replay preserves original review evidence');
  const studentNext = review('student', 'student-a', 'student-next', 2);
  await denied(await send({ ...studentNext, expectedVersion: 1 }), 409, 'Stale expected revision denied');
  const twins = await Promise.all([send(studentNext), send(studentNext)]);
  check(
    twins.map((r) => r.status),
    [200, 200],
    'Concurrent identical retries converge',
  );
  const twinsData = await Promise.all(twins.map((r) => r.json()));
  check(twinsData[0], twinsData[1], 'Concurrent retries return one immutable decision');
  check(version('student', 'student-a'), 3, 'Concurrent retries increment once');
  const race = await Promise.all([
    send(review('student', 'student-a', null, 3)),
    send(review('student', 'student-a', 'student-free', 3)),
  ]);
  check(race.map((r) => r.status).sort(), [200, 409], 'Competing same-profile reviews have one CAS winner');
  check(version('student', 'student-a'), 4, 'CAS race advances revision once');
  // Two profiles competing for one login are also serialized by the guarded batch.
  const p1 = await students.createStudent(admin, {
    schoolId: 'a',
    firstName: 'Synthetic',
    lastName: 'One',
    dateOfBirth: '2012-01-01',
    admissionNumber: 'new-one',
    gradeLevel: '8',
  });
  const p2 = await students.createStudent(admin, {
    schoolId: 'a',
    firstName: 'Synthetic',
    lastName: 'Two',
    dateOfBirth: '2012-01-01',
    admissionNumber: 'new-two',
    gradeLevel: '8',
  });
  const availableUser = binding('student', 'student-a') === 'student-free' ? 'student-next' : 'student-free';
  const competing = await Promise.all([
    send(review('student', p1.id, availableUser)),
    send(review('student', p2.id, availableUser)),
  ]);
  check(competing.map((r) => r.status).sort(), [200, 409], 'One login cannot bind two student profiles');
  check(
    sqlite.prepare('SELECT count(*) n FROM students WHERE user_id=?').get(availableUser).n,
    1,
    'Same-type uniqueness persists',
  );
  const guardianInput = review('guardian', 'guardian-profile-a', 'guardian-free');
  response = await send(guardianInput);
  check(response.status, 200, 'Reviewed guardian replacement succeeds');
  check(count('student_guardians'), 3, 'Many student/guardian relationships preserved');
  check(
    await principalForToken(sessions['guardian-a'].split('=')[1]),
    null,
    'Former guardian sessions revoked',
  );
  sessions['guardian-free'] = (await createSession('guardian-free')).split(';')[0];
  sessions['guardian-a'] = (await createSession('guardian-a')).split(';')[0];
  check(
    (await students.listStudentsForGuardian({ id: 'guardian-free', role: 'guardian', schoolId: 'a' })).map(
      (p) => p.id,
    ),
    ['student-a'],
    'New guardian login follows explicit existing family relationship',
  );
  check(
    (await students.listStudentsForGuardian({ id: 'guardian-a', role: 'guardian', schoolId: 'a' })).length,
    0,
    'Former guardian has no inherited learner authority',
  );
  check(
    (await studentRead.GET(request('guardian-free'), { params: Promise.resolve({ id: 'student-a' }) }))
      .status,
    200,
    'Fresh guardian session receives linked learner',
  );
  check(
    (await studentRead.GET(request('guardian-a'), { params: Promise.resolve({ id: 'student-a' }) })).status,
    404,
    'Former guardian cannot read learner through old binding',
  );
  const g1 = await guardians.createGuardian(admin, { name: 'Synthetic G1', relationship: 'parent' }),
    g2 = await guardians.createGuardian(admin, { name: 'Synthetic G2', relationship: 'parent' });
  const graces = await Promise.all([
    send(review('guardian', g1.id, 'guardian-next')),
    send(review('guardian', g2.id, 'guardian-next')),
  ]);
  check(graces.map((r) => r.status).sort(), [200, 409], 'One login cannot bind two guardian profiles');
  check(
    sqlite.prepare("SELECT count(*) n FROM guardians WHERE user_id='guardian-next'").get().n,
    1,
    'Guardian uniqueness survives concurrent reviews',
  );
  check(
    await (await history.GET(request('admin-b'))).json(),
    [],
    'Foreign school cannot read reviewed ownership history',
  );
  const exactHistory = await (
    await history.GET(
      request(
        'admin-a',
        'GET',
        undefined,
        '/api/admin/profile-links/history?profileType=student&profileId=student-a',
      ),
    )
  ).json();
  check(exactHistory.length, 4, 'Exact profile history retains all confirmed revisions');
  check(
    exactHistory.every((e) => e.profileId === 'student-a' && e.profileType === 'student'),
    true,
    'History filter remains exact',
  );
  check(JSON.stringify(exactHistory).includes('requestHash'), false, 'History strips private request hash');
  assert.throws(() =>
    sqlite
      .prepare('UPDATE profile_link_events SET reason=? WHERE id=?')
      .run('Synthetic replacement history.', saved.event.id),
  );
  checks++;
  assert.throws(() => sqlite.prepare('DELETE FROM profile_link_events WHERE id=?').run(saved.event.id));
  checks++;
  // Legacy writes preserve unchanged/omitted links but never silently link/unlink/reassign.
  const studentData = {
    schoolId: 'a',
    firstName: 'Edited',
    lastName: 'Synthetic',
    dateOfBirth: '2012-01-01',
    admissionNumber: 'student-a',
    gradeLevel: '8',
  };
  for (const userId of ['student-user-a', 'student-user-other']) {
    response = await legacy.student.PATCH(request('admin-a', 'PATCH', { ...studentData, userId }), {
      params: Promise.resolve({ id: 'student-a' }),
    });
    check(response.status, 400, 'Legacy student changes require review');
    check(
      (await response.json()).error,
      'Use reviewed profile link administration at /admin/profile-links',
      'Legacy API gives fixed safe direction',
    );
  }
  const occupiedProfile = binding('student', p1.id) ? p1.id : p2.id;
  for (const [profileId, userId] of [
    [occupiedProfile, null],
    ['student-a', ''],
  ]) {
    response = await legacy.student.PATCH(request('admin-a', 'PATCH', { ...studentData, userId }), {
      params: Promise.resolve({ id: profileId }),
    });
    check(response.status, 400, 'Legacy null/empty unlink attempt requires explicit review');
    check(
      (await response.json()).error,
      'Use reviewed profile link administration at /admin/profile-links',
      'Legacy nullable/empty binding change gives safe direction',
    );
  }
  for (const [route, payload] of [
    [legacy.students, { ...studentData, admissionNumber: 'new-legacy-linked', userId: 'student-user-a' }],
    [legacy.guardians, { name: 'Synthetic linked create', relationship: 'parent', userId: 'guardian-a' }],
  ]) {
    response = await route.POST(request('admin-a', 'POST', payload));
    check(response.status, 400, 'Legacy linked profile creation denied');
    check(
      (await response.json()).error.includes('/admin/profile-links'),
      true,
      'Create directs to reviewed links',
    );
  }
  const stable = binding('student', 'student-a');
  const unchanged = await students.updateStudent(admin, 'student-a', { ...studentData, userId: stable });
  check(unchanged.userId, stable, 'Unchanged explicit binding accepted');
  const omitted = await students.updateStudent(admin, 'student-a', studentData);
  check(omitted.userId, stable, 'Omitted binding preserved');
  await assert.rejects(
    () =>
      guardians.updateGuardian(admin, 'guardian-profile-a', {
        name: 'Synthetic edited guardian',
        relationship: 'parent',
        userId: 'guardian-a',
      }),
    service.ProfileLinkReviewRequired,
  );
  checks++;
  const gUpdated = await guardians.updateGuardian(admin, 'guardian-profile-a', {
    name: 'Synthetic edited guardian',
    relationship: 'parent',
    userId: 'guardian-free',
  });
  check(gUpdated.userId, 'guardian-free', 'Guardian unchanged binding preserved');
  // Live mutations recheck actor, target account and profile school at batch time.
  const probe = review('student', 'student-a', 'student-user-a', 4);
  for (const mutation of [
    () => sqlite.prepare("UPDATE users SET disabled_at='revoked' WHERE id='admin-a'").run(),
    () => sqlite.prepare("UPDATE users SET role='teacher' WHERE id='admin-a'").run(),
    () => sqlite.prepare("UPDATE users SET school_id='b' WHERE id='admin-a'").run(),
    () => sqlite.prepare("UPDATE users SET identity_subject='' WHERE id='admin-a'").run(),
  ]) {
    const snapshot = before(),
      old = binding('student', 'student-a');
    db.batch = async (qs) => {
      mutation();
      return originalBatch(qs);
    };
    response = await send({ ...probe, clientRequestId: crypto.randomUUID() });
    check([401, 403, 409].includes(response.status), true, 'Actor authority changed before write is denied');
    check(binding('student', 'student-a'), old, 'Revoked actor changes no binding');
    check(before(), snapshot, 'Revoked actor changes no review/revision/session');
    db.batch = originalBatch;
    restoreAdmin();
  }
  for (const mutation of [
    () => sqlite.prepare("UPDATE users SET disabled_at='revoked' WHERE id='student-user-a'").run(),
    () => sqlite.prepare("UPDATE users SET role='guardian' WHERE id='student-user-a'").run(),
    () => sqlite.prepare("UPDATE users SET school_id='b' WHERE id='student-user-a'").run(),
    () => sqlite.prepare("UPDATE users SET identity_subject='' WHERE id='student-user-a'").run(),
    () => sqlite.prepare("UPDATE students SET school_id='b' WHERE id='student-a'").run(),
  ]) {
    const snapshot = before(),
      old = binding('student', 'student-a');
    db.batch = async (qs) => {
      mutation();
      return originalBatch(qs);
    };
    response = await send({ ...probe, clientRequestId: crypto.randomUUID() });
    check(response.status, 409, 'Target/parent changed before write conflicts');
    check(binding('student', 'student-a'), old, 'Target revocation creates no ownership change');
    check(before(), snapshot, 'Target revocation leaves review/revision/session unchanged');
    db.batch = originalBatch;
    sqlite
      .prepare(
        "UPDATE users SET role='student',school_id='a',disabled_at=NULL,identity_subject='sub-student-user-a' WHERE id='student-user-a'",
      )
      .run();
    sqlite.prepare("UPDATE students SET school_id='a' WHERE id='student-a'").run();
  }
  // Downstream history/retry selection rechecks live scope, not only route entry.
  const realDb = globalThis.__sahaTestDb;
  for (const mutation of [
    () => sqlite.prepare("UPDATE users SET disabled_at='revoked' WHERE id='admin-a'").run(),
    () => sqlite.prepare("UPDATE users SET role='teacher' WHERE id='admin-a'").run(),
    () => sqlite.prepare("UPDATE users SET school_id='b' WHERE id='admin-a'").run(),
    () => sqlite.prepare("UPDATE students SET school_id='b' WHERE id='student-a'").run(),
  ]) {
    let injected = false;
    globalThis.__sahaTestDb = new Proxy(realDb, {
      get(target, property) {
        if (property === 'select')
          return (...args) => {
            const builder = target.select(...args);
            return new Proxy(builder, {
              get(query, member) {
                if (member === 'from')
                  return (table) => {
                    if (!injected && table === domainSchema.profileLinkEvents) {
                      injected = true;
                      mutation();
                    }
                    return query.from(table);
                  };
                const v = Reflect.get(query, member, query);
                return typeof v === 'function' ? v.bind(query) : v;
              },
            });
          };
        const v = Reflect.get(target, property, target);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
    response = await history.GET(
      request(
        'admin-a',
        'GET',
        undefined,
        '/api/admin/profile-links/history?profileType=student&profileId=student-a',
      ),
    );
    check(injected, true, 'Revocation injected immediately before history SELECT');
    check(response.status, 200, 'Live-scope history returns safe collection');
    check(await response.json(), [], 'Revoked/current-foreign scope leaks no historical link evidence');
    globalThis.__sahaTestDb = realDb;
    restoreAdmin();
    sqlite.prepare("UPDATE students SET school_id='a' WHERE id='student-a'").run();
  }
  // Ordinary edits also cannot overwrite a concurrent reviewed binding change.
  for (const [kind, id, changeTo, input] of [
    ['student', 'student-a', 'student-user-a', studentData],
    [
      'guardian',
      'guardian-profile-a',
      'guardian-a',
      { name: 'This stale ordinary edit must not persist', relationship: 'parent' },
    ],
  ]) {
    const table = kind === 'student' ? schema.students : schema.guardians;
    const previous = binding(kind, id),
      profileTable = kind === 'student' ? 'students' : 'guardians';
    const priorName = sqlite
      .prepare(
        'SELECT ' + (kind === 'student' ? 'first_name' : 'name') + ' n FROM ' + profileTable + ' WHERE id=?',
      )
      .get(id).n;
    let injected = false;
    globalThis.__sahaTestDb = new Proxy(realDb, {
      get(target, property) {
        if (property === 'update')
          return (candidate) => {
            if (candidate === table && !injected) {
              injected = true;
              sqlite.prepare('UPDATE ' + profileTable + ' SET user_id=? WHERE id=?').run(changeTo, id);
            }
            return target.update(candidate);
          };
        const v = Reflect.get(target, property, target);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
    const edited =
      kind === 'student'
        ? await students.updateStudent(admin, id, input)
        : await guardians.updateGuardian(admin, id, input);
    check(injected, true, 'Binding changed before ordinary update statement');
    check(edited, null, 'Stale ordinary update cannot overwrite another binding decision');
    check(binding(kind, id), changeTo, 'Concurrent changed binding remains preserved');
    check(
      sqlite
        .prepare(
          'SELECT ' +
            (kind === 'student' ? 'first_name' : 'name') +
            ' n FROM ' +
            profileTable +
            ' WHERE id=?',
        )
        .get(id).n,
      priorName,
      'Stale ordinary profile text is not saved',
    );
    globalThis.__sahaTestDb = realDb;
    sqlite.prepare('UPDATE ' + profileTable + ' SET user_id=? WHERE id=?').run(previous, id);
  }
  // Direct service reads also require a current live account, not a stale Principal.
  sqlite.prepare("UPDATE users SET disabled_at='revoked' WHERE id='admin-a'").run();
  check(await students.listStudents(admin), [], 'Revoked stale administrator cannot list student profiles');
  check(
    await students.getStudent(admin, 'student-a'),
    null,
    'Revoked stale administrator cannot read student profile',
  );
  check(
    await guardians.listGuardians(admin),
    [],
    'Revoked stale administrator cannot list guardian profiles',
  );
  check(
    await guardians.getGuardian(admin, 'guardian-profile-a'),
    null,
    'Revoked stale administrator cannot read guardian profile',
  );
  restoreAdmin();
  // Replay evidence may not be returned after revocation between its queries.
  let replayInjected = false;
  globalThis.__sahaTestDb = new Proxy(realDb, {
    get(target, property) {
      if (property === 'select')
        return (...args) => {
          const builder = target.select(...args);
          return new Proxy(builder, {
            get(query, member) {
              if (member === 'from')
                return (table) => {
                  if (!replayInjected && table === domainSchema.profileLinkEvents) {
                    replayInjected = true;
                    sqlite.prepare("UPDATE users SET role='teacher' WHERE id='admin-a'").run();
                  }
                  return query.from(table);
                };
              const v = Reflect.get(query, member, query);
              return typeof v === 'function' ? v.bind(query) : v;
            },
          });
        };
      const v = Reflect.get(target, property, target);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
  response = await send(input);
  check(replayInjected, true, 'Role revoked immediately before saved-review retry SELECT');
  check(
    [403, 409].includes(response.status),
    true,
    'Revoked administrator cannot receive prior profile-link evidence',
  );
  check(Object.keys(await response.json()), ['error'], 'Denied replay contains no profile/history');
  globalThis.__sahaTestDb = realDb;
  restoreAdmin();
  // A malformed legacy admin binding can be repaired without logging out its reviewer.
  const malformed = await students.createStudent(admin, {
    schoolId: 'a',
    firstName: 'Legacy',
    lastName: 'Malformed mapping',
    dateOfBirth: '2012-01-01',
    admissionNumber: 'malformed-admin-binding',
    gradeLevel: '8',
  });
  sqlite.prepare('UPDATE students SET user_id=? WHERE id=?').run('admin-a', malformed.id);
  response = await send(review('student', malformed.id, null));
  check(response.status, 200, 'Reviewed unlink repairs malformed legacy admin binding');
  check(binding('student', malformed.id), null, 'Malformed binding cleared without deleting profile');
  check(
    (await principalForToken(sessions['admin-a'].split('=')[1])).id,
    'admin-a',
    'Reviewing administrator session survives legacy repair',
  );
  // Atomic rollback preserves profile/event/version and both accounts' sessions.
  sessions['student-user-a'] = (await createSession('student-user-a')).split(';')[0];
  const old = binding('student', 'student-a');
  if (old) sessions[old] = (await createSession(old)).split(';')[0];
  sqlite.exec(
    "CREATE TRIGGER profile_test_failure BEFORE UPDATE OF user_id ON students WHEN NEW.id='student-a' BEGIN SELECT RAISE(ABORT,'synthetic profile transaction failure'); END;",
  );
  const rollback = before();
  response = await send(probe);
  check(response.status, 500, 'Failed binding write has controlled error');
  check(before(), rollback, 'Rollback restores event/revision and all sessions');
  check(binding('student', 'student-a'), old, 'Rollback restores previous binding');
  check(version('student', 'student-a'), 4, 'Rollback preserves expected version');
  check(
    (await principalForToken(sessions['student-user-a'].split('=')[1])).id,
    'student-user-a',
    'Rollback retains valid target session',
  );
  sqlite.exec('DROP TRIGGER profile_test_failure');
  // Production-shaped Drizzle D1 prepared batch, using real SQLite statements.
  const { drizzle: d1Drizzle } = await import('drizzle-orm/d1');
  function prepared(query, params = []) {
    return {
      bind(...values) {
        return prepared(query, values);
      },
      async run() {
        const result = sqlite.prepare(query).run(...params);
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
          const out = [];
          for (const statement of statements) out.push(await statement.run());
          sqlite.exec('COMMIT');
          return out;
        } catch (e) {
          sqlite.exec('ROLLBACK');
          throw e;
        }
      },
    },
    { schema: { ...schema, ...domainSchema } },
  );
  response = await send(probe);
  check(response.status, 200, 'Production D1 driver commits reviewed binding batch');
  const native = await response.json();
  check(native.profile.userId, 'student-user-a', 'D1 binding matches explicit review');
  check(native.profile.version, 5, 'D1 revision committed');
  check(
    await principalForToken(sessions['student-user-a'].split('=')[1]),
    null,
    'D1 batch revokes affected session',
  );
  check(await (await send(probe)).json(), native, 'D1 retry preserves original review');
  globalThis.__sahaTestDb = realDb;
  // Apply additive migration to legacy duplicate guardians without rewriting them.
  const oldDb = new DatabaseSync(':memory:');
  oldDb.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(join(root, 'drizzle'))
    .filter((f) => /^000[0-7].*\.sql$/.test(f))
    .sort())
    oldDb.exec(readFileSync(join(root, 'drizzle', file), 'utf8').replaceAll('--> statement-breakpoint', ''));
  oldDb
    .prepare('INSERT INTO schools(id,name,created_at,updated_at) VALUES (?,?,?,?)')
    .run('legacy', 'Synthetic legacy', stamp, stamp);
  oldDb
    .prepare('INSERT INTO users(id,name,email,role,school_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
    .run('legacy-login', 'Synthetic guardian', 'legacy@example.invalid', 'guardian', 'legacy', stamp, stamp);
  for (const id of ['legacy-g1', 'legacy-g2'])
    oldDb
      .prepare(
        'INSERT INTO guardians(id,school_id,user_id,name,relationship,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
      )
      .run(id, 'legacy', 'legacy-login', id, 'parent', stamp, stamp);
  oldDb.exec(
    readFileSync(join(root, 'drizzle/0008_profile_links.sql'), 'utf8').replaceAll(
      '--> statement-breakpoint',
      '',
    ),
  );
  check(
    oldDb.prepare('SELECT count(*) n FROM guardians').get().n,
    2,
    'Migration preserves legacy duplicate confirmed profiles',
  );
  oldDb.prepare("UPDATE guardians SET name='Synthetic edited',user_id=user_id WHERE id='legacy-g1'").run();
  checks++;
  assert.throws(() =>
    oldDb
      .prepare(
        'INSERT INTO guardians(id,school_id,user_id,name,relationship,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
      )
      .run('legacy-g3', 'legacy', 'legacy-login', 'Synthetic duplicate', 'parent', stamp, stamp),
  );
  checks++;
  oldDb.prepare("UPDATE guardians SET user_id=NULL WHERE id='legacy-g1'").run();
  check(
    oldDb.prepare('SELECT count(*) n FROM guardians WHERE user_id=?').get('legacy-login').n,
    1,
    'Legacy duplicate can be explicitly unlinked without deletion',
  );
  oldDb.close();
  check(networkCalls, 0, 'No provider or outbound requests');
  console.log(
    `Profile links contract: ${checks} checks passed (real sessions/routes, SQLite and production-shaped D1 batches; synthetic only).`,
  );
  console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0 }));
} finally {
  db.batch = originalBatch;
  globalThis.fetch = originalFetch;
  sqlite.close();
}
