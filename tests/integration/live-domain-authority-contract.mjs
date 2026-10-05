// Independent fixed-behavior regression contracts. Actual routes, sessions and SQLite;
// no diagnostic unsafe outcome is accepted as a passing check.
import assert from 'node:assert/strict';
import { bindings, freshDatabase, seedSecurityData, load, stamp } from '../support/security-db.mjs';

const origin = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = origin;
const sessions = await load('lib/education/session.ts');
const profileLinks = await load('lib/education/profile-links.ts');
const noticesService = await load('lib/education/notifications.ts');
const { reportPublicationReceipts } = await load('db/report-publication-schema.ts');
const routes = {};
for (const [name, path] of Object.entries({
  schools: 'app/api/schools/route.ts', school: 'app/api/schools/[id]/route.ts',
  courses: 'app/api/courses/route.ts', course: 'app/api/courses/[id]/route.ts',
  classes: 'app/api/classes/route.ts', class: 'app/api/classes/[id]/route.ts',
  users: 'app/api/users/route.ts', reports: 'app/api/report-cards/route.ts',
  report: 'app/api/report-cards/[id]/route.ts', notices: 'app/api/notifications/route.ts',
  student: 'app/api/students/[id]/route.ts',
})) routes[name] = await load(path);

let checks = 0, scenarios = 0, networkCalls = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
function responseStatus(response, expected, name) {
  check(response.status, expected, name);
  check(response.headers.get('cache-control'), 'no-store', name + ': uncached response');
}
const parameters = id => ({ params: Promise.resolve({ id }) });
const admin = { id: 'admin-a', role: 'admin', schoolId: 'a' };
const classInput = { schoolId: 'a', courseId: 'course-a', teacherId: 'teacher-a', name: 'Synthetic guarded class', term: 'T1' };
const courseInput = { schoolId: 'a', code: 'guarded-course', title: 'Synthetic guarded course', gradeLevel: '8' };
const reportInput = { studentId: 'student-a', term: 'Guarded report', overallGrade: 'Supplied grade', summary: 'Synthetic reviewed summary.' };
const noticeInput = { userId: 'guardian-a', channel: 'in_app', title: 'Synthetic guarded notice', body: 'Synthetic explicit recipient notice.' };
const actorChanges = [
  ['disable', "UPDATE users SET disabled_at='synthetic-revocation' WHERE id=?"],
  ['demote', "UPDATE users SET role='student' WHERE id=?"],
  ['move school', "UPDATE users SET school_id='b' WHERE id=?"],
  ['remove issuer', 'UPDATE users SET identity_issuer=NULL WHERE id=?'],
  ['blank subject', "UPDATE users SET identity_subject='' WHERE id=?"],
];
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { networkCalls++; throw new Error('Live-domain contracts are local only.'); };

