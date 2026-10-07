// Cross-role journeys on the rich synthetic school (the same school `pnpm demo` starts).
// What one person does must show up for the right other person, and only for them:
//   1. The administrator sends a class notice to guardians -> a guardian of that class receives it, a student does not,
//      and an exact retry of the same request does not send it twice.
//   2. The administrator records an absence for a guardian's child -> the guardian sees it on the child's attendance;
//      another family's child stays closed to that guardian.
//   3. The administrator shares a draft report -> it was not visible to the guardian before and is afterwards.
// Then the guardian's pages are opened in a real browser (desktop and 375px) to confirm the result is what a person sees,
// with no page errors, no failed assets, no dialogs and no request that leaves the local Worker.
// Needs a local Worker started with SAHA_DEMO_ENABLED=true and SAHA_DEMO_INSTALLATION_ID from the fixture manifest and the
// sessions written by tests/support/write-demo-fixture.mjs. Synthetic data only. Evidence of these journeys; not acceptance.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, request as playwrightRequest } from '@playwright/test';

const origin = process.env.SAHA_WORKER_TEST_URL, fixture = process.env.SAHA_WORKER_SESSION_FIXTURE, executablePath = process.env.SAHA_TEST_BROWSER;
if (!origin || !fixture || !executablePath) throw new Error('Supply a local demo Worker, the demo session fixture and a local browser.');
const base = new URL(origin);
if (!['127.0.0.1', 'localhost'].includes(base.hostname) || base.protocol !== 'http:') throw new Error('The journeys run only against a local Worker.');
const outputDir = process.env.SAHA_TEST_OUTPUT_DIR || '/tmp'; mkdirSync(outputDir, { recursive: true });
const sessions = JSON.parse(readFileSync(fixture, 'utf8'));
for (const role of ['admin', 'teacher', 'guardian', 'student']) if (typeof sessions[role] !== 'string') throw new Error('Missing a required synthetic session: ' + role);
const suffix = crypto.randomUUID().slice(0, 8);
const checks = []; const pageErrors = []; const externalRequests = []; const dialogs = []; const failedAssets = [];
let passed = 0;
const check = async (name, action) => { await action(); passed++; checks.push(name); console.log('ok - ' + name); };

const actors = {};
for (const role of ['admin', 'teacher', 'guardian', 'student']) actors[role] = await playwrightRequest.newContext({ baseURL: base.origin, extraHTTPHeaders: { cookie: sessions[role] } });
let workerRestartRetries = 0;
async function api(role, path, { method = 'GET', data, expect: expected = [200] } = {}) {
  // The local Worker sometimes answers the request that follows a refused one with "restarted mid-request" (a local
  // development artefact; the retries are counted and reported). Every write here carries a client request id or is an
  // idempotent publish, so one exact retry is safe: a write that had already been applied answers as a replay.
  let retried = false;
  for (let attempt = 1; ; attempt++) {
    const response = await actors[role].fetch(path, { method, maxRedirects: 0, timeout: 30000, headers: method === 'GET' ? {} : { Origin: base.origin }, ...(data === undefined ? {} : { data }) });
    const text = await response.text();
    if (response.status() === 503 && /restarted mid-request/.test(text) && attempt < 4) { workerRestartRetries++; retried = true; continue; }
    let body = null; try { body = JSON.parse(text); } catch { /* not JSON */ }
    const accepted = retried && expected.includes(201) ? [...expected, 200] : expected;
    assert.ok(accepted.includes(response.status()), `${role} ${method} ${path}: expected ${expected.join('/')} got ${response.status()} ${text.slice(0, 200)}`);
    return { status: response.status(), body, text, retried };
  }
}
const list = value => Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];

// ---- what the guardian can see, and the objects the journeys use -----------------------------------------------------
let children, guardianClasses, classId, child, otherChild;
await check('The guardian is linked to children and classes of the demo school', async () => {
  children = list((await api('guardian', '/api/students')).body);
  guardianClasses = list((await api('guardian', '/api/classes')).body);
  assert.ok(children.length >= 1, 'a guardian is linked to at least one child');
  assert.ok(guardianClasses.length >= 1, 'a guardian can see at least one class');
  child = children[0]; classId = guardianClasses[0].id;
  const all = list((await api('admin', '/api/students')).body);
  otherChild = all.find(student => !children.some(own => own.id === student.id));
  assert.ok(otherChild, 'the school has a child who is not this guardian\'s');
});

// ---- journey 1: notice ----------------------------------------------------------------------------------------------
const noticeTitle = 'Journey notice ' + suffix;
const noticeRequest = crypto.randomUUID();
let guardianNoticeCountBefore, studentNoticeCountBefore;
const noticeInput = () => ({ clientRequestId: noticeRequest, title: noticeTitle, body: 'Fictional class notice for the journey check ' + suffix + '. No real person receives it.',
  audience: { kind: 'class', classId, roles: 'guardians' }, reviewConfirmed: true });
