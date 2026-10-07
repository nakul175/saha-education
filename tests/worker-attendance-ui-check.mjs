// Manual localhost-only browser procedures using final migrated synthetic data.
// Reviewed changes are real; local response injections model failed delivery.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
const origin = process.env.SAHA_WORKER_TEST_URL, fixture = process.env.SAHA_WORKER_SESSION_FIXTURE, executablePath = process.env.SAHA_TEST_BROWSER;
if (!origin || !fixture || !executablePath) throw new Error('Supply a local built Worker, private synthetic sessions and local browser.');
const base = new URL(origin);
if (!['127.0.0.1', 'localhost'].includes(base.hostname) || !['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('Attendance browser checks require an exact localhost origin.');
const sessions = JSON.parse(readFileSync(fixture, 'utf8'));
const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-background-networking'] });
const contexts = [], pageErrors = [], externalRequests = [], failedResources = [], checks = [], screenshots = [];
let passed = 0;
const suffix = crypto.randomUUID().slice(0, 8), date = '2026-10-05', secondDate = '2026-10-06';
const reason = 'Synthetic reviewed attendance ' + suffix;
const check = async (name, action) => { await action(); passed++; checks.push(name); console.log('ok - ' + name); };
async function context(user) {
  if (user && typeof sessions[user] !== 'string') throw new Error('Missing a required synthetic session.');
  const value = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Pacific/Kiritimati', serviceWorkers: 'block', extraHTTPHeaders: user ? { cookie: sessions[user] } : {} });
  if (user) { const separator = sessions[user].indexOf('='); await value.addCookies([{ name: sessions[user].slice(0, separator), value: sessions[user].slice(separator + 1), domain: base.hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }]); }
  contexts.push(value);
  value.on('page', page => {
    page.on('pageerror', error => pageErrors.push(error.message));
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
  assert.equal(response.status(), expected, 'Local API status: ' + path); return response.json();
}
async function localRouteFetch(route) {
  if (new URL(route.request().url()).origin !== base.origin) throw new Error('Injected fixture requests must remain local.');
  // route.fetch uses an API cookie jar, which omits secure cookies over HTTP.
  // Preserve the already-authorised synthetic browser request explicitly.
  try { return await route.fetch({ timeout: 15000, maxRedirects: 0, headers: { ...await route.request().allHeaders(), cookie: sessions['teacher-a'] } }); }
  catch { throw new Error('Local attendance injection transport failed: ' + new URL(route.request().url()).pathname); }
}
const endpoint = classId => '/api/classes/' + encodeURIComponent(classId) + '/attendance-editor';
const row = (page, student) => page.locator('[data-attendance-student=' + JSON.stringify(student.id) + ']');
const status = (page, student) => page.getByLabel('Attendance status for ' + student.firstName + ' ' + student.lastName, { exact: true });
const note = (page, student) => page.getByLabel('Attendance note for ' + student.firstName + ' ' + student.lastName, { exact: true });
const reviewBox = page => page.getByRole('checkbox', { name: 'I reviewed the loaded records and these intended attendance changes.', exact: true });
const saveButton = page => page.getByRole('button', { name: 'Save reviewed attendance', exact: true });
async function open(page, classId, chosenDate = date) {
  const response = await page.goto(base.origin + '/classes/' + encodeURIComponent(classId) + '/attendance', { waitUntil: 'networkidle', timeout: 20000 });
  assert.equal(response?.status(), 200); await expect(page.getByRole('heading', { name: 'Take Attendance', exact: true, level: 1 })).toBeVisible();
  await expect(page.getByLabel('Attendance date', { exact: true })).toBeEnabled();
  if (await page.getByLabel('Attendance date', { exact: true }).inputValue() !== chosenDate) await page.getByLabel('Attendance date', { exact: true }).fill(chosenDate);
  await expect(page.getByText('Date: ' + chosenDate + '. Unrecorded learners remain blank. Only explicit changes are submitted.', { exact: true })).toBeVisible();
}
async function prepare(page, explanation = reason) { await page.getByLabel('Reason for attendance changes', { exact: true }).fill(explanation); await reviewBox(page).check(); await expect(saveButton(page)).toBeEnabled(); }
async function submit(page, classId, expected = 201) {
  const saved = page.waitForResponse(response => new URL(response.url()).pathname === endpoint(classId) && response.request().method() === 'POST');
  await saveButton(page).click(); const response = await saved; assert.equal(response.status(), expected); const result = await response.json();
  await expect(page.locator('[data-confirmed-attendance-review=' + JSON.stringify(result.review.id) + ']')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Current records reloaded.' })).toBeVisible(); return result;
}
async function manualReview(value, classId, chosenDate, changes, explanation) {
  const saved = await api(value, endpoint(classId) + '?date=' + chosenDate);
  const entries = changes.map(change => { const pupil = saved.roster.items.find(item => item.student.id === change.studentId); assert.ok(pupil); return { studentId: change.studentId, status: change.status, note: change.note === undefined ? pupil.record?.note ?? null : change.note, expectedRecord: pupil.record }; });
  return api(value, endpoint(classId), 'POST', { date: chosenDate, clientRequestId: crypto.randomUUID(), reviewConfirmed: true, reason: explanation, entries }, 201);
}
async function labelsAndWidth(page) {
  const missing = await page.locator('input:not([type=hidden]),select,textarea').evaluateAll(items => items.filter(item => !item.labels?.length && !item.getAttribute('aria-label') && !item.getAttribute('aria-labelledby')).length);
  assert.equal(missing, 0); const width = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth })); assert.ok(width.scroll <= width.viewport + 1, 'No horizontal overflow: ' + JSON.stringify(width));
}
async function shot(page, name) { const path = (process.env.SAHA_TEST_OUTPUT_DIR || '/private/tmp') + '/saha-attendance-ui-' + name + '.png'; await page.screenshot({ path, fullPage: true }); screenshots.push(path); }
try {
  const admin = await context('admin-a'), teacher = await context('teacher-a'), family = await context('guardian-a'), learner = await context('student-user-a'), other = await context('teacher-other');
  const school = (await api(admin, '/api/schools'))[0], course = (await api(admin, '/api/courses')).find(item => item.id === 'course-a'); assert.ok(school && course);
  const classroom = await api(admin, '/api/classes', 'POST', { schoolId: school.id, courseId: course.id, teacherId: 'teacher-a', name: '<img src=x onerror=alert(1)> Attendance ' + suffix, term: 'Synthetic reviewed attendance term' }, 201);
  const pupils = [];
  for (const kind of ['saved', 'unrecorded', 'untouched', 'withdrawn', 'completed']) {
    const pupil = await api(admin, '/api/students', 'POST', { schoolId: school.id, firstName: 'Synthetic attendance', lastName: kind + ' ' + suffix, admissionNumber: 'ATT-' + suffix + '-' + kind, gradeLevel: '8', dateOfBirth: '2012-01-01' }, 201);
    const enrolment = await api(admin, '/api/enrolments', 'POST', { classId: classroom.id, studentId: pupil.id }, 201);
    if (kind === 'withdrawn' || kind === 'completed') await api(admin, '/api/enrolments', 'PATCH', { id: enrolment.id, status: kind });
    pupils.push(pupil);
  }
  const [savedPupil, blankPupil, untouchedPupil] = pupils;
  const savedNote = '<script>window.__attendanceInjected=true</script> Saved note ' + suffix;
  await api(teacher, '/api/attendance', 'POST', { classId: classroom.id, date, entries: [{ studentId: savedPupil.id, status: 'absent', note: savedNote }] });
  await api(teacher, '/api/attendance', 'POST', { classId: classroom.id, date: secondDate, entries: [{ studentId: savedPupil.id, status: 'excused', note: 'Other exact date ' + suffix }] });
  const page = await teacher.newPage(); await open(page, classroom.id);
  await check('Current active roster excludes withdrawn and completed pupils', async () => { await expect(page.locator('[data-attendance-student]')).toHaveCount(3); for (const pupil of pupils.slice(3)) await expect(row(page, pupil)).toHaveCount(0); });
  await check('Saved status and note load exactly while unrecorded learners stay blank', async () => { await expect(status(page, savedPupil)).toHaveValue('absent'); await expect(note(page, savedPupil)).toHaveValue(savedNote); for (const pupil of [blankPupil, untouchedPupil]) { await expect(status(page, pupil)).toHaveValue(''); await expect(row(page, pupil).getByText('No attendance record.', { exact: true })).toBeVisible(); } });
  await check('No-op and unreviewed forms cannot save or default all pupils to present', async () => { await page.getByLabel('Reason for attendance changes', { exact: true }).fill(reason); await reviewBox(page).check(); await expect(saveButton(page)).toBeDisabled(); await status(page, blankPupil).selectOption('present'); await expect(reviewBox(page)).not.toBeChecked(); await expect(saveButton(page)).toBeDisabled(); });
  await check('Editing a note or reason resets explicit review before save', async () => { await reviewBox(page).check(); await note(page, blankPupil).fill('An explicitly entered new note.'); await expect(reviewBox(page)).not.toBeChecked(); await reviewBox(page).check(); await page.getByLabel('Reason for attendance changes', { exact: true }).fill(reason + ' updated'); await expect(reviewBox(page)).not.toBeChecked(); });
  await check('Reviewed save includes only the dirty learner and creates immutable evidence', async () => {
    await prepare(page); const result = await submit(page, classroom.id);
    assert.equal(result.review.changes.length, 1); assert.equal(result.review.changes[0].studentId, blankPupil.id); assert.equal(result.review.changes[0].beforeRecord, null); assert.equal(result.review.changes[0].afterRecord.status, 'present');
    const actual = await api(teacher, '/api/attendance?classId=' + classroom.id + '&date=' + date); assert.equal(actual.length, 2); assert.equal(actual.find(item => item.studentId === savedPupil.id).note, savedNote); assert.equal(actual.some(item => item.studentId === untouchedPupil.id), false);
    await expect(reviewBox(page)).not.toBeChecked(); await expect(saveButton(page)).toBeDisabled();
  });
  await check('Two same-frame native submits create only one request and saved review', async () => {
    await status(page, savedPupil).selectOption('present'); await prepare(page, reason + ' same-frame');
    let posts = 0; const observe = request => { if (new URL(request.url()).pathname === endpoint(classroom.id) && request.method() === 'POST') posts++; }; page.on('request', observe);
    const before = (await api(teacher, endpoint(classroom.id) + '/history?date=' + date)).total;
    try { await saveButton(page).evaluate(button => { const form = button.form; form.requestSubmit(); form.requestSubmit(); }); await expect(page.getByRole('status').filter({ hasText: 'Current records reloaded.' })).toBeVisible(); } finally { page.off('request', observe); }
    assert.equal(posts, 1); assert.equal((await api(teacher, endpoint(classroom.id) + '/history?date=' + date)).total, before + 1); await expect(note(page, savedPupil)).toHaveValue(savedNote);
  });
  await check('HTML from saved class and note is escaped as plain text', async () => { await expect(page.getByText(classroom.name, { exact: true })).toBeVisible(); await expect(row(page, savedPupil)).toContainText(savedNote); await expect(page.locator('img[src=x]')).toHaveCount(0); assert.equal(await page.evaluate(() => window.__attendanceInjected), undefined); });
  await check('Real stale expected records conflict without erasing intended edits', async () => {
    await status(page, savedPupil).selectOption('absent'); await prepare(page, reason + ' compare conflict');
    await manualReview(teacher, classroom.id, date, [{ studentId: savedPupil.id, status: 'late' }, { studentId: untouchedPupil.id, status: 'present' }], reason + ' concurrent staff');
    const response = page.waitForResponse(item => new URL(item.url()).pathname === endpoint(classroom.id) && item.request().method() === 'POST'); await saveButton(page).click(); assert.equal((await response).status(), 409);
    await expect(page.getByRole('alert').filter({ hasText: 'Saved attendance or class access changed.' })).toBeVisible(); await expect(status(page, savedPupil)).toHaveValue('absent'); await expect(saveButton(page)).toBeDisabled(); await expect(reviewBox(page)).not.toBeChecked();
  });
  await check('Explicit comparison reload retains only intended edits and refreshes untouched rows', async () => {
    await page.getByRole('button', { name: 'Reload current records', exact: true }).click(); await expect(page.getByRole('status').filter({ hasText: 'Your intended edits are retained.' })).toBeVisible();
    await expect(row(page, savedPupil).getByText('late', { exact: true })).toBeVisible(); await expect(status(page, savedPupil)).toHaveValue('absent'); await expect(status(page, untouchedPupil)).toHaveValue('present');
    await expect(page.getByText('1 learner with intended changes.', { exact: true })).toBeVisible(); await expect(reviewBox(page)).not.toBeChecked();
    await prepare(page); const result = await submit(page, classroom.id); assert.equal(result.review.changes.length, 1); assert.equal(result.review.changes[0].studentId, savedPupil.id); assert.equal(result.review.changes[0].beforeRecord.status, 'late');
  });
  await check('A rejected save retains entries and visible error without claiming success', async () => {
    await status(page, blankPupil).selectOption('absent'); await prepare(page, reason + ' rejected');
    const match = url => url.pathname === endpoint(classroom.id); const reject = route => route.request().method() === 'POST' ? route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"Invalid request"}' }) : route.continue();
    await page.route(match, reject); try { await saveButton(page).click(); await expect(page.getByRole('alert').filter({ hasText: 'The attendance review was rejected.' })).toBeVisible(); await expect(status(page, blankPupil)).toHaveValue('absent'); await expect(reviewBox(page)).not.toBeChecked(); } finally { await page.unroute(match, reject); }
    assert.equal((await api(teacher, endpoint(classroom.id) + '?date=' + date)).roster.items.find(item => item.student.id === blankPupil.id).record.status, 'present');
  });
  await check('Lost acknowledgement preserves exact request and locks edits/date until retry', async () => {
    await prepare(page, reason + ' lost acknowledgement'); let original;
    const match = url => url.pathname === endpoint(classroom.id); const lose = async route => {
      if (route.request().method() !== 'POST') return route.continue();
      original = route.request().postDataJSON(); const response = await localRouteFetch(route); assert.equal(response.status(), 201);
      await manualReview(teacher, classroom.id, date, [{ studentId: blankPupil.id, status: 'late' }], reason + ' later current change'); await route.abort('failed');
    };
    await page.route(match, lose); try { await saveButton(page).click(); await expect(page.getByRole('alert').filter({ hasText: 'The save outcome is not confirmed.' })).toBeVisible(); } finally { await page.unroute(match, lose); }
    assert.ok(original?.clientRequestId); page.__originalAttendanceRequest = original;
    await expect(status(page, blankPupil)).toHaveValue('absent'); await expect(status(page, blankPupil)).toBeDisabled(); await expect(page.getByLabel('Attendance date', { exact: true })).toBeDisabled(); await expect(page.getByRole('button', { name: 'Retry pending save', exact: true })).toBeEnabled();
  });
  await check('Exact UUID replay confirms original receipt while reloading later current marks', async () => {
    const response = page.waitForResponse(item => new URL(item.url()).pathname === endpoint(classroom.id) && item.request().method() === 'POST'); await page.getByRole('button', { name: 'Retry pending save', exact: true }).click();
    const result = await response; assert.equal(result.status(), 200); assert.deepEqual(result.request().postDataJSON(), page.__originalAttendanceRequest); const evidence = await result.json(); assert.equal(evidence.replayed, true); assert.equal(evidence.review.id, page.__originalAttendanceRequest.clientRequestId); assert.equal(evidence.review.changes[0].afterRecord.status, 'absent');
    await expect(page.getByRole('status').filter({ hasText: 'Original attendance review confirmed.' })).toContainText('Current records reloaded.'); await expect(status(page, blankPupil)).toHaveValue('late');
    await expect(page.locator('[data-confirmed-attendance-review=' + JSON.stringify(evidence.review.id) + ']')).toContainText('absent');
  });
  await check('Confirmed save with failed refresh keeps receipt and truthfully blocks further edits', async () => {
    await status(page, savedPupil).selectOption('excused'); await prepare(page, reason + ' refresh failure'); let committed = false, receipt;
    const match = url => url.pathname === endpoint(classroom.id); const failRefresh = async route => {
      if (route.request().method() === 'POST') { const response = await localRouteFetch(route); receipt = await response.json(); committed = response.status() === 201; return route.fulfill({ response }); }
      if (committed) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Unavailable"}' }); return route.continue();
    };
    await page.route(match, failRefresh); try { await saveButton(page).click(); await expect(page.getByRole('status').filter({ hasText: 'Attendance review saved.' })).toContainText('Current records could not be refreshed.'); await expect(page.locator('[data-confirmed-attendance-review=' + JSON.stringify(receipt.review.id) + ']')).toBeVisible(); await expect(page.getByRole('button', { name: 'Retry pending save', exact: true })).toHaveCount(0); await expect(status(page, savedPupil)).toBeDisabled(); } finally { await page.unroute(match, failRefresh); }
    await page.getByRole('button', { name: 'Reload current records', exact: true }).click(); await expect(status(page, savedPupil)).toHaveValue('excused'); await expect(page.getByText('0 learners with intended changes.', { exact: true })).toBeVisible();
  });
  await check('Date changes clear previous edits/review and retain exact calendar date without timezone shifting', async () => {
    await status(page, savedPupil).selectOption('present'); await prepare(page); await page.getByLabel('Attendance date', { exact: true }).fill(secondDate);
    await expect(status(page, savedPupil)).toHaveValue('excused'); await expect(note(page, savedPupil)).toHaveValue('Other exact date ' + suffix); await expect(reviewBox(page)).not.toBeChecked(); await expect(page.getByLabel('Reason for attendance changes', { exact: true })).toHaveValue('');
    await expect(page.getByText('Date: ' + secondDate + '. Unrecorded learners remain blank. Only explicit changes are submitted.', { exact: true })).toBeVisible();
    await page.getByLabel('Attendance date', { exact: true }).fill(''); await expect(page.getByRole('alert').filter({ hasText: 'Choose a real calendar date' })).toBeVisible(); await expect(page.locator('[data-attendance-student]')).toHaveCount(0);
    await page.getByLabel('Attendance date', { exact: true }).fill('2028-02-29'); await expect(status(page, savedPupil)).toHaveValue(''); await expect(page.getByText('Date: 2028-02-29. Unrecorded learners remain blank. Only explicit changes are submitted.', { exact: true })).toBeVisible();
  });
  await check('A delayed obsolete date response cannot replace the newly selected snapshot', async () => {
    let release, started, done; const gate = new Promise(resolve => { release = resolve; }), begun = new Promise(resolve => { started = resolve; }), ended = new Promise(resolve => { done = resolve; });
    const match = url => url.pathname === endpoint(classroom.id) && url.searchParams.get('date') === date;
    const delay = async route => { const response = await localRouteFetch(route); started(); await gate; try { await route.fulfill({ response }); } catch { /* The old request was intentionally cancelled. */ } finally { done(); } };
    await page.route(match, delay); try { await page.getByLabel('Attendance date', { exact: true }).fill(date); await begun; await page.getByLabel('Attendance date', { exact: true }).fill(secondDate); await expect(note(page, savedPupil)).toHaveValue('Other exact date ' + suffix); release(); await ended; await page.waitForTimeout(100); await expect(page.getByLabel('Attendance date', { exact: true })).toHaveValue(secondDate); await expect(note(page, savedPupil)).toHaveValue('Other exact date ' + suffix); } finally { release(); await page.unroute(match, delay); }
  });
  await check('Immutable history displays exact before/after evidence independently of current marks', async () => {
    await page.getByLabel('Attendance date', { exact: true }).fill(date); await expect(status(page, blankPupil)).toHaveValue('late'); const actual = await api(teacher, endpoint(classroom.id) + '/history?date=' + date);
    await expect(page.locator('[data-attendance-review]')).toHaveCount(actual.total); const earlier = actual.items.find(item => item.reason.endsWith('lost acknowledgement')); assert.ok(earlier); const details = page.locator('[data-attendance-review=' + JSON.stringify(earlier.id) + ']'); await details.locator('summary').click(); await expect(details.getByRole('heading', { name: 'Before this review', exact: true })).toBeVisible(); await expect(details.getByRole('heading', { name: 'After this review', exact: true })).toBeVisible(); await expect(details).toContainText('absent');
  });
  await check('Unicode reasons/notes use code-point bounds and still require explicit review', async () => {
    await status(page, savedPupil).selectOption('present'); await note(page, savedPupil).fill('🙂'.repeat(2000)); await prepare(page, '🙂'.repeat(10)); await expect(page.getByText('Enter a single-line explanation of 10–500 characters. Current length: 10.', { exact: true })).toBeVisible(); const result = await submit(page, classroom.id); assert.equal(Array.from(result.review.reason).length, 10); assert.equal(Array.from(result.review.changes[0].afterRecord.note).length, 2000);
    await note(page, savedPupil).fill('🙂'.repeat(2001)); await page.getByLabel('Reason for attendance changes', { exact: true }).fill(reason); await reviewBox(page).check(); await expect(saveButton(page)).toBeDisabled(); await expect(page.getByRole('alert').filter({ hasText: 'keep new notes within 2,000 characters' })).toBeVisible();
  });
  await check('Committed access-denied acknowledgements retain exact retry until current access is verified', async () => {
    await note(page, savedPupil).fill('🙂'.repeat(2000));
    for (const [denial, mark] of [[403, 'excused'], [404, 'absent'], [401, 'present']]) {
      await status(page, blankPupil).selectOption(mark); await prepare(page, reason + ' denied acknowledgement ' + denial);
      let original; const match = url => url.pathname === endpoint(classroom.id);
      const denyAck = async route => { if (route.request().method() !== 'POST') return route.continue(); original = route.request().postDataJSON(); const response = await localRouteFetch(route); assert.equal(response.status(), 201); return route.fulfill({ status: denial, contentType: 'application/json', body: '{"error":"Unavailable"}' }); };
      await page.route(match, denyAck);
      try { await saveButton(page).click(); await expect(page.getByRole('alert')).toContainText('The save outcome is not confirmed'); await expect(page.locator('[data-attendance-student],[data-confirmed-attendance-review]')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Retry pending save', exact: true })).toHaveCount(0); await expect(page.getByLabel('Attendance date', { exact: true })).toBeDisabled(); if (denial === 401) await expect(page.getByRole('link', { name: 'Sign in again in another tab', exact: true })).toHaveAttribute('href', '/login'); }
      finally { await page.unroute(match, denyAck); }
      const historyMatch = url => url.pathname === endpoint(classroom.id) + '/history';
      const denyHistory = route => route.fulfill({ status: denial, contentType: 'application/json', body: '{"error":"Unavailable"}' });
      await page.route(historyMatch, denyHistory);
      try { await page.getByRole('button', { name: 'Reload current records', exact: true }).click(); await expect(page.locator('[data-attendance-student],[data-confirmed-attendance-review],[data-attendance-review]')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Retry pending save', exact: true })).toHaveCount(0); await expect(page.getByRole('status').filter({ hasText: 'Current records reloaded and access verified.' })).toHaveCount(0); await expect(page.getByRole('status').filter({ hasText: 'The original reviewed request remains pending.' })).toBeVisible(); }
      finally { await page.unroute(historyMatch, denyHistory); }
      await page.getByRole('button', { name: 'Reload current records', exact: true }).click(); await expect(page.getByRole('status').filter({ hasText: 'Current records reloaded and access verified.' })).toBeVisible();
      const retried = page.waitForResponse(response => new URL(response.url()).pathname === endpoint(classroom.id) && response.request().method() === 'POST'); await page.getByRole('button', { name: 'Retry pending save', exact: true }).click(); const response = await retried; assert.equal(response.status(), 200); assert.deepEqual(response.request().postDataJSON(), original); const result = await response.json(); assert.equal(result.review.id, original.clientRequestId); assert.equal(result.replayed, true); await expect(page.getByRole('status').filter({ hasText: 'Current records reloaded.' })).toBeVisible();
    }
  });
  await open(page, 'attendance-review-long-note-class');
  await check('Status-only correction preserves an exact legacy note longer than the replacement bound', async () => {
    const original = await api(teacher, endpoint('attendance-review-long-note-class') + '?date=' + date), pupil = original.roster.items[0].student, record = original.roster.items[0].record; assert.ok(Array.from(record.note).length > 2000);
    await expect(note(page, pupil)).toHaveValue(record.note); await status(page, pupil).selectOption(record.status === 'present' ? 'late' : 'present'); await prepare(page, reason + ' preserve long legacy note'); const result = await submit(page, 'attendance-review-long-note-class'); assert.equal(result.review.changes[0].beforeRecord.note, record.note); assert.equal(result.review.changes[0].afterRecord.note, record.note);
  });
  await open(page, 'attendance-review-legacy-class');
  await check('Real retained duplicate enrolments block the entire editor without deleting evidence', async () => { await expect(page.getByRole('alert').filter({ hasText: 'The stored roster or attendance requires review.' })).toBeVisible(); await expect(saveButton(page)).toBeDisabled(); assert.equal((await api(admin, '/api/enrolments?classId=attendance-review-legacy-class')).filter(item => item.studentId === 'attendance-review-legacy-student').length, 2); });
  await open(page, 'attendance-review-cap-class');
  await check('Actual 101-pupil roster discloses the 100-row bound and blocks partial saves', async () => { await expect(page.locator('[data-attendance-student]')).toHaveCount(100); await expect(page.getByRole('alert').filter({ hasText: 'Showing 100 of 101 active learners.' })).toBeVisible(); await expect(saveButton(page)).toBeDisabled(); });
  await check('Failed initial load exposes an error and cannot submit an unverified roster', async () => {
    const screen = await teacher.newPage(), match = url => url.pathname === endpoint(classroom.id);
    const fail = route => route.request().method() === 'GET' ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Unavailable"}' }) : route.continue();
    await screen.route(match, fail);
    try { await screen.goto(base.origin + '/classes/' + classroom.id + '/attendance', { waitUntil: 'networkidle' }); await expect(screen.getByRole('alert')).toContainText('Saved attendance could not be loaded.'); await expect(screen.locator('[data-attendance-student]')).toHaveCount(0); await expect(saveButton(screen)).toHaveCount(0); }
    finally { await screen.unroute(match, fail); }
    await screen.getByRole('button', { name: 'Reload current records', exact: true }).click(); await expect(screen.locator('[data-attendance-student]')).toHaveCount(3); await screen.close();
  });
  await check('Known history denial hides current private data and known committed evidence until authorized reload', async () => {
    const reload = screen => screen.getByRole('button', { name: 'Reload current records', exact: true });
    const historyMatch = url => url.pathname === endpoint(classroom.id) + '/history';
    for (const denial of [403, 404]) {
      const screen = await teacher.newPage(), deny = route => route.fulfill({ status: denial, contentType: 'application/json', body: '{"error":"Unavailable"}' });
      await screen.route(historyMatch, deny);
      try { await screen.goto(base.origin + '/classes/' + classroom.id + '/attendance', { waitUntil: 'domcontentloaded' }); await expect(screen.getByRole('alert')).toContainText(denial === 403 ? 'Your account does not have permission' : 'This class is unavailable'); await expect(screen.locator('[data-attendance-student],[data-confirmed-attendance-review],[data-attendance-review]')).toHaveCount(0); await expect(saveButton(screen)).toHaveCount(0); }
      finally { await screen.unroute(historyMatch, deny); }
      await reload(screen).click(); await expect(screen.locator('[data-attendance-student]')).toHaveCount(3); await expect(status(screen, savedPupil)).toBeEnabled(); await screen.close();
    }
    const screen = await teacher.newPage(); await open(screen, classroom.id); await note(screen, blankPupil).fill('Known committed history denial ' + suffix); await prepare(screen, reason + ' committed history denial');
    const deny = route => route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"Unavailable"}' }); await screen.route(historyMatch, deny);
    try { const saved = screen.waitForResponse(item => new URL(item.url()).pathname === endpoint(classroom.id) && item.request().method() === 'POST'); await saveButton(screen).click(); const response = await saved; assert.equal(response.status(), 201); await response.body(); await expect(screen.getByRole('status').filter({ hasText: 'Attendance review saved.' })).toContainText('Current access could not be verified.'); await expect(screen.getByRole('status').filter({ hasText: 'Current records reloaded.' })).toHaveCount(0); await expect(screen.locator('[data-attendance-student],[data-confirmed-attendance-review],[data-attendance-review]')).toHaveCount(0); await expect(screen.getByRole('button', { name: 'Retry pending save', exact: true })).toHaveCount(0); }
    finally { await screen.unroute(historyMatch, deny); }
    await reload(screen).click(); await expect(note(screen, blankPupil)).toHaveValue('Known committed history denial ' + suffix); await expect(screen.getByText('0 learners with intended changes.', { exact: true })).toBeVisible(); await screen.close();
  });
  await check('Temporary history503 remains an availability error while authorized current marks remain usable', async () => {
    const screen = await teacher.newPage(), match = url => url.pathname === endpoint(classroom.id) + '/history';
    const fail = route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Unavailable"}' }); await screen.route(match, fail);
    try { await screen.goto(base.origin + '/classes/' + classroom.id + '/attendance', { waitUntil: 'domcontentloaded' }); await expect(screen.getByRole('alert')).toContainText('Review history could not be loaded.'); await expect(screen.locator('[data-attendance-student]')).toHaveCount(3); await expect(status(screen, savedPupil)).toBeEnabled(); await expect(screen.getByText('0 learners with intended changes.', { exact: true })).toBeVisible(); }
    finally { await screen.unroute(match, fail); await screen.close(); }
  });
  await check('Family accounts see a clear recording denial without editor requests or private roster', async () => {
    for (const value of [family, learner]) { const screen = await value.newPage(); let editorRequests = 0; screen.on('request', request => { if (new URL(request.url()).pathname.startsWith(endpoint(classroom.id))) editorRequests++; }); await screen.goto(base.origin + '/classes/' + classroom.id + '/attendance', { waitUntil: 'networkidle' }); await expect(screen.getByRole('alert')).toContainText('Attendance recording is available to authorised school staff.'); await expect(screen.getByLabel('Attendance date', { exact: true })).toHaveCount(0); await expect(screen.locator('[data-attendance-student]')).toHaveCount(0); assert.equal(editorRequests, 0); await api(value, endpoint(classroom.id) + '?date=' + date, 'GET', undefined, 403); await screen.close(); }
  });
  await check('Unassigned teacher receives clear unavailable scope without roster disclosure', async () => { const screen = await other.newPage(); await screen.goto(base.origin + '/classes/' + classroom.id + '/attendance', { waitUntil: 'networkidle' }); await expect(screen.getByRole('alert')).toContainText('This class is unavailable'); await expect(screen.locator('[data-attendance-student]')).toHaveCount(0); await screen.close(); });
  await check('Anonymous recorder requests redirect to sign-in', async () => { const value = await context(null), screen = await value.newPage(); await screen.goto(base.origin + '/classes/' + classroom.id + '/attendance', { waitUntil: 'networkidle' }); await expect(screen).toHaveURL(base.origin + '/login'); await expect(screen.locator('[data-attendance-student]')).toHaveCount(0); await screen.close(); });
  await open(page, classroom.id);
  await check('Desktop recorder has native labels, visible saved states and no overflow', async () => { await labelsAndWidth(page); await expect(page.getByRole('main')).toHaveCount(1); }); await shot(page, 'desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await check('390px recorder and history wrap long text and support keyboard controls', async () => { await labelsAndWidth(page); await status(page, blankPupil).focus(); await expect(status(page, blankPupil)).toBeFocused(); await page.keyboard.press('ArrowDown'); await page.getByRole('link', { name: 'Attendance records', exact: true }).focus(); await expect(page.getByRole('link', { name: 'Attendance records', exact: true })).toBeFocused(); }); await shot(page, 'mobile');
  await check('Native attendance summary link opens the permitted recorded-data page', async () => { await page.getByRole('link', { name: 'Attendance records', exact: true }).click(); await expect(page).toHaveURL(base.origin + '/attendance'); await expect(page.getByRole('heading', { name: 'Attendance Summary', exact: true, level: 1 })).toBeVisible(); });
  await check('Browser assets load and all observed requests stay local', async () => { assert.deepEqual(pageErrors, []); assert.deepEqual(externalRequests, []); assert.deepEqual(failedResources, []); });
  const result = { executedAt: new Date().toISOString(), passed, failed: 0, skipped: 0, externalRequests: externalRequests.length, pageErrors: pageErrors.length, checks, screenshots, limits: ['Built localhost Worker with final migrated synthetic sessions only.', 'Failure injections model local rejected, lost-acknowledgement and failed-refresh delivery; no external messaging/provider calls.', 'Suffix-only fixtures and explicit real reviews were added; base actor/profile/enrolment states were unchanged.', 'Legacy duplicate enrolments were seeded before final guards; no confirmed rows were deleted or merged.', 'This does not establish educational date/attendance policy, accessibility certification, hosted release or UAT approval.'] };
  writeFileSync((process.env.SAHA_TEST_OUTPUT_DIR || '/private/tmp') + '/saha-attendance-ui-results.json', JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify({ passed, failed: 0, skipped: 0, externalRequests: externalRequests.length, pageErrors: pageErrors.length }));
} catch (error) {
  for (const value of contexts) for (const page of value.pages()) if (page.url().startsWith(base.origin)) console.error('Local screen: ' + new URL(page.url()).pathname + '\n' + (await page.locator('body').innerText()).slice(0, 1600));
  console.log(JSON.stringify({ passed, failed: 1, externalRequests: externalRequests.length, pageErrors: pageErrors.length })); throw error;
} finally { for (const value of contexts) await value.close(); await browser.close(); }
