// Mounted browser procedure for the reviewed course / class / enrolment pages (FR-07, FR-08).
// Local built Worker + isolated synthetic D1 only. Offline: every non-local request is aborted and counted.
// Reviewed changes are real; a lost reply is modelled by letting a request reach the Worker and dropping its response.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, expect as baseExpect } from '@playwright/test';
const expect = baseExpect.configure({ timeout: 10000 });
const origin = process.env.SAHA_WORKER_TEST_URL, fixture = process.env.SAHA_WORKER_SESSION_FIXTURE, executablePath = process.env.SAHA_TEST_BROWSER;
const outputDir = process.env.SAHA_TEST_OUTPUT_DIR || '/tmp';
if (!origin || !fixture || !executablePath) throw new Error('Supply a local built Worker, private synthetic sessions and local browser.');
const base = new URL(origin);
if (!['127.0.0.1', 'localhost'].includes(base.hostname) || !['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('Course/enrolment browser checks require the local Worker origin only.');
mkdirSync(outputDir, { recursive: true });
const sessions = JSON.parse(readFileSync(fixture, 'utf8'));
const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-background-networking'] });
const owners = new Map(), contexts = [], pageErrors = [], externalRequests = [], failedResources = [], checks = [], screenshots = [], dialogs = [];
let passed = 0;
const suffix = crypto.randomUUID().slice(0, 8), today = new Date().toISOString().slice(0, 10);
const failures = [], pendingRequests = new Set();
const check = async (name, action) => { const began = Date.now(); try { await action(); passed++; checks.push(name); console.log('ok - ' + name + ' (' + (Date.now() - began) + ' ms)'); } catch (error) { failures.push(name); console.log('not ok - ' + name + ': ' + String(error?.message ?? error).split('\n').slice(0, 8).join(' | ').slice(0, 900)); await diagnose(); } };
const diagnose = async () => { console.log('  requests still pending: ' + JSON.stringify([...pendingRequests].map(request => request.method() + ' ' + new URL(request.url()).pathname)).slice(0, 600)); for (const value of contexts) for (const open of value.pages()) { if (!open.url().startsWith(base.origin)) continue; try { const text = await Promise.race([open.locator('[role=alert],[role=status]').allInnerTexts(), new Promise((_, reject) => setTimeout(() => reject(new Error('unresponsive')), 4000))]); console.log('  screen ' + new URL(open.url()).pathname + ' notices: ' + JSON.stringify(text).slice(0, 500)); } catch { console.log('  screen unreadable'); } } };
async function context(user) {
  if (user && typeof sessions[user] !== 'string') throw new Error('Missing a required synthetic session: ' + user);
  const value = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Pacific/Kiritimati', serviceWorkers: 'block', extraHTTPHeaders: user ? { cookie: sessions[user] } : {} });
  if (user) { const separator = sessions[user].indexOf('='); await value.addCookies([{ name: sessions[user].slice(0, separator), value: sessions[user].slice(separator + 1), domain: base.hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }]); }
  value.setDefaultTimeout(15000); contexts.push(value); owners.set(value, user);
  value.on('request', request => pendingRequests.add(request)); value.on('requestfinished', request => pendingRequests.delete(request)); value.on('requestfailed', request => pendingRequests.delete(request));
  value.on('page', page => {
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('dialog', dialog => { dialogs.push(dialog.type()); void dialog.dismiss(); });
    page.on('response', response => { if (response.status() >= 400 && ['script', 'stylesheet'].includes(response.request().resourceType())) failedResources.push({ path: new URL(response.url()).pathname, status: response.status() }); });
  });
  await value.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin === base.origin) return route.continue(); externalRequests.push({ origin: url.origin, pathname: url.pathname }); return route.abort(); });
  return value;
}
async function api(value, path, method = 'GET', data, expected = 200) {
  const url = new URL(path, base); if (url.origin !== base.origin || url.username || url.password) throw new Error('Synthetic requests must remain local.');
  let response;
  try { response = await value.request.fetch(url.href, { method, timeout: 15000, maxRedirects: 0, headers: { cookie: sessions[owners.get(value)] ?? '', ...(method === 'GET' ? {} : { Origin: base.origin }) }, ...(data === undefined ? {} : { data }) }); }
  catch { throw new Error('Local API transport failed: ' + url.pathname); }
  assert.equal(response.status(), expected, 'Local API status: ' + method + ' ' + path); return response.json();
}
async function goto(page, path) {
  const response = await page.goto(base.origin + path, { waitUntil: 'networkidle', timeout: 45000 }); assert.equal(response?.status(), 200); return response;
}
async function labelsAndWidth(page) {
  const missing = await page.locator('input:not([type=hidden]),select,textarea').evaluateAll(items => items.filter(item => !item.labels?.length && !item.getAttribute('aria-label') && !item.getAttribute('aria-labelledby')).length);
  assert.equal(missing, 0, 'Every control is labelled');
  const width = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth })); assert.ok(width.scroll <= width.viewport + 1, 'No horizontal overflow: ' + JSON.stringify(width));
}
async function noRawIds(page) {
  const text = await page.locator('main, body').first().innerText();
  assert.doesNotMatch(text, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, 'No raw record identifier is shown');
  assert.doesNotMatch(text, /[{]\s*"[a-zA-Z]+"\s*:/, 'No raw JSON is shown');
}
async function shot(page, name) { const path = join(outputDir, 'courses-enrolment-' + name + '.png'); await page.screenshot({ path, fullPage: true }); screenshots.push(path); }
const reasonField = page => page.getByLabel(/^Reason/);
const status = (page, text) => expect(page.getByRole('status').filter({ hasText: text }).first()).toBeVisible();
try {
  const admin = await context('admin-a'), teacher = await context('teacher-a'), newTeacher = await context('teacher-new'), otherTeacher = await context('teacher-other');
  const family = await context('guardian-a'), learner = await context('student-user-a'), foreignFamily = await context('guardian-other'), anon = await context(null);
  const as = value => ({ get: (path, expected) => api(value, path, 'GET', undefined, expected), post: (path, data, expected) => api(value, path, 'POST', data, expected) });
  const adminApi = as(admin), teacherApi = as(teacher), newTeacherApi = as(newTeacher);
  const page = await admin.newPage();

  // ---- Hub and course lifecycle
  await goto(page, '/academic');
  await check('Administrator hub lists courses and classes with plain-language links and no raw ids', async () => {
    await expect(page.getByRole('heading', { name: 'Courses, classes and enrolments', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add a course' })).toBeVisible(); await expect(page.getByRole('link', { name: 'Add a class' })).toBeVisible(); await expect(page.getByRole('link', { name: 'Enrolment history' }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Courses', exact: true })).toBeVisible(); await noRawIds(page); await labelsAndWidth(page);
  });
  const code = 'CE-' + suffix, title = 'Synthetic Reviewed Science ' + suffix;
  await goto(page, '/courses/new');
  let courseId;
  await check('Reviewed course creation succeeds, is idempotent on a double click and links to the saved course', async () => {
    await page.getByLabel('Course code').fill(code); await page.getByLabel('Course title').fill(title); await page.getByLabel('Description (optional)').fill('Plain synthetic description'); await page.getByLabel('Grade level').fill('8');
    const posted = []; page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/academic-changes') posted.push(request); });
    await page.getByRole('button', { name: 'Add course' }).dblclick();
    await status(page, 'saved'); await expect(page.getByRole('link', { name: 'Open course ' + title })).toBeVisible();
    assert.equal(posted.length, 1, 'One request despite a double click');
    const found = (await adminApi.get('/api/courses')).filter(row => row.code === code); assert.equal(found.length, 1); courseId = found[0].id;
    await noRawIds(page);
  });
  await check('A course code that is already used is refused in plain language and nothing is added', async () => {
    await page.getByLabel('Course code').fill(code); await page.getByLabel('Course title').fill('Duplicate code'); await page.getByLabel('Grade level').fill('8');
    await page.getByRole('button', { name: 'Add course' }).click();
    await expect(page.getByRole('alert')).toContainText('That course code is already in use'); await expect(page.getByRole('alert')).toContainText('Nothing was saved');
    assert.equal((await adminApi.get('/api/courses')).filter(row => row.code === code).length, 1);
  });
  await goto(page, '/courses/' + courseId);
  await check('Course detail edit needs a reason, saves, and records history for administrators', async () => {
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    await page.getByLabel('Course title').fill(title + ' II'); await expect(page.getByRole('button', { name: 'Save course changes' })).toBeDisabled();
    await reasonField(page).fill('Renamed for clarity'); await expect(page.getByRole('button', { name: 'Save course changes' })).toBeEnabled(); await page.getByRole('button', { name: 'Save course changes' }).click();
    await status(page, 'Course edit saved'); await expect(page.getByRole('heading', { name: title + ' II', level: 1 })).toBeVisible();
    await expect(page.getByText('Edited course ' + title + ' II')).toBeVisible(); await expect(page.getByText('Reason: Renamed for clarity')).toBeVisible(); await noRawIds(page);
  });
  await check('A stale second window gets a plain conflict message and cannot overwrite the newer edit', async () => {
    const second = await admin.newPage(); await goto(second, '/courses/' + courseId);
    await page.getByLabel('Course title').fill(title + ' III'); await reasonField(page).fill('Second rename'); await page.getByRole('button', { name: 'Save course changes' }).click(); await status(page, 'Course edit saved');
    await second.getByLabel('Course title').fill(title + ' stale overwrite'); await reasonField(second).fill('Stale attempt'); await second.getByRole('button', { name: 'Save course changes' }).click();
    await expect(second.getByRole('alert')).toContainText('This record changed since you opened it'); await expect(second.getByRole('alert')).toContainText('Nothing was saved');
    assert.equal((await adminApi.get('/api/courses')).find(row => row.id === courseId).title, title + ' III'); await second.close();
  });
  await check('Retiring a course hides it from new classes while reinstatement restores it', async () => {
    await page.reload({ waitUntil: 'networkidle' }); await reasonField(page).fill('No longer offered this term'); await page.getByRole('button', { name: 'Retire this course' }).click();
    await status(page, 'Course retirement saved'); await expect(page.getByText('This course is retired.')).toBeVisible(); await expect(page.getByRole('button', { name: 'Reinstate this course' })).toBeVisible();
    const shown = await admin.newPage(); await goto(shown, '/classes/new'); assert.equal(await shown.locator('#new-class-course option', { hasText: title }).count(), 0, 'Retired course is not selectable'); await shown.close();
    await reasonField(page).fill('Offered again'); await page.getByRole('button', { name: 'Reinstate this course' }).click(); await status(page, 'Course reinstatement saved');
    const again = await admin.newPage(); await goto(again, '/classes/new'); assert.equal(await again.locator('#new-class-course option', { hasText: title }).count(), 1, 'Reinstated course is selectable'); await again.close();
  });

  // ---- Class creation, settings and teacher assignment
  const className = 'Synthetic Reviewed Class ' + suffix;
  let classId;
  await goto(page, '/classes/new');
  await check('Reviewed class creation with capacity validates input and links to its settings', async () => {
    await page.getByLabel('Course').selectOption({ label: title + ' III (' + code + ')' }); await page.getByLabel('Teacher').selectOption({ label: 'teacher-a' });
    await page.getByLabel('Class name').fill(className); await page.getByLabel('Term').fill('Term ' + suffix);
    await page.getByLabel(/^Capacity/).fill('abc'); await expect(page.getByText('Enter a whole number from 1 to 500')).toBeVisible(); await expect(page.getByRole('button', { name: 'Add class' })).toBeDisabled();
    await page.getByLabel(/^Capacity/).fill('2'); await page.getByRole('button', { name: 'Add class' }).click();
    await status(page, 'saved'); await expect(page.getByRole('link', { name: 'Open settings for ' + className })).toBeVisible();
    const found = (await adminApi.get('/api/classes')).filter(row => row.name === className); assert.equal(found.length, 1); classId = found[0].id; assert.equal(found[0].teacherId, 'teacher-a');
  });
  await goto(page, '/classes/' + classId + '/manage');
  await check('Settings page shows capacity and open state; teacher assignment drives access immediately', async () => {
    await expect(page.getByRole('heading', { name: 'Settings for ' + className, level: 1 })).toBeVisible(); await expect(page.getByText('0 of 2 places used')).toBeVisible();
    assert.equal((await teacherApi.get('/api/classes/' + classId)).id, classId, 'Assigned teacher sees the class');
    await reasonField(page).fill('Teacher handover'); await page.getByLabel('New teacher').selectOption({ label: 'Synthetic teacher new' }); await page.getByRole('button', { name: 'Assign this teacher' }).click();
    await status(page, 'Teacher change saved'); await expect(page.getByText('Current teacher: Synthetic teacher new')).toBeVisible();
    await teacherApi.get('/api/classes/' + classId, 404);
    assert.equal((await newTeacherApi.get('/api/classes/' + classId)).id, classId, 'New teacher now sees the class');
    await expect(page.getByText('Teacher for ' + className + ' changed from teacher-a to Synthetic teacher new')).toBeVisible();
  });
  await check('Capacity can be raised and cannot go below enrolled learners (checked after enrolment below)', async () => {
    await page.getByLabel(/^Capacity/).fill('3'); await reasonField(page).fill('Room for one more'); await page.getByRole('button', { name: 'Save class settings' }).click();
    await status(page, 'Class settings saved'); await expect(page.getByText('0 of 3 places used')).toBeVisible();
    await page.getByLabel(/^Capacity/).fill('2'); await reasonField(page).fill('Back to two'); await page.getByRole('button', { name: 'Save class settings' }).click(); await status(page, 'Class settings saved');
  });

  // ---- Roster, batch enrolment, capacity, lifecycle
  const roster = await admin.newPage();
  await goto(roster, '/classes/' + classId + '/roster');
  await check('Batch enrolment is atomic: three learners into a two-place class changes nothing and explains why', async () => {
    await expect(roster.getByRole('heading', { name: 'Roster for ' + className, level: 1 })).toBeVisible(); await expect(roster.getByText('No learner has been enrolled in this class yet.')).toBeVisible();
    for (const name of ['Alpha', 'Bravo', 'Charlie']) await roster.getByLabel('Synthetic ' + name + ' · CE-' + name.toLowerCase()).check();
    await expect(roster.getByRole('button', { name: 'Enrol 3 learners' })).toBeEnabled(); await roster.getByRole('button', { name: 'Enrol 3 learners' }).click();
    await expect(roster.getByRole('alert')).toContainText('This class is full'); await expect(roster.getByRole('alert')).toContainText('Nothing was saved');
    assert.equal((await adminApi.get('/api/classes/' + classId + '/roster')).length, 0, 'No learner was enrolled');
  });
  await check('Two learners enrol together and the roster and capacity update', async () => {
    await roster.reload({ waitUntil: 'networkidle' });
    for (const name of ['Alpha', 'Bravo']) await roster.getByLabel('Synthetic ' + name + ' · CE-' + name.toLowerCase()).check();
    await roster.getByRole('button', { name: 'Enrol 2 learners' }).click(); await status(roster, 'Enrolment of 2 learners saved');
    await expect(roster.getByText('2 of 2 places used')).toBeVisible(); await expect(roster.getByRole('heading', { name: 'Synthetic Alpha' })).toBeVisible(); await noRawIds(roster);
    await roster.getByLabel('Find a learner by name or admission number').fill('Charlie'); await roster.getByLabel('Synthetic Charlie · CE-charlie').check(); await roster.getByRole('button', { name: 'Enrol 1 learner' }).click();
    await expect(roster.getByRole('alert')).toContainText('This class is full');
  });
  await check('Withdrawal needs a reason and a real date; a future date is refused in plain language', async () => {
    await roster.reload({ waitUntil: 'networkidle' }); await roster.getByRole('button', { name: 'Withdraw Synthetic Alpha' }).click();
    await expect(roster.getByRole('heading', { name: 'Withdraw Synthetic Alpha' })).toBeVisible(); await expect(roster.getByRole('button', { name: 'Confirm withdraw' })).toBeDisabled();
    await roster.getByLabel('Reason (required, at least 5 characters)').fill('Family moved away'); await roster.getByLabel('Effective date').fill(new Date(Date.parse(today) + 3 * 86400000).toISOString().slice(0, 10));
    await roster.getByRole('button', { name: 'Confirm withdraw' }).click(); await expect(roster.getByRole('alert')).toContainText('That date is in the future');
    assert.equal((await adminApi.get('/api/classes/' + classId + '/roster')).find(row => row.firstName === 'Synthetic' && row.lastName === 'Alpha').status, 'active');
  });
  await check('A withdrawal saves with its date; the freed place is reusable and the history shows the reason to administrators only', async () => {
    await roster.reload({ waitUntil: 'networkidle' }); await roster.getByRole('button', { name: 'Withdraw Synthetic Alpha' }).click();
    await roster.getByLabel('Reason (required, at least 5 characters)').fill('Family moved away'); await roster.getByRole('button', { name: 'Confirm withdraw' }).click(); await status(roster, 'Withdraw for Synthetic Alpha saved');
    await expect(roster.getByText('1 of 2 places used')).toBeVisible(); await expect(roster.getByRole('button', { name: 'Re-enrol Synthetic Alpha' })).toBeVisible();
    const alphaCard = roster.locator('li', { has: roster.getByRole('heading', { name: 'Synthetic Alpha' }) }); await expect(alphaCard).toContainText('Withdrawn'); await expect(alphaCard).toContainText('Ended');
    const manage = await admin.newPage(); await goto(manage, '/classes/' + classId + '/manage'); await expect(manage.getByText('Reason: Family moved away')).toBeVisible(); await manage.close();
  });
  await check('Lowering capacity below the enrolled learners is refused', async () => {
    const manage = await admin.newPage(); await goto(manage, '/classes/' + classId + '/manage');
    await manage.getByLabel(/^Capacity/).fill('0'); await reasonField(manage).fill('Too low'); await manage.getByRole('button', { name: 'Save class settings' }).click();
    await expect(manage.getByRole('alert')).toBeVisible(); await manage.close();
  });
  await check('A lost reply keeps the same request: checking the receipt finds it saved and nothing is applied twice', async () => {
    await roster.reload({ waitUntil: 'networkidle' }); let delivered = 0; const lostReplies = [];
    const lose = async route => { if (route.request().method() !== 'POST') return route.continue(); delivered++; const reply = await route.fetch({ headers: { ...route.request().headers(), cookie: sessions['admin-a'] } }); lostReplies.push(reply.status() + ' ' + (await reply.text()).slice(0, 200)); return route.abort('connectionreset'); };
    await roster.route('**/api/academic-changes', lose);
    await roster.getByRole('button', { name: 'Re-enrol Synthetic Alpha' }).click(); await roster.getByLabel('Reason (required, at least 5 characters)').fill('Returned to school'); await roster.getByRole('button', { name: 'Confirm re-enrol' }).click();
    await expect(roster.getByRole('alert')).toContainText('could not be confirmed'); await expect(roster.getByRole('button', { name: 'Check whether it was saved' })).toBeVisible();
    await roster.unroute('**/api/academic-changes', lose); assert.equal(delivered, 1); assert.ok(lostReplies[0]?.startsWith('201'), 'The delivered request was applied by the Worker: ' + lostReplies[0]);
    await roster.getByRole('button', { name: 'Check whether it was saved' }).click(); await status(roster, 'was already saved'); await expect(roster.getByText('2 of 2 places used')).toBeVisible();
    const events = (await adminApi.get('/api/classes/' + classId + '/history')).items.filter(item => item.kind === 'enrolment.reenrol'); assert.equal(events.length, 1, 'Exactly one re-enrolment event');
  });
  await check('A request dropped before reaching the Worker is retried once with the same id and applied exactly once', async () => {
    await roster.reload({ waitUntil: 'networkidle' }); let dropped = 0;
    const drop = route => { if (route.request().method() !== 'POST') return route.continue(); dropped++; return route.abort('connectionreset'); };
    await roster.route('**/api/academic-changes', drop);
    await roster.getByRole('button', { name: 'Withdraw Synthetic Bravo' }).click(); await roster.getByLabel('Reason (required, at least 5 characters)').fill('Moved to another school'); await roster.getByRole('button', { name: 'Confirm withdraw' }).click();
    await expect(roster.getByRole('button', { name: 'Try the same request again' })).toBeVisible(); await roster.unroute('**/api/academic-changes', drop);
    assert.equal((await adminApi.get('/api/classes/' + classId + '/roster')).find(row => row.lastName === 'Bravo').status, 'active', 'Nothing was applied yet');
    await roster.getByRole('button', { name: 'Check whether it was saved' }).click(); await expect(roster.getByRole('alert')).toContainText('was not recorded');
    await roster.getByRole('button', { name: 'Try the same request again' }).click(); await status(roster, 'Withdraw for Synthetic Bravo saved');
    assert.equal(dropped, 1); assert.equal((await adminApi.get('/api/classes/' + classId + '/history')).items.filter(item => item.kind === 'enrolment.withdraw' && item.label.includes('Bravo')).length, 1);
  });
  const second = (await adminApi.post('/api/academic-changes', { clientRequestId: crypto.randomUUID(), changes: [{ kind: 'class.create', courseId: courseId, teacherId: 'teacher-spare', name: 'Synthetic Destination ' + suffix, term: 'Term ' + suffix, capacity: 5 }] }, 201)).receipt.items[0].subjectId;
  await check('Transfer moves a learner to another class in one step and both rosters show it', async () => {
    await roster.reload({ waitUntil: 'networkidle' }); await roster.getByRole('button', { name: 'Transfer Synthetic Alpha' }).click();
    await roster.getByLabel('Move to class').selectOption({ label: 'Synthetic Destination ' + suffix + ' (term Term ' + suffix + ')' }); await roster.getByLabel('Reason (required, at least 5 characters)').fill('Timetable clash resolved');
    await roster.getByRole('button', { name: 'Confirm transfer' }).click(); await status(roster, 'Transfer for Synthetic Alpha saved');
    const card = roster.locator('li', { has: roster.getByRole('heading', { name: 'Synthetic Alpha' }) }); await expect(card).toContainText('Transferred');
    assert.equal((await adminApi.get('/api/classes/' + second + '/roster')).filter(row => row.lastName === 'Alpha' && row.status === 'active').length, 1);
  });
  await check('Closing a class with completion marks active learners completed and blocks further enrolment', async () => {
    const manage = await admin.newPage(); await goto(manage, '/classes/' + classId + '/manage');
    await reasonField(manage).fill('End of term'); await manage.getByLabel('Also mark every active learner as completed today').check(); await manage.getByRole('button', { name: 'Close this class' }).click();
    await status(manage, 'Class closure saved'); await expect(manage.getByText('This class is closed')).toBeVisible(); await expect(manage.getByRole('button', { name: 'Save class settings' })).toBeDisabled();
    await roster.reload({ waitUntil: 'networkidle' }); await expect(roster.getByText('This class is closed, so no learner can be enrolled.')).toBeVisible();
    assert.ok((await adminApi.get('/api/classes/' + classId + '/roster')).every(row => row.status !== 'active'));
    await reasonField(manage).fill('More teaching needed'); await manage.getByRole('button', { name: 'Reopen this class' }).click(); await status(manage, 'Class reopening saved'); await manage.close();
  });

  // ---- Scoped views
  await check('A teacher sees only assigned classes; the roster is read-only and history hides reasons', async () => {
    const view = await newTeacher.newPage(); await goto(view, '/classes/' + classId + '/roster');
    await expect(view.getByRole('heading', { name: 'Roster for ' + className, level: 1 })).toBeVisible(); assert.equal(await view.getByRole('button', { name: /^(Withdraw|Complete|Transfer|Re-enrol) / }).count(), 0, 'No change controls for a teacher');
    assert.equal(await view.getByRole('heading', { name: 'Enrol learners' }).count(), 0); await noRawIds(view);
    const log = await view.request.fetch(new URL('/api/classes/' + classId + '/history', base).href, { headers: { cookie: sessions['teacher-new'] } }); const data = await log.json();
    assert.ok(data.items.length > 0 && data.items.every(item => item.reason === null && item.actorName === null), 'Teacher history carries no reasons or actors');
    const sourceLabel = data.items.find(item => item.kind === 'enrolment.transfer'); assert.ok(!sourceLabel || !sourceLabel.label.includes('Destination'), 'Teacher of the source never learns the destination name');
    await view.close();
    const manageView = await newTeacher.newPage(); await goto(manageView, '/classes/' + classId + '/manage'); await expect(manageView.getByText('Only a school administrator can change class settings.')).toBeVisible(); assert.equal(await manageView.getByRole('button', { name: 'Save class settings' }).count(), 0); await manageView.close();
  });
  await check('The former teacher and an unrelated teacher are told the class is unavailable and receive no roster', async () => {
    for (const value of [teacher, otherTeacher]) { const view = await value.newPage(); await goto(view, '/classes/' + classId + '/roster'); await expect(view.getByRole('alert')).toContainText('unavailable to your current account'); assert.equal(await view.getByRole('heading', { name: 'Learners (0)' }).count(), 0); await view.close(); }
  });
  await check('A guardian and a learner see only their own enrolment history, with no administrator reasons', async () => {
    for (const value of [family, learner]) {
      const view = await value.newPage(); await goto(view, '/enrolments/history');
      await expect(view.getByRole('heading', { name: 'Enrolment history', level: 1 })).toBeVisible(); await expect(view.getByRole('heading', { name: /^Classes for / })).toBeVisible();
      await expect(view.getByText('Reason:')).toHaveCount(0); await noRawIds(view); await labelsAndWidth(view); await view.close();
    }
    const nobody = await foreignFamily.newPage(); await goto(nobody, '/enrolments/history'); assert.equal(await nobody.getByText('student-a Synthetic').count(), 0); await nobody.close();
  });
  await check('Families and learners cannot open rosters, settings or the reviewed-change endpoint', async () => {
    for (const [name, value] of [['guardian-a', family], ['student-user-a', learner]]) {
      await api(value, '/api/classes/class-a/roster', 'GET', undefined, 403); await api(value, '/api/classes/class-a/history', 'GET', undefined, 403); await api(value, '/api/academic-changes', 'POST', { clientRequestId: crypto.randomUUID(), changes: [{ kind: 'course.create', code: 'X-' + name, title: 'No', gradeLevel: '8' }] }, 403);
    }
    const hub = await family.newPage(); await goto(hub, '/academic'); await expect(hub.getByText('This page is for school staff.')).toBeVisible(); assert.equal(await hub.getByRole('link', { name: 'Add a course' }).count(), 0); await hub.close();
  });
  await check('Anonymous visitors are redirected to sign-in', async () => {
    const view = await anon.newPage(); await view.goto(base.origin + '/classes/' + classId + '/roster', { waitUntil: 'networkidle' }); await expect(view).toHaveURL(/\/login/); await view.close();
  });
  await check('Teachers cannot make reviewed changes', async () => { await api(newTeacher, '/api/academic-changes', 'POST', { clientRequestId: crypto.randomUUID(), changes: [{ kind: 'course.create', code: 'T-' + suffix, title: 'No', gradeLevel: '8' }] }, 403); });

  // ---- Responsive and accessible
  const narrow = await admin.newPage(); await narrow.setViewportSize({ width: 375, height: 800 });
  await check('At 375px every page has labelled controls, no horizontal overflow, no raw ids and no dialogs', async () => {
    for (const path of ['/academic', '/courses/new', '/courses/' + courseId, '/classes/new', '/classes/' + classId + '/manage', '/classes/' + classId + '/roster', '/enrolments/history']) {
      try { await goto(narrow, path); } catch (error) { throw new Error('Opening ' + path + ' failed: ' + String(error?.message).split('\n')[0]); }
      await expect(narrow.getByRole('heading', { level: 1 }).last()).toBeVisible();
      await labelsAndWidth(narrow); await noRawIds(narrow);
    }
    assert.deepEqual(dialogs, [], 'No alert/confirm/prompt dialogs');
  });
  await goto(narrow, '/classes/' + classId + '/roster'); await shot(narrow, 'roster-375');
  await narrow.setViewportSize({ width: 1280, height: 900 }); await goto(narrow, '/classes/' + classId + '/manage'); await shot(narrow, 'manage-desktop');
  await check('Browser assets load and all observed requests stay local', async () => { assert.deepEqual(pageErrors, []); assert.deepEqual(externalRequests, []); assert.deepEqual(failedResources, []); });
  if (failures.length) throw new Error(failures.length + ' check(s) failed: ' + failures.join('; '));
  const result = { executedAt: new Date().toISOString(), passed, failed: 0, skipped: 0, externalRequests: externalRequests.length, pageErrors: pageErrors.length, checks, screenshots,
    limits: ['Built localhost Worker with final migrated synthetic sessions only.', 'Offline: non-local requests are aborted and counted.', 'Lost replies are modelled by dropping a real response; no real recipient, identity provider or paid service.'] };
  writeFileSync(join(outputDir, 'courses-enrolment-results.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ passed, failed: 0, skipped: 0, externalRequests: externalRequests.length, pageErrors: pageErrors.length }));
} catch (error) {
  for (const value of contexts) for (const page of value.pages()) if (page.url().startsWith(base.origin)) console.error('Local screen: ' + new URL(page.url()).pathname + '\n' + (await page.locator('body').innerText()).slice(0, 1600));
  console.log(JSON.stringify({ passed, failed: failures.length || 1, externalRequests: externalRequests.length, pageErrors: pageErrors.length })); throw error;
} finally { for (const value of contexts) await value.close(); await browser.close(); }