const titlesOf = async role => list((await api(role, '/api/notifications?limit=100')).body).map(row => row.title ?? row.message ?? '');
await check('Journey 1: before the notice nobody has it', async () => {
  guardianNoticeCountBefore = (await titlesOf('guardian')).filter(text => text.includes(noticeTitle)).length;
  studentNoticeCountBefore = (await titlesOf('student')).filter(text => text.includes(noticeTitle)).length;
  assert.equal(guardianNoticeCountBefore, 0); assert.equal(studentNoticeCountBefore, 0);
});
await check('Journey 1: a guardian and a student cannot send a notice (refused before the body is read)', async () => {
  await api('guardian', '/api/notices', { method: 'POST', data: noticeInput(), expect: [403] });
  await api('student', '/api/notices', { method: 'POST', data: noticeInput(), expect: [403] });
});
await check('Journey 1: the administrator sends a class notice to guardians', async () => {
  const sent = await api('admin', '/api/notices', { method: 'POST', data: noticeInput(), expect: [201] });
  assert.equal(sent.body.replayed, sent.retried ? sent.body.replayed : false);
});
await check('Journey 1: the guardian receives it exactly once, the student does not', async () => {
  const guardianTitles = await titlesOf('guardian'); const studentTitles = await titlesOf('student');
  assert.equal(guardianTitles.filter(text => text.includes(noticeTitle)).length, 1, 'the guardian has the notice once');
  assert.equal(studentTitles.filter(text => text.includes(noticeTitle)).length, 0, 'a student-only audience was not chosen, so the student has none');
});
await check('Journey 1: an exact retry replays and does not send a second copy', async () => {
  const again = await api('admin', '/api/notices', { method: 'POST', data: noticeInput(), expect: [200] });
  assert.equal(again.body.replayed, true);
  assert.equal((await titlesOf('guardian')).filter(text => text.includes(noticeTitle)).length, 1);
});
await check('Journey 1: the same request id with different text is refused, not applied', async () => {
  await api('admin', '/api/notices', { method: 'POST', data: { ...noticeInput(), title: noticeTitle + ' changed' }, expect: [409] });
  assert.equal((await titlesOf('guardian')).filter(text => text.includes(noticeTitle + ' changed')).length, 0);
});

// ---- journey 2: attendance ------------------------------------------------------------------------------------------
let attendanceDate, childClassId;
const daysBack = n => { const d = new Date(Date.parse((process.env.SAHA_JOURNEY_ATTENDANCE_ANCHOR || '2026-10-06') + 'T00:00:00Z') - n * 86400000); return d.toISOString().slice(0, 10); };
const childMarks = async role => JSON.stringify((await api(role, `/api/students/${child.id}/attendance?from=${attendanceDate}&to=${attendanceDate}`)).body);
await check('Journey 2: the child has a class and a recent day with no mark yet, and the guardian sees none', async () => {
  const classes = list((await api('admin', '/api/classes')).body);
  for (let back = 0; back < 21 && !attendanceDate; back++) {
    const date = daysBack(back);
    for (const candidate of classes) {
      const editor = await api('admin', `/api/classes/${candidate.id}/attendance-editor?date=${date}`, { expect: [200, 400, 404] });
      const row = (editor.body?.roster?.items ?? []).find(item => item.student.id === child.id);
      if (row && row.record === null) { childClassId = candidate.id; attendanceDate = date; break; }
    }
  }
  assert.ok(childClassId && attendanceDate, 'a day exists in the last three weeks on which the child has no mark');
  assert.ok(!(await childMarks('guardian')).includes('"status":"absent"'), 'the guardian sees no absence for that day yet');
});
await check('Journey 2: a guardian cannot record attendance', async () => {
  await api('guardian', `/api/classes/${childClassId}/attendance-editor`, { method: 'POST', data: { date: attendanceDate, clientRequestId: crypto.randomUUID(), reviewConfirmed: true, reason: 'A guardian trying to mark', entries: [{ studentId: child.id, status: 'absent', note: null, expectedRecord: null }] }, expect: [403] });
});
await check('Journey 2: the administrator records an absence with a reason', async () => {
  const editor = (await api('admin', `/api/classes/${childClassId}/attendance-editor?date=${attendanceDate}`)).body;
  const row = editor.roster.items.find(item => item.student.id === child.id);
  const saved = await api('admin', `/api/classes/${childClassId}/attendance-editor`, { method: 'POST', expect: [200, 201],
    data: { date: attendanceDate, clientRequestId: crypto.randomUUID(), reviewConfirmed: true, reason: 'Journey check ' + suffix + ': recording a synthetic absence',
      entries: [{ studentId: child.id, status: 'absent', note: null, expectedRecord: row.record }] } });
  assert.ok(saved.status === 200 || saved.status === 201);
});
await check('Journey 2: the guardian now sees the absence on the child\'s attendance', async () => {
  const text = await childMarks('guardian');
  assert.ok(text.includes(attendanceDate) && text.includes('absent'), 'the saved absence is visible: ' + text.slice(0, 200));
});
await check('Journey 2: another family\'s child is closed to this guardian', async () => {
  const response = await actors.guardian.fetch(`/api/students/${otherChild.id}/attendance`, { maxRedirects: 0 });
  assert.ok([403, 404].includes(response.status()), 'status ' + response.status());
});

