// Run only against isolated localhost workerd/D1 with synthetic session fixtures.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const origin = process.env.SAHA_WORKER_TEST_URL;
const fixture = process.env.SAHA_WORKER_SESSION_FIXTURE;
if (!origin || !fixture) throw new Error('Set local test origin and synthetic session fixture.');
const target = new URL(origin);
if (!['localhost', '127.0.0.1'].includes(target.hostname))
  throw new Error('This check only permits localhost.');
const cookies = JSON.parse(readFileSync(fixture, 'utf8'));
const request = (path, user, method = 'GET', value, suppliedOrigin = origin) =>
  fetch(new URL(path, origin), {
    method,
    redirect: 'manual',
    headers: {
      ...(user ? { cookie: cookies[user] } : {}),
      ...(method !== 'GET' ? { origin: suppliedOrigin, 'content-type': 'application/json' } : {}),
    },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }),
  });
const reading = {
  clientCheckId: crypto.randomUUID(),
  classId: 'class-a',
  studentId: 'student-a',
  language: 'en-IN',
  passageReference: 'Synthetic reading passage',
  readingDate: new Date().toISOString().slice(0, 10),
  durationSeconds: 45,
  wordsAttempted: 40,
  wordsCorrect: 36,
};
const tests = [];
const test = (name, run) => tests.push({ name, run });
for (const path of ['/api/reading-checks', '/api/external-apps'])
  test('Anonymous denied ' + path, async () => assert.equal((await request(path)).status, 401));
test('Anonymous reading write denied', async () =>
  assert.equal((await request('/api/reading-checks', null, 'POST', reading)).status, 401));
test('Anonymous app launch denied', async () =>
  assert.equal(
    (await request('/api/external-apps/oral-reading-fluency/launch', null, 'POST', {})).status,
    401,
  ));
for (const user of ['guardian-a', 'student-user-a']) {
  test('Family reading history denied ' + user, async () =>
    assert.equal((await request('/api/reading-checks', user)).status, 403),
  );
  test('Family reading recording denied ' + user, async () =>
    assert.equal((await request('/api/reading-checks', user, 'POST', reading)).status, 403),
  );
  test('Family app launch denied ' + user, async () =>
    assert.equal(
      (await request('/api/external-apps/oral-reading-fluency/launch', user, 'POST', {})).status,
      403,
    ),
  );
}
test('Unassigned teacher recording denied', async () =>
  assert.equal((await request('/api/reading-checks', 'teacher-other', 'POST', reading)).status, 404));
test('Cross-school recording denied', async () =>
  assert.equal((await request('/api/reading-checks', 'admin-b', 'POST', reading)).status, 404));
test('Foreign-origin recording denied', async () =>
  assert.equal(
    (await request('/api/reading-checks', 'teacher-a', 'POST', reading, 'https://attacker.example.invalid'))
      .status,
    403,
  ));
let saved;
test('Assigned teacher can save and receive derived metrics', async () => {
  const response = await request('/api/reading-checks', 'teacher-a', 'POST', reading);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  saved = await response.json();
  assert.equal(saved.wcpm, 48);
  assert.equal(saved.accuracy, 90);
  assert.equal(saved.recordedBy, 'teacher-a');
  assert.equal(saved.schoolId, 'a');
  assert.equal(saved.sourceAppId, 'oral-reading-fluency');
  assert.equal(saved.provenance, 'manual-reviewed-external');
});
test('Same-key retry creates no duplicate', async () => {
  const response = await request('/api/reading-checks', 'teacher-a', 'POST', reading);
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), saved);
});
test('Changed retry is a safe conflict', async () => {
  const response = await request('/api/reading-checks', 'teacher-a', 'POST', {
    ...reading,
    wordsCorrect: 35,
  });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'Reading check conflict' });
});
for (const user of ['teacher-a', 'admin-a'])
  test('Authorized staff scoped reading history ' + user, async () => {
    const response = await request('/api/reading-checks?studentId=student-a&classId=class-a', user);
    assert.equal(response.status, 200);
    const readings = await response.json();
    assert.equal(readings.filter((record) => record.id === reading.clientCheckId).length, 1);
  });
for (const user of ['admin-b', 'teacher-other'])
  test('Foreign/unassigned staff cannot see reading ' + user, async () => {
    const response = await request('/api/reading-checks?studentId=student-a', user);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), []);
  });
test('Submitted calculated scores are rejected', async () =>
  assert.equal(
    (await request('/api/reading-checks', 'teacher-a', 'POST', { ...reading, accuracy: 100 })).status,
    400,
  ));
test('Unconfigured application fails closed', async () => {
  const response = await request('/api/external-apps/oral-reading-fluency/launch', 'teacher-a', 'POST', {});
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Service unavailable' });
});
test('Registry accurately reports disabled launch-only integration', async () => {
  const response = await request('/api/external-apps', 'admin-a');
  assert.equal(response.status, 200);
  const [app] = await response.json();
  assert.equal(app.id, 'oral-reading-fluency');
  assert.equal(app.available, false);
  assert.equal(app.resultSync, false);
  assert.equal(Object.hasOwn(app, 'url'), false);
});
let passed = 0;
let failed = 0;
for (const { name, run } of tests) {
  try {
    await run();
    passed++;
    console.log('ok - ' + name);
  } catch (error) {
    failed++;
    console.error('not ok - ' + name + ': ' + error.message);
  }
}
console.log(JSON.stringify({ passed, failed, skipped: 0 }));
process.exitCode = failed ? 1 : 0;