async function scenario(name, action) {
  const fixture = freshDatabase();
  await seedSecurityData(fixture.db, fixture.schema);
  const baseDb = fixture.db, cookies = {};
  for (const id of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'guardian-a', 'guardian-other', 'student-user-a']) cookies[id] = (await sessions.createSession(id)).split(';')[0];
  const request = (actor, method = 'GET', payload, path = '/api/live-domain', selectedOrigin = origin) => new Request(origin + path, {
    method, headers: { ...(cookies[actor] ? { cookie: cookies[actor] } : {}), origin: selectedOrigin, ...(payload !== undefined ? { 'content-type': 'application/json' } : {}) },
    ...(payload !== undefined ? { body: typeof payload === 'string' ? payload : JSON.stringify(payload) } : {}),
  });
  const count = table => fixture.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;
  // Awaited Drizzle statement hooks run after validation and SQL construction,
  // immediately before execution. They also permit a nested real reviewed unlink
  // or publisher to complete without replacing application behavior with mocks.
  function beforeExecution(operation, table, mutation, ordinal = 1) {
    let seen = 0, injected = false;
    const chain = new Set(['select', 'values', 'set', 'where', 'returning', 'onConflictDoNothing', 'onConflictDoUpdate', 'leftJoin', 'innerJoin', 'orderBy', 'limit', 'offset']);
    const fire = async () => {
      if (injected || ++seen !== ordinal) return;
      injected = true; globalThis.__sahaTestDb = baseDb; await mutation();
    };
    function statement(query) {
      return new Proxy(query, { get(target, member) {
        if (member === 'then') return (fulfilled, rejected) => (async () => { await fire(); return await target; })().then(fulfilled, rejected);
        if (['execute', 'run', 'all', 'get'].includes(member) && typeof target[member] === 'function') return async (...args) => { await fire(); return target[member](...args); };
        const value = Reflect.get(target, member, target);
        if (typeof value !== 'function') return value;
        return (...args) => { const result = value.apply(target, args); return chain.has(member) && result && typeof result === 'object' ? statement(result) : result; };
      } });
    }
    globalThis.__sahaTestDb = new Proxy(baseDb, { get(target, property) {
      if (operation === 'read' && (property === 'select' || property === 'selectDistinct')) return (...args) => {
        const builder = target[property](...args);
        return new Proxy(builder, { get(query, member) {
          if (member === 'from') return selected => selected === table ? statement(query.from(selected)) : query.from(selected);
          const value = Reflect.get(query, member, query); return typeof value === 'function' ? value.bind(query) : value;
        } });
      };
      if (property === operation) return (...args) => {
        const builder = target[property](...args); return args[0] === table ? statement(builder) : builder;
      };
      const value = Reflect.get(target, property, target); return typeof value === 'function' ? value.bind(target) : value;
    } });
    return () => { globalThis.__sahaTestDb = baseDb; check(injected, true, name + ': late change reached actual SQL execution'); };
  }
  const publish = actor => routes.report.PATCH(request(actor, 'PATCH', { publish: true }), parameters('draft-a'));
  const unlink = profileType => profileLinks.reviewProfileLink(admin, { profileType,
    profileId: profileType === 'guardian' ? 'guardian-profile-a' : 'student-a', userId: null,
    expectedVersion: 0, clientRequestId: crypto.randomUUID(), reviewConfirmed: true,
    reason: 'Synthetic reviewed concurrent ownership unlink.' });
  try { await action({ ...fixture, cookies, request, count, beforeExecution, publish, unlink }); scenarios++; }
  finally { globalThis.__sahaTestDb = baseDb; fixture.sqlite.close(); }
}

