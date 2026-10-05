// Run against an isolated localhost Worker using only synthetic sessions.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const origin = process.env.SAHA_WORKER_TEST_URL;
const fixture = process.env.SAHA_WORKER_SESSION_FIXTURE;
if (!origin || !fixture || !['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Local origin and synthetic session fixture required.');
const cookies = JSON.parse(readFileSync(fixture, 'utf8'));
const request = (path, user, method = 'GET', value, suppliedOrigin = origin) => fetch(new URL(path, origin), {
  method, redirect: 'manual', headers: { ...(user ? {cookie: cookies[user]} : {}),
    ...(method !== 'GET' ? {origin: suppliedOrigin, 'content-type': 'application/json'} : {}) },
  ...(value === undefined ? {} : {body: JSON.stringify(value)}),
});
const content = {title: 'Synthetic fraction worksheet', type: 'worksheet', curriculum: 'Synthetic pilot curriculum',
  gradeLevel: '8', subject: 'Mathematics', language: 'en-IN', objectives: 'Represent halves.',
  body: 'Draw two halves of a rectangle.', teacherNotes: 'PRIVATE_TEACHER_NOTE', answerKey: 'PRIVATE_ANSWER_KEY'};
const clientResourceId = crypto.randomUUID();
const tests = [];
const test = (name, run) => tests.push({name, run});
let resource; let first; let second;
test('Anonymous resources denied', async () => assert.equal((await request('/api/resources')).status, 401));
test('Anonymous assignments denied', async () => assert.equal((await request('/api/resource-assignments')).status, 401));
for (const role of ['student-user-a', 'guardian-a']) test('Family draft list denied ' + role, async () => assert.equal((await request('/api/resources', role)).status, 403));
test('Origin mismatch write denied', async () => assert.equal((await request('/api/resources', 'teacher-a', 'POST', {content}, 'https://foreign.example.invalid')).status, 403));
test('Staff create scoped draft', async () => {
  const response = await request('/api/resources', 'teacher-a', 'POST', {content, clientResourceId});
  assert.equal(response.status, 201); assert.equal(response.headers.get('cache-control'), 'no-store');
  resource = await response.json(); first = resource.latest;
  assert.equal(resource.schoolId, 'a'); assert.equal(resource.authorId, 'teacher-a'); assert.equal(first.version, 1); assert.equal(first.approvedAt, null);
});
test('Create retry returns the same resource', async () => {
  const response = await request('/api/resources', 'teacher-a', 'POST', {content, clientResourceId});
  assert.equal(response.status, 201); assert.equal((await response.json()).id, resource.id);
});
test('Cross-school draft denied', async () => assert.equal((await request('/api/resources/' + resource.id, 'admin-b')).status, 404));
test('Another teacher draft denied', async () => assert.equal((await request('/api/resources/' + resource.id, 'teacher-other')).status, 404));
test('Cannot assign an unapproved version', async () => assert.equal((await request('/api/resources/' + resource.id + '/assign', 'teacher-a', 'POST', {versionId: first.id, classId: 'class-a'})).status, 400));
test('Approve exact draft version', async () => {
  const response = await request('/api/resources/' + resource.id + '/approve', 'teacher-a', 'POST', {versionId: first.id});
  assert.equal(response.status, 200); assert.equal((await response.json()).approvedBy, 'teacher-a');
});
test('Approval retry is safe', async () => assert.equal((await request('/api/resources/' + resource.id + '/approve', 'teacher-a', 'POST', {versionId: first.id})).status, 200));
test('Cannot assign to unrelated class', async () => assert.equal((await request('/api/resources/' + resource.id + '/assign', 'teacher-a', 'POST', {versionId: first.id, classId: 'class-other'})).status, 404));
let assignment;
test('Assign approved version to authorized class', async () => {
  const response = await request('/api/resources/' + resource.id + '/assign', 'teacher-a', 'POST', {versionId: first.id, classId: 'class-a'});
  assert.equal(response.status, 201); assignment = await response.json(); assert.equal(assignment.versionId, first.id);
});
test('Assignment retry is safe', async () => {
  const response = await request('/api/resources/' + resource.id + '/assign', 'teacher-a', 'POST', {versionId: first.id, classId: 'class-a'});
  assert.equal(response.status, 201); assert.equal((await response.json()).id, assignment.id);
});
test('Student gets approved content without teacher material', async () => {
  const response = await request('/api/resource-assignments', 'student-user-a'); assert.equal(response.status, 200);
  const rows = await response.json(); const row = rows.find(item => item.id === assignment.id); assert.ok(row);
  assert.equal(row.resource.body, content.body); assert.equal(Object.hasOwn(row.resource, 'teacherNotes'), false); assert.equal(Object.hasOwn(row.resource, 'answerKey'), false);
  assert.equal(JSON.stringify(rows).includes('PRIVATE_'), false);
});
test('Guardian assignments are not published yet', async () => assert.equal((await request('/api/resource-assignments', 'guardian-a')).status, 403));
test('Append revision without replacing approved version', async () => {
  const response = await request('/api/resources/' + resource.id, 'teacher-a', 'PATCH', {expectedVersion: 1, content: {...content, body: 'Draw four quarters.'}});
  assert.equal(response.status, 200); second = (await response.json()).latest; assert.equal(second.version, 2); assert.equal(second.approvedAt, null);
});
test('Stale revision conflicts safely', async () => assert.equal((await request('/api/resources/' + resource.id, 'teacher-a', 'PATCH', {expectedVersion: 1, content})).status, 409));
test('Assigned version stays unchanged after revision', async () => {
  const response = await request('/api/resource-assignments', 'student-user-a'); const rows = await response.json();
  const row = rows.find(item => item.id === assignment.id); assert.equal(row.resource.body, content.body); assert.equal(row.versionId, first.id);
});
test('Version history preserves approval and content', async () => {
  const response = await request('/api/resources/' + resource.id + '/versions', 'teacher-a'); assert.equal(response.status, 200);
  const rows = await response.json(); assert.equal(rows.length, 2); assert.equal(rows.find(row => row.id === first.id).approvedBy, 'teacher-a');
  assert.equal(rows.find(row => row.id === second.id).approvedAt, null);
});
test('Student cannot fetch staff draft detail', async () => assert.equal((await request('/api/resources/' + resource.id, 'student-user-a')).status, 403));
test('Injected author rejected', async () => assert.equal((await request('/api/resources', 'teacher-a', 'POST', {content, authorId: 'admin-a'})).status, 400));
let passed = 0; let failed = 0;
for (const {name, run} of tests) {
  try { await run(); passed++; console.log('ok - ' + name); }
  catch (error) { failed++; console.error('not ok - ' + name + ': ' + error.message); }
}
console.log(JSON.stringify({passed, failed, skipped: 0})); process.exitCode = failed ? 1 : 0;
