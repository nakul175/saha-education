import assert from 'node:assert/strict';
import { bindings, freshDatabase, seedSecurityData, load } from '../support/security-db.mjs';

const { db, schema, sqlite } = freshDatabase();
await seedSecurityData(db, schema);
const { createSession } = await load('lib/education/session.ts');
const services = await load('lib/education/curriculum.ts');
const routes = {
  collection: await load('app/api/curriculum/route.ts'),
  detail: await load('app/api/curriculum/[id]/route.ts'),
  versions: await load('app/api/curriculum/[id]/versions/route.ts'),
  approval: await load('app/api/curriculum/[id]/approve/route.ts'),
  snapshot: await load('app/api/curriculum/[id]/snapshot/route.ts'),
  draft: await load('app/api/curriculum/[id]/draft/route.ts'),
};
const origin = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = origin;
const sessions = {};
for (const id of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'teacher-b', 'guardian-a', 'student-user-a']) sessions[id] = (await createSession(id)).split(';')[0];
const content = { title: 'Synthetic fractions reference', curriculum: 'Synthetic curriculum', gradeLevel: '8', subject: 'Mathematics',
  language: 'en-IN', objectives: 'Compare two fractions.', body: 'Compare 1/2 and 1/4. Explain your reasoning.',
  rightsStatement: 'Original synthetic content written for this test; approved for copying within the synthetic school.',
  sourceReference: 'SYNTHETIC-FRACTIONS-1', sourceUrl: 'https://sources.example.invalid/fractions' };
