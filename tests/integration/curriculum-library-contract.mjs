// FR-22 library lifecycle: search/filter, reasoned retire/reinstate, reference-to-resource-to-class usage and
// resource source attribution. Real authenticated route handlers over SQLite; synthetic content only, no network.
import assert from 'node:assert/strict';
import { bindings, freshDatabase, seedSecurityData, load } from '../support/security-db.mjs';

const { db, schema, sqlite } = freshDatabase();
await seedSecurityData(db, schema);
const { createSession } = await load('lib/education/session.ts');
const routes = {
  collection: await load('app/api/curriculum/route.ts'),
  detail: await load('app/api/curriculum/[id]/route.ts'),
  versions: await load('app/api/curriculum/[id]/versions/route.ts'),
  approval: await load('app/api/curriculum/[id]/approve/route.ts'),
  snapshot: await load('app/api/curriculum/[id]/snapshot/route.ts'),
  draft: await load('app/api/curriculum/[id]/draft/route.ts'),
  status: await load('app/api/curriculum/[id]/status/route.ts'),
  usage: await load('app/api/curriculum/[id]/usage/route.ts'),
  resourceApprove: await load('app/api/resources/[id]/approve/route.ts'),
  resourceAssign: await load('app/api/resources/[id]/assign/route.ts'),
  resourceSource: await load('app/api/resources/[id]/source/route.ts'),
  resourceDetail: await load('app/api/resources/[id]/route.ts'),
};
const origin = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = origin;
const sessions = {};
for (const id of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'teacher-b', 'guardian-a', 'student-user-a']) sessions[id] = (await createSession(id)).split(';')[0];
const base = { curriculum: 'Synthetic framework', gradeLevel: '8', subject: 'Mathematics', language: 'en-IN', objectives: 'Compare two fractions.',
  body: 'Compare 1/2 and 1/4. Explain your reasoning.', rightsStatement: 'Original synthetic content written for this test.', sourceReference: 'SYN-LIB-1', sourceUrl: null };