try {
  await scenario('Baseline route boundaries and private projections', async ({ request, sqlite }) => {
    for (const route of [routes.schools, routes.courses, routes.classes, routes.users, routes.reports, routes.notices]) responseStatus(await route.GET(request(null)), 401, 'Anonymous collection rejected');
    for (const [route, id] of [[routes.school, 'b'], [routes.course, 'course-b'], [routes.class, 'class-b'], [routes.report, 'published-b']]) responseStatus(await route.GET(request('admin-a'), parameters(id)), 404, 'Cross-school detail hidden');
    for (const [route, path] of [[routes.courses, '/api/courses?schoolId=b'], [routes.classes, '/api/classes?schoolId=b']]) responseStatus(await route.GET(request('admin-a', 'GET', undefined, path)), 403, 'Cross-school feed selector denied');
    const users = await routes.users.GET(request('admin-a', 'GET', undefined, '/api/users?role=teacher'));
    responseStatus(users, 200, 'Administrator role-filtered picker');
    const accounts = await users.json(); check(accounts.length, 2, 'Picker lists this school enabled teachers');
    for (const account of accounts) check(Object.keys(account).sort(), ['id', 'name', 'role'], 'Picker never exposes provider identity or contact fields');
    responseStatus(await routes.users.GET(request('teacher-a')), 403, 'Teacher cannot enumerate school accounts');
    for (const actor of ['guardian-a', 'student-user-a']) {
      const response = await routes.reports.GET(request(actor)); responseStatus(response, 200, 'Family report feed is accessible');
      check((await response.json()).map(row => row.id), ['published-a'], 'Family sees only its published report');
      responseStatus(await routes.report.GET(request(actor), parameters('draft-a')), 404, 'Family draft report hidden');
    }
    const personal = await routes.notices.GET(request('guardian-a', 'GET', undefined, '/api/notifications?userId=guardian-b'));
    responseStatus(personal, 200, 'Personal notice feed'); check((await personal.json()).map(row => row.id), ['notice-guardian-a'], 'Query cannot remap notice owner');
    responseStatus(await routes.notices.PATCH(request('guardian-a', 'PATCH', undefined, '/api/notifications?id=notice-guardian-b')), 404, 'Other account read marker hidden');
    check(sqlite.prepare("SELECT read_at FROM notifications WHERE id='notice-guardian-b'").get().read_at, null, 'Other account notice unchanged');
    responseStatus(await routes.schools.POST(request('admin-a', 'POST', { name: 'Unauthorized bootstrap' })), 403, 'School administrator cannot bootstrap schools');
  });

  await scenario('Authentication, role and same-origin precede malformed mutation bodies', async ({ request }) => {
    for (const [route, method, actor, params] of [
      [routes.courses, 'POST', 'guardian-a'], [routes.classes, 'POST', 'teacher-a'],
      [routes.school, 'PATCH', 'teacher-a', parameters('a')], [routes.course, 'PATCH', 'teacher-a', parameters('course-a')],
      [routes.class, 'PATCH', 'guardian-a', parameters('class-a')], [routes.reports, 'POST', 'teacher-a'],
      [routes.report, 'PATCH', 'guardian-a', parameters('draft-a')], [routes.notices, 'POST', 'guardian-a'],
    ]) {
      responseStatus(await route[method](request(null, method, '{'), params), 401, 'Mutation authenticates before JSON');
      responseStatus(await route[method](request(actor, method, '{'), params), 403, 'Mutation checks role before JSON');
      responseStatus(await route[method](request('admin-a', method, '{', '/api/live-domain', 'https://foreign.example.invalid'), params), 403, 'Mutation checks origin before JSON');
      responseStatus(await route[method](request('admin-a', method, '{'), params), 400, 'Authorized malformed JSON is rejected');
    }
  });

  await scenario('Legitimate teacher picker excludes enabled unmapped accounts', async ({ sqlite, request }) => {
    sqlite.prepare('INSERT INTO users(id,name,email,role,school_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('teacher-unmapped', 'Synthetic unmapped teacher', 'unmapped@example.invalid', 'teacher', 'a', stamp, stamp);
    const response = await routes.users.GET(request('admin-a', 'GET', undefined, '/api/users?role=teacher')); responseStatus(response, 200, 'Current admin can load mapped teacher choices');
    const choices = await response.json(); check(choices.map(row => row.id).sort(), ['teacher-a', 'teacher-other'], 'Enabled teacher with no issuer/subject is never offered');
    for (const choice of choices) check(Object.keys(choice).sort(), ['id', 'name', 'role'], 'Eligible picker keeps private projection');
    sqlite.prepare("UPDATE users SET identity_subject='' WHERE id='teacher-other'").run();
    const partial = await routes.users.GET(request('admin-a', 'GET', undefined, '/api/users?role=teacher')); responseStatus(partial, 200, 'Teacher picker remains available after target eligibility changes'); check((await partial.json()).map(row => row.id), ['teacher-a'], 'Partially unmapped enabled teacher is also omitted');
  });

  // Independently recheck representative original structure reads/mutations.
  for (const [name, routeName, tableName, actor, id] of [
    ['school', 'schools', 'schools', 'admin-a', 'a'], ['course', 'courses', 'courses', 'admin-a', 'course-a'],
    ['class', 'classes', 'classes', 'teacher-a', 'class-a'], ['users', 'users', 'users', 'admin-a', null],
    ['report', 'reports', 'reportCards', 'admin-a', 'draft-a'], ['notices', 'notices', 'notifications', 'guardian-a', null],
  ]) for (const [change, sql] of actorChanges) {
    await scenario(name + ' collection after ' + change, async ({ schema, sqlite, request, beforeExecution }) => {
      const finish = beforeExecution('read', schema[tableName], () => sqlite.prepare(sql).run(actor));
      const response = await routes[routeName].GET(request(actor)); finish();
      responseStatus(response, 200, 'Late invalid actor collection is safely empty'); check(await response.json(), [], 'No stale actor record feed released');
    });
    if (id) await scenario(name + ' detail after ' + change, async ({ schema, sqlite, request, beforeExecution }) => {
      const finish = beforeExecution('read', schema[tableName], () => sqlite.prepare(sql).run(actor));
      const response = await routes[name].GET(request(actor), parameters(id)); finish();
      responseStatus(response, 404, 'Late invalid actor detail is hidden'); check(await response.json(), { error: 'Not found' }, 'Detail denial contains no prior snapshot');
    });
  }

  for (const [change, sql] of actorChanges) for (const target of ['school-update', 'course-create', 'class-create', 'report-create', 'notice-create', 'notice-read']) {
    await scenario(target + ' after actor ' + change, async ({ schema, sqlite, request, beforeExecution, count }) => {
      const actor = target === 'notice-read' ? 'guardian-a' : 'admin-a';
      const mutation = () => sqlite.prepare(sql).run(actor);
      const definitions = {
        'school-update': ['update', schema.schools, 'schools', routes.school, 'PATCH', { name: 'Forbidden late school change' }, parameters('a'), '/api/schools/a', 409],
        'course-create': ['insert', schema.courses, 'courses', routes.courses, 'POST', courseInput, undefined, '/api/courses', 409],
        'class-create': ['insert', schema.classes, 'classes', routes.classes, 'POST', classInput, undefined, '/api/classes', 409],
        'report-create': ['insert', schema.reportCards, 'report_cards', routes.reports, 'POST', reportInput, undefined, '/api/report-cards', 409],
        'notice-create': ['insert', schema.notifications, 'notifications', routes.notices, 'POST', noticeInput, undefined, '/api/notifications', 409],
        'notice-read': ['update', schema.notifications, 'notifications', routes.notices, 'PATCH', undefined, undefined, '/api/notifications?id=notice-guardian-a', 404],
      };
      const [operation, table, sqlTable, route, method, payload, params, path, status] = definitions[target];
      const originalCount = count(sqlTable), originalSchool = sqlite.prepare("SELECT name,updated_at FROM schools WHERE id='a'").get();
      const finish = beforeExecution(operation, table, mutation);
      const response = await route[method](request(actor, method, payload, path), params); finish();
      responseStatus(response, status, 'Late actor mutation rejected'); check(count(sqlTable), originalCount, 'No stale actor row inserted or deleted');
      if (target === 'school-update') check(sqlite.prepare("SELECT name,updated_at FROM schools WHERE id='a'").get(), originalSchool, 'School edit and timestamp preserved');
      if (target === 'notice-read') check(sqlite.prepare("SELECT read_at FROM notifications WHERE id='notice-guardian-a'").get().read_at, null, 'Revoked account cannot mark notice read');
    });
  }

  for (const [name, sql] of [
    ['course school transfer', "UPDATE courses SET school_id='b' WHERE id='course-a'"],
    ['teacher disable', "UPDATE users SET disabled_at='synthetic-revocation' WHERE id='teacher-a'"],
    ['teacher role change', "UPDATE users SET role='guardian' WHERE id='teacher-a'"],
    ['teacher school transfer', "UPDATE users SET school_id='b' WHERE id='teacher-a'"],
    ['teacher issuer removal', "UPDATE users SET identity_issuer=NULL WHERE id='teacher-a'"],
  ]) for (const operation of ['insert', 'update']) await scenario('Class reference ' + name + ' before ' + operation, async ({ schema, sqlite, request, beforeExecution, count }) => {
    const original = sqlite.prepare("SELECT * FROM classes WHERE id='class-a'").get(), originalCount = count('classes');
    const finish = beforeExecution(operation, schema.classes, () => sqlite.exec(sql));
    const response = operation === 'insert' ? await routes.classes.POST(request('admin-a', 'POST', classInput)) : await routes.class.PATCH(request('admin-a', 'PATCH', classInput), parameters('class-a')); finish();
    responseStatus(response, 409, 'Changed class reference rejected at SQL time'); check(count('classes'), originalCount, 'No inconsistent class row appended'); check(sqlite.prepare("SELECT * FROM classes WHERE id='class-a'").get(), original, 'Existing class evidence preserved');
  });

  await scenario('Joined class roster excludes late transferred pupils', async ({ schema, sqlite, request, beforeExecution }) => {
    const finish = beforeExecution('read', schema.classes, () => sqlite.prepare("UPDATE students SET school_id='b' WHERE id='student-a'").run());
    const response = await routes.class.GET(request('admin-a'), parameters('class-a')); finish();
    responseStatus(response, 200, 'Current authorized class remains readable'); const record = await response.json(); check(record.id, 'class-a', 'Joined class identity retained'); check(record.enrolledStudents, [], 'Foreign-school pupil snapshot never enters assembled roster');
  });
  for (const actor of ['guardian-a', 'student-user-a']) await scenario('Reviewed unlink removes late class and report access for ' + actor, async ({ schema, request, beforeExecution, unlink, cookies }) => {
    const finish = beforeExecution('read', schema.classes, () => unlink(actor === 'guardian-a' ? 'guardian' : 'student'));
    const response = await routes.class.GET(request(actor), parameters('class-a')); finish(); responseStatus(response, 404, 'Cached family class access ends at reviewed unlink');
    cookies[actor] = (await sessions.createSession(actor)).split(';')[0];
    responseStatus(await routes.report.GET(request(actor), parameters('published-a')), 404, 'Fresh unlinked account cannot read learner report');
  });

  for (const [name, sql] of [
    ['student school transfer', "UPDATE students SET school_id='b' WHERE id='student-a'"],
    ['teacher reassignment', "UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'"],
    ['class school transfer', "UPDATE classes SET school_id='b' WHERE id='class-a'"],
    ['withdrawn enrollment', "UPDATE enrolments SET status='withdrawn' WHERE id='student-a-enrolment'"],
    ['guardian profile school transfer', "UPDATE guardians SET school_id='b' WHERE id='guardian-profile-a'"],
    ['guardian link removal', "DELETE FROM student_guardians WHERE student_id='student-a' AND guardian_id='guardian-profile-a'"],
    ['recipient role change', "UPDATE users SET role='teacher' WHERE id='guardian-a'"],
    ['recipient school transfer', "UPDATE users SET school_id='b' WHERE id='guardian-a'"],
    ['recipient disable', "UPDATE users SET disabled_at='synthetic-revocation' WHERE id='guardian-a'"],
    ['recipient issuer removal', "UPDATE users SET identity_issuer=NULL WHERE id='guardian-a'"],
    ['recipient subject blank', "UPDATE users SET identity_subject='' WHERE id='guardian-a'"],
  ]) await scenario('Teacher notice after ' + name, async ({ schema, sqlite, request, beforeExecution, count }) => {
    const initial = count('notifications'); const finish = beforeExecution('insert', schema.notifications, () => sqlite.exec(sql));
    const response = await routes.notices.POST(request('teacher-a', 'POST', noticeInput)); finish();
    responseStatus(response, 409, 'Former teacher/recipient relationship cannot authorize a new notice'); check(count('notifications'), initial, 'No former-class or mismapped recipient notice inserted');
  });
  await scenario('Reviewed profile unlink prevents a late teacher notice', async ({ schema, request, beforeExecution, unlink, count }) => {
    const initial = count('notifications'), finish = beforeExecution('insert', schema.notifications, () => unlink('guardian'));
    const response = await routes.notices.POST(request('teacher-a', 'POST', noticeInput)); finish(); responseStatus(response, 409, 'Reviewed unlink invalidates teacher recipient at actual INSERT'); check(count('notifications'), initial, 'No new notice follows removed login mapping');
  });
  for (const [name, sql] of actorChanges) await scenario('Teacher notice after actor ' + name, async ({ schema, sqlite, request, beforeExecution, count }) => {
    const initial = count('notifications'), finish = beforeExecution('insert', schema.notifications, () => sqlite.prepare(sql).run('teacher-a'));
    const response = await routes.notices.POST(request('teacher-a', 'POST', noticeInput)); finish(); responseStatus(response, 409, 'Teacher account must still match resolved authority at INSERT'); check(count('notifications'), initial, 'Revoked teacher leaves no notice');
  });
  for (const [name, sql] of [['issuer', "UPDATE users SET identity_issuer=NULL WHERE id='guardian-a'"], ['subject', "UPDATE users SET identity_subject='' WHERE id='guardian-a'"]]) await scenario('Administrator notice recipient mapping ' + name, async ({ schema, sqlite, request, beforeExecution, count }) => {
    const initial = count('notifications'), finish = beforeExecution('insert', schema.notifications, () => sqlite.exec(sql));
    const late = await routes.notices.POST(request('admin-a', 'POST', noticeInput)); finish(); responseStatus(late, 409, 'Target mapping rechecked on administrator notice INSERT');
    responseStatus(await routes.notices.POST(request('admin-a', 'POST', noticeInput)), 404, 'Initially unmapped recipient is unavailable'); check(count('notifications'), initial, 'Unmapped recipient leaves no notice');
  });
  await scenario('Report draft cannot follow a student across schools', async ({ schema, sqlite, request, beforeExecution, count }) => {
    const initial = count('report_cards'), finish = beforeExecution('insert', schema.reportCards, () => sqlite.prepare("UPDATE students SET school_id='b' WHERE id='student-a'").run());
    const response = await routes.reports.POST(request('admin-a', 'POST', reportInput)); finish(); responseStatus(response, 409, 'Report student rechecked at actual INSERT'); check(count('report_cards'), initial, 'Cross-school draft not inserted');
  });

  for (const [name, sql] of [...actorChanges.map(([name, sql]) => ['actor ' + name, sql.replace('?', "'admin-a'")]),
    ['student school transfer', "UPDATE students SET school_id='b' WHERE id='student-a'"],
    ['report student changed', "UPDATE report_cards SET student_id='student-b' WHERE id='draft-a'"],
  ]) await scenario('Publication rejected after ' + name, async ({ sqlite, beforeExecution, publish, count }) => {
    const noticeCount = count('notifications'); const finish = beforeExecution('insert', reportPublicationReceipts, () => sqlite.exec(sql));
    const response = await publish('admin-a'); finish(); responseStatus(response, 409, 'Late publication guard yields safe conflict');
    check(sqlite.prepare("SELECT published_at FROM report_cards WHERE id='draft-a'").get().published_at, null, 'No report publication without current authority'); check(count('report_publication_receipts'), 0, 'Rejected publication leaves no receipt'); check(count('notifications'), noticeCount, 'Zero-row publication never sends a false notice');
  });

  for (const [name, mutation] of [
    ['reviewed guardian unlink', async context => context.unlink('guardian')],
    ['guardian relationship removal', async ({ sqlite }) => sqlite.prepare("DELETE FROM student_guardians WHERE student_id='student-a' AND guardian_id='guardian-profile-a'").run()],
    ['guardian profile school transfer', async ({ sqlite }) => sqlite.prepare("UPDATE guardians SET school_id='b' WHERE id='guardian-profile-a'").run()],
    ['guardian login disable', async ({ sqlite }) => sqlite.prepare("UPDATE users SET disabled_at='synthetic-revocation' WHERE id='guardian-a'").run()],
    ['guardian login role change', async ({ sqlite }) => sqlite.prepare("UPDATE users SET role='teacher' WHERE id='guardian-a'").run()],
    ['guardian login school transfer', async ({ sqlite }) => sqlite.prepare("UPDATE users SET school_id='b' WHERE id='guardian-a'").run()],
    ['guardian issuer removal', async ({ sqlite }) => sqlite.prepare("UPDATE users SET identity_issuer=NULL WHERE id='guardian-a'").run()],
    ['guardian subject blank', async ({ sqlite }) => sqlite.prepare("UPDATE users SET identity_subject='' WHERE id='guardian-a'").run()],
  ]) await scenario('Publication chooses current recipients after ' + name, async context => {
    const initial = context.count('notifications'), finish = context.beforeExecution('insert', reportPublicationReceipts, () => mutation(context));
    const response = await context.publish('admin-a'); finish(); responseStatus(response, 200, 'Authorized report publishes with current recipient selection'); check((await response.json()).publishedAt !== null, true, 'Current report is actually published'); check(context.count('report_publication_receipts'), 1, 'One durable publication receipt'); check(context.count('notifications'), initial, 'Former or invalid guardian receives no new publication notice');
    if (name === 'reviewed guardian unlink') {
      context.cookies['guardian-a'] = (await sessions.createSession('guardian-a')).split(';')[0];
      responseStatus(await routes.student.GET(context.request('guardian-a'), parameters('student-a')), 404, 'Former guardian has no fresh learner access');
      const response = await routes.notices.GET(context.request('guardian-a')); responseStatus(response, 200, 'Historical personal notice access retained'); check((await response.json()).map(row => row.id), ['notice-guardian-a'], 'Historical notice preserved and no new learner-name notice leaked');
      responseStatus(await routes.notices.PATCH(context.request('guardian-a', 'PATCH', undefined, '/api/notifications?id=notice-guardian-a')), 200, 'Historical own notice can still be marked read');
    }
  });

  await scenario('Concurrent publication and retries preserve one commit and deterministic notices', async ({ publish, sqlite, request, count }) => {
    const results = await Promise.all([publish('admin-a'), publish('admin-a')]);
    for (const response of results) responseStatus(response, 200, 'Concurrent publisher reads the committed winner');
    const first = await results[0].json(), second = await results[1].json(); check(second.publishedAt, first.publishedAt, 'Concurrent callers observe identical publication evidence');
    check(count('report_publication_receipts'), 1, 'Concurrent publishers create one receipt'); check(count('notifications'), 4, 'Concurrent publishers append one eligible guardian notice');
    const notice = sqlite.prepare("SELECT * FROM notifications WHERE id='report-card-published:draft-a:guardian-a'").get(); check(notice?.user_id, 'guardian-a', 'Durable deterministic recipient identity'); check(notice?.body.includes('student-a Synthetic'), true, 'Legitimate notice uses current pupil name');
    const receipt = sqlite.prepare('SELECT * FROM report_publication_receipts').get();
    const retry = await publish('admin-a'); responseStatus(retry, 200, 'Committed publication retry succeeds'); check((await retry.json()).publishedAt, first.publishedAt, 'Retry preserves published timestamp'); check(sqlite.prepare('SELECT * FROM report_publication_receipts').get(), receipt, 'Retry preserves original receipt'); check(sqlite.prepare("SELECT * FROM notifications WHERE id='report-card-published:draft-a:guardian-a'").get(), notice, 'Retry preserves original notice');
    for (const actor of ['guardian-a', 'student-user-a']) responseStatus(await routes.report.GET(request(actor), parameters('draft-a')), 200, 'Published report becomes available to its linked family');
  });

  await scenario('Same-clock losing publisher never sends to a later eligible guardian', async ({ beforeExecution, publish, sqlite, count }) => {
    const RealDate = globalThis.Date, instant = RealDate.now();
    globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [instant])); } static now() { return instant; } };
    try {
      const finish = beforeExecution('insert', reportPublicationReceipts, async () => {
        const winner = await publish('admin-a'); responseStatus(winner, 200, 'Inner real publisher wins');
        sqlite.prepare("INSERT INTO student_guardians(student_id,guardian_id,is_primary) VALUES('student-a','guardian-profile-other',0)").run();
      });
      const loser = await publish('admin-a'); finish(); responseStatus(loser, 200, 'Same-time loser only reads publication winner');
      check(count('report_publication_receipts'), 1, 'Same-clock race has one immutable receipt'); check(count('notifications'), 4, 'Losing attempt appends zero notices');
      check(sqlite.prepare("SELECT count(*) n FROM notifications WHERE id='report-card-published:draft-a:guardian-other'").get().n, 0, 'Newly eligible guardian receives no notice from a losing attempt');
    } finally { globalThis.Date = RealDate; }
  });

  await scenario('Notice failure rolls publication and receipt back together', async ({ sqlite, publish, count }) => {
    sqlite.exec("CREATE TRIGGER synthetic_notice_failure BEFORE INSERT ON notifications WHEN NEW.title='Report Card Published' BEGIN SELECT RAISE(ABORT,'synthetic notice persistence failure'); END;");
    const initial = count('notifications'), response = await publish('admin-a'); responseStatus(response, 500, 'Unexpected persistence failure returns safe server error'); check(await response.json(), { error: 'Internal server error' }, 'Rollback error reveals no notice, learner or database details');
    check(sqlite.prepare("SELECT published_at FROM report_cards WHERE id='draft-a'").get().published_at, null, 'Publication timestamp rolls back'); check(count('report_publication_receipts'), 0, 'Publication receipt rolls back'); check(count('notifications'), initial, 'All existing notifications retained without partial new insert');
    sqlite.exec('DROP TRIGGER synthetic_notice_failure'); responseStatus(await publish('admin-a'), 200, 'Legitimate retry can publish after transient storage failure'); check(count('report_publication_receipts'), 1, 'Recovery records exactly one receipt'); check(count('notifications'), initial + 1, 'Recovery records exactly one notice');
  });

  await scenario('Historical publications have no invented evidence or notices', async ({ request, count }) => {
    const initial = count('notifications'); const response = await routes.report.PATCH(request('admin-a', 'PATCH', { publish: true }), parameters('published-a'));
    responseStatus(response, 200, 'Legacy published report retry remains readable'); check((await response.json()).publishedAt, stamp, 'Historical publication timestamp retained'); check(count('report_publication_receipts'), 0, 'Historical receipt is not fabricated'); check(count('notifications'), initial, 'Historical retry does not invent publication notices');
  });

  for (const [name, sql] of actorChanges) await scenario('Publication response after committed actor ' + name, async ({ schema, sqlite, beforeExecution, publish, count }) => {
    const finish = beforeExecution('read', schema.reportCards, () => sqlite.prepare(sql).run('admin-a'), 2);
    const response = await publish('admin-a'); finish(); responseStatus(response, 404, 'Final publication response does not expose a stale staff report');
    check(await response.json(), { error: 'Not found' }, 'Post-commit denial releases no snapshot or receipt');
    check(sqlite.prepare("SELECT published_at FROM report_cards WHERE id='draft-a'").get().published_at !== null, true, 'Previously authorized committed publication is preserved'); check(count('report_publication_receipts'), 1, 'Post-commit revocation does not delete original publication evidence'); check(count('notifications'), 4, 'Previously authorized committed notice is preserved');
  });

  await scenario('Repeated personal read markers preserve original evidence', async ({ sqlite, request }) => {
    responseStatus(await routes.notices.PATCH(request('guardian-a', 'PATCH', undefined, '/api/notifications?id=notice-guardian-a')), 200, 'First personal read marker succeeds');
    const first = sqlite.prepare("SELECT read_at,updated_at FROM notifications WHERE id='notice-guardian-a'").get(); check(typeof first.read_at, 'string', 'First read timestamp exists');
    responseStatus(await routes.notices.PATCH(request('guardian-a', 'PATCH', undefined, '/api/notifications?id=notice-guardian-a')), 200, 'Repeated same-record read marker is safely idempotent'); check(sqlite.prepare("SELECT read_at,updated_at FROM notifications WHERE id='notice-guardian-a'").get(), first, 'Read retry changes neither original read evidence nor timestamp');
  });

  await scenario('Late personal notice detail is unavailable and no historical records are deleted', async ({ schema, sqlite, beforeExecution, count }) => {
    const initial = count('notifications'), finish = beforeExecution('read', schema.notifications, () => sqlite.prepare("UPDATE users SET disabled_at='synthetic-revocation' WHERE id='guardian-a'").run());
    check(await noticesService.getNotification({ id: 'guardian-a', role: 'guardian', schoolId: 'a' }, 'notice-guardian-a'), null, 'Service detail has no stale personal notice'); finish(); check(count('notifications'), initial, 'Revocation leaves confirmed historical notices intact');
  });
  check(networkCalls, 0, 'All independent contracts stay local');
  console.log(JSON.stringify({ suite: 'live-domain-authority', scenarios, checks, passed: checks, failed: 0, externalRequests: networkCalls }));
} finally { globalThis.fetch = originalFetch; }
