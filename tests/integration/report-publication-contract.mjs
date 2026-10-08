// Synthetic real-session HTTP contracts, SQL-time changes, migration guards and
// production Drizzle D1 statement execution. No external notification delivery.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bindings, freshDatabase, seedSecurityData, load, stamp } from '../support/security-db.mjs';

const { db, schema, sqlite } = freshDatabase();
await seedSecurityData(db, schema);
const { reportPublicationReceipts } = await load('db/report-publication-schema.ts');
const sessions = await load('lib/education/session.ts');
const notices = await load('lib/education/notifications.ts');
const routes = {
  reports: await load('app/api/report-cards/route.ts'),
  report: await load('app/api/report-cards/[id]/route.ts'),
  notices: await load('app/api/notifications/route.ts'),
};
const origin = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = origin;
const cookies = {};
for (const user of [
  'admin-a',
  'admin-b',
  'teacher-a',
  'teacher-other',
  'guardian-a',
  'guardian-other',
  'student-user-a',
])
  cookies[user] = (await sessions.createSession(user)).split(';')[0];
const guardian = { id: 'guardian-a', role: 'guardian', schoolId: 'a' };
let checks = 0;
function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  checks++;
}
function throws(run, expected, message) {
  assert.throws(run, expected, message);
  checks++;
}
function request(user, method = 'GET', payload, path = '/api/report-cards', selectedOrigin = origin) {
  const headers = { origin: selectedOrigin, ...(cookies[user] ? { cookie: cookies[user] } : {}) };
  const init = { method, headers };
  if (payload !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  }
  return new Request(origin + path, init);
}
const parameters = (id) => ({ params: Promise.resolve({ id }) });
const publish = (id, user = 'admin-a') =>
  routes.report.PATCH(request(user, 'PATCH', { publish: true }, '/api/report-cards/' + id), parameters(id));
const count = (table) => sqlite.prepare(`SELECT count(*) n FROM ${table}`).get().n;
const publicationCount = (id) =>
  sqlite.prepare('SELECT count(*) n FROM report_publication_receipts WHERE report_id=?').get(id).n;
const reportRow = (id) => sqlite.prepare('SELECT * FROM report_cards WHERE id=?').get(id);
const publicationNotices = (id) =>
  sqlite
    .prepare('SELECT * FROM notifications WHERE id LIKE ? ORDER BY id')
    .all('report-card-published:' + id + ':%');
