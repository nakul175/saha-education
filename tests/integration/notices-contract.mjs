import assert from 'node:assert/strict';
import { bindings, freshDatabase, seedSecurityData, load, stamp } from '../support/security-db.mjs';
import { compileWithD1Limits, recordStatements } from '../support/d1-limits.mjs';

// FR-12 in-app notices: staff send to a class or chosen people within their authority, recipients
// see only their own, nothing leaves the application, saved text is never markup.
const { db, schema, sqlite } = freshDatabase();
await seedSecurityData(db, schema);
const executed = recordStatements(sqlite);
const service = await load('lib/education/notices.ts');
const routes = {
  collection: await load('app/api/notices/route.ts'),
  detail: await load('app/api/notices/[id]/route.ts'),
  corrections: await load('app/api/notices/[id]/corrections/route.ts'),
  audience: await load('app/api/notices/audience/route.ts'),
  people: await load('app/api/notices/recipients/route.ts'),
  inbox: await load('app/api/notifications/route.ts'),
};
const { createSession } = await load('lib/education/session.ts');
const origin = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = origin;
let checks = 0;
const check = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  checks++;
};
const ok = (value, message) => {
  assert.ok(value, message);
  checks++;
};
const sessions = {};
for (const id of [
  'admin-a',
  'admin-b',
  'teacher-a',
  'teacher-other',
  'guardian-a',
  'guardian-other',
  'guardian-b',
  'student-user-a',
  'student-user-other',
])
  sessions[id] = (await createSession(id)).split(';')[0];
const request = (user, method = 'GET', payload, path = '/api/notices', suppliedOrigin = origin) =>
  new Request(origin + path, {
    method,
    headers: {
      ...(sessions[user] ? { cookie: sessions[user] } : {}),
      origin: suppliedOrigin,
      ...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload !== undefined
      ? { body: typeof payload === 'string' ? payload : JSON.stringify(payload) }
      : {}),
  });
const count = (table) => sqlite.prepare('SELECT count(*) n FROM ' + table).get().n;
const uuid = () => crypto.randomUUID();
const classNotice = (classId = 'class-a', roles = 'both', extra = {}) => ({
  clientRequestId: uuid(),
  title: 'Synthetic school trip',
  body: 'Please send the signed form by Friday.',
  audience: { kind: 'class', classId, roles },
  reviewConfirmed: true,
  ...extra,
});
const peopleNotice = (userIds, extra = {}) => ({
  clientRequestId: uuid(),
  title: 'Synthetic personal note',
  body: 'A short private message.',
  audience: { kind: 'recipients', userIds },
  reviewConfirmed: true,
  ...extra,
});
const send = (user, payload) => routes.collection.POST(request(user, 'POST', payload));
const inbox = async (user, query = '') => {
  const response = await routes.inbox.GET(request(user, 'GET', undefined, '/api/notifications' + query));
  return { response, rows: await response.json() };
};
const recipientsOf = (id) =>
  sqlite
    .prepare('SELECT user_id FROM notice_recipients WHERE notice_id=? ORDER BY user_id')
    .all(id)
    .map((row) => row.user_id);
