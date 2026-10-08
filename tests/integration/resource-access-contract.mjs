import assert from 'node:assert/strict';
import { bindings, freshDatabase, seedSecurityData, load } from '../support/security-db.mjs';

const { db, schema, sqlite } = freshDatabase();
await seedSecurityData(db, schema);
const { createSession } = await load('lib/education/session.ts');
const service = await load('lib/education/resources.ts');
const routes = {
  collection: await load('app/api/resources/route.ts'),
  detail: await load('app/api/resources/[id]/route.ts'),
  versions: await load('app/api/resources/[id]/versions/route.ts'),
  approval: await load('app/api/resources/[id]/approve/route.ts'),
  assign: await load('app/api/resources/[id]/assign/route.ts'),
  assignments: await load('app/api/resource-assignments/route.ts'),
};
const origin = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = origin;
const sessions = {};
for (const id of ['admin-a', 'teacher-a', 'teacher-other', 'student-user-a'])
  sessions[id] = (await createSession(id)).split(';')[0];
const teacher = { id: 'teacher-a', role: 'teacher', schoolId: 'a' };
const content = {
  title: 'Synthetic resource evidence',
  type: 'worksheet',
  curriculum: 'Synthetic only',
  gradeLevel: '8',
  subject: 'Mathematics',
  language: 'en-IN',
  objectives: 'Compare synthetic fractions.',
  body: 'Synthetic learner-facing task.',
  teacherNotes: 'Private synthetic staff observation.',
  answerKey: 'Private synthetic answer key.',
};
const createInput = { content, clientResourceId: crypto.randomUUID() };
const original = await service.createResource(teacher, createInput);
await service.approveResource(teacher, original.id, original.latest.id);
const assignInput = { versionId: original.latest.id, classId: 'class-a' };
const assignment = await service.assignResource(teacher, original.id, assignInput);
const unassigned = await service.createResource(teacher, {
  content: { ...content, title: 'Synthetic unassigned reviewed task' },
});
await service.approveResource(teacher, unassigned.id, unassigned.latest.id);
const unreviewed = await service.createResource(teacher, {
  content: { ...content, title: 'Synthetic private review candidate' },
});
const originalDb = globalThis.__sahaTestDb;
let checks = 0;
function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  checks++;
}
function request(user, method = 'GET', payload) {
  const headers = { cookie: sessions[user], origin };
  const init = { method, headers };
  if (payload !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(payload);
  }
  return new Request(origin + '/api/resources', init);
}
function call(route, method, user, payload, resourceId = original.id) {
  return routes[route][method](request(user, method, payload), {
    params: Promise.resolve({ id: resourceId }),
  });
}
async function denied(response, message) {
  check([401, 403, 404, 409].includes(response.status), true, message);
  const value = await response.json();
  check(Object.keys(value), ['error'], 'Denied operation exposes only a safe error');
}
function count(table) {
  return sqlite.prepare('SELECT count(*) n FROM ' + table).get().n;
}
function revoke(user = 'teacher-a') {
  sqlite.prepare("UPDATE users SET disabled_at='revoked-before-resource-statement' WHERE id=?").run(user);
}
function restore(user = 'teacher-a') {
  sqlite.prepare('UPDATE users SET disabled_at=NULL WHERE id=?').run(user);
}
function beforeStatement({ operation = 'select', match, mutate }) {
  let injected = false;
  globalThis.__sahaTestDb = new Proxy(originalDb, {
    get(target, property) {
      if (property === operation && operation !== 'select')
        return (table) => {
          if (!injected && match(table)) {
            injected = true;
            globalThis.__sahaTestDb = originalDb;
            mutate();
          }
          return target[property](table);
        };
      if (property === 'select' && operation === 'select')
        return (...args) => {
          const builder = target.select(...args);
          return new Proxy(builder, {
            get(query, member) {
              if (member === 'from')
                return (table) => {
                  if (!injected && match(table, args[0])) {
                    injected = true;
                    globalThis.__sahaTestDb = originalDb;
                    mutate();
                  }
                  return query.from(table);
                };
              const value = Reflect.get(query, member, query);
              return typeof value === 'function' ? value.bind(query) : value;
            },
          });
        };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return () => {
    globalThis.__sahaTestDb = originalDb;
    check(injected, true, 'Authority changed immediately before the selected resource statement');
  };
}
const originalFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = async () => {
  networkCalls++;
  throw new Error('Resource scope checks must remain local');
};
try {
  const parentsBefore = count('teaching_resources'),
    versionsBefore = count('resource_versions');
  let finish = beforeStatement({
    operation: 'insert',
    match: (table) => table === schema.teachingResources,
    mutate: () => revoke(),
  });
  let response = await call('collection', 'POST', 'teacher-a', {
    content,
    clientResourceId: crypto.randomUUID(),
  });
  finish();
  await denied(response, 'Revocation before create INSERT prevents persisted or fabricated success');
  check(count('teaching_resources'), parentsBefore, 'Revoked creation adds no parent');
  check(count('resource_versions'), versionsBefore, 'Revoked creation adds no version');
  restore();
  finish = beforeStatement({
    operation: 'insert',
    match: (table) => table === schema.resourceVersions,
    mutate: () => revoke(),
  });
  response = await call('collection', 'POST', 'teacher-a', {
    content,
    clientResourceId: crypto.randomUUID(),
  });
  finish();
  await denied(response, 'Revocation during create query preparation guards both atomic INSERTs');
  check(count('teaching_resources'), parentsBefore, 'Zero-row creation batch leaves no detached parent');
  check(count('resource_versions'), versionsBefore, 'Zero-row creation batch leaves no detached version');
  restore();
  finish = beforeStatement({
    operation: 'insert',
    match: (table) => table === schema.teachingResources,
    mutate: () => sqlite.prepare("UPDATE users SET identity_subject='' WHERE id='teacher-a'").run(),
  });
  response = await call('collection', 'POST', 'teacher-a', {
    content,
    clientResourceId: crypto.randomUUID(),
  });
  finish();
  await denied(response, 'Removed trusted identity mapping prevents stale-session create');
  sqlite.prepare("UPDATE users SET identity_subject='sub-teacher-a' WHERE id='teacher-a'").run();

  for (const route of ['detail', 'versions']) {
    finish = beforeStatement({ match: (table) => table === schema.resourceVersions, mutate: () => revoke() });
    response = await call(route, 'GET', 'teacher-a');
    finish();
    if (response.status === 200)
      check(await response.json(), [], 'Revoked version list returns no private content');
    else
      await denied(
        response,
        'Revocation before latest/exact content SELECT denies private resource evidence',
      );
    restore();
  }
  finish = beforeStatement({
    match: (table, fields) =>
      table === schema.teachingResources && fields?.resource === schema.teachingResources,
    mutate: () => revoke(),
  });
  response = await call('collection', 'GET', 'teacher-a');
  finish();
  check(response.status, 200, 'Scoped one-query resource list returns a safe collection');
  check(await response.json(), [], 'Revoked author cannot retrieve private resource list');
  restore();
  finish = beforeStatement({ match: (table) => table === schema.resourceVersions, mutate: () => revoke() });
  response = await call('collection', 'POST', 'teacher-a', createInput);
  finish();
  await denied(response, 'Creation replay rechecks actor at original-version evidence SELECT');
  restore();
  finish = beforeStatement({
    match: (table) => table === schema.resourceVersions,
    mutate: () =>
      sqlite.prepare("UPDATE teaching_resources SET author_id='teacher-other' WHERE id=?").run(original.id),
  });
  response = await call('detail', 'GET', 'teacher-a');
  finish();
  await denied(response, 'Changed authorship before SELECT cannot reveal now-peer private content');
  sqlite.prepare("UPDATE teaching_resources SET author_id='teacher-a' WHERE id=?").run(original.id);
  finish = beforeStatement({
    match: (table) => table === schema.resourceVersions,
    mutate: () => sqlite.prepare("UPDATE users SET role='teacher' WHERE id='admin-a'").run(),
  });
  response = await call('detail', 'GET', 'admin-a');
  finish();
  await denied(response, 'Demoted administrator cannot use stale admin scope to read another author draft');
  sqlite.prepare("UPDATE users SET role='admin' WHERE id='admin-a'").run();

  const revisionInput = {
    expectedVersion: 1,
    content: { ...content, title: 'Unauthorized synthetic next revision' },
  };
  for (const mutate of [
    () => revoke(),
    () => sqlite.prepare("UPDATE users SET role='guardian' WHERE id='teacher-a'").run(),
    () =>
      sqlite.prepare("UPDATE teaching_resources SET author_id='teacher-other' WHERE id=?").run(original.id),
  ]) {
    finish = beforeStatement({
      operation: 'insert',
      match: (table) => table === schema.resourceVersions,
      mutate,
    });
    response = await call('detail', 'PATCH', 'teacher-a', revisionInput);
    finish();
    await denied(response, 'Revision INSERT rechecks current actor and parent authority');
    check(count('resource_versions'), versionsBefore, 'Denied revision appends no content');
    restore();
    sqlite.prepare("UPDATE users SET role='teacher' WHERE id='teacher-a'").run();
    sqlite.prepare("UPDATE teaching_resources SET author_id='teacher-a' WHERE id=?").run(original.id);
  }
  for (const mutate of [
    () => revoke(),
    () =>
      sqlite.prepare("UPDATE teaching_resources SET author_id='teacher-other' WHERE id=?").run(unreviewed.id),
  ]) {
    finish = beforeStatement({
      operation: 'update',
      match: (table) => table === schema.resourceVersions,
      mutate,
    });
    response = await call(
      'approval',
      'POST',
      'teacher-a',
      { versionId: unreviewed.latest.id },
      unreviewed.id,
    );
    finish();
    await denied(response, 'Approval UPDATE and fallback content read enforce live parent scope');
    check(
      sqlite.prepare('SELECT approved_at FROM resource_versions WHERE id=?').get(unreviewed.latest.id)
        .approved_at,
      null,
      'Denied approval preserves private unreviewed state',
    );
    restore();
    sqlite.prepare("UPDATE teaching_resources SET author_id='teacher-a' WHERE id=?").run(unreviewed.id);
  }
  finish = beforeStatement({ match: (table) => table === schema.resourceVersions, mutate: () => revoke() });
  response = await call('approval', 'POST', 'teacher-a', { versionId: original.latest.id });
  finish();
  await denied(response, 'Already-approved exact-version retry cannot return evidence after revocation');
  restore();
  const assignmentsBefore = count('resource_assignments');
  finish = beforeStatement({
    operation: 'insert',
    match: (table) => table === schema.resourceAssignments,
    mutate: () => revoke(),
  });
  response = await call(
    'assign',
    'POST',
    'teacher-a',
    { versionId: unassigned.latest.id, classId: 'class-a' },
    unassigned.id,
  );
  finish();
  await denied(response, 'Assignment INSERT rechecks live actor before assigning reviewed content');
  check(count('resource_assignments'), assignmentsBefore, 'Revoked assignment creates no record');
  restore();
  finish = beforeStatement({
    match: (table, fields) => table === schema.resourceAssignments && fields === undefined,
    mutate: () => revoke(),
  });
  response = await call('assign', 'POST', 'teacher-a', assignInput);
  finish();
  await denied(response, 'Existing assignment replay cannot bypass actor revocation');
  restore();
  for (const user of ['teacher-a', 'student-user-a']) {
    finish = beforeStatement({
      match: (table, fields) =>
        table === schema.resourceAssignments && fields?.assignment === schema.resourceAssignments,
      mutate: () => revoke(user),
    });
    response = await call('assignments', 'GET', user);
    finish();
    check(response.status, 200, 'Revoked assignment feed returns safe collection');
    check(
      await response.json(),
      [],
      'Live actor predicate hides assigned content after staff/learner revocation',
    );
    restore(user);
  }
  check(
    sqlite.prepare('SELECT version_id FROM resource_assignments WHERE id=?').get(assignment.id).version_id,
    original.latest.id,
    'Authority races preserve approved assignment version',
  );
  check(
    {
      ...sqlite
        .prepare('SELECT body,teacher_notes,answer_key FROM resource_versions WHERE id=?')
        .get(original.latest.id),
    },
    { body: content.body, teacher_notes: content.teacherNotes, answer_key: content.answerKey },
    'Authority races preserve original public/private teaching evidence',
  );
  const learnerResponse = await call('assignments', 'GET', 'student-user-a');
  check(learnerResponse.status, 200, 'Restored active learner still receives assignment');
  const learnerFeed = await learnerResponse.json();
  check(learnerFeed.length, 1, 'Restored learner receives only the authorized assignment');
  check(
    JSON.stringify(learnerFeed).includes(content.answerKey),
    false,
    'Stronger authorization preserves answer-key privacy',
  );
  check(
    JSON.stringify(learnerFeed).includes(content.teacherNotes),
    false,
    'Stronger authorization preserves teacher-note privacy',
  );
  check(networkCalls, 0, 'Manual resource hardening makes no external network calls');
  console.log(
    `Resource access contract: ${checks} checks passed (actual sessions/routes and SQLite; live authority in mutation/evidence SQL; synthetic only).`,
  );
  console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0 }));
} finally {
  globalThis.__sahaTestDb = originalDb;
  globalThis.fetch = originalFetch;
  sqlite.close();
}