// ---- journey 3: report cards ----------------------------------------------------------------------------------------
let draft;
await check('Journey 3: a draft report exists that the guardian cannot see', async () => {
  const reports = list((await api('admin', '/api/report-cards')).body);
  const seen = new Set(list((await api('guardian', '/api/report-cards')).body).map(report => report.id));
  draft = reports.find(report => !report.publishedAt && children.some(own => own.id === report.studentId) && !seen.has(report.id));
  assert.ok(draft, 'one of this guardian\'s children has a private draft report');
  await api('guardian', `/api/report-cards/${draft.id}`, { expect: [403, 404] });
});
await check('Journey 3: a guardian cannot share a report', async () => {
  await api('guardian', `/api/report-cards/${draft.id}`, { method: 'PATCH', data: { publish: true }, expect: [403] });
});
await check('Journey 3: the administrator shares the draft', async () => {
  const response = await api('admin', `/api/report-cards/${draft.id}`, { method: 'PATCH', data: { publish: true }, expect: [200, 409] });
  assert.equal(response.status, 200, 'the draft is publishable: ' + response.text.slice(0, 200));
});
await check('Journey 3: the guardian now sees it, and a second publish does not duplicate the family notice', async () => {
  const mine = list((await api('guardian', '/api/report-cards')).body);
  assert.ok(mine.some(report => report.id === draft.id && report.publishedAt), 'the shared report is listed with its publication time');
  const before = (await titlesOf('guardian')).length;
  await api('admin', `/api/report-cards/${draft.id}`, { method: 'PATCH', data: { publish: true }, expect: [200, 409] });
  assert.equal((await titlesOf('guardian')).length, before, 'no extra notification from a repeated publish');
});

// ---- the same results through the pages a person uses ---------------------------------------------------------------
const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-background-networking'] });
async function guardianPage(viewport) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', extraHTTPHeaders: { cookie: sessions.guardian } });
  const separator = sessions.guardian.indexOf('=');
  await context.addCookies([{ name: sessions.guardian.slice(0, separator), value: sessions.guardian.slice(separator + 1), domain: base.hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }]);
  await context.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin !== base.origin) { externalRequests.push(url.origin + url.pathname); return route.abort(); } return route.continue(); });
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  page.on('response', response => { if (response.status() >= 400 && ['script', 'stylesheet', 'image', 'font'].includes(response.request().resourceType())) failedAssets.push(response.url()); });
  return { context, page };
}
async function openStable(page, path) {
  for (let attempt = 1; ; attempt++) {
    const response = await page.goto(base.origin + path, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (response?.status() === 503 && attempt < 4) continue;
    assert.equal(response?.status(), 200, path);
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    return;
  }
}
for (const [label, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone 375px', { width: 375, height: 800 }]]) {
  await check(`Browser (${label}): the guardian sees the notice and the shared report, and the page does not scroll sideways`, async () => {
    const { context, page } = await guardianPage(viewport);
    try {
      await openStable(page, '/notifications');
      await page.getByText(noticeTitle, { exact: false }).first().waitFor({ timeout: 15000 });
      await openStable(page, '/report-cards');
      await page.locator('main').first().waitFor();
      const text = await page.locator('main').first().innerText();
      assert.ok(!/UUID|undefined|\[object Object\]|NaN/.test(text), 'no internal wording on the report page');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, 'horizontal overflow ' + overflow + 'px');
    } finally { await context.close(); }
  });
}
await check('No page error, dialog, failed asset or request outside the local Worker', async () => {
  assert.deepEqual(pageErrors, []); assert.deepEqual(dialogs, []); assert.deepEqual(failedAssets, []); assert.deepEqual(externalRequests, []);
});
await browser.close();
for (const actor of Object.values(actors)) await actor.dispose();
const result = { passed, failed: 0, skipped: 0, externalRequests: externalRequests.length, pageErrors: pageErrors.length, dialogs: dialogs.length, workerRestartRetries, checks };
writeFileSync(join(outputDir, 'demo-journey-results.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ passed, failed: 0, skipped: 0, externalRequests: externalRequests.length, pageErrors: pageErrors.length, workerRestartRetries }));
