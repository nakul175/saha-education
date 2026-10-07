// FR-19/FR-20/FR-21: the external ORF launch handoff and its reviewed return path, proved against a
// LOCAL FAKE destination (tests/support/fake-orf-destination.mjs) and actual routes/SQLite. No real
// external site, provider or recipient is contacted; the only network peer is the loopback fake.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { get } from 'node:https';
import { bindings, freshDatabase, seedSecurityData, load } from '../support/security-db.mjs';
import { startFakeOrf } from '../support/fake-orf-destination.mjs';

const { db, schema, sqlite } = freshDatabase();
await seedSecurityData(db, schema);
const { createSession } = await load('lib/education/session.ts');
const registry = await load('app/api/external-apps/route.ts');
const launch = await load('app/api/external-apps/[id]/launch/route.ts');
const imports = await load('app/api/reading-imports/route.ts');
const decision = await load('app/api/reading-imports/[id]/decision/route.ts');
const readingChecksRoute = await load('app/api/reading-checks/route.ts');
const reviewRoute = await load('app/api/reading-review/route.ts');
const base = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = base;
bindings.SAHA_ORF_APP_URL = '';
const fake = await startFakeOrf();
const users = ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'guardian-a', 'student-user-a'];
const sessions = {};
for (const id of users) sessions[id] = (await createSession(id)).split(';')[0];
let checks = 0;
function check(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }
function request(path, user, method = 'GET', payload, headers = {}) {
  const init = { method, headers: { origin: base, ...headers } };
  if (user) init.headers.cookie = sessions[user];
  if (payload !== undefined) { init.body = JSON.stringify(payload); init.headers['content-type'] = 'application/json'; }
  return new Request(base + path, init);
}
const params = id => ({ params: Promise.resolve({ id }) });
const launchUrl = '/api/external-apps/oral-reading-fluency/launch';
const post = (user, payload) => launch.POST(request(launchUrl, user, 'POST', payload), params('oral-reading-fluency'));
const tableCounts = () => Object.fromEntries(sqlite.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%' ORDER BY name").all()
  .map(({ name }) => [name, sqlite.prepare(`SELECT count(*) n FROM "${name}"`).get().n]));
