// Manual localhost-only browser procedure for the complete attendance workflow (FR-09 demo):
// school-local date, roll call, review, save, correction, conflict, change log, class report,
// learner/family view and access limits. Final built Worker, real D1 and synthetic sessions only.
// Needs SAHA_WORKER_TEST_URL, SAHA_WORKER_SESSION_FIXTURE and SAHA_TEST_BROWSER; SAHA_TEST_OUTPUT_DIR is optional.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';
const origin = process.env.SAHA_WORKER_TEST_URL, fixture = process.env.SAHA_WORKER_SESSION_FIXTURE, executablePath = process.env.SAHA_TEST_BROWSER;
if (!origin || !fixture || !executablePath) throw new Error('Supply a local built Worker, private synthetic sessions and local browser.');
const base = new URL(origin);
if (!['127.0.0.1', 'localhost'].includes(base.hostname) || !['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('Attendance demo checks require an exact localhost origin.');
const outputDir = process.env.SAHA_TEST_OUTPUT_DIR || '/private/tmp'; mkdirSync(outputDir, { recursive: true });
const sessions = JSON.parse(readFileSync(fixture, 'utf8'));
const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-background-networking'] });
const contexts = [], pageErrors = [], externalRequests = [], failedResources = [], dialogs = [], checks = [], screenshots = [];
let passed = 0;
const suffix = crypto.randomUUID().slice(0, 8);
const zone = 'Pacific/Kiritimati';
const schoolToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDays = (date, days) => { const value = new Date(date + 'T00:00:00Z'); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };
const check = async (name, action) => { await action(); passed++; checks.push(name); console.log('ok - ' + name); };
async function context(user, viewport = { width: 1280, height: 900 }) {
  if (user && typeof sessions[user] !== 'string') throw new Error('Missing a required synthetic session: ' + user);
  // The device is 25 hours behind the school clock, so device-local and school-local dates can never agree.
  const value = await browser.newContext({ viewport, timezoneId: 'Pacific/Pago_Pago', serviceWorkers: 'block', extraHTTPHeaders: user ? { cookie: sessions[user] } : {} });
  if (user) { const separator = sessions[user].indexOf('='); await value.addCookies([{ name: sessions[user].slice(0, separator), value: sessions[user].slice(separator + 1), domain: base.hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }]); }
  contexts.push(value);
  value.on('page', page => {
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.dismiss(); });
    page.on('response', response => { if (response.status() >= 400 && ['script', 'stylesheet'].includes(response.request().resourceType())) failedResources.push({ path: new URL(response.url()).pathname, status: response.status() }); });
  });
  await value.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin === base.origin) return route.continue(); externalRequests.push({ origin: url.origin, pathname: url.pathname }); return route.abort(); });
  return value;
}
async function api(value, path, method = 'GET', data, expected = 200) {
  const url = new URL(path, base); if (url.origin !== base.origin || url.username || url.password) throw new Error('Synthetic requests must remain local.');
  let response;
  try { response = await value.request.fetch(url.href, { method, timeout: 15000, maxRedirects: 0, headers: method === 'GET' ? {} : { Origin: base.origin }, ...(data === undefined ? {} : { data }) }); }
  catch { throw new Error('Local attendance API transport failed: ' + url.pathname); }
  assert.equal(response.status(), expected, 'Local API status: ' + method + ' ' + path + ' got ' + response.status()); return response.json();
}
const editor = classId => '/api/classes/' + encodeURIComponent(classId) + '/attendance-editor';
const row = (page, student) => page.locator('[data-attendance-student=' + JSON.stringify(student.id) + ']');
const name = student => student.firstName + ' ' + student.lastName;
const status = (page, student) => page.getByLabel('Attendance status for ' + name(student), { exact: true });
const note = (page, student) => page.getByLabel('Attendance note for ' + name(student), { exact: true });
const reasonBox = page => page.getByLabel('Reason for attendance changes', { exact: true });
const reviewBox = page => page.getByRole('checkbox', { name: 'I reviewed the loaded records and these intended attendance changes.', exact: true });
const saveButton = page => page.getByRole('button', { name: 'Save reviewed attendance', exact: true });
async function open(page, classId, date) {
  const response = await page.goto(base.origin + '/classes/' + encodeURIComponent(classId) + '/attendance' + (date ? '?date=' + date : ''), { waitUntil: 'networkidle', timeout: 20000 });
  assert.equal(response?.status(), 200); await expect(page.getByRole('heading', { name: 'Take Attendance', exact: true, level: 1 })).toBeVisible();
  await expect(page.getByLabel('Attendance date', { exact: true })).toBeEnabled(); await expect(page.locator('[data-attendance-student]').first()).toBeVisible();
}
async function submit(page, classId, expected = 201) {
  const saved = page.waitForResponse(item => new URL(item.url()).pathname === editor(classId) && item.request().method() === 'POST');
  await saveButton(page).click(); const response = await saved; assert.equal(response.status(), expected);
  if (expected !== 201) return null;
  const result = await response.json();
  await expect(page.locator('[data-confirmed-attendance-review=' + JSON.stringify(result.review.id) + ']')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Current records reloaded.' })).toBeVisible(); return result;
}
async function labelsAndWidth(page) {
  const missing = await page.locator('input:not([type=hidden]),select,textarea').evaluateAll(items => items.filter(item => !item.labels?.length && !item.getAttribute('aria-label') && !item.getAttribute('aria-labelledby')).length);
  assert.equal(missing, 0, 'Every control has a label');
  const width = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth })); assert.ok(width.scroll <= width.viewport + 1, 'No horizontal overflow: ' + JSON.stringify(width));
}
async function shot(page, label) { const path = join(outputDir, 'saha-attendance-demo-' + label + '.png'); await page.screenshot({ path, fullPage: true }); screenshots.push(path); }
async function plainTextHasNoJson(page) { const text = await page.locator('body').innerText(); assert.ok(!/[{]\s*"[a-zA-Z]+"\s*:/.test(text), 'No raw JSON is shown'); assert.ok(!text.includes('[object Object]') && !text.includes('undefined'), 'No programming placeholders are shown'); }
let current = 'start';
try {
  const admin = await context('admin-a'), teacher = await context('teacher-a'), otherTeacher = await context('teacher-other'), family = await context('guardian-a'), learner = await context('student-user-a');
  const school = (await api(admin, '/api/schools'))[0], course = (await api(admin, '/api/courses')).find(item => item.id === 'course-a'); assert.ok(school && course);
  const classroom = await api(admin, '/api/classes', 'POST', { schoolId: school.id, courseId: course.id, teacherId: 'teacher-a', name: 'Attendance demo ' + suffix, term: 'Synthetic demo term' }, 201);
  const pupils = [];
  for (const kind of ['amina', 'brian', 'chloe', 'dev']) {
    const pupil = await api(admin, '/api/students', 'POST', { schoolId: school.id, firstName: 'Demo', lastName: kind + ' ' + suffix, admissionNumber: 'DEMO-' + suffix + '-' + kind, gradeLevel: '8', dateOfBirth: '2012-01-01' }, 201);
    await api(admin, '/api/enrolments', 'POST', { classId: classroom.id, studentId: pupil.id }, 201); pupils.push(pupil);
  }
  // student-a is linked to guardian-a and student-user-a, which gives the family journey a real linked learner.
  const linked = await api(admin, '/api/students/student-a'); await api(admin, '/api/enrolments', 'POST', { classId: classroom.id, studentId: 'student-a' }, 201);
  const [amina, brian, chloe, dev] = pupils; const everyone = [...pupils, linked];

  // ---------------------------------------------------------------- administrator sets the school calendar
  const adminPage = await admin.newPage();
  current = 'calendar';
  await adminPage.goto(base.origin + '/attendance', { waitUntil: 'networkidle' });
  await check('Administrator sees the school calendar control with the unconfigured default stated', async () => {
    const panel = adminPage.locator('[data-attendance-calendar-settings]'); await expect(panel.getByRole('heading', { name: 'School attendance calendar' })).toBeVisible();
    await expect(panel).toContainText('No timezone has been set, so UTC dates are used.'); await expect(panel.getByLabel('School timezone')).toBeVisible();
  });
  await check('An unknown timezone is refused with a plain-language message and nothing is saved', async () => {
    const panel = adminPage.locator('[data-attendance-calendar-settings]'); await panel.getByLabel('School timezone').fill('Mars/Olympus'); await panel.getByRole('button', { name: 'Save school calendar' }).click();
    await expect(panel.getByRole('alert')).toContainText('Enter a recognised timezone name'); assert.equal((await api(admin, '/api/attendance/calendar')).configured, false);
  });
  await check('Saving the school timezone and no-future-dates policy shows today at the school', async () => {
    const panel = adminPage.locator('[data-attendance-calendar-settings]'); await panel.getByLabel('School timezone').fill(zone);
    await panel.getByRole('checkbox', { name: 'Allow attendance to be recorded for dates after today at the school' }).uncheck(); await panel.getByRole('button', { name: 'Save school calendar' }).click();
    await expect(panel.getByRole('status')).toContainText('School calendar saved. Today at the school is ');
    const saved = await api(admin, '/api/attendance/calendar'); assert.equal(saved.timezone, zone); assert.equal(saved.futureDatesAllowed, false); assert.equal(saved.configured, true);
    assert.ok([schoolToday(), addDays(schoolToday(), -1)].includes(saved.schoolDate));
  });
  await check('Teachers and families cannot change the school calendar', async () => {
    for (const value of [teacher, family, learner]) await api(value, '/api/attendance/calendar', 'PUT', { timezone: 'UTC', futureDatesAllowed: true }, 403);
    const view = await teacher.newPage(); await view.goto(base.origin + '/attendance', { waitUntil: 'networkidle' }); await expect(view.locator('[data-attendance-calendar-settings]')).toHaveCount(0); await view.close();
  });

  // ---------------------------------------------------------------- teacher roll call on the school date
  const page = await teacher.newPage();
  const date = schoolToday();
  current = 'roll call';
  await open(page, classroom.id);
  await check('The recorder opens on the school calendar date, not the device date', async () => {
    const deviceDate = await page.evaluate(() => new Date().toLocaleDateString('en-CA')); assert.notEqual(deviceDate, date);
    assert.ok([date, addDays(date, 1)].includes(await page.getByLabel('Attendance date', { exact: true }).inputValue()) || (await page.getByLabel('Attendance date', { exact: true }).inputValue()) === addDays(date, -1));
    const shown = await page.getByLabel('Attendance date', { exact: true }).inputValue(); assert.notEqual(shown, deviceDate);
    await expect(page.locator('[data-school-calendar]')).toContainText('Today at the school is ' + shown + ' (' + zone + ').');
  });
  const day = await page.getByLabel('Attendance date', { exact: true }).inputValue();
  await check('A future date is blocked by the school policy and the button returns to today', async () => {
    await page.getByLabel('Attendance date', { exact: true }).fill(addDays(day, 1));
    await expect(page.locator('[data-school-calendar]').getByRole('alert')).toContainText('does not allow attendance to be recorded for a future date');
    await expect(page.locator('[data-attendance-student]').first()).toBeVisible();
    await page.getByRole('button', { name: 'Go to today at the school' }).click(); await expect(page.getByLabel('Attendance date', { exact: true })).toHaveValue(day);
    await expect(page.locator('[data-school-calendar]').getByRole('alert')).toHaveCount(0);
  });
  await check('Nobody is pre-marked and a deliberate action fills only unrecorded learners', async () => {
    await expect(page.locator('[data-attendance-student]')).toHaveCount(5);
    for (const pupil of everyone) await expect(status(page, pupil)).toHaveValue('');
    await expect(saveButton(page)).toBeDisabled();
    await page.getByRole('button', { name: 'Mark all unrecorded learners present' }).click();
    for (const pupil of everyone) await expect(status(page, pupil)).toHaveValue('present');
    await expect(page.getByRole('button', { name: 'Mark all unrecorded learners present' })).toBeDisabled();
  });
  await check('Changing individual marks lists every intended change before saving', async () => {
    await status(page, brian).selectOption('absent'); await note(page, brian).fill('Parent reported illness');
    await status(page, chloe).selectOption('late'); await status(page, dev).selectOption('excused'); await note(page, dev).fill('Clinic appointment');
    const list = page.locator('[data-intended-changes] li'); await expect(list).toHaveCount(5);
    await expect(list.filter({ hasText: name(brian) })).toContainText('Not recorded to Absent (new mark), note changed');
    await expect(list.filter({ hasText: name(amina) })).toContainText('Not recorded to Present (new mark)');
  });
  await check('The standard first-roll-call reason is offered and the save needs explicit review', async () => {
    await page.getByRole('button', { name: /Use .Initial roll call for / }).click(); await expect(reasonBox(page)).toHaveValue('Initial roll call for ' + day);
    await expect(saveButton(page)).toBeDisabled(); await reviewBox(page).check(); await expect(saveButton(page)).toBeEnabled();
  });
  let receipt;
  await check('Saving creates an immutable receipt for every learner and exact reload shows the saved marks', async () => {
    receipt = await submit(page, classroom.id); assert.equal(receipt.replayed, false); assert.equal(receipt.review.changes.length, 5);
    assert.ok(receipt.review.changes.every(change => change.beforeRecord === null));
    const saved = await api(teacher, '/api/attendance?classId=' + classroom.id + '&date=' + day); assert.equal(saved.length, 5);
    await expect(status(page, brian)).toHaveValue('absent'); await expect(note(page, dev)).toHaveValue('Clinic appointment');
    await expect(page.locator('[data-attendance-review]')).toHaveCount(1);
  });
  await shot(page, 'recorder-after-roll-call');

  // ---------------------------------------------------------------- correction with reason
  current = 'correction';
  await check('A correction shows before and after, needs a reason, and keeps history', async () => {
    await status(page, brian).selectOption('present'); await note(page, brian).fill('Arrived after the register closed');
    await expect(page.locator('[data-intended-changes] li')).toHaveCount(1); await expect(page.locator('[data-intended-changes] li')).toContainText('Absent to Present (correction of a saved mark), note changed');
    await expect(page.getByRole('button', { name: /Use .Initial roll call for / })).toHaveCount(0);
    await reasonBox(page).fill('Corrected: Brian arrived late and was marked absent.'); await reviewBox(page).check();
    const result = await submit(page, classroom.id); const change = result.review.changes[0];
    assert.equal(change.beforeRecord.status, 'absent'); assert.equal(change.afterRecord.status, 'present'); assert.equal(change.afterRecord.id, change.beforeRecord.id); assert.equal(change.afterRecord.createdAt, change.beforeRecord.createdAt);
    await expect(page.locator('[data-attendance-review]')).toHaveCount(2);
    const text = await page.locator('[data-confirmed-attendance-review]').innerText(); assert.ok(text.includes('Corrected: Brian arrived late'));
    assert.ok(text.includes('Before this review') && text.includes('After this review'));
  });
  await check('An exact retry of the first save confirms the original receipt without reapplying it', async () => {
    const replay = await api(teacher, editor(classroom.id), 'POST', { date: day, clientRequestId: receipt.review.id, reviewConfirmed: true, reason: receipt.review.reason, entries: receipt.review.changes.map(item => ({ studentId: item.studentId, status: item.afterRecord.status, note: item.afterRecord.note, expectedRecord: item.beforeRecord })) }, 200);
    assert.equal(replay.replayed, true); assert.equal(replay.review.id, receipt.review.id);
    const now = await api(teacher, editor(classroom.id) + '?date=' + day); assert.equal(now.roster.items.find(item => item.student.id === brian.id).record.status, 'present');
  });

  // ---------------------------------------------------------------- conflict with another member of staff
  current = 'conflict';
  await check('When another staff member changed the mark, saving conflicts and nothing is overwritten', async () => {
    await status(page, chloe).selectOption('absent'); await reasonBox(page).fill('Chloe was absent not late after the office check.'); await reviewBox(page).check();
    const loaded = await api(admin, editor(classroom.id) + '?date=' + day); const record = loaded.roster.items.find(item => item.student.id === chloe.id).record;
    await api(admin, editor(classroom.id), 'POST', { date: day, clientRequestId: crypto.randomUUID(), reviewConfirmed: true, reason: 'Office confirmed Chloe was excused today.', entries: [{ studentId: chloe.id, status: 'excused', note: 'Office confirmation', expectedRecord: record }] }, 201);
    await saveButton(page).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Saved attendance or class access changed.' })).toBeVisible();
    const saved = await api(teacher, editor(classroom.id) + '?date=' + day); assert.equal(saved.roster.items.find(item => item.student.id === chloe.id).record.status, 'excused');
    await page.getByRole('button', { name: 'Reload current records' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Your intended edits are retained.' })).toBeVisible(); await expect(status(page, chloe)).toHaveValue('absent');
    await expect(row(page, chloe)).toContainText('Excused'.toLowerCase());
    await reasonBox(page).fill('Chloe was absent not late after the office check.'); await reviewBox(page).check(); await submit(page, classroom.id);
    await expect(page.locator('[data-attendance-review]')).toHaveCount(4);
  });

  // ---------------------------------------------------------------- an overwrite that skipped review is still visible
  current = 'unreviewed change';
  await check('A replacement made outside the review is listed with no reason recorded', async () => {
    await api(teacher, '/api/attendance', 'POST', { classId: classroom.id, date: day, entries: [{ studentId: dev.id, status: 'late' }] });
    await page.getByRole('button', { name: 'Reload current records' }).click(); await expect(page.locator('[data-unreviewed-change]')).toHaveCount(1);
    const entry = page.locator('[data-unreviewed-change]'); await expect(entry).toContainText(name(dev) + ': mark replaced'); await expect(entry).toContainText('Before: Excused'); await expect(entry).toContainText('After: Late');
    await expect(page.locator('[data-unreviewed-changes]')).toContainText('No reason was recorded');
    await expect(status(page, dev)).toHaveValue('late');
  });
  await check('Marks in a class the teacher does not teach are refused and show no roster', async () => {
    const stranger = await otherTeacher.newPage(); await stranger.goto(base.origin + '/classes/' + classroom.id + '/attendance', { waitUntil: 'networkidle' });
    await expect(stranger.getByRole('alert')).toContainText('unavailable'); await expect(stranger.locator('[data-attendance-student]')).toHaveCount(0); await stranger.close();
    const body = { date: day, clientRequestId: crypto.randomUUID(), reviewConfirmed: true, reason: 'An unassigned teacher attempt.', entries: [{ studentId: amina.id, status: 'absent', note: null, expectedRecord: null }] };
    await api(otherTeacher, editor(classroom.id), 'POST', body, 404); await api(otherTeacher, '/api/classes/' + classroom.id + '/attendance-report', 'GET', undefined, 404);
    await api(otherTeacher, '/api/classes/' + classroom.id + '/attendance-changes?date=' + day, 'GET', undefined, 404);
  });

  // ---------------------------------------------------------------- class report
  current = 'class report';
  const report = await teacher.newPage();
  await report.goto(base.origin + '/attendance/classes/' + classroom.id, { waitUntil: 'networkidle' });
  await check('The class report opens on the last 30 school days and lists the saved date with counts', async () => {
    await expect(report.getByRole('heading', { name: 'Class attendance report', level: 1 })).toBeVisible(); await expect(report.locator('[data-class-attendance-report]')).toBeVisible();
    const finish = await report.getByLabel('To date').inputValue(); assert.ok([day, addDays(day, 1)].includes(finish)); assert.equal(await report.getByLabel('From date').inputValue(), addDays(finish, -29));
    const api1 = await api(teacher, '/api/classes/' + classroom.id + '/attendance-report?from=' + addDays(finish, -29) + '&to=' + finish);
    for (const key of ['present', 'absent', 'late', 'excused', 'other']) assert.equal(await report.locator('[data-total=' + key + ']').innerText(), String(api1.totals[key]));
    assert.equal(api1.totals.recordedRows, 5); assert.equal(api1.totals.present, 3 + 0); assert.equal(api1.totals.late, 1);
    await expect(report.locator('[data-report-day=' + JSON.stringify(day) + ']')).toContainText('5');
    await expect(report.getByRole('region', { name: 'Attendance by date' })).toBeVisible(); await expect(report.getByRole('region', { name: 'Attendance by learner' })).toBeVisible();
    await expect(report.getByText('no percentage is shown', { exact: false })).toBeVisible();
  });
  await check('Choosing dates narrows the report and an impossible range is refused before any request', async () => {
    let requests = 0; const watch = request => { if (new URL(request.url()).pathname.endsWith('/attendance-report')) requests++; }; report.on('request', watch);
    try {
      await report.getByLabel('From date').fill(addDays(day, 3)); await report.getByLabel('To date').fill(addDays(day, 5)); await report.getByRole('button', { name: 'Show report' }).click();
      await expect(report.getByText('No attendance marks were saved in this range.')).toBeVisible(); const before = requests;
      await report.getByLabel('From date').fill(addDays(day, 9)); await report.getByLabel('To date').fill(addDays(day, 2)); await report.getByRole('button', { name: 'Show report' }).click();
      await expect(report.getByRole('alert')).toContainText('The start date cannot be after the end date.'); assert.equal(requests, before);
      await report.getByRole('button', { name: 'All saved dates' }).click(); await expect(report.locator('[data-report-day=' + JSON.stringify(day) + ']')).toBeVisible();
      await report.getByRole('button', { name: 'Last 7 days' }).click(); await expect(report.getByLabel('From date')).not.toHaveValue(''); await expect(report.locator('[data-class-attendance-report]')).toBeVisible();
    } finally { report.off('request', watch); }
  });
  await check('Each learner row opens that learner day-by-day record, with staff notes visible to staff', async () => {
    await report.getByRole('link', { name: name(brian) }).click(); await expect(report.getByRole('heading', { name: 'Learner attendance', level: 1 })).toBeVisible();
    await expect(report.locator('[data-learner-name]')).toHaveText(name(brian)); await expect(report.getByRole('columnheader', { name: 'Note' })).toBeVisible();
    await expect(report.locator('[data-learner-record]')).toHaveCount(1); await expect(report.getByRole('cell', { name: 'Arrived after the register closed' })).toBeVisible();
    await expect(report.getByRole('cell', { name: 'Present', exact: true })).toBeVisible();
  });

  // ---------------------------------------------------------------- family and learner see only their own
  current = 'family';
  const familyPage = await family.newPage();
  await familyPage.goto(base.origin + '/attendance', { waitUntil: 'networkidle' });
  await check('A linked guardian chooses the class and follows a link to the learner day-by-day record', async () => {
    await expect(familyPage.locator('[data-attendance-calendar-settings]')).toHaveCount(0);
    await familyPage.getByLabel('Select Class').selectOption(classroom.id);
    await expect(familyPage.locator('[data-attendance-pupil]')).toHaveCount(1); await expect(familyPage.getByRole('link', { name: 'Class attendance report' })).toHaveCount(0);
    await familyPage.getByRole('link', { name: 'Day-by-day attendance for ' + name(linked) }).click();
    await expect(familyPage.getByRole('heading', { name: 'Learner attendance', level: 1 })).toBeVisible(); await expect(familyPage.locator('[data-learner-name]')).toHaveText(name(linked));
    await expect(familyPage.locator('[data-learner-record]')).toHaveCount(1); await expect(familyPage.getByRole('cell', { name: 'Present', exact: true })).toBeVisible();
    await expect(familyPage.getByText('Present or late on 1 of 1 saved mark.')).toBeVisible();
  });
  await check('Family and learner views never show notes, recorder names or other learners', async () => {
    await expect(familyPage.getByRole('columnheader', { name: 'Note' })).toHaveCount(0); await expect(familyPage.getByRole('columnheader', { name: 'Recorded by' })).toHaveCount(0);
    const text = await familyPage.locator('body').innerText(); for (const pupil of pupils) assert.ok(!text.includes(pupil.firstName + ' ' + pupil.lastName), 'Another learner is not named');
    const payload = await api(family, '/api/students/student-a/attendance'); assert.ok(payload.records.items.every(item => item.note === null && item.recordedByName === null));
    await api(family, '/api/students/' + brian.id + '/attendance', 'GET', undefined, 404); await api(family, '/api/classes/' + classroom.id + '/attendance-report', 'GET', undefined, 403);
    await familyPage.goto(base.origin + '/attendance/learners/' + brian.id, { waitUntil: 'networkidle' });
    await expect(familyPage.getByRole('alert')).toContainText('not available to your account'); await expect(familyPage.locator('[data-learner-attendance]')).toHaveCount(0);
    assert.ok(!(await familyPage.locator('body').innerText()).includes(brian.firstName + ' ' + brian.lastName));
  });
  await check('A learner reads their own record and is refused every other learner', async () => {
    const mine = await learner.newPage(); await mine.goto(base.origin + '/attendance/learners/student-a', { waitUntil: 'networkidle' });
    await expect(mine.locator('[data-learner-name]')).toHaveText(name(linked)); await expect(mine.locator('[data-learner-record]')).toHaveCount(1);
    await api(learner, '/api/students/' + amina.id + '/attendance', 'GET', undefined, 404); await mine.close();
  });
  await check('A change to the family view range is validated and applied', async () => {
    await familyPage.goto(base.origin + '/attendance/learners/student-a', { waitUntil: 'networkidle' });
    await familyPage.getByLabel('From date').fill(addDays(day, 2)); await familyPage.getByLabel('To date').fill(addDays(day, 4)); await familyPage.getByRole('button', { name: 'Show attendance' }).click();
    await expect(familyPage.getByText('No attendance has been saved for this learner in these dates.')).toBeVisible();
    await familyPage.getByRole('button', { name: 'All saved dates' }).click(); await expect(familyPage.locator('[data-learner-record]')).toHaveCount(1);
  });

  // ---------------------------------------------------------------- accessibility, mobile, safety
  current = 'mobile';
  await check('The report, learner and recorder pages fit 375px, label every control and show no raw data', async () => {
    const phone = await context('teacher-a', { width: 375, height: 800 }); const screen = await phone.newPage();
    for (const path of ['/attendance/classes/' + classroom.id, '/attendance/learners/' + brian.id, '/classes/' + classroom.id + '/attendance']) {
      await screen.goto(base.origin + path, { waitUntil: 'networkidle' }); await expect(screen.getByRole('main')).toHaveCount(1);
      await expect(screen.locator('main h1, h1').first()).toBeVisible(); await labelsAndWidth(screen); await plainTextHasNoJson(screen);
    }
    await shot(screen, 'recorder-375px'); await screen.goto(base.origin + '/attendance/classes/' + classroom.id, { waitUntil: 'networkidle' }); await shot(screen, 'report-375px');
    await screen.getByLabel('From date').focus(); let reached = false; for (let press = 0; press < 8 && !reached; press++) { await screen.keyboard.press('Tab'); reached = await screen.evaluate(() => document.activeElement?.id === 'report-to'); } assert.equal(reached, true, 'the To date field is reachable by keyboard from the From date field');
    await screen.close();
    const phoneFamily = await context('guardian-a', { width: 375, height: 800 }); const small = await phoneFamily.newPage(); await small.goto(base.origin + '/attendance/learners/student-a', { waitUntil: 'networkidle' }); await labelsAndWidth(small); await shot(small, 'family-375px'); await small.close();
  });
  await check('Desktop pages have one main landmark and screenshots were captured', async () => { await expect(report.getByRole('main')).toHaveCount(1); await shot(report, 'learner-desktop'); await shot(familyPage, 'family-desktop'); });
  await check('No alert dialogs, page errors, failed assets or external requests occurred', async () => { assert.deepEqual(dialogs, []); assert.deepEqual(pageErrors, []); assert.deepEqual(failedResources, []); assert.deepEqual(externalRequests, []); });
  const result = { executedAt: new Date().toISOString(), passed, failed: 0, skipped: 0, externalRequests: externalRequests.length, pageErrors: pageErrors.length, dialogs: dialogs.length, checks, screenshots, limits: ['Final built localhost Worker, local D1 and synthetic sessions only.', 'The device timezone is deliberately 25 hours behind the school timezone to prove the school date is used.', 'No providers, real recipients, paid AI, hosted deployment or educator acceptance were exercised.'] };
  writeFileSync(join(outputDir, 'saha-attendance-demo-results.json'), JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify({ passed, failed: 0, skipped: 0, externalRequests: externalRequests.length, pageErrors: pageErrors.length }));
} catch (error) {
  for (const value of contexts) for (const page of value.pages()) if (page.url().startsWith(base.origin)) console.error('Local screen: ' + new URL(page.url()).pathname + '\n' + (await page.locator('body').innerText()).slice(0, 1800));
  writeFileSync(join(outputDir, 'saha-attendance-demo-results.json'), JSON.stringify({ executedAt: new Date().toISOString(), passed, failed: 1, stage: current, checks, failure: error instanceof Error ? error.message : String(error) }, null, 2) + '\n');
  console.log(JSON.stringify({ passed, failed: 1, stage: current, externalRequests: externalRequests.length, pageErrors: pageErrors.length })); throw error;
} finally { for (const value of contexts) await value.close(); await browser.close(); }