const ids = { fractions: '11111111-1111-4111-8111-111111111111', plants: '22222222-2222-4222-8222-222222222222', hindi: '33333333-3333-4333-8333-333333333333' };
let checks = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const url = (path, query = '') => origin + path + query;
function request(user, method, path, payload, query = '', suppliedOrigin = origin) {
  const headers = { origin: suppliedOrigin };
  if (user) headers.cookie = sessions[user];
  const init = { method, headers };
  if (payload !== undefined) { headers['content-type'] = 'application/json'; init.body = JSON.stringify(payload); }
  return new Request(url(path, query), init);
}
const params = id => ({ params: Promise.resolve({ id }) });
const call = (route, method, user, id, payload, query = '', suppliedOrigin = origin) => routes[route][method](request(user, method, '/api/x', payload, query, suppliedOrigin), params(id));
const list = async (user, query = '') => { const response = await routes.collection.GET(request(user, 'GET', '/api/curriculum', undefined, query)); return { status: response.status, body: response.status === 200 ? await response.json() : null }; };
const titles = result => result.body.map(item => item.latest.title).sort();
async function create(user, id, content) {
  const response = await routes.collection.POST(request(user, 'POST', '/api/curriculum', { content, clientReferenceId: id }));
  assert.equal(response.status, 201); checks++;
  return response.json();
}
async function approve(user, referenceId, versionId) {
  const response = await call('approval', 'POST', user, referenceId, { versionId, confirmReview: true });
  check(response.status, 200, 'Reference version reviewed');
  return response.json();
}
const originalFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error('Curriculum library must not use the network'); };
try {
  // ---- search and filters -------------------------------------------------
  const fractions = await create('teacher-a', ids.fractions, { ...base, title: 'Synthetic fractions reference' });
  const plants = await create('teacher-a', ids.plants, { ...base, title: 'Synthetic plant parts reference', gradeLevel: '6', subject: 'Science', curriculum: 'Synthetic science framework',
    objectives: 'Name the parts of a plant.', body: 'Roots, stem and leaves.', rightsStatement: 'Permission recorded by the school librarian (synthetic).', sourceReference: 'SYN-LIB-2' });
  const hindi = await create('teacher-other', ids.hindi, { ...base, title: 'Synthetic Hindi reading reference', language: 'hi', subject: 'Language', gradeLevel: '5', objectives: 'Read a short passage aloud.', body: 'Short synthetic passage.' });
  await approve('teacher-a', ids.fractions, fractions.latest.id);
  await approve('teacher-other', ids.hindi, hindi.latest.id);
  check(titles(await list('teacher-a')), ['Synthetic Hindi reading reference', 'Synthetic fractions reference', 'Synthetic plant parts reference'].sort(), 'Author sees own drafts plus reviewed school references');
  check(titles(await list('teacher-other')), ['Synthetic Hindi reading reference', 'Synthetic fractions reference'].sort(), 'Peer sees own draft and reviewed references only, never another author draft');
  check(titles(await list('admin-a')).length, 3, 'School administrator sees the whole school library');
  check((await list('admin-b')).body, [], 'Another school sees no references');
  const filtered = async (query, user = 'admin-a') => titles(await list(user, query));
  check(await filtered('?q=fractions'), ['Synthetic fractions reference'], 'Text search matches title');
  check(await filtered('?q=FRACTIONS'), ['Synthetic fractions reference'], 'Text search ignores case');
  check(await filtered('?q=plant%20stem'), ['Synthetic plant parts reference'], 'Every search word must match across title and body');
  check(await filtered('?q=librarian'), ['Synthetic plant parts reference'], 'Search covers the recorded rights statement');
  check(await filtered('?q=SYN-LIB-1'), ['Synthetic Hindi reading reference', 'Synthetic fractions reference'].sort(), 'Search covers the source reference');
  check(await filtered('?q=teacher-other'), ['Synthetic Hindi reading reference'], 'Search covers the author name');
  check(await filtered('?subject=science'), ['Synthetic plant parts reference'], 'Subject filter is exact and case-insensitive');
  check(await filtered('?subject=scien'), [], 'Subject filter does not match partial values');
  check(await filtered('?gradeLevel=5'), ['Synthetic Hindi reading reference'], 'Grade filter');
  check(await filtered('?language=hi'), ['Synthetic Hindi reading reference'], 'Language filter');
  check(await filtered('?curriculum=Synthetic%20science%20framework'), ['Synthetic plant parts reference'], 'Curriculum filter');
  check(await filtered('?review=reviewed'), ['Synthetic Hindi reading reference', 'Synthetic fractions reference'].sort(), 'Reviewed filter');
  check(await filtered('?review=draft'), ['Synthetic plant parts reference'], 'Draft filter');
  check(await filtered('?review=reviewed&subject=Mathematics&q=compare'), ['Synthetic fractions reference'], 'Filters combine');
  check(await filtered('?subject=Science', 'teacher-other'), [], 'Filters never reveal another author draft to a peer');
  check(await filtered('?q=%20&subject='), ['Synthetic Hindi reading reference', 'Synthetic fractions reference', 'Synthetic plant parts reference'].sort(), 'Blank filters mean not set');
  for (const bad of ['?unknown=1', '?review=maybe', '?lifecycle=gone', '?q=' + 'x'.repeat(201), '?subject=a&subject=b', '?schoolId=b']) check((await list('teacher-a', bad)).status, 400, 'Unsupported, repeated or oversized filter rejected: ' + bad.slice(0, 30));
  for (const user of ['guardian-a', 'student-user-a']) check((await list(user, '?bogus=1')).status, 403, 'Family role is denied before filters are read');
  check((await list(null)).status, 401, 'Anonymous library list denied');

  // ---- names instead of internal ids --------------------------------------
  const detail = await (await call('detail', 'GET', 'teacher-other', ids.fractions)).json();
  check(detail.authorName, 'teacher-a', 'Reference carries the author display name');
  check(detail.latest.approvedByName, 'teacher-a', 'Reviewed version carries the reviewer display name');
  check(detail.latest.createdByName, 'teacher-a', 'Version carries the creator display name');
  check(detail.status, { state: 'active', revision: 0, reason: null, changedAt: null }, 'A reference never retired reports active revision zero');
  check((await (await call('versions', 'GET', 'teacher-a', ids.fractions)).json())[0].approvedByName, 'teacher-a', 'Version history carries reviewer names');

  // ---- copies, assignment and usage ---------------------------------------
  const copyA = await (await call('draft', 'POST', 'teacher-a', ids.fractions, { versionId: fractions.latest.id, type: 'lesson', clientResourceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })).json();
  const copyOther = await (await call('draft', 'POST', 'teacher-other', ids.fractions, { versionId: fractions.latest.id, type: 'worksheet', clientResourceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })).json();
  check(copyA.resource.latest.approvedAt, null, 'Copied draft is not approved');
  let usage = await (await call('usage', 'GET', 'teacher-a', ids.fractions)).json();
  check(usage.scope, 'own', 'Teacher usage is limited to own copies');
  check(usage.copies.map(item => item.resourceId), [copyA.resource.id], 'Teacher sees only own copy');
  check(usage.copies[0].assignments, [], 'A copy not yet assigned lists no classes');
  check(usage.copies[0].latestApproved, false, 'Unapproved copy reported as such');
  check(usage.copiesInSchool, 2, 'Reference manager sees the school-wide copy count');
  usage = await (await call('usage', 'GET', 'teacher-other', ids.fractions)).json();
  check([usage.copies.map(item => item.resourceId), usage.copiesInSchool], [[copyOther.resource.id], null], 'Peer sees own copy only and no school count');
  usage = await (await call('usage', 'GET', 'admin-a', ids.fractions)).json();
  check([usage.scope, usage.copies.length, usage.copiesInSchool], ['school', 2, 2], 'Administrator sees every copy in the school');
  check(usage.copies.map(item => item.authorName).sort(), ['teacher-a', 'teacher-other'], 'Usage names the copying teacher');
  // Approve and assign the copied resource to the teacher's class.
  let response = await call('resourceApprove', 'POST', 'teacher-a', copyA.resource.id, { versionId: copyA.resource.latest.id });
  check(response.status, 200, 'Copied draft reviewed by its own author');
  response = await call('resourceAssign', 'POST', 'teacher-a', copyA.resource.id, { versionId: copyA.resource.latest.id, classId: 'class-a', dueDate: '2026-12-01' });
  check(response.status, 201, 'Reviewed copy assigned to the teacher class');
  usage = await (await call('usage', 'GET', 'teacher-a', ids.fractions)).json();
  check(usage.copies[0].assignments.map(item => [item.className, item.dueDate, item.assignedVersion]), [['class-a', '2026-12-01', 1]], 'Usage lists the class the copy reached');
  check(usage.copies[0].latestApproved, true, 'Usage reports the reviewed copy');
  check((await (await call('usage', 'GET', 'admin-a', ids.fractions)).json()).copies.flatMap(item => item.assignments).length, 1, 'Administrator sees the assignment');
  check((await (await call('usage', 'GET', 'teacher-other', ids.fractions)).json()).copies[0].assignments, [], 'Another teacher never sees classes of copies they do not own');
  for (const user of ['teacher-b', 'admin-b']) check((await call('usage', 'GET', user, ids.fractions)).status, 404, 'Cross-school usage hides the reference');
  for (const user of ['guardian-a', 'student-user-a']) check((await call('usage', 'GET', user, ids.fractions)).status, 403, 'Family cannot read usage');
  check((await call('usage', 'GET', null, ids.fractions)).status, 401, 'Anonymous usage denied');
  check((await call('usage', 'GET', 'teacher-other', ids.plants)).status, 404, 'Usage of another author draft is hidden from peers');

  // ---- resource source attribution ----------------------------------------
  let source = await (await call('resourceSource', 'GET', 'teacher-a', copyA.resource.id)).json();
  check(source.sources.length, 1, 'Copied resource reports its source');
  check([source.sources[0].referenceVersion, source.sources[0].latestReferenceVersion, source.sources[0].lifecycle, source.sources[0].referenceAvailable], [1, 1, 'active', true], 'Source pinned to version 1 and active');
  check(source.sources[0].rightsStatement, base.rightsStatement, 'Recorded rights statement shown exactly as declared');
  check([source.sources[0].reviewedByName, source.sources[0].copiedByName], ['teacher-a', 'teacher-a'], 'Source names reviewer and copier');
  check('body' in source.sources[0], false, 'Source attribution never repeats the source text');
  check((await call('resourceSource', 'GET', 'teacher-other', copyA.resource.id)).status, 404, 'Another teacher cannot read a private resource source');
  check((await (await call('resourceSource', 'GET', 'admin-a', copyA.resource.id)).json()).sources.length, 1, 'Administrator can read the source');
  check((await call('resourceSource', 'GET', 'guardian-a', copyA.resource.id)).status, 403, 'Family cannot read resource sources');
  check((await call('resourceSource', 'GET', 'admin-b', copyA.resource.id)).status, 404, 'Cross-school resource source hidden');
  check((await call('resourceSource', 'GET', null, copyA.resource.id)).status, 401, 'Anonymous resource source denied');

  // ---- retirement ----------------------------------------------------------
  const event = (overrides = {}) => ({ clientEventId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', expectedRevision: 0, status: 'retired', reason: 'Replaced by the revised school scheme.', ...overrides });
  for (const invalid of [{ reason: 'short' }, { reason: 'x'.repeat(501) }, { reason: 'Bad\u0007control character here' }, { clientEventId: 'nope' }, { expectedRevision: -1 }, { expectedRevision: 1.5 },
    { status: 'deleted' }, { schoolId: 'b' }, { changedBy: 'admin-a' }]) check((await call('status', 'POST', 'teacher-a', ids.fractions, { ...event(), ...invalid })).status, 400, 'Invalid retirement body rejected');
  check((await call('status', 'POST', 'teacher-a', ids.fractions, event(), '', 'https://attacker.example.invalid')).status, 403, 'Origin guard on retirement');
  check((await call('status', 'POST', null, ids.fractions, event())).status, 401, 'Anonymous retirement denied');
  for (const user of ['guardian-a', 'student-user-a']) check((await call('status', 'POST', user, ids.fractions, event())).status, 403, 'Family cannot retire');
  for (const user of ['teacher-other', 'teacher-b', 'admin-b']) check((await call('status', 'POST', user, ids.fractions, event())).status, 404, 'A non-manager cannot retire or discover the reference');
  check((await call('status', 'POST', 'teacher-a', ids.fractions, event({ expectedRevision: 5 }))).status, 409, 'A revision the reference has not reached cannot be claimed (compare and set)');
  check(sqlite.prepare('SELECT count(*) AS n FROM curriculum_reference_status_events').get().n, 0, 'Rejected retirements wrote nothing');

  response = await call('status', 'POST', 'teacher-a', ids.fractions, event());
  check(response.status, 201, 'Author retires own reference with a reason');
  const retired = await response.json();
  check([retired.event.revision, retired.event.status, retired.event.changedBy, retired.event.changedByName], [1, 'retired', 'teacher-a', 'teacher-a'], 'Event attributed to the authenticated author');
  check([retired.status.state, retired.status.revision, retired.status.reason], ['retired', 1, 'Replaced by the revised school scheme.'], 'Current status reports retirement and reason');
  check(await (await call('status', 'POST', 'teacher-a', ids.fractions, event())).json(), retired, 'Exact retry returns the original event');
  check((await call('status', 'POST', 'teacher-a', ids.fractions, event({ reason: 'A different reason for the same id.' }))).status, 409, 'Changed retry conflicts');
  check((await call('status', 'POST', 'admin-a', ids.fractions, event())).status, 409, 'Another actor cannot reuse the event id');
  check((await call('status', 'POST', 'teacher-a', ids.fractions, event({ clientEventId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }))).status, 409, 'Stale expected revision conflicts');
  check((await call('status', 'POST', 'teacher-a', ids.fractions, event({ clientEventId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', expectedRevision: 1 }))).status, 409, 'Retiring an already retired reference conflicts');
  check(sqlite.prepare('SELECT count(*) AS n FROM curriculum_reference_status_events').get().n, 1, 'Only the first retirement persisted');

  check(titles(await list('teacher-a')).includes('Synthetic fractions reference'), false, 'Retired reference leaves the default list');
  check(titles(await list('teacher-a', '?lifecycle=retired')), ['Synthetic fractions reference'], 'Author can list retired references');
  check(titles(await list('admin-a', '?lifecycle=all')).length, 3, 'Administrator lists everything with lifecycle=all');
  check(titles(await list('admin-a', '?lifecycle=retired')), ['Synthetic fractions reference'], 'Administrator lists retired references');
  check((await list('teacher-a', '?lifecycle=retired')).body[0].status.state, 'retired', 'Listed retired reference carries its status');
  check(titles(await list('teacher-other', '?lifecycle=all')).includes('Synthetic fractions reference'), false, 'Peer never sees a retired reference, even with lifecycle=all');
  check((await list('teacher-other', '?lifecycle=retired')).body, [], 'Peer retired list is empty');
  for (const route of ['detail', 'versions']) check((await call(route, 'GET', 'teacher-other', ids.fractions)).status, 404, 'Peer gets not-found for a retired reference ' + route);
  check((await call('usage', 'GET', 'teacher-other', ids.fractions)).status, 404, 'Peer usage of a retired reference hidden');
  check((await (await call('detail', 'GET', 'teacher-a', ids.fractions)).json()).status.state, 'retired', 'Author can still open the retired reference');
  check((await call('versions', 'GET', 'admin-a', ids.fractions)).status, 200, 'Administrator can still read retired history');
  check((await call('snapshot', 'GET', 'admin-a', ids.fractions, undefined, '?versionId=' + fractions.latest.id)).status, 404, 'A retired reference cannot supply a copy snapshot');
  check((await call('draft', 'POST', 'teacher-other', ids.fractions, { versionId: fractions.latest.id, type: 'quiz' })).status, 404, 'Peer cannot copy a retired reference');
  check((await call('draft', 'POST', 'teacher-a', ids.fractions, { versionId: fractions.latest.id, type: 'quiz' })).status, 404, 'Even the author cannot create a new copy while retired');
  response = await call('draft', 'POST', 'teacher-a', ids.fractions, { versionId: fractions.latest.id, type: 'lesson', clientResourceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  check([response.status, (await response.json()).resource.id], [201, copyA.resource.id], 'Exact replay of an already committed copy survives retirement');
  response = await call('detail', 'PATCH', 'teacher-a', ids.fractions, { expectedVersion: 1, content: { ...base, title: 'Retired edit' } });
  check([response.status, (await response.json()).code], [409, 'curriculum-retired'], 'A retired reference cannot be revised');
  const draftPlants = (await (await call('detail', 'GET', 'teacher-a', ids.plants)).json()).latest;
  await call('status', 'POST', 'teacher-a', ids.plants, event({ clientEventId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }));
  response = await call('approval', 'POST', 'teacher-a', ids.plants, { versionId: draftPlants.id, confirmReview: true });
  check([response.status, (await response.json()).code], [409, 'curriculum-retired'], 'A retired draft cannot be reviewed');
  check(sqlite.prepare('SELECT approved_at FROM curriculum_reference_versions WHERE id=?').get(draftPlants.id).approved_at, null, 'Rejected review left the draft unapproved');
  response = await call('status', 'POST', 'teacher-a', ids.plants, event({ clientEventId: 'ffffffff-ffff-4fff-8fff-ffffffffffff', expectedRevision: 1, status: 'active', reason: 'Reinstating the draft for editing.' }));
  check(response.status, 201, 'Draft reinstated');
  check(await approve('teacher-a', ids.plants, draftPlants.id).then(item => item.approvedBy), 'teacher-a', 'Reinstated draft can be reviewed again');

  // Existing copies keep their provenance and now say the source is retired.
  usage = await (await call('usage', 'GET', 'teacher-a', ids.fractions)).json();
  check(usage.copies.length, 1, 'Retirement leaves the existing copies and their classes in place');
  check(usage.copies[0].assignments.length, 1, 'Retirement does not unassign classes');
  source = await (await call('resourceSource', 'GET', 'teacher-a', copyA.resource.id)).json();
  check([source.sources[0].lifecycle, source.sources[0].retiredReason, source.sources[0].referenceAvailable], ['retired', 'Replaced by the revised school scheme.', true], 'Author sees retirement and can open the reference');
  source = await (await call('resourceSource', 'GET', 'teacher-other', copyOther.resource.id)).json();
  check([source.sources[0].lifecycle, source.sources[0].referenceAvailable, source.sources[0].referenceVersion], ['retired', false, 1], 'A peer who copied earlier sees retirement but cannot open the reference');
  check((await (await call('resourceDetail', 'GET', 'teacher-other', copyOther.resource.id)).json()).latest.body, base.body, 'The copied resource text is untouched by retirement');

  // History and reinstatement.
  check((await call('status', 'GET', 'teacher-other', ids.fractions)).status, 404, 'Peer cannot read status history');
  for (const user of ['guardian-a', 'student-user-a']) check((await call('status', 'GET', user, ids.fractions)).status, 403, 'Family cannot read status history');
  response = await call('status', 'POST', 'admin-a', ids.fractions, event({ clientEventId: '99999999-9999-4999-8999-999999999999', expectedRevision: 1, status: 'active', reason: 'Scheme confirmed again by the department.' }));
  check(response.status, 201, 'An administrator reinstates a reference they did not author');
  const reinstated = await response.json();
  check([reinstated.event.revision, reinstated.status.state, reinstated.event.changedBy], [2, 'active', 'admin-a'], 'Reinstatement appended as revision two');
  check((await (await call('status', 'GET', 'teacher-a', ids.fractions)).json()).map(item => [item.revision, item.status, item.changedByName]), [[2, 'active', 'admin-a'], [1, 'retired', 'teacher-a']], 'History is newest first with names');
  check(await (await call('status', 'POST', 'teacher-a', ids.fractions, event())).json().then(item => item.status.state), 'active', 'Replaying the first retirement reports today\'s status and does not retire again');
  check(titles(await list('teacher-other')).includes('Synthetic fractions reference'), true, 'Reinstated reference is back for peers');
  response = await call('draft', 'POST', 'teacher-other', ids.fractions, { versionId: fractions.latest.id, type: 'quiz' });
  check(response.status, 201, 'Copying works again after reinstatement');
  response = await call('detail', 'PATCH', 'teacher-a', ids.fractions, { expectedVersion: 1, content: { ...base, title: 'Synthetic fractions reference' , body: 'Revised synthetic body.' } });
  check(response.status, 200, 'Revision works again after reinstatement');
  source = await (await call('resourceSource', 'GET', 'teacher-a', copyA.resource.id)).json();
  check([source.sources[0].referenceVersion, source.sources[0].latestReferenceVersion, source.sources[0].lifecycle], [1, 2, 'active'], 'Source shows the pinned version and that a newer one exists');

  // Immutability and concurrency at the database.
  for (const sql of ["UPDATE curriculum_reference_status_events SET reason='Rewritten history reason'", 'DELETE FROM curriculum_reference_status_events'])
    assert.throws(() => sqlite.exec(sql), /immutable/i), checks++;
  const racing = [['11111111-aaaa-4aaa-8aaa-111111111111', 'First racing retirement reason.'], ['22222222-bbbb-4bbb-8bbb-222222222222', 'Second racing retirement reason.']];
  const outcomes = await Promise.all(racing.map(([clientEventId, reason]) => call('status', 'POST', 'teacher-a', ids.fractions, event({ clientEventId, expectedRevision: 2, reason })).then(item => item.status)));
  check(outcomes.sort(), [201, 409], 'Two competing status changes at one revision have exactly one winner');
  check(sqlite.prepare('SELECT count(*) AS n FROM curriculum_reference_status_events WHERE reference_id=? AND revision=3').get(ids.fractions).n, 1, 'One revision-three event persisted');
  check(networkCalls, 0, 'No network call was made');
} finally { globalThis.fetch = originalFetch; sqlite.close(); }
console.log(`Curriculum library contract: ${checks} checks passed (actual authenticated routes and SQLite; retire/reinstate, filters, usage and attribution; synthetic only).`);
console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0 }));