/** A person opening the returned link: a plain navigation with no Saha cookie and no referrer, as the page's link attributes require. */
function open(url) {
  const target = new URL(url);
  return new Promise((resolve, reject) => get({ host: target.hostname, port: target.port, path: target.pathname + target.search, rejectUnauthorized: false,
    headers: { 'user-agent': 'saha-test-browser', accept: 'text/html' } }, response => {
    const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
  }).on('error', reject));
}
const originalFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error('The application must never contact the destination or any other service'); };
try {
  // 1. Not configured, and every unsafe configuration, fails closed and never touches the destination.
  const beforeLaunches = tableCounts();
  let response = await registry.GET(request('/api/external-apps', 'teacher-a'));
  check((await response.json())[0].available, false, 'A blank destination reports the slot as not connected');
  check((await post('teacher-a')).status, 503, 'Blank destination: launch fails closed');
  for (const unsafe of ['http://127.0.0.1:' + fake.port + fake.basePath, fake.url + '?token=abc', fake.url + '#fragment', 'https://user:secret@127.0.0.1:' + fake.port + fake.basePath,
    fake.url + '/with space', 'ftp://127.0.0.1/x', 'javascript:alert(1)', '//127.0.0.1/x', 'https://127.0.0.1:' + fake.port + '\\reading']) {
    bindings.SAHA_ORF_APP_URL = unsafe;
    response = await post('admin-a');
    check(response.status, 503, 'Unsafe destination fails closed: ' + unsafe);
    check(await response.json(), { error: 'Service unavailable' }, 'The failure reveals no configuration detail');
    check((await (await registry.GET(request('/api/external-apps', 'admin-a'))).json())[0].available, false, 'Unsafe destination disables the slot');
  }
  check(fake.requests.length, 0, 'The unconfigured and unsafe cases never contacted the destination');

  // 2. A configured launch hands over the fixed URL and nothing else.
  bindings.SAHA_ORF_APP_URL = fake.url;
  const plain = await post('teacher-a');
  const plainText = await plain.text();
  check(plain.status, 200, 'Assigned staff launch the configured fake destination');
  check(JSON.parse(plainText), { url: fake.url, signIn: 'separate', resultSync: false }, 'The response is exactly the fixed URL with separate sign-in and no result sync');
  check(new URL(JSON.parse(plainText).url).search, '', 'The launch URL carries no query string');
  check(plain.headers.get('cache-control'), 'no-store', 'The destination is never cached');
  check(plain.headers.has('set-cookie'), false, 'Launch sets no cookie');
  check(plain.headers.has('location'), false, 'Launch performs no redirect');
  const withStudent = await post('teacher-a', { studentId: 'student-a' });
  check(await withStudent.text(), plainText, 'Learner context changes nothing in the handoff, byte for byte');
  check(await (await post('admin-a', { studentId: 'student-a' })).text(), plainText, 'Administrator launch with a learner is the same fixed handoff');
  for (const user of users.filter(id => id !== 'admin-a' && id !== 'teacher-a' && !id.startsWith('teacher-other') && id !== 'admin-b')) check((await post(user)).status, 403, 'Families cannot launch: ' + user);
  check((await post('teacher-a', { studentId: 'student-b' })).status, 404, 'A learner from another school cannot be named');
  check((await post('teacher-other', { studentId: 'student-a' })).status, 404, 'An unassigned teacher cannot name this learner');
  for (const forbidden of [{ url: 'https://attacker.example.invalid' }, { studentName: 'Private' }, { token: 'secret' }, { classId: 'class-a' }, { redirect: '/x' }]) {
    check((await post('teacher-a', forbidden)).status, 400, 'The launch accepts no destination or learner details: ' + Object.keys(forbidden)[0]);
  }
  check(tableCounts(), beforeLaunches, 'Registry and launch change no table in the education database');
  check(fake.requests.length, 0, 'Saha itself never contacted the destination during any launch');
  check(networkCalls, 0, 'The application made no outbound request');

  // 3. What the destination actually receives when a person follows the returned link.
  const opened = await open(JSON.parse(plainText).url);
  check(opened.status, 200, 'The fake destination serves its own page');
  check(fake.requests.length, 1, 'Following the link is the only request the destination ever received');
  const received = fake.requests[0];
  check([received.method, received.path, received.query], ['GET', fake.basePath, ''], 'The destination receives only its own fixed path and no query');
  for (const name of ['cookie', 'authorization', 'referer', 'origin', 'x-user-id', 'x-school-id', 'x-saha-session']) check(name in received.headers, false, 'No Saha context header reaches the destination: ' + name);
  const everything = JSON.stringify(received);
  for (const secret of [sessions['teacher-a'].split('=')[1], 'student-a', 'teacher-a', 'class-a', 'education.example.invalid', 'Synthetic school']) check(everything.includes(secret), false, 'The destination never sees: ' + secret);
  const page = readFileSync(new URL('../../app/external-apps/page.tsx', import.meta.url), 'utf8');
  for (const attribute of ['target="_blank"', 'rel="noopener noreferrer"', 'referrerPolicy="no-referrer"']) check(page.includes(attribute), true, 'The opening link carries ' + attribute);
  check(/launch'?,\s*\{method: 'POST', headers: \{'Content-Type': 'application\/json'\}, body: '\{\}'\}/.test(page), true, 'The page requests a launch with an empty body only');

  // 4. The destination cannot write into Saha: it has no session, and forged context grants nothing.
  const writeBack = { classId: 'class-a', studentId: 'student-a', language: 'en-IN', passageReference: 'Pushed by the fake app', readingDate: new Date().toISOString().slice(0, 10), durationSeconds: 60, wordsAttempted: 100, wordsCorrect: 90 };
  for (const forged of [{}, { 'x-user-id': 'teacher-a', 'x-school-id': 'a' }, { cookie: 'saha_demo_role=teacher' }, { authorization: 'Bearer fake-orf' }]) {
    check((await readingChecksRoute.POST(new Request(base + '/api/reading-checks', { method: 'POST', headers: { origin: fake.origin, 'content-type': 'application/json', ...forged }, body: JSON.stringify(writeBack) }))).status, 401, 'A result pushed from the destination is refused');
  }
  check(sqlite.prepare('SELECT count(*) n FROM reading_checks').get().n, 0, 'Nothing was recorded by the destination');

  // 5. The only way results return: an adult carries them into a normalized envelope, Saha stages an immutable preview,
  //    an educator reviews it, and only then are readings created.
  const today = new Date().toISOString().slice(0, 10);
  fake.setResults([{ externalReference: 'fake-result-1', studentId: 'student-a', language: 'en-IN', passageReference: 'Fake app passage A', readingDate: today, durationSeconds: 60, wordsAttempted: 100, wordsCorrect: 91 },
    { externalReference: 'fake-result-2', studentId: 'student-a', language: 'en-IN', passageReference: 'Fake app passage A', readingDate: '2026-09-01', durationSeconds: 60, wordsAttempted: 100, wordsCorrect: 84 }]);
  const exported = await fake.fetchExport();
  const envelope = { format: 'saha.reading-results.v1', classId: 'class-a', sourceLabel: 'Local fake ORF app', sourceReference: 'Fake export 1', rows: exported };
  const stage = (user, value = envelope, id = crypto.randomUUID()) => imports.POST(request('/api/reading-imports', user, 'POST', { clientImportId: id, envelope: value }));
  check((await stage('guardian-a')).status, 403, 'Families cannot stage results');
  check((await stage('student-user-a')).status, 403, 'Learners cannot stage results');
  check((await stage('teacher-other')).status, 404, 'An unassigned teacher cannot stage results for this class');
  check((await stage('teacher-a', { ...envelope, callbackUrl: fake.url })).status, 400, 'An envelope cannot carry a callback or fetch URL');
  check((await stage('teacher-a', { ...envelope, rows: [{ ...exported[0], studentName: 'Private Name' }] })).status, 400, 'Rows cannot carry learner names');
  check((await stage('teacher-a', { ...envelope, rows: [{ ...exported[0], studentId: 'student-b' }] })).status, 404, 'A learner from another school cannot be staged');
  check((await stage('teacher-a', { ...envelope, rows: [{ ...exported[0], studentId: 'student-other' }] })).status, 404, 'A learner not enrolled in this class cannot be staged');
  response = await stage('teacher-a');
  check(response.status, 201, 'The exported envelope stages as an immutable preview');
  const staged = await response.json();
  check(staged.draft.status, 'staged', 'The preview is staged, not confirmed');
  check(staged.items.map(item => [item.externalReference, item.wcpm, item.accuracy, item.eligible]), [['fake-result-1', 91, 91, true], ['fake-result-2', 84, 84, true]], 'The preview shows exact derived metrics and current eligibility');
  check(sqlite.prepare('SELECT count(*) n FROM reading_checks').get().n, 0, 'Staging created no reading');
  check(await (await reviewRoute.GET(request('/api/reading-review?classId=class-a', 'teacher-a'))).json().then(value => value.observations), [], 'Staged results are absent from reading review');
  const decide = (user, payload, id = staged.draft.id) => decision.POST(request('/api/reading-imports/' + id + '/decision', user, 'POST', payload), params(id));
  const confirmation = { clientDecisionId: crypto.randomUUID(), expectedRevision: 0, action: 'confirm', confirmReviewed: true, reason: 'Educator reviewed both fictional results.' };
  check((await decide('teacher-a', { ...confirmation, confirmReviewed: false })).status, 400, 'Confirmation without an explicit review is refused');
  check((await decide('teacher-a', { ...confirmation, reason: '' })).status, 400, 'Confirmation without a reason is refused');
  check((await decide('guardian-a', confirmation)).status, 403, 'Families cannot confirm');
  check(sqlite.prepare('SELECT count(*) n FROM reading_checks').get().n, 0, 'Refused decisions created no reading');
  response = await decide('teacher-a', confirmation);
  check(response.status, 200, 'The educator confirms the reviewed import');
  const confirmed = await response.json();
  check([confirmed.draft.status, confirmed.draft.reviewedBy, confirmed.items.every(item => item.receipt?.readingCheckId)], ['confirmed', 'teacher-a', true], 'Confirmation records the reviewer and a receipt per source result');
  check((await decide('teacher-a', confirmation)).status, 200, 'The exact decision retry is stable');
  check((await decide('teacher-a', { ...confirmation, clientDecisionId: crypto.randomUUID() })).status, 409, 'A different decision cannot change the outcome');
  const rows = sqlite.prepare('SELECT source_app_id, provenance, recorded_by, school_id FROM reading_checks ORDER BY reading_date').all();
  check(rows.map(row => [row.source_app_id, row.provenance, row.recorded_by, row.school_id]), [['oral-reading-fluency', 'manual-reviewed-external', 'teacher-a', 'a'], ['oral-reading-fluency', 'manual-reviewed-external', 'teacher-a', 'a']], 'Confirmed readings keep manual provenance and the reviewing educator');
  const reviewed = await (await reviewRoute.GET(request('/api/reading-review?classId=class-a', 'teacher-a'))).json();
  check(reviewed.observations.length, 2, 'Confirmed readings appear in reading review');
  check(reviewed.series.length, 1, 'Both confirmed readings form one exact-task series');
  check(reviewed.series[0].points.map(point => point.readingDate), ['2026-09-01', today], 'The series is chronological');
  // A source result can be consumed once; a replayed export cannot create duplicates.
  const replay = await (await stage('teacher-a', { ...envelope, sourceReference: 'Fake export 1 again' })).json();
  response = await decide('teacher-a', { ...confirmation, clientDecisionId: crypto.randomUUID() }, replay.draft.id);
  check(response.status, 409, 'Replaying the same exported results cannot create duplicate readings');
  check(sqlite.prepare('SELECT count(*) n FROM reading_checks').get().n, 2, 'No duplicate reading was created');
  response = await decide('teacher-a', { clientDecisionId: crypto.randomUUID(), expectedRevision: 0, action: 'reject', confirmReviewed: true, reason: 'Duplicate export; rejected after review.' }, replay.draft.id);
  check((await response.json()).draft.status, 'rejected', 'The duplicate draft can be rejected after review');
  check(sqlite.prepare('SELECT count(*) n FROM reading_checks').get().n, 2, 'Rejection created no reading');
  check(fake.requests.length, 2, 'The destination saw only the person following the link and the person downloading its export');
  check(fake.requests.map(item => item.path), [fake.basePath, fake.basePath + '/export'], 'No callback, webhook or sync request ever reached the destination');
  check(networkCalls, 0, 'The application made no outbound request during the whole return path');
  console.log(`External ORF handoff contract: ${checks} checks passed (actual routes/SQLite and a loopback fake destination; no real external site contacted).`);
  console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0 }));
} finally {
  globalThis.fetch = originalFetch;
  await fake.close();
  sqlite.close();
}
