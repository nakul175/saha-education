// Synthetic exported-route/session checks over actual migrated SQLite. Changes
// occur after authentication/preflight and before the affected SQL statement.
import assert from 'node:assert/strict';
import { bindings, freshDatabase, seedSecurityData, load } from '../support/security-db.mjs';

const { db, schema, sqlite } = freshDatabase();
await seedSecurityData(db, schema);
const sessions = await load('lib/education/session.ts');
const services = {
  classes: await load('lib/education/classes.ts'), courses: await load('lib/education/courses.ts'),
  schools: await load('lib/education/schools.ts'),
};
const routes = {};
for (const domain of ['classes', 'courses', 'schools']) {
  routes[domain] = await load(`app/api/${domain}/route.ts`);
  routes[`${domain}Detail`] = await load(`app/api/${domain}/[id]/route.ts`);
}
routes.users = await load('app/api/users/route.ts');
const origin = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = origin;
const cookies = {};
for (const id of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'guardian-a', 'student-user-a']) {
  cookies[id] = (await sessions.createSession(id)).split(';')[0];
}
const admin = { id: 'admin-a', role: 'admin', schoolId: 'a' };
const teacher = { id: 'teacher-a', role: 'teacher', schoolId: 'a' };
const baseDb = globalThis.__sahaTestDb;
const originalFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error('School structure checks are local only'); };
let checks = 0;
function check(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }
const count = table => sqlite.prepare(`SELECT count(*) n FROM ${table}`).get().n;
const params = id => ({ params: Promise.resolve({ id }) });
function request(user, method = 'GET', payload, path = '/api/structure', selectedOrigin = origin) {
  const headers = { origin: selectedOrigin, ...(cookies[user] ? { cookie: cookies[user] } : {}) };
  const init = { method, headers };
  if (payload !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  }
  return new Request(origin + path, init);
}
const classInput = name => ({ schoolId: 'a', courseId: 'course-a', teacherId: 'teacher-a', name, term: 'Synthetic T1' });
const courseInput = code => ({ schoolId: 'a', code, title: 'Synthetic course', gradeLevel: '8' });
function beforeOperation(operation, table, mutate) {
  let injected = false;
  globalThis.__sahaTestDb = new Proxy(baseDb, { get(target, property) {
    if (property === operation) return (...args) => {
      if (!injected && args[0] === table) { injected = true; globalThis.__sahaTestDb = baseDb; mutate(); }
      return target[property](...args);
    };
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  return () => { globalThis.__sahaTestDb = baseDb; check(injected, true, 'Change occurred immediately before the actual write'); };
}
function beforeRead(table, mutate) {
  let injected = false;
  globalThis.__sahaTestDb = new Proxy(baseDb, { get(target, property) {
    if (property === 'select') return (...args) => {
      const builder = target.select(...args);
      return new Proxy(builder, { get(query, member) {
        if (member === 'from') return selected => {
          if (!injected && selected === table) { injected = true; globalThis.__sahaTestDb = baseDb; mutate(); }
          return query.from(selected);
        };
        const value = Reflect.get(query, member, query);
        return typeof value === 'function' ? value.bind(query) : value;
      } });
    };
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  return () => { globalThis.__sahaTestDb = baseDb; check(injected, true, 'Change occurred after session resolution and before the actual SELECT'); };
}
const actorChanges = [
  ['disabled', "UPDATE users SET disabled_at='synthetic' WHERE id='admin-a'", "UPDATE users SET disabled_at=NULL WHERE id='admin-a'"],
  ['demoted', "UPDATE users SET role='teacher' WHERE id='admin-a'", "UPDATE users SET role='admin' WHERE id='admin-a'"],
  ['moved', "UPDATE users SET school_id='b' WHERE id='admin-a'", "UPDATE users SET school_id='a' WHERE id='admin-a'"],
  ['issuer removed', "UPDATE users SET identity_issuer=NULL WHERE id='admin-a'", "UPDATE users SET identity_issuer='https://identity.example.invalid' WHERE id='admin-a'"],
  ['subject empty', "UPDATE users SET identity_subject='' WHERE id='admin-a'", "UPDATE users SET identity_subject='sub-admin-a' WHERE id='admin-a'"],
];
try {
  check((await routes.classes.GET(request('teacher-a'))).status, 200, 'Active assigned teacher reads classes');
  check((await routes.courses.GET(request('admin-a'))).status, 200, 'Active administrator reads own courses');
  // This fails before the repair: the original handler returns 201 and persists
  // a class after the administrator was disabled between preflight and INSERT.
  let finish = beforeOperation('insert', schema.classes, () => sqlite.exec(actorChanges[0][1]));
  const initialClasses = count('classes');
  try {
    check((await routes.classes.POST(request('admin-a', 'POST', classInput('Denied late disabled actor')))).status, 409,
      'Class INSERT must deny a newly disabled administrator');
    finish();
  } finally { globalThis.__sahaTestDb = baseDb; sqlite.exec(actorChanges[0][2]); }
  check(count('classes'), initialClasses, 'Denied class creation persists no row');

  for (const domain of ['classes', 'courses', 'schools']) {
    let response = await routes[domain].POST(request(null, 'POST', '{'));
    check(response.status, 401, `${domain} authenticates before JSON`);
    check(response.headers.get('cache-control'), 'no-store', `${domain} denial is uncached`);
    response = await routes[domain].POST(request('teacher-a', 'POST', '{'));
    check(response.status, 403, `${domain} denies role before JSON`);
    response = await routes[domain].POST(request('admin-a', 'POST', '{', '/api/structure', 'https://foreign.example.invalid'));
    check(response.status, 403, `${domain} checks origin before JSON`);
    response = await routes[domain].POST(request('admin-a', 'POST', '{'));
    check(response.status, 400, `${domain} validates authorized malformed JSON`);
    check((await routes[`${domain}Detail`].PATCH(request('guardian-a', 'PATCH', '{'), params(domain === 'schools' ? 'a' : `${domain.slice(0, -2)}-a`))).status,
      403, `${domain} updates deny role before JSON`);
    check((await routes[domain].POST(request('admin-a', 'POST', { name: 'x'.repeat(128 * 1024) }))).status, 400, `${domain} caps body at 128 KiB`);
  }
  check((await routes.schools.POST(request('admin-a', 'POST', { name: 'Denied bootstrap' }))).status, 403, 'School bootstrap remains unavailable');
  check(count('schools'), 2, 'Bootstrap denial leaves schools unchanged');
  check((await routes.users.GET(request('teacher-a'))).status, 403, 'Account inventory remains administrator-only');
  check((await routes.users.GET(request('admin-a', 'GET', undefined, '/api/users?role=unknown'))).status, 400, 'Users filter validates role');
  const accounts = await (await routes.users.GET(request('admin-a', 'GET', undefined, '/api/users?role=teacher'))).json();
  check(accounts.map(row => row.id).sort(), ['teacher-a', 'teacher-other'], 'Account inventory scopes selected role and school');
  check(accounts.every(row => JSON.stringify(Object.keys(row).sort()) === JSON.stringify(['id', 'name', 'role'])), true, 'Inventory excludes email/issuer/subject/private account fields');

  check((await routes.classes.POST(request('admin-a', 'POST', { ...classInput('Foreign course'), courseId: 'course-b' }))).status, 400, 'Class cannot select a foreign-school course');
  check((await routes.classes.POST(request('admin-a', 'POST', { ...classInput('Foreign teacher'), teacherId: 'teacher-b' }))).status, 400, 'Class cannot select a foreign-school teacher');
  check((await routes.classes.POST(request('admin-a', 'POST', { ...classInput('Wrong role'), teacherId: 'student-user-a' }))).status, 400, 'Class requires teacher role');
  check((await routes.classes.POST(request('admin-a', 'POST', { ...classInput('Foreign school'), schoolId: 'b' }))).status, 403, 'Class school cannot be spoofed');
  check((await routes.courses.POST(request('admin-a', 'POST', { ...courseInput('foreign-course'), schoolId: 'b' }))).status, 403, 'Course school cannot be spoofed');
  for (const [name, change, restore] of [
    ['unmapped teacher', "UPDATE users SET identity_issuer=NULL WHERE id='teacher-a'", "UPDATE users SET identity_issuer='https://identity.example.invalid' WHERE id='teacher-a'"],
    ['empty subject teacher', "UPDATE users SET identity_subject='' WHERE id='teacher-a'", "UPDATE users SET identity_subject='sub-teacher-a' WHERE id='teacher-a'"],
  ]) {
    const before = count('classes'); sqlite.exec(change);
    try { check((await routes.classes.POST(request('admin-a', 'POST', classInput(name)))).status, 400, `Preflight rejects ${name}`); }
    finally { sqlite.exec(restore); }
    check(count('classes'), before, 'Ineligible teacher persists no class');
  }
  for (const [name, change, restore] of actorChanges) {
    for (const [domain, payload] of [['classes', classInput(`Denied ${name}`)], ['courses', courseInput(`denied-${name}`)]]) {
      const before = count(domain);
      finish = beforeOperation('insert', schema[domain], () => sqlite.exec(change));
      try { check((await routes[domain].POST(request('admin-a', 'POST', payload))).status, 409, `${domain} INSERT denies late actor ${name}`); finish(); }
      finally { globalThis.__sahaTestDb = baseDb; sqlite.exec(restore); }
      check(count(domain), before, `${domain} actor race persists no row`);
    }
    for (const [domain, id, payload] of [
      ['classes', 'class-a', classInput(`Denied update ${name}`)],
      ['courses', 'course-a', { ...courseInput('course-a'), title: `Denied update ${name}` }],
      ['schools', 'a', { name: `Denied update ${name}` }],
    ]) {
      const before = sqlite.prepare(`SELECT * FROM ${domain} WHERE id=?`).get(id);
      finish = beforeOperation('update', schema[domain], () => sqlite.exec(change));
      try { check((await routes[`${domain}Detail`].PATCH(request('admin-a', 'PATCH', payload), params(id))).status, 409, `${domain} UPDATE denies late actor ${name}`); finish(); }
      finally { globalThis.__sahaTestDb = baseDb; sqlite.exec(restore); }
      check(sqlite.prepare(`SELECT * FROM ${domain} WHERE id=?`).get(id), before, `${domain} actor race preserves all original fields`);
    }
  }

  const relationChanges = [
    ['course moved', "UPDATE courses SET school_id='b' WHERE id='course-a'", "UPDATE courses SET school_id='a' WHERE id='course-a'"],
    ['teacher disabled', "UPDATE users SET disabled_at='synthetic' WHERE id='teacher-a'", "UPDATE users SET disabled_at=NULL WHERE id='teacher-a'"],
    ['teacher demoted', "UPDATE users SET role='student' WHERE id='teacher-a'", "UPDATE users SET role='teacher' WHERE id='teacher-a'"],
    ['teacher moved', "UPDATE users SET school_id='b' WHERE id='teacher-a'", "UPDATE users SET school_id='a' WHERE id='teacher-a'"],
    ['teacher issuer removed', "UPDATE users SET identity_issuer=NULL WHERE id='teacher-a'", "UPDATE users SET identity_issuer='https://identity.example.invalid' WHERE id='teacher-a'"],
    ['teacher subject empty', "UPDATE users SET identity_subject='' WHERE id='teacher-a'", "UPDATE users SET identity_subject='sub-teacher-a' WHERE id='teacher-a'"],
  ];
  for (const [name, change, restore] of relationChanges) {
    for (const operation of ['insert', 'update']) {
      const before = sqlite.prepare('SELECT * FROM classes ORDER BY id').all();
      finish = beforeOperation(operation, schema.classes, () => sqlite.exec(change));
      try {
        const response = operation === 'insert'
          ? await routes.classes.POST(request('admin-a', 'POST', classInput(`Denied relation ${name}`)))
          : await routes.classesDetail.PATCH(request('admin-a', 'PATCH', classInput(`Denied relation ${name}`)), params('class-a'));
        check(response.status, 409, `Class ${operation} rechecks ${name}`); finish();
      } finally { globalThis.__sahaTestDb = baseDb; sqlite.exec(restore); }
      check(sqlite.prepare('SELECT * FROM classes ORDER BY id').all(), before, 'Failed class relation guard preserves every original class');
    }
  }

  for (const [name, change, restore] of actorChanges) {
    for (const domain of ['schools', 'courses', 'classes', 'users']) {
      finish = beforeRead(schema[domain], () => sqlite.exec(change));
      try {
        const response = await routes[domain].GET(request('admin-a'));
        check(response.status, 200, `${domain} late-read denial is a safe empty feed`);
        check(await response.json(), [], `${domain} actual SELECT denies actor ${name}`); finish();
      } finally { globalThis.__sahaTestDb = baseDb; sqlite.exec(restore); }
    }
    for (const [domain, id] of [['schools', 'a'], ['courses', 'course-a'], ['classes', 'class-a']]) {
      finish = beforeRead(schema[domain], () => sqlite.exec(change));
      try { check((await routes[`${domain}Detail`].GET(request('admin-a'), params(id))).status, 404, `${domain} detail denies late actor ${name}`); finish(); }
      finally { globalThis.__sahaTestDb = baseDb; sqlite.exec(restore); }
    }
  }
  sqlite.exec("UPDATE users SET disabled_at='synthetic' WHERE id='admin-a'");
  try {
    for (const domain of ['schools', 'courses', 'classes']) {
      check(await services[domain][`list${domain[0].toUpperCase()}${domain.slice(1)}`](admin), [], `${domain} direct stale Principal reads are empty`);
      check((await routes[domain].GET(request('admin-a'))).status, 401, `${domain} previously disabled session is unauthenticated`);
    }
  } finally { sqlite.exec("UPDATE users SET disabled_at=NULL WHERE id='admin-a'"); }

  let response = await routes.classesDetail.GET(request('teacher-a'), params('class-a'));
  check(response.status, 200, 'Assigned teacher reads class detail');
  const detail = await response.json();
  check(detail.enrolledStudents.map(row => row.id), ['student-a'], 'Class detail preserves current scoped roster shape');
  check(detail.schoolId, 'a', 'Class detail preserves class fields');
  for (const user of ['teacher-other', 'admin-b']) check((await routes.classesDetail.GET(request(user), params('class-a'))).status, 404, 'Unassigned/foreign staff cannot read class detail');
  for (const [name, change, restore] of [
    ['teacher reassigned', "UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'", "UPDATE classes SET teacher_id='teacher-a' WHERE id='class-a'"],
    ['teacher disabled', "UPDATE users SET disabled_at='synthetic' WHERE id='teacher-a'", "UPDATE users SET disabled_at=NULL WHERE id='teacher-a'"],
  ]) {
    finish = beforeRead(schema.classes, () => sqlite.exec(change));
    try { check((await routes.classesDetail.GET(request('teacher-a'), params('class-a'))).status, 404, `Joined detail denies late ${name}`); finish(); }
    finally { globalThis.__sahaTestDb = baseDb; sqlite.exec(restore); }
  }
  finish = beforeRead(schema.classes, () => sqlite.exec("UPDATE students SET school_id='b' WHERE id='student-a'"));
  try {
    response = await routes.classesDetail.GET(request('teacher-a'), params('class-a'));
    check(response.status, 200, 'Authorized class remains visible after learner transfer');
    check((await response.json()).enrolledStudents, [], 'Final joined roster omits newly foreign-school pupil'); finish();
  } finally { globalThis.__sahaTestDb = baseDb; sqlite.exec("UPDATE students SET school_id='a' WHERE id='student-a'"); }
  finish = beforeRead(schema.classes, () => sqlite.exec("DELETE FROM student_guardians WHERE student_id='student-a' AND guardian_id='guardian-profile-a'"));
  try { check((await routes.classesDetail.GET(request('guardian-a'), params('class-a'))).status, 404, 'Final joined detail denies removed guardian relationship'); finish(); }
  finally { globalThis.__sahaTestDb = baseDb; sqlite.exec("INSERT INTO student_guardians(student_id,guardian_id,is_primary) VALUES ('student-a','guardian-profile-a',1)"); }
  check(await services.classes.getClass(teacher, 'class-b'), null, 'Direct class lookup remains cross-school scoped');

  // Production Drizzle D1 prepared driver over the same SQLite exercises the
  // conditional INSERT SELECT/RETURNING mapping, not a mocked service return.
  const { drizzle: d1Drizzle } = await import('drizzle-orm/d1');
  function prepared(query, parameters = []) {
    return {
      bind(...values) { return prepared(query, values); },
      async run() {
        const statement = sqlite.prepare(query);
        if (statement.columns().length) return { success: true, results: statement.all(...parameters), meta: {} };
        const result = statement.run(...parameters);
        return { success: true, results: [], meta: { changes: Number(result.changes) } };
      },
      async all() { return { success: true, results: sqlite.prepare(query).all(...parameters), meta: {} }; },
      async raw() { const statement = sqlite.prepare(query); statement.setReturnArrays(true); return statement.all(...parameters); },
    };
  }
  globalThis.__sahaTestDb = d1Drizzle({ prepare: prepared }, { schema });
  response = await routes.courses.POST(request('admin-a', 'POST', { ...courseInput('synthetic-d1-course'), id: 'spoofed-course', createdAt: 'spoofed', updatedAt: 'spoofed' }));
  check(response.status, 201, 'Production D1 conditional course creation succeeds');
  const course = await response.json();
  check(course.id === 'spoofed-course' || course.createdAt === 'spoofed' || course.updatedAt === 'spoofed', false, 'Course ID and timestamps remain server-owned');
  response = await routes.classes.POST(request('admin-a', 'POST', { ...classInput('Synthetic D1 class'), courseId: course.id, schedule: 'Synthetic schedule' }));
  check(response.status, 201, 'Production D1 conditional class creation succeeds');
  const createdClass = await response.json();
  check(createdClass.courseId, course.id, 'D1 class returning retains selected course');
  check(createdClass.schedule, 'Synthetic schedule', 'D1 class returning retains optional schedule');
  response = await routes.classesDetail.PATCH(request('admin-a', 'PATCH', { ...classInput('Synthetic revised D1 class'), courseId: course.id }), params(createdClass.id));
  check(response.status, 200, 'Production D1 guarded class update succeeds');
  check((await response.json()).id, createdClass.id, 'Class update preserves server record ID');
  response = await routes.coursesDetail.PATCH(request('admin-a', 'PATCH', { ...courseInput(course.code), title: 'Synthetic revised D1 course' }), params(course.id));
  check(response.status, 200, 'Production D1 guarded course update succeeds');
  response = await routes.schoolsDetail.PATCH(request('admin-a', 'PATCH', { name: 'Synthetic revised school', address: 'Synthetic address' }), params('a'));
  check(response.status, 200, 'Production D1 guarded school update succeeds');
  check((await response.json()).address, 'Synthetic address', 'School response shape preserves address');
  response = await routes.classesDetail.GET(request('admin-a'), params('class-a'));
  check((await response.json()).enrolledStudents.map(row => row.id), ['student-a'], 'Production D1 joined class/roster mapping preserves nested shape');
  check(networkCalls, 0, 'All structure verification remains local without providers or recipients');
  console.log(`School structure authority contract: ${checks} checks passed (actual sessions/routes/SQLite, SQL-time actor/reference races, production D1 driver; synthetic only).`);
  console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0 }));
} finally { globalThis.__sahaTestDb = baseDb; globalThis.fetch = originalFetch; sqlite.close(); }