async function draft(studentId = 'student-a') {
  const response = await routes.reports.POST(
    request('admin-a', 'POST', {
      studentId,
      term: 'Synthetic term',
      summary: 'Manual supplied summary',
      overallGrade: 'Supplied grade',
    }),
  );
  check(response.status, 201, 'Administrator creates a scoped manual draft');
  return await response.json();
}
const originalDb = globalThis.__sahaTestDb;
function beforeOperation(operation, table, mutate) {
  let injected = false;
  globalThis.__sahaTestDb = new Proxy(originalDb, {
    get(target, property) {
      if (property === operation)
        return (...args) => {
          if (!injected && args[0] === table) {
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
    check(injected, true, 'Late change executed after prevalidation and before the actual mutation');
  };
}
const originalFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = async () => {
  networkCalls++;
  throw new Error('Publication verification stays local');
};
try {
  // Authentication, origin and role precede JSON parsing, including publish retries.
  for (const [handler, params, forbidden] of [
    [routes.reports.POST, undefined, 'teacher-a'],
    [routes.report.PATCH, parameters('published-a'), 'guardian-a'],
    [routes.notices.POST, undefined, 'student-user-a'],
  ]) {
    let response = await handler(request(null, 'POST', '{'), params);
    check(response.status, 401, 'Anonymous malformed mutation authenticates first');
    check(response.headers.get('cache-control'), 'no-store', 'Authentication denial is uncached');
    response = await handler(request(forbidden, 'POST', '{'), params);
    check(response.status, 403, 'Unauthorized role is denied before malformed JSON');
    response = await handler(
      request('admin-a', 'POST', '{', '/api/report-cards', 'https://foreign.example.invalid'),
      params,
    );
    check(response.status, 403, 'Foreign origin is denied before malformed JSON');
    response = await handler(request('admin-a', 'POST', '{'), params);
    check(response.status, 400, 'Authorized malformed JSON is invalid');
  }
  check((await publish('published-b')).status, 404, 'Administrator cannot publish another school report');
  check((await publish('draft-a', 'teacher-a')).status, 403, 'Teacher cannot publish a report');
  check(
    (await routes.report.GET(request('guardian-a'), parameters('draft-a'))).status,
    404,
    'Draft content remains unavailable to family',
  );

  // The exact migration can be applied over pre-existing published evidence.
  const existingReports = sqlite.prepare('SELECT * FROM report_cards ORDER BY id').all();
  const existingNotices = sqlite.prepare('SELECT * FROM notifications ORDER BY id').all();
  for (const name of [
    'report_publication_authority',
    'report_publication_commit',
    'report_publication_no_update',
    'report_publication_no_delete',
  ])
    sqlite.exec(`DROP TRIGGER ${name}`);
  sqlite.exec('DROP TABLE report_publication_receipts');
  sqlite.exec(
    readFileSync(new URL('../../drizzle/0012_report_publication_receipts.sql', import.meta.url), 'utf8'),
  );
  check(
    sqlite.prepare('SELECT * FROM report_cards ORDER BY id').all(),
    existingReports,
    'Additive migration preserves all legacy report fields',
  );
  check(
    sqlite.prepare('SELECT * FROM notifications ORDER BY id').all(),
    existingNotices,
    'Additive migration preserves historical personal notices',
  );
  check(
    count('report_publication_receipts'),
    0,
    'Migration does not backfill receipts or fabricate publishers',
  );
  let response = await publish('published-a');
  check(response.status, 200, 'Legacy published retry returns established report');
  check((await response.json()).publishedAt, stamp, 'Legacy retry retains original publication time');
  check(count('report_publication_receipts'), 0, 'Legacy retry does not backfill publication evidence');
  check(
    sqlite.prepare('SELECT * FROM notifications ORDER BY id').all(),
    existingNotices,
    'Legacy retry creates no new notice',
  );

  response = await routes.reports.POST(
    request('admin-a', 'POST', {
      id: 'spoof-report',
      studentId: 'student-a',
      term: 'Supplied',
      overallGrade: 'Manual',
      publishedAt: stamp,
      createdAt: stamp,
      updatedAt: stamp,
    }),
  );
  check(response.status, 201, 'Ordinary draft input remains compatible');
  const created = await response.json();
  check(created.publishedAt, null, 'Client cannot publish through draft creation');
  check(created.id === 'spoof-report', false, 'Report identity is server generated');
  check(created.createdAt === stamp, false, 'Draft creation time is server generated');
  check(
    (
      await routes.reports.POST(
        request('admin-a', 'POST', { studentId: 'student-b', term: 'T', overallGrade: 'A' }),
      )
    ).status,
    404,
    'Foreign student draft is denied',
  );

  const concurrent = await Promise.all([publish(created.id), publish(created.id)]);
  check(
    concurrent.map((item) => item.status),
    [200, 200],
    'Concurrent publishers converge to a successful winner',
  );
  const published = await concurrent[0].json();
  check(
    (await concurrent[1].json()).publishedAt,
    published.publishedAt,
    'Concurrent loser returns the exact established publication time',
  );
  check(publicationCount(created.id), 1, 'Exactly one receipt exists for a publication');
  const receipt = sqlite
    .prepare('SELECT * FROM report_publication_receipts WHERE report_id=?')
    .get(created.id);
  check(
    [receipt.student_id, receipt.school_id, receipt.published_by, receipt.published_at],
    ['student-a', 'a', 'admin-a', published.publishedAt],
    'Receipt records the committing report, student, school, actor and time',
  );
  check(
    publicationNotices(created.id).map((row) => row.user_id),
    ['guardian-a'],
    'Current explicit guardian user receives one notice',
  );
  const notice = publicationNotices(created.id)[0];
  check(
    [notice.id, notice.channel, notice.title, notice.read_at],
    ['report-card-published:' + created.id + ':guardian-a', 'in_app', 'Report Card Published', null],
    'Notice identity and existing in-app shape are retained',
  );
  check(
    notice.body,
    "Your child student-a Synthetic's report card has been published.",
    'Notice uses current student name without external messages',
  );
  const beforeRetry = sqlite.prepare('SELECT * FROM report_publication_receipts ORDER BY id').all();
  const beforeRetryNotices = publicationNotices(created.id);
  check((await publish(created.id)).status, 200, 'Successful publication retry remains200');
  check(
    sqlite.prepare('SELECT * FROM report_publication_receipts ORDER BY id').all(),
    beforeRetry,
    'Retry preserves receipt identity and fields',
  );
  check(publicationNotices(created.id), beforeRetryNotices, 'Retry creates no duplicate notice');
  check(
    (await routes.report.GET(request('guardian-a'), parameters(created.id))).status,
    200,
    'Current linked guardian can read the published report',
  );
  check(
    (await routes.report.GET(request('guardian-other'), parameters(created.id))).status,
    404,
    'Unrelated guardian cannot read published content',
  );
  throws(
    () =>
      sqlite
        .prepare('UPDATE report_publication_receipts SET published_at=? WHERE id=?')
        .run(stamp, receipt.id),
    /immutable/,
    'Publication receipt cannot be edited',
  );
  throws(
    () => sqlite.prepare('DELETE FROM report_publication_receipts WHERE id=?').run(receipt.id),
    /immutable/,
    'Publication receipt cannot be deleted',
  );
  check(
    sqlite.prepare('SELECT * FROM report_publication_receipts ORDER BY id').all(),
    beforeRetry,
    'Rejected raw receipt changes preserve exact evidence',
  );

  // Direct SQL cannot manufacture a receipt for an unauthorized, mismatched or
  // already published report. The DB guard is additional to the service scope.
  const guarded = await draft();
  const receiptInsert = sqlite.prepare('INSERT INTO report_publication_receipts VALUES (?,?,?,?,?,?)');
  for (const [reportId, studentId, schoolId, actorId] of [
    [guarded.id, 'student-a', 'a', 'teacher-a'],
    [guarded.id, 'student-a', 'b', 'admin-b'],
    [guarded.id, 'student-other', 'a', 'admin-a'],
    ['published-a', 'student-a', 'a', 'admin-a'],
  ]) {
    throws(
      () => receiptInsert.run(crypto.randomUUID(), reportId, studentId, schoolId, actorId, stamp),
      /saha_report_publication_conflict/,
      'Raw receipt must match live administrator, current report and student school',
    );
    check(publicationCount(guarded.id), 0, 'Rejected receipt inserts preserve unpublished evidence');
  }
  check(reportRow(guarded.id).published_at, null, 'Rejected raw authority cannot publish the draft');

  // Guardian eligibility is read at the SQL boundary, never from a cached list.
  const recipientChanges = [
    [
      "UPDATE guardians SET user_id=NULL WHERE id='guardian-profile-a'",
      "UPDATE guardians SET user_id='guardian-a' WHERE id='guardian-profile-a'",
    ],
    [
      "DELETE FROM student_guardians WHERE student_id='student-a' AND guardian_id='guardian-profile-a'",
      "INSERT INTO student_guardians VALUES ('student-a','guardian-profile-a',1)",
    ],
    [
      "UPDATE guardians SET school_id='b' WHERE id='guardian-profile-a'",
      "UPDATE guardians SET school_id='a' WHERE id='guardian-profile-a'",
    ],
    [
      "UPDATE users SET school_id='b' WHERE id='guardian-a'",
      "UPDATE users SET school_id='a' WHERE id='guardian-a'",
    ],
    [
      "UPDATE users SET role='teacher' WHERE id='guardian-a'",
      "UPDATE users SET role='guardian' WHERE id='guardian-a'",
    ],
    [
      "UPDATE users SET disabled_at='synthetic-disabled' WHERE id='guardian-a'",
      "UPDATE users SET disabled_at=NULL WHERE id='guardian-a'",
    ],
    [
      "UPDATE users SET identity_issuer=NULL WHERE id='guardian-a'",
      "UPDATE users SET identity_issuer='https://identity.example.invalid' WHERE id='guardian-a'",
    ],
    [
      "UPDATE users SET identity_subject='' WHERE id='guardian-a'",
      "UPDATE users SET identity_subject='sub-guardian-a' WHERE id='guardian-a'",
    ],
  ];
  for (const [change, restore] of recipientChanges) {
    const pending = await draft();
    const finish = beforeOperation('insert', reportPublicationReceipts, () => sqlite.exec(change));
    try {
      response = await publish(pending.id);
      finish();
      check(
        response.status,
        200,
        'Report publication succeeds independently of absent current guardian recipients',
      );
      check(Boolean(reportRow(pending.id).published_at), true, 'Authorized report becomes published');
      check(publicationCount(pending.id), 1, 'Successful publication commits one receipt');
      check(
        publicationNotices(pending.id),
        [],
        'Late removed, foreign, disabled, wrong-role or unmapped guardian gets no new notice',
      );
    } finally {
      globalThis.__sahaTestDb = originalDb;
      sqlite.exec(restore);
    }
    check(
      (await publish(pending.id)).status,
      200,
      'Restoring recipient eligibility does not repeat publication',
    );
    check(
      publicationNotices(pending.id),
      [],
      'Retry after eligibility restoration does not create delayed notice',
    );
  }
  // Historical personal notices are retained after reviewed profile ownership
  // changes; this does not grant access to a now unrelated learner report.
  sqlite.exec("UPDATE guardians SET user_id=NULL WHERE id='guardian-profile-a'");
  try {
    check(
      (await notices.listNotifications(guardian)).some((item) => item.id === notice.id),
      true,
      'Unlinked guardian keeps historical own notices',
    );
    check(
      (await routes.report.GET(request('guardian-a'), parameters(created.id))).status,
      404,
      'Unlinked guardian loses report content access',
    );
    check(
      (
        await routes.notices.PATCH(
          request('guardian-a', 'PATCH', undefined, '/api/notifications?id=' + notice.id),
        )
      ).status,
      200,
      'Live recipient may acknowledge a historical own notice',
    );
    check(
      sqlite.prepare('SELECT read_at FROM notifications WHERE id=?').get(notice.id).read_at !== null,
      true,
      'Personal read marker updates without changing recipient history',
    );
  } finally {
    sqlite.exec("UPDATE guardians SET user_id='guardian-a' WHERE id='guardian-profile-a'");
  }

  const actorChanges = [
    ["disabled_at='synthetic-disabled'", 'disabled_at=NULL'],
    ["role='guardian'", "role='admin'"],
    ["school_id='b'", "school_id='a'"],
    ["identity_issuer=''", "identity_issuer='https://identity.example.invalid'"],
    ['identity_subject=NULL', "identity_subject='sub-admin-a'"],
  ];
  for (const [change, restore] of actorChanges) {
    const pending = await draft();
    const finish = beforeOperation('insert', reportPublicationReceipts, () =>
      sqlite.exec('UPDATE users SET ' + change + " WHERE id='admin-a'"),
    );
    try {
      response = await publish(pending.id);
      finish();
      check(response.status, 409, 'Publication SQL rejects late account authority change');
      check(
        await response.json(),
        { error: 'Conflict' },
        'Late publication conflict exposes no internal SQL or learner data',
      );
      check(response.headers.get('cache-control'), 'no-store', 'Conflict is uncached');
      check(reportRow(pending.id).published_at, null, 'Revoked actor cannot publish a report');
      check(publicationCount(pending.id), 0, 'Revoked actor creates no receipt');
      check(publicationNotices(pending.id), [], 'Revoked actor creates no notice');
    } finally {
      globalThis.__sahaTestDb = originalDb;
      sqlite.exec('UPDATE users SET ' + restore + " WHERE id='admin-a'");
    }
  }
  let pending = await draft();
  let finish = beforeOperation('insert', reportPublicationReceipts, () =>
    sqlite.exec("UPDATE students SET school_id='b' WHERE id='student-a'"),
  );
  try {
    response = await publish(pending.id);
    finish();
    check(response.status, 409, 'Late student transfer rejects publication');
    check(reportRow(pending.id).published_at, null, 'Transferred draft is never published');
    check(publicationCount(pending.id), 0, 'Transferred student creates no receipt');
    check(publicationNotices(pending.id), [], 'Zero-row publication produces no false publication notice');
  } finally {
    globalThis.__sahaTestDb = originalDb;
    sqlite.exec("UPDATE students SET school_id='a' WHERE id='student-a'");
  }

  // A report UPDATE ignored by another constraint/trigger cannot commit a
  // receipt or notices. A later notification failure also rolls everything back.
  sqlite.exec(
    `CREATE TRIGGER synthetic_ignore_publication BEFORE UPDATE OF published_at ON report_cards WHEN NEW.id='${pending.id}' BEGIN SELECT RAISE(IGNORE); END;`,
  );
  response = await publish(pending.id);
  check(response.status, 409, 'Receipt aborts when report UPDATE affects zero rows');
  check(reportRow(pending.id).published_at, null, 'Ignored UPDATE leaves report unchanged');
  check(publicationCount(pending.id), 0, 'Ignored UPDATE rolls back receipt');
  check(publicationNotices(pending.id), [], 'Ignored UPDATE emits no notice');
  sqlite.exec('DROP TRIGGER synthetic_ignore_publication');
  sqlite.exec(
    "CREATE TRIGGER synthetic_notice_failure BEFORE INSERT ON notifications WHEN NEW.title='Report Card Published' BEGIN SELECT RAISE(ABORT,'synthetic notice storage failure'); END;",
  );
  response = await publish(pending.id);
  check(response.status, 500, 'Unrelated storage fault returns a safe server error');
  check(
    await response.json(),
    { error: 'Internal server error' },
    'Notification storage fault exposes no SQL details',
  );
  check(reportRow(pending.id).published_at, null, 'Notice failure rolls back publication');
  check(publicationCount(pending.id), 0, 'Notice failure rolls back receipt');
  check(publicationNotices(pending.id), [], 'Notice failure leaves no partial recipient delivery');
  sqlite.exec('DROP TRIGGER synthetic_notice_failure');
  check((await publish(pending.id)).status, 200, 'Retry after rolled-back failure can publish safely');
  check(publicationCount(pending.id), 1, 'Recovered publication has one receipt');
  check(publicationNotices(pending.id).length, 1, 'Recovered publication has one current notice');

  const beforeDraft = count('report_cards');
  finish = beforeOperation('insert', schema.reportCards, () =>
    sqlite.exec("UPDATE students SET school_id='b' WHERE id='student-a'"),
  );
  try {
    response = await routes.reports.POST(
      request('admin-a', 'POST', { studentId: 'student-a', term: 'Late transfer', overallGrade: 'Manual' }),
    );
    finish();
    check(response.status, 409, 'Draft INSERT rechecks current student school');
    check(count('report_cards'), beforeDraft, 'Rejected draft creates no orphan school record');
  } finally {
    globalThis.__sahaTestDb = originalDb;
    sqlite.exec("UPDATE students SET school_id='a' WHERE id='student-a'");
  }
  const beforeNotices = count('notifications');
  finish = beforeOperation('insert', schema.notifications, () =>
    sqlite.exec("UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'"),
  );
  try {
    response = await routes.notices.POST(
      request('teacher-a', 'POST', {
        userId: 'guardian-a',
        channel: 'in_app',
        title: 'Synthetic',
        body: 'Current class only',
      }),
    );
    finish();
    check(response.status, 409, 'Teacher notice INSERT rechecks current class authority');
    check(count('notifications'), beforeNotices, 'Reassigned teacher creates no former-family notice');
  } finally {
    globalThis.__sahaTestDb = originalDb;
    sqlite.exec("UPDATE classes SET teacher_id='teacher-a' WHERE id='class-a'");
  }
  response = await routes.notices.POST(
    request('teacher-a', 'POST', {
      userId: 'guardian-a',
      channel: 'in_app',
      title: 'Synthetic',
      body: 'Current class only',
      id: 'spoof-notice',
      readAt: stamp,
      createdAt: stamp,
    }),
  );
  check(response.status, 201, 'Current teacher may create notice for current linked class guardian');
  const createdNotice = await response.json();
  check(createdNotice.readAt, null, 'Notice create cannot spoof an acknowledgement');
  check(createdNotice.id === 'spoof-notice', false, 'Notice ID is server generated');
  check(
    (
      await routes.notices.POST(
        request('teacher-other', 'POST', {
          userId: 'guardian-a',
          channel: 'in_app',
          title: 'Synthetic',
          body: 'Other class',
        }),
      )
    ).status,
    404,
    'Other teacher cannot target unrelated class guardian',
  );
  check(
    (
      await routes.notices.POST(
        request('admin-a', 'POST', {
          userId: 'guardian-b',
          channel: 'in_app',
          title: 'Synthetic',
          body: 'Other school',
        }),
      )
    ).status,
    404,
    'Administrator cannot target another school account',
  );
  for (const [change, restore] of [
    ["identity_issuer=''", "identity_issuer='https://identity.example.invalid'"],
    ['identity_subject=NULL', "identity_subject='sub-guardian-a'"],
  ]) {
    const before = count('notifications');
    finish = beforeOperation('insert', schema.notifications, () =>
      sqlite.exec('UPDATE users SET ' + change + " WHERE id='guardian-a'"),
    );
    try {
      response = await routes.notices.POST(
        request('admin-a', 'POST', {
          userId: 'guardian-a',
          channel: 'in_app',
          title: 'Synthetic',
          body: 'Mapped current recipient only',
        }),
      );
      finish();
      check(response.status, 409, 'Generic notification SQL rejects a newly unmapped recipient');
      check(count('notifications'), before, 'Unmapped recipient receives no new generic notice');
    } finally {
      globalThis.__sahaTestDb = originalDb;
      sqlite.exec('UPDATE users SET ' + restore + " WHERE id='guardian-a'");
    }
    sqlite.exec('UPDATE users SET ' + change + " WHERE id='guardian-a'");
    try {
      check(
        (
          await routes.notices.POST(
            request('admin-a', 'POST', {
              userId: 'guardian-a',
              channel: 'in_app',
              title: 'Synthetic',
              body: 'Mapped current recipient only',
            }),
          )
        ).status,
        404,
        'Initially unmapped notification recipient is invisible',
      );
    } finally {
      sqlite.exec('UPDATE users SET ' + restore + " WHERE id='guardian-a'");
    }
  }
  finish = beforeOperation('update', schema.notifications, () =>
    sqlite.exec("UPDATE users SET disabled_at='synthetic-disabled' WHERE id='guardian-a'"),
  );
  try {
    response = await routes.notices.PATCH(
      request('guardian-a', 'PATCH', undefined, '/api/notifications?id=' + createdNotice.id),
    );
    finish();
    check(response.status, 404, 'Notice read mutation checks live recipient authority');
    check(
      sqlite.prepare('SELECT read_at FROM notifications WHERE id=?').get(createdNotice.id).read_at,
      null,
      'Revoked recipient cannot change read state',
    );
    check(
      await notices.listNotifications(guardian),
      [],
      'Direct stale-principal notice list releases no records',
    );
    check(
      await notices.getNotification(guardian, createdNotice.id),
      null,
      'Direct stale-principal notice detail releases no record',
    );
  } finally {
    globalThis.__sahaTestDb = originalDb;
    sqlite.exec("UPDATE users SET disabled_at=NULL WHERE id='guardian-a'");
  }

  // Production D1's actual prepared/RETURNING path, with triggers firing in the
  // same SQLite statement rather than an implementation-shaped response mock.
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
  globalThis.__sahaTestDb = d1Drizzle({ prepare: prepared }, { schema });
  pending = await draft();
  response = await publish(pending.id);
  check(response.status, 200, 'Production D1 statement publishes successfully');
  const d1Published = await response.json();
  check(
    [d1Published.id, d1Published.studentId, d1Published.overallGrade],
    [pending.id, 'student-a', 'Supplied grade'],
    'Production D1 returned report columns map correctly',
  );
  check(publicationCount(pending.id), 1, 'Production D1 commits one receipt');
  check(publicationNotices(pending.id).length, 1, 'Production D1 commits current notice');
  check((await publish(pending.id)).status, 200, 'Production D1 publication retry is safe');
  check(publicationNotices(pending.id).length, 1, 'Production D1 retry creates no duplicate notice');
  response = await routes.notices.POST(
    request('admin-a', 'POST', {
      userId: 'guardian-a',
      channel: 'in_app',
      title: 'Synthetic D1',
      body: 'Stored locally only',
    }),
  );
  check(response.status, 201, 'Production D1 guarded generic notification insert succeeds');
  const d1Notice = await response.json();
  check(d1Notice.userId, 'guardian-a', 'Production D1 notification returning maps own recipient');
  check(
    (
      await routes.notices.PATCH(
        request('guardian-a', 'PATCH', undefined, '/api/notifications?id=' + d1Notice.id),
      )
    ).status,
    200,
    'Production D1 live own notice marker succeeds',
  );
  const firstRead = sqlite.prepare('SELECT * FROM notifications WHERE id=?').get(d1Notice.id);
  const OriginalDate = globalThis.Date;
  const later = new OriginalDate(OriginalDate.now() + 60_000).toISOString();
  globalThis.Date = class extends OriginalDate {
    constructor(...args) {
      super(...(args.length ? args : [later]));
    }
  };
  try {
    check(
      (
        await routes.notices.PATCH(
          request('guardian-a', 'PATCH', undefined, '/api/notifications?id=' + d1Notice.id),
        )
      ).status,
      200,
      'Lost-response acknowledgement retry remains successful',
    );
    check(
      sqlite.prepare('SELECT read_at FROM notifications WHERE id=?').get(d1Notice.id).read_at,
      firstRead.read_at,
      'Retry retains exact first acknowledgement time despite later clock',
    );
    check(
      sqlite.prepare('SELECT * FROM notifications WHERE id=?').get(d1Notice.id),
      firstRead,
      'Acknowledgement retry retains all notice fields including updated time',
    );
  } finally {
    globalThis.Date = OriginalDate;
  }
  check(
    sqlite.prepare('PRAGMA foreign_key_check').all(),
    [],
    'All new publication evidence retains valid foreign keys',
  );
  check(
    sqlite.prepare('PRAGMA integrity_check').get().integrity_check,
    'ok',
    'Populated synthetic database retains SQLite integrity',
  );
  check(networkCalls, 0, 'No providers or external notification channels were called');
  console.log(
    `Report publication contract: ${checks} checks passed (real sessions/routes, atomic SQL, current recipients, preserved legacy evidence and production D1 driver; synthetic only).`,
  );
  console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0 }));
} finally {
  globalThis.__sahaTestDb = originalDb;
  globalThis.fetch = originalFetch;
  sqlite.close();
}