const referenceId = 'c7092085-5b82-4a0a-b19d-12f2e0fdd153';
let checks = 0;
function check(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }
function request(user, method = 'GET', payload, suppliedOrigin = origin, query = '') {
  const headers = { origin: suppliedOrigin };
  if (user) headers.cookie = sessions[user];
  const init = { method, headers };
  if (payload !== undefined) { headers['content-type'] = 'application/json'; init.body = JSON.stringify(payload); }
  return new Request(origin + '/api/curriculum' + query, init);
}
const params = id => ({ params: Promise.resolve({ id }) });
const call = (route, method, user, payload, id = referenceId, suppliedOrigin = origin, query = '') => routes[route][method](request(user, method, payload, suppliedOrigin, query), params(id));
async function read(route, user, id = referenceId, query = '') {
  const response = await call(route, 'GET', user, undefined, id, origin, query);
  check(response.status, 200, 'Authorized curriculum read');
  check(response.headers.get('cache-control'), 'no-store', 'Curriculum content is uncached');
  return response.json();
}
const originalFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error('Curriculum references must not fetch source or provider URLs'); };
try {
  const boundaries = [['collection', 'GET'], ['collection', 'POST'], ['detail', 'GET'], ['detail', 'PATCH'], ['versions', 'GET'], ['approval', 'POST'], ['snapshot', 'GET'], ['draft', 'POST']];
  for (const [route, method] of boundaries) {
    check((await call(route, method, null, method === 'GET' ? undefined : {})).status, 401, 'Anonymous curriculum endpoint denied');
    if (method !== 'GET') check((await call(route, method, 'teacher-a', {}, referenceId, 'https://attacker.example.invalid')).status, 403, 'Origin guard precedes parsing');
    for (const family of ['guardian-a', 'student-user-a']) check((await call(route, method, family, method === 'GET' ? undefined : {})).status, method === 'GET' && route !== 'snapshot' ? 403 : 400, 'Family access rejected before any content is disclosed');
  }
  check((await routes.collection.GET(new Request(origin + '/api/curriculum', { headers: { cookie: 'saha_demo_role=admin' } }))).status, 401, 'Legacy role cookie grants no authority');
  const creation = { content, clientReferenceId: referenceId };
  for (const invalid of [
    { ...creation, schoolId: 'b' }, { ...creation, authorId: 'teacher-other' }, { ...creation, approvedBy: 'admin-a' },
    { ...creation, content: { ...content, rightsStatement: ' ' } }, { ...creation, content: { ...content, body: 'x'.repeat(20001) } },
    { ...creation, content: { ...content, sourceUrl: 'http://sources.example.invalid' } },
    { ...creation, content: { ...content, sourceUrl: 'https://user:secret@sources.example.invalid' } },
    { ...creation, content: { ...content, sourceUrl: 'https://sources.example.invalid/#fragment' } },
    { ...creation, content: { ...content, sourceUrl: 'javascript:alert(1)' } },
    { ...creation, clientReferenceId: 'not-a-uuid' },
  ]) check((await call('collection', 'POST', 'teacher-a', invalid)).status, 400, 'Invalid rights, source URL, length or authority fields rejected');
  const oversized = new Request(origin + '/api/curriculum', { method: 'POST', headers: { origin, cookie: sessions['teacher-a'] }, body: JSON.stringify({ body: 'x'.repeat(140000) }) });
  check((await routes.collection.POST(oversized)).status, 400, 'Oversized JSON rejected');
  let response = await call('collection', 'POST', 'teacher-a', creation);
  check(response.status, 201, 'Teacher authors own curriculum draft');
  const first = await response.json(), version1 = first.latest;
  check(first.id, referenceId, 'Client UUID persists safe retry identity');
  check(first.schoolId, 'a', 'School comes from authenticated identity');
  check(first.authorId, 'teacher-a', 'Author comes from authenticated identity');
  check(first.canManage, true, 'Author can manage draft');
  check(version1.version, 1, 'Initial immutable version numbered one');
  check(version1.approvedAt, null, 'No automatic suitability approval');
  check(version1.rightsStatement, content.rightsStatement, 'Declared source rights retained');
  check((await call('collection', 'POST', 'guardian-a', creation)).status, 403, 'Valid family authoring payload is forbidden');
  response = await call('collection', 'POST', 'teacher-a', creation);
  check(await response.json(), first, 'Exact creation retry preserves original version and timestamps');
  check((await call('collection', 'POST', 'teacher-a', { ...creation, content: { ...content, body: 'Changed retry' } })).status, 409, 'Changed creation retry conflicts');
  check((await call('collection', 'POST', 'teacher-other', creation)).status, 409, 'Peer cannot claim another author retry identity');
  check((await read('collection', 'teacher-other')).length, 0, 'Peer cannot list unapproved drafts');
  check((await read('collection', 'admin-a')).length, 1, 'School admin sees school drafts');
  check((await read('collection', 'admin-b')).length, 0, 'Other school admin sees no references');
  for (const user of ['teacher-other', 'teacher-b', 'admin-b']) check((await call('detail', 'GET', user)).status, 404, 'Inaccessible private reference hides existence');
  check((await call('draft', 'POST', 'teacher-a', { versionId: version1.id, type: 'lesson' })).status, 404, 'Unapproved source cannot create resource draft');
  check((await call('snapshot', 'GET', 'teacher-a', undefined, referenceId, origin, '?versionId=' + version1.id)).status, 404, 'Unapproved source cannot provide copy snapshot');
  check((await call('approval', 'POST', 'teacher-a', { versionId: version1.id, confirmReview: false })).status, 400, 'Explicit review confirmation mandatory');
  check((await call('approval', 'POST', 'teacher-other', { versionId: version1.id, confirmReview: true })).status, 404, 'Peer cannot approve author content');
  response = await call('approval', 'POST', 'teacher-a', { versionId: version1.id, confirmReview: true });
  check(response.status, 200, 'Author explicitly reviews exact source version');
  const approved = await response.json();
  check(approved.approvedBy, 'teacher-a', 'Server attributes educator review');
  check(typeof approved.approvedAt, 'string', 'Server attributes review time');
  response = await call('approval', 'POST', 'admin-a', { versionId: version1.id, confirmReview: true });
  check(await response.json(), approved, 'Review retry never rewrites first approval evidence');
  const peer = await read('detail', 'teacher-other');
  check(peer.canManage, false, 'Approved school source remains read-only to peers');
  check(peer.latest.id, version1.id, 'Peer sees exact reviewed source version');
  const snapshot = await read('snapshot', 'teacher-other', referenceId, '?versionId=' + version1.id);
  check(snapshot.suggestedDraft.body, content.body, 'Explicit approved snapshot copies original text');
  check(snapshot.suggestedDraft.teacherNotes, '', 'Source does not fabricate private teacher notes');
  for (const query of ['', '?versionId=' + version1.id + '&versionId=' + version1.id, '?versionId=' + version1.id + '&schoolId=b']) check((await call('snapshot', 'GET', 'teacher-a', undefined, referenceId, origin, query)).status, 400, 'Missing, duplicate and authority-bearing snapshot query rejected');

  const resourceId = 'b77517f8-96c0-43db-bc7c-b5cf880e8c56';
  const copy = { versionId: version1.id, type: 'worksheet', clientResourceId: resourceId };
  response = await call('draft', 'POST', 'teacher-other', copy);
  check(response.status, 201, 'Peer explicitly selects approved same-school source into own draft');
  const copied = await response.json();
  check(copied.resource.authorId, 'teacher-other', 'New resource belongs to authenticated selecting teacher');
  check(copied.resource.latest.type, 'worksheet', 'Teacher chooses copied resource form');
  check(copied.resource.latest.body, content.body, 'Resource preserves approved source text');
  check(copied.resource.latest.approvedAt, null, 'Source approval never approves copied teaching material');
  check(copied.provenance.referenceVersionId, version1.id, 'Durable provenance pins exact reviewed source');
  check(copied.provenance.resourceVersionId, copied.resource.latest.id, 'Provenance identifies exact initial resource version');
  check(copied.provenance.selectedBy, 'teacher-other', 'Source selection retains actor');
  check(sqlite.prepare('SELECT count(*) AS count FROM resource_assignments WHERE resource_id=?').get(resourceId).count, 0, 'Copy never assigns to a class');
  response = await call('draft', 'POST', 'teacher-other', copy);
  check(await response.json(), copied, 'Exact copy retry preserves resource and source binding');
  check((await call('draft', 'POST', 'teacher-other', { ...copy, type: 'quiz' })).status, 409, 'Changed copy retry conflicts');
  check((await call('draft', 'POST', 'teacher-a', copy)).status, 409, 'Different actor cannot reuse copied draft identity');
  for (const user of ['teacher-b', 'admin-b']) check((await call('draft', 'POST', user, { versionId: version1.id, type: 'lesson' })).status, 404, 'Cross-school source copy denied');
  check((await call('draft', 'POST', 'student-user-a', copy)).status, 403, 'Learner cannot copy reviewed staff source');

  const next = { ...content, title: 'Synthetic private revision', body: 'A private new draft reference.' };
  response = await call('detail', 'PATCH', 'teacher-a', { expectedVersion: 1, content: next });
  check(response.status, 200, 'Author appends immutable revision');
  const second = await response.json();
  check(second.latest.version, 2, 'Reference revision increments');
  check(second.latest.approvedAt, null, 'Reference revision begins unapproved');
  check((await read('detail', 'teacher-other')).latest.id, version1.id, 'Unapproved newer source never displaces approved peer view');
  check((await read('versions', 'teacher-other')).length, 1, 'Peer history excludes private revisions');
  check((await read('versions', 'teacher-a')).length, 2, 'Author preserves complete source history');
  check((await call('detail', 'PATCH', 'teacher-a', { expectedVersion: 1, content: next })).status, 409, 'Stale reference revision conflicts');
  check((await call('detail', 'PATCH', 'teacher-other', { expectedVersion: 2, content: next })).status, 404, 'Peer cannot revise approved source');
  check(sqlite.prepare('SELECT body FROM resource_versions WHERE id=?').get(copied.resource.latest.id).body, content.body, 'Source revision cannot change previously copied teaching content');
  check(sqlite.prepare('SELECT reference_version_id FROM resource_reference_bindings WHERE resource_id=?').get(resourceId).reference_version_id, version1.id, 'Source revision cannot change copied provenance');

  const raceId = '5d4124fb-dd89-4d5c-8d12-ea88e36a423c';
  const races = await Promise.all([call('collection', 'POST', 'teacher-a', { content, clientReferenceId: raceId }), call('collection', 'POST', 'teacher-a', { content, clientReferenceId: raceId })]);
  check(races.map(result => result.status), [201, 201], 'Concurrent identical reference retries succeed');
  const raceBodies = await Promise.all(races.map(result => result.json()));
  check(raceBodies[0], raceBodies[1], 'Concurrent creation yields one original source/version');
  const revisions = await Promise.all([call('detail', 'PATCH', 'teacher-a', { expectedVersion: 2, content: { ...next, body: 'Concurrent reference A' } }), call('detail', 'PATCH', 'admin-a', { expectedVersion: 2, content: { ...next, body: 'Concurrent reference B' } })]);
  check(revisions.map(result => result.status).sort(), [200, 409], 'Concurrent revision permits exactly one immutable winner');
  const latest = await read('detail', 'teacher-a');
  const approvals = await Promise.all([call('approval', 'POST', 'teacher-a', { versionId: latest.latest.id, confirmReview: true }), call('approval', 'POST', 'admin-a', { versionId: latest.latest.id, confirmReview: true })]);
  check(approvals.map(result => result.status), [200, 200], 'Concurrent exact-version review succeeds');
  const approvalBodies = await Promise.all(approvals.map(result => result.json()));
  check(approvalBodies[0], approvalBodies[1], 'First reviewer and timestamp preserved under race');
  const copyRaceId = '30e715a5-9be2-47ac-8e0e-700c62c889f2';
  const copyRaces = await Promise.all([call('draft', 'POST', 'teacher-other', { ...copy, clientResourceId: copyRaceId }), call('draft', 'POST', 'teacher-other', { ...copy, clientResourceId: copyRaceId })]);
  check(copyRaces.map(result => result.status), [201, 201], 'Concurrent source copy retries succeed');
  const copyBodies = await Promise.all(copyRaces.map(result => result.json()));
  check(copyBodies[0], copyBodies[1], 'Concurrent source copy retains one draft and binding');

  // Force the third statement to fail and verify the D1 transaction rolls back
  // the resource/version instead of leaving a draft without source evidence.
  const rollbackId = 'ac190dc2-d586-47f4-b360-695f157a491f';
  sqlite.exec("CREATE TRIGGER fail_curriculum_binding BEFORE INSERT ON resource_reference_bindings BEGIN SELECT RAISE(ABORT, 'synthetic binding failure'); END");
  check((await call('draft', 'POST', 'teacher-a', { ...copy, clientResourceId: rollbackId })).status, 500, 'Binding persistence failure fails closed');
  check(sqlite.prepare('SELECT count(*) AS count FROM teaching_resources WHERE id=?').get(rollbackId).count, 0, 'Binding failure rolls back newly created resource');
  check(sqlite.prepare('SELECT count(*) AS count FROM resource_versions WHERE resource_id=?').get(rollbackId).count, 0, 'Binding failure rolls back resource version');
  sqlite.exec('DROP TRIGGER fail_curriculum_binding');

  // Resolve the service principal, then remove its school authority just before
  // INSERT SELECT construction. The persistence guard must reject the stale role.
  const principal = { id: 'teacher-a', role: 'teacher', schoolId: 'a' };
  const before = sqlite.prepare('SELECT count(*) AS count FROM curriculum_reference_versions WHERE reference_id=?').get(referenceId).count;
  let changed = false;
  globalThis.__sahaTestDb = new Proxy(db, { get(target, property) {
    if (property !== 'insert') return Reflect.get(target, property, target);
    return (...args) => {
      if (!changed) { changed = true; sqlite.prepare('UPDATE users SET school_id=? WHERE id=?').run('b', principal.id); }
      return target.insert(...args);
    };
  } });
  await assert.rejects(() => services.reviseCurriculumReference(principal, referenceId, { expectedVersion: 3, content }), services.CurriculumConflict); checks++;
  check(sqlite.prepare('SELECT count(*) AS count FROM curriculum_reference_versions WHERE reference_id=?').get(referenceId).count, before, 'School transfer after validation cannot persist reference revision');
  globalThis.__sahaTestDb = db;
  sqlite.prepare('UPDATE users SET school_id=? WHERE id=?').run('a', principal.id);
  sqlite.prepare('UPDATE users SET disabled_at=? WHERE id=?').run('2026-10-05T00:00:00.000Z', 'teacher-other');
  check((await call('collection', 'GET', 'teacher-other')).status, 401, 'Disabled staff session cannot read approved library');
  check((await call('draft', 'POST', 'teacher-other', copy)).status, 401, 'Disabled staff session cannot copy sources');
  check(networkCalls, 0, 'Manual curriculum workspace makes zero network calls');
  console.log(`Curriculum contract: ${checks} checks passed (actual authenticated routes and SQLite/D1, synthetic content only).`);
  console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0 }));
} finally { globalThis.fetch = originalFetch; globalThis.__sahaTestDb = db; sqlite.close(); }