async function denied(response, status, message) {
  check(response.status, status, message);
  check(Object.keys(await response.json()), ['error'], 'Denial exposes only a safe error');
}
let networkCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  networkCalls++;
  throw new Error('Notices must remain in-app and local');
};
const originalBatch = db.batch.bind(db);
try {
  // ---- access: staff only, role checked before the body, origin and authentication enforced ----
  await denied(await routes.collection.GET(request('anonymous')), 401, 'Anonymous notice list denied');
  await denied(
    await routes.collection.POST(request('anonymous', 'POST', classNotice())),
    401,
    'Anonymous send denied',
  );
  for (const user of ['guardian-a', 'student-user-a']) {
    await denied(
      await routes.collection.GET(request(user)),
      403,
      'Family and learner accounts cannot list sent notices',
    );
    await denied(await send(user, classNotice()), 403, 'Family and learner accounts cannot send');
    await denied(
      await routes.collection.POST(request(user, 'POST', '{not json')),
      403,
      'Role denial precedes body parsing',
    );
    await denied(
      await routes.audience.GET(
        request(user, 'GET', undefined, '/api/notices/audience?classId=class-a&roles=both'),
      ),
      403,
      'Audience preview is staff-only',
    );
    await denied(
      await routes.people.GET(request(user, 'GET', undefined, '/api/notices/recipients')),
      403,
      'Recipient list is staff-only',
    );
    await denied(
      await routes.detail.GET(request(user, 'GET', undefined, '/api/notices/x'), {
        params: Promise.resolve({ id: 'x' }),
      }),
      403,
      'Sent-notice detail is staff-only',
    );
  }
  await denied(
    await routes.collection.POST(
      request('admin-a', 'POST', classNotice(), '/api/notices', 'https://foreign.example.invalid'),
    ),
    403,
    'Foreign origin cannot send',
  );
  check(count('notices'), 0, 'Denied calls create nothing');

  // ---- strict, plain-language input ----
  for (const altered of [
    { title: '' },
    { title: ' ' },
    { title: 'x'.repeat(121) },
    { body: '' },
    { body: 'x'.repeat(2001) },
    { reviewConfirmed: false },
    { reviewConfirmed: undefined },
    { clientRequestId: 'not-a-uuid' },
    { extra: 'field' },
    { schoolId: 'b' },
    { authorId: 'admin-b' },
    { recipientCount: 99 },
    { title: 'Hello\u0000there' },
    { title: 'Line\nbreak' },
    { body: 'bell\u0007' },
    { title: '<script>alert(1)</script>' },
    { body: 'See <img src=x onerror=alert(1)>' },
    { body: 'Visit <a href="https://example.invalid">here</a>' },
    { title: '<!-- hidden -->' },
    { audience: { kind: 'class', classId: 'class-a', roles: 'staff' } },
    { audience: { kind: 'class', classId: '', roles: 'both' } },
    { audience: { kind: 'recipients', userIds: [] } },
    { audience: { kind: 'recipients', userIds: ['guardian-a', 'guardian-a'] } },
    { audience: { kind: 'recipients', userIds: Array.from({ length: 51 }, (_, index) => 'u' + index) } },
    { audience: { kind: 'everyone' } },
    { audience: { kind: 'class', classId: 'class-a', roles: 'both', userIds: ['guardian-a'] } },
  ]) {
    const payload = classNotice();
    const merged = { ...payload, ...altered };
    for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key];
    await denied(
      await send('admin-a', merged),
      400,
      'Strict plain-text input rejects ' + JSON.stringify(altered).slice(0, 60),
    );
  }
  check(
    count('notices') + count('notifications'),
    3,
    'Invalid input persisted nothing beyond the three seeded inbox rows',
  );

  // ---- class notice: exact recipients, plain in-app rows, no leakage ----
  const seededInbox = count('notifications');
  const first = classNotice('class-a', 'both');
  let response = await send('teacher-a', first);
  check(response.status, 201, 'Assigned teacher sends to the own class');
  let result = await response.json();
  check(result.replayed, false, 'First save is not a replay');
  check(result.notice.recipientCount, 2, 'Active learner and linked guardian receive it');
  check(recipientsOf(first.clientRequestId), ['guardian-a', 'student-user-a'], 'Exact recipient set');
  check(result.notice.audienceLabel, 'class-a (T1): guardians and students', 'Plain-language audience label');
  check(result.notice.senderLabel, 'Sent by teacher-a (teacher)', 'Sender label comes from the server');
  check(count('notifications'), seededInbox + 2, 'One in-app row per recipient');
  check(
    sqlite.prepare("SELECT count(*) n FROM notifications WHERE id LIKE 'notice:%' AND channel='in_app'").get()
      .n,
    2,
    'Only the in-app channel is used',
  );
  ok(
    !('requestHash' in result.notice) && !('attemptId' in result.notice),
    'Private retry markers are not returned',
  );
  for (const [user, expected] of [
    ['guardian-a', 1],
    ['student-user-a', 1],
    ['guardian-other', 0],
    ['student-user-other', 0],
    ['guardian-b', 0],
    ['teacher-a', 0],
    ['admin-a', 0],
  ]) {
    const { rows } = await inbox(user);
    check(
      rows.filter((row) => row.id.startsWith('notice:')).length,
      expected,
      `${user} sees only notices addressed to them`,
    );
  }
  const mine = (await inbox('guardian-a')).rows.find(
    (row) => row.id === `notice:${first.clientRequestId}:guardian-a`,
  );
  check(
    [mine.title, mine.readAt],
    ['Synthetic school trip', null],
    'Recipient notice is unread with the authored title',
  );
  ok(
    mine.body.startsWith('Please send the signed form by Friday.') &&
      mine.body.endsWith('Sent by teacher-a (teacher)'),
    'Body keeps the text and ends with the sender line',
  );

  // roles filter, class scope, admin reach
  response = await send('teacher-a', classNotice('class-a', 'guardians'));
  check(recipientsOf((await response.json()).notice.id), ['guardian-a'], 'Guardians-only audience');
  response = await send('teacher-a', classNotice('class-a', 'learners'));
  check(recipientsOf((await response.json()).notice.id), ['student-user-a'], 'Learners-only audience');
  await denied(
    await send('teacher-a', classNotice('class-other')),
    404,
    "A teacher cannot send to another teacher's class",
  );
  await denied(
    await send('teacher-a', classNotice('class-b')),
    404,
    "A teacher cannot send to another school's class",
  );
  await denied(
    await send('admin-a', classNotice('class-b')),
    404,
    "An administrator cannot reach another school's class",
  );
  response = await send('admin-a', classNotice('class-other'));
  check(response.status, 201, 'An administrator may notify any class in the own school');
  check(
    recipientsOf((await response.json()).notice.id),
    ['guardian-other', 'student-user-other'],
    'Other class recipients are exactly its own family and learner',
  );
  await denied(
    await send(
      'teacher-a',
      classNotice('class-a', 'both', { audience: { kind: 'class', classId: 'missing', roles: 'both' } }),
    ),
    404,
    'Unknown class is not disclosed',
  );

  // membership is current: withdrawn learners and disabled or unmapped accounts are excluded
  sqlite.prepare("UPDATE enrolments SET status='withdrawn' WHERE student_id='student-a'").run();
  await denied(
    await send('teacher-a', classNotice('class-a', 'both')),
    400,
    'A class with no current members cannot receive a notice',
  );
  check(count('notices'), 4, 'Empty audience creates no notice record');
  sqlite.prepare("UPDATE enrolments SET status='active' WHERE student_id='student-a'").run();
  sqlite.prepare("UPDATE users SET disabled_at='2026-10-05T00:00:00.000Z' WHERE id='guardian-a'").run();
  response = await send('teacher-a', classNotice('class-a', 'both'));
  check(
    recipientsOf((await response.json()).notice.id),
    ['student-user-a'],
    'A disabled account receives nothing',
  );
  sqlite.prepare("UPDATE users SET disabled_at=NULL WHERE id='guardian-a'").run();
  sqlite.prepare("UPDATE users SET identity_subject=NULL WHERE id='student-user-a'").run();
  response = await send('teacher-a', classNotice('class-a', 'both'));
  check(
    recipientsOf((await response.json()).notice.id),
    ['guardian-a'],
    'An account without a provider identity receives nothing',
  );
  sqlite.prepare("UPDATE users SET identity_subject='sub-student-user-a' WHERE id='student-user-a'").run();

  // ---- explicit recipients ----
  response = await send('teacher-a', peopleNotice(['guardian-a', 'student-user-a']));
  check(response.status, 201, 'Teacher may choose related guardians and learners');
  check((await response.json()).notice.audienceLabel, '2 selected people', 'Selected-people label');
  await denied(
    await send('teacher-a', peopleNotice(['guardian-other'])),
    404,
    'Teacher cannot pick an unrelated guardian',
  );
  await denied(
    await send('teacher-a', peopleNotice(['guardian-a', 'student-user-other'])),
    404,
    'One unrelated person rejects the whole send',
  );
  await denied(
    await send('teacher-a', peopleNotice(['teacher-other'])),
    404,
    'Staff accounts are not notice recipients',
  );
  await denied(
    await send('teacher-a', peopleNotice(['admin-a'])),
    404,
    'Administrators are not notice recipients',
  );
  await denied(
    await send('admin-a', peopleNotice(['guardian-b'])),
    404,
    "Administrator cannot reach another school's guardian",
  );
  response = await send('admin-a', peopleNotice(['guardian-other', 'student-user-a']));
  check(response.status, 201, 'Administrator may choose anyone in the school');
  const adminPick = (await response.json()).notice;
  check(recipientsOf(adminPick.id), ['guardian-other', 'student-user-a'], 'Exact chosen set');

  // ---- idempotent retry ----
  const retryBody = classNotice('class-a', 'both');
  const beforeRetry = {
    notices: count('notices'),
    notes: count('notifications'),
    recipients: count('notice_recipients'),
  };
  const firstSend = await send('teacher-a', retryBody);
  check(firstSend.status, 201, 'Original send');
  const again = await send('teacher-a', retryBody);
  check(again.status, 200, 'Exact retry returns the original');
  const replayed = await again.json();
  check(
    [replayed.replayed, replayed.notice.id],
    [true, retryBody.clientRequestId],
    'Retry is flagged as a replay of the same notice',
  );
  check(
    [count('notices'), count('notifications'), count('notice_recipients')],
    [beforeRetry.notices + 1, beforeRetry.notes + 2, beforeRetry.recipients + 2],
    'Retry creates no duplicate notice or inbox row',
  );
  await denied(
    await send('teacher-a', { ...retryBody, body: 'Changed text after the first save.' }),
    409,
    'Same request id with changed content conflicts',
  );
  await denied(await send('admin-a', retryBody), 409, 'Another account cannot reuse the request id');
  await denied(
    await send('admin-b', retryBody),
    404,
    'Another school learns nothing about the request id or class',
  );
  await denied(
    await send('admin-b', peopleNotice(['guardian-b'], { clientRequestId: retryBody.clientRequestId })),
    409,
    'Another school cannot take over an existing request id',
  );

  // ---- authority changes between preview and save ----
  const raced = classNotice('class-a', 'both');
  const beforeRace = { notices: count('notices'), notes: count('notifications') };
  db.batch = async (queries) => {
    db.batch = originalBatch;
    sqlite.prepare("UPDATE users SET disabled_at='2026-10-05T01:00:00.000Z' WHERE id='guardian-a'").run();
    return originalBatch(queries);
  };
  await denied(
    await send('teacher-a', raced),
    409,
    'A recipient lost between preview and save conflicts safely',
  );
  check(
    [count('notices'), count('notifications')],
    [beforeRace.notices, beforeRace.notes],
    'No partial notice or inbox row remains after the conflict',
  );
  sqlite.prepare("UPDATE users SET disabled_at=NULL WHERE id='guardian-a'").run();
  response = await send('teacher-a', raced);
  check(
    response.status,
    201,
    'The same request succeeds once authority is restored (not poisoned by the failed attempt)',
  );
  const revoked = classNotice('class-a', 'both');
  db.batch = async (queries) => {
    db.batch = originalBatch;
    sqlite.prepare("UPDATE users SET role='guardian' WHERE id='teacher-a'").run();
    return originalBatch(queries);
  };
  const beforeRevoke = { notices: count('notices'), notes: count('notifications') };
  await denied(await send('teacher-a', revoked), 403, 'A sender whose authority was revoked cannot save');
  sqlite.prepare("UPDATE users SET role='teacher' WHERE id='teacher-a'").run();
  check(
    [count('notices'), count('notifications')],
    [beforeRevoke.notices, beforeRevoke.notes],
    'Revoked sender leaves no rows',
  );
  db.batch = async (queries) => {
    db.batch = originalBatch;
    sqlite.prepare("UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'").run();
    return originalBatch(queries);
  };
  await denied(
    await send('teacher-a', classNotice('class-a', 'both')),
    409,
    "A class reassigned before save is no longer in the teacher's scope",
  );
  sqlite.prepare("UPDATE classes SET teacher_id='teacher-a' WHERE id='class-a'").run();
  check(count('notices'), beforeRevoke.notices, 'Class reassignment race leaves no notice');
  db.batch = async (queries) => {
    db.batch = originalBatch;
    sqlite.prepare('DELETE FROM auth_sessions WHERE user_id=?').run('teacher-a');
    return originalBatch(queries);
  };
  await denied(
    await send('teacher-a', classNotice('class-a', 'both')),
    403,
    'A revoked session cannot complete the save',
  );
  check(count('notices'), beforeRevoke.notices, 'Revoked session leaves no notice');
  sessions['teacher-a'] = (await createSession('teacher-a')).split(';')[0];

  // ---- sent-notice reads: authors and administrators only, school-scoped ----
  response = await routes.collection.GET(request('teacher-a'));
  let page = await response.json();
  ok(
    page.items.every((item) => item.authorId === 'teacher-a'),
    'A teacher lists only the notices they sent',
  );
  check(page.total, page.items.length, "Total matches the teacher's own notices");
  response = await routes.collection.GET(request('admin-a'));
  page = await response.json();
  ok(
    page.items.some((item) => item.authorId === 'teacher-a') &&
      page.items.some((item) => item.authorId === 'admin-a'),
    'An administrator lists every notice in the school',
  );
  response = await routes.collection.GET(request('admin-b'));
  page = await response.json();
  check([page.items.length, page.total], [0, 0], 'Another school sees none of them');
  response = await routes.collection.GET(request('teacher-other'));
  page = await response.json();
  check(page.items.length, 0, 'Another teacher sees none of them');
  const sentId = first.clientRequestId;
  const ctx = (id) => ({ params: Promise.resolve({ id }) });
  response = await routes.detail.GET(
    request('teacher-a', 'GET', undefined, '/api/notices/' + sentId),
    ctx(sentId),
  );
  check(response.status, 200, 'Author reads the detail');
  let detail = await response.json();
  check(
    detail.recipients.map((row) => [row.userId, row.readAt]),
    [
      ['guardian-a', null],
      ['student-user-a', null],
    ],
    'Recipients are listed with unread state',
  );
  await denied(
    await routes.detail.GET(
      request('teacher-other', 'GET', undefined, '/api/notices/' + sentId),
      ctx(sentId),
    ),
    404,
    'Another teacher cannot open the notice',
  );
  await denied(
    await routes.detail.GET(request('admin-b', 'GET', undefined, '/api/notices/' + sentId), ctx(sentId)),
    404,
    "Another school's administrator cannot open the notice",
  );
  response = await routes.detail.GET(
    request('admin-a', 'GET', undefined, '/api/notices/' + sentId),
    ctx(sentId),
  );
  check(response.status, 200, 'The school administrator can open any notice');
  await denied(
    await routes.detail.GET(request('admin-a', 'GET', undefined, '/api/notices/missing'), ctx('missing')),
    404,
    'Unknown notice is not found',
  );

  // ---- read state belongs to each recipient ----
  response = await routes.inbox.PATCH(
    request(
      'guardian-a',
      'PATCH',
      undefined,
      `/api/notifications?id=${encodeURIComponent(`notice:${sentId}:guardian-a`)}`,
    ),
  );
  check(response.status, 200, 'Recipient marks the notice read');
  await denied(
    await routes.inbox.PATCH(
      request(
        'guardian-other',
        'PATCH',
        undefined,
        `/api/notifications?id=${encodeURIComponent(`notice:${sentId}:student-user-a`)}`,
      ),
    ),
    404,
    "A different account cannot mark another recipient's notice",
  );
  response = await routes.detail.GET(
    request('teacher-a', 'GET', undefined, '/api/notices/' + sentId),
    ctx(sentId),
  );
  detail = await response.json();
  check([detail.readCount, detail.recipientCount], [1, 2], 'Sender sees how many recipients have read it');
  check(
    detail.recipients.map((row) => [row.userId, typeof row.readAt]),
    [
      ['guardian-a', 'string'],
      ['student-user-a', 'object'],
    ],
    'Read state is per recipient',
  );

  // ---- corrections keep the original and add a reasoned correction ----
  const originalRows =
    JSON.stringify(sqlite.prepare('SELECT * FROM notices WHERE id=?').get(sentId)) +
    JSON.stringify(
      sqlite.prepare('SELECT * FROM notifications WHERE id LIKE ? ORDER BY id').all(`notice:${sentId}:%`),
    );
  const fix = {
    clientRequestId: uuid(),
    title: 'Trip date changed',
    body: 'The trip is now on Monday, not Friday.',
    reason: 'The date in the first notice was wrong.',
    reviewConfirmed: true,
  };
  const correct = (user, id, payload) =>
    routes.corrections.POST(request(user, 'POST', payload, `/api/notices/${id}/corrections`), ctx(id));
  await denied(await correct('guardian-a', sentId, fix), 403, 'Families cannot send corrections');
  await denied(await correct('teacher-other', sentId, fix), 404, 'Another teacher cannot correct it');
  await denied(await correct('admin-b', sentId, fix), 404, 'Another school cannot correct it');
  for (const altered of [
    { reason: '' },
    { reason: 'too short' },
    { reason: '<b>wrong</b> date entered' },
    { reviewConfirmed: false },
    { title: '' },
    { audience: { kind: 'class' } },
    { recipientCount: 5 },
  ]) {
    await denied(
      await correct('teacher-a', sentId, { ...fix, ...altered }),
      400,
      'Strict correction input rejects ' + JSON.stringify(altered),
    );
  }
  response = await correct('teacher-a', sentId, fix);
  check(response.status, 201, 'Author sends a reasoned correction');
  const corrected = (await response.json()).notice;
  check(
    [corrected.audienceKind, corrected.correctsNoticeId, corrected.correctionReason],
    ['correction', sentId, 'The date in the first notice was wrong.'],
    'Correction links to the original with its reason',
  );
  check(
    recipientsOf(corrected.id),
    ['guardian-a', 'student-user-a'],
    'Correction reaches the original recipients',
  );
  const note = (await inbox('guardian-a')).rows.find((row) => row.id === `notice:${corrected.id}:guardian-a`);
  check(note.title, 'Correction: Trip date changed', 'Recipients see it labelled as a correction');
  ok(
    note.body.includes('This corrects an earlier notice titled “Synthetic school trip”.') &&
      note.body.includes('Reason: The date in the first notice was wrong.'),
    'Correction text names the original and the reason',
  );
  check(
    JSON.stringify(sqlite.prepare('SELECT * FROM notices WHERE id=?').get(sentId)) +
      JSON.stringify(
        sqlite.prepare('SELECT * FROM notifications WHERE id LIKE ? ORDER BY id').all(`notice:${sentId}:%`),
      ),
    originalRows,
    'The original notice and its inbox rows are byte-for-byte unchanged',
  );
  response = await correct('teacher-a', sentId, fix);
  check(
    [response.status, (await response.json()).replayed],
    [200, true],
    'Exact correction retry returns the original',
  );
  await denied(
    await correct('teacher-a', sentId, { ...fix, body: 'Different body after save.' }),
    409,
    'Changed correction text under one request id conflicts',
  );
  response = await routes.detail.GET(
    request('teacher-a', 'GET', undefined, '/api/notices/' + sentId),
    ctx(sentId),
  );
  detail = await response.json();
  check(
    [detail.correctionCount, detail.corrections.map((item) => item.id)],
    [1, [corrected.id]],
    'The original lists its corrections',
  );
  response = await routes.detail.GET(
    request('teacher-a', 'GET', undefined, '/api/notices/' + corrected.id),
    ctx(corrected.id),
  );
  detail = await response.json();
  check(
    detail.corrects,
    { id: sentId, title: 'Synthetic school trip' },
    'A correction links back to the original',
  );
  sqlite.prepare("UPDATE users SET disabled_at='2026-10-05T00:00:00.000Z' WHERE id='student-user-a'").run();
  response = await correct('admin-a', sentId, { ...fix, clientRequestId: uuid() });
  check(
    recipientsOf((await response.json()).notice.id),
    ['guardian-a'],
    "An administrator may correct a teacher's notice; ineligible recipients are skipped",
  );
  sqlite.prepare("UPDATE users SET disabled_at=NULL WHERE id='student-user-a'").run();
  sqlite
    .prepare(
      "UPDATE users SET disabled_at='2026-10-05T00:00:00.000Z' WHERE id IN ('guardian-a','student-user-a')",
    )
    .run();
  await denied(
    await correct('admin-a', sentId, { ...fix, clientRequestId: uuid() }),
    400,
    'A correction with nobody left to receive it is refused',
  );
  sqlite.prepare("UPDATE users SET disabled_at=NULL WHERE id IN ('guardian-a','student-user-a')").run();

  // ---- immutability ----
  for (const sql of [
    "UPDATE notices SET title='x'",
    'DELETE FROM notices',
    "UPDATE notice_recipients SET user_id='x'",
    'DELETE FROM notice_recipients',
  ])
    assert.throws(() => sqlite.exec(sql), /immutable/, sql);
  checks += 4;
  check(
    sqlite.prepare('SELECT count(*) n FROM notices').get().n > 0,
    true,
    'Immutability attempts changed nothing',
  );

  // ---- picker and audience preview ----
  response = await routes.audience.GET(
    request('teacher-a', 'GET', undefined, '/api/notices/audience?classId=class-a&roles=both'),
  );
  let preview = await response.json();
  check(
    [preview.count, preview.label, preview.sample.map((row) => row.name)],
    [2, 'class-a (T1): guardians and students', ['guardian-a', 'student-user-a']],
    'Preview shows who would receive a class notice',
  );
  await denied(
    await routes.audience.GET(
      request('teacher-a', 'GET', undefined, '/api/notices/audience?classId=class-other&roles=both'),
    ),
    404,
    'Preview respects class scope',
  );
  await denied(
    await routes.audience.GET(
      request('teacher-a', 'GET', undefined, '/api/notices/audience?classId=class-a&roles=both&extra=1'),
    ),
    400,
    'Preview rejects unknown parameters',
  );
  response = await routes.people.GET(request('teacher-a', 'GET', undefined, '/api/notices/recipients'));
  let people = await response.json();
  check(
    people.map((row) => row.userId),
    ['guardian-a', 'student-user-a'],
    'Teacher can pick only related learners and guardians',
  );
  ok(
    people.every((row) => typeof row.context === 'string' && !('email' in row)),
    'The picker shows plain context and no contact details',
  );
  response = await routes.people.GET(
    request('admin-a', 'GET', undefined, '/api/notices/recipients?q=guardian'),
  );
  people = await response.json();
  check(
    people.map((row) => row.userId),
    ['guardian-a', 'guardian-other'],
    'Administrator search by name stays inside the school',
  );
  response = await routes.people.GET(request('admin-a', 'GET', undefined, '/api/notices/recipients?q=%25'));
  people = await response.json();
  check(people.length, 0, 'A percent sign is a literal search, not a wildcard');
  await denied(
    await routes.people.GET(request('admin-a', 'GET', undefined, '/api/notices/recipients?limit=500')),
    400,
    'Picker limit is bounded',
  );

  // ---- text is data, never markup ----
  const sample = 'Is 3 < 5 and 7 > 2? Use a & b "quotes" \'single\' and emoji \u{1F4DA}.';
  response = await send('admin-a', peopleNotice(['guardian-a'], { title: 'Maths: 3 < 5', body: sample }));
  check(response.status, 201, 'Comparison symbols and entities are plain text');
  const stored = sqlite
    .prepare('SELECT title, body FROM notices WHERE id=?')
    .get((await response.json()).notice.id);
  check([stored.title, stored.body], ['Maths: 3 < 5', sample], 'Saved verbatim, not rewritten or escaped');
  response = await send(
    'admin-a',
    peopleNotice(['guardian-a'], { body: 'Line one\r\nLine two\n\nLine four' }),
  );
  check(
    sqlite.prepare('SELECT body FROM notices WHERE id=?').get((await response.json()).notice.id).body,
    'Line one\nLine two\n\nLine four',
    'Line breaks are normalised, not removed',
  );

  // ---- inbox paging ----
  const pageUser = 'guardian-other';
  sqlite.prepare("DELETE FROM notifications WHERE user_id=? AND id NOT LIKE 'notice:%'").run(pageUser);
  const insert = sqlite.prepare(
    'INSERT INTO notifications (id,user_id,channel,title,body,read_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
  );
  for (let index = 0; index < 60; index++) {
    const time = `2026-09-${String(1 + Math.floor(index / 3)).padStart(2, '0')}T00:00:00.000Z`;
    insert.run(
      `page-${String(index).padStart(2, '0')}`,
      pageUser,
      'in_app',
      'Paged ' + index,
      'Body',
      index % 4 === 0 ? time : null,
      time,
      time,
    );
  }
  const total = count("notifications WHERE user_id='guardian-other'");
  const seen = [];
  let cursor = null,
    pages = 0;
  do {
    const { response: pageResponse, rows } = await inbox(
      pageUser,
      '?limit=25' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
    );
    check(pageResponse.status, 200, 'Inbox page loads');
    check(pageResponse.headers.get('x-total-count'), String(total), 'Total is reported in a header');
    ok(rows.length <= 25, 'Page size is respected');
    seen.push(...rows.map((row) => row.id));
    pages++;
    const next = pageResponse.headers.get('x-next-cursor');
    cursor = next ? decodeURIComponent(next) : null;
  } while (cursor && pages < 10);
  check(
    [pages, seen.length, new Set(seen).size],
    [Math.ceil(total / 25), total, total],
    'Paging visits every notice exactly once',
  );
  const times = seen.map(
    (id) => sqlite.prepare('SELECT created_at c FROM notifications WHERE id=?').get(id).c,
  );
  check(times, [...times].sort().reverse(), 'Newest first');
  let { response: unreadResponse, rows: unreadRows } = await inbox(pageUser, '?unread=1&limit=100');
  ok(
    unreadRows.every((row) => row.readAt === null),
    'Unread filter returns only unread',
  );
  check(
    Number(unreadResponse.headers.get('x-unread-count')),
    sqlite
      .prepare("SELECT count(*) n FROM notifications WHERE user_id='guardian-other' AND read_at IS NULL")
      .get().n,
    'Unread count header matches storage',
  );
  check((await inbox(pageUser)).rows.length, 25, 'Default page is bounded');
  check(
    (await inbox(pageUser, '?userId=guardian-a')).rows.every((row) => row.userId === pageUser),
    true,
    'A userId parameter never switches the inbox owner',
  );
  for (const bad of ['?limit=0', '?limit=101', '?limit=abc', '?cursor=nope', '?unread=2', '?limit=5&limit=6'])
    check((await inbox(pageUser, bad)).response.status, 400, 'Malformed paging rejected: ' + bad);
  check((await inbox('anonymous')).response.status, 401, 'Anonymous inbox denied');

  check(networkCalls, 0, 'No outbound network request was made');
  check(
    sqlite
      .prepare("SELECT count(*) n FROM notifications WHERE channel <> 'in_app' AND id LIKE 'notice:%'")
      .get().n,
    0,
    'No notice uses an external channel',
  );
  // Every statement this suite really ran must also compile under D1's 100-variable and depth-100 limits.
  const compiled = compileWithD1Limits(executed);
  check(compiled.failures, [], 'All executed statements fit the D1 variable and expression-depth limits');
  ok(compiled.checked > 40, "The D1 limit check covered the suite's real statements");
  void service;
  void stamp;
  console.log(
    `Notices contract: ${checks} checks passed (real sessions/routes, atomic SQL fan-out, scoped recipients; synthetic only).`,
  );
  console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0 }));
} finally {
  db.batch = originalBatch;
  globalThis.fetch = originalFetch;
  sqlite.close();
}
