// Manual local-only mounted procedure for school setup and student/guardian records (FR-05, FR-06).
// Runs against the built Worker with the synthetic records fixture (tests/support/write-records-fixture.mjs).
// Offline: any request that is not the local Worker origin is aborted and counted. Synthetic data only.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';

const base = new URL(process.env.SAHA_WORKER_TEST_URL), fixture = process.env.SAHA_WORKER_SESSION_FIXTURE, executablePath = process.env.SAHA_TEST_BROWSER;
if (!fixture || !executablePath || !['127.0.0.1', 'localhost'].includes(base.hostname) || base.pathname !== '/' || base.search || base.hash || base.username || base.password) throw new Error('Use an exact local Worker origin, private synthetic sessions and local Chrome.');
const outputDir = process.env.SAHA_TEST_OUTPUT_DIR || join(tmpdir(), 'saha-school-records-demo'); mkdirSync(outputDir, { recursive: true });
const sessions = JSON.parse(readFileSync(fixture, 'utf8'));
const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-background-networking'] });
const contexts = [], external = [], errors = [], assets = [], checks = [], screenshots = [], dialogs = [];
let passed = 0;
async function check(name, work) { await work(); passed++; checks.push(name); console.log('ok - ' + name); }

async function context(user, viewport = { width: 1280, height: 900 }) {
  const cookie = sessions[user]; assert.equal(typeof cookie, 'string', 'session for ' + user);
  const value = await browser.newContext({ viewport, serviceWorkers: 'block', timezoneId: 'Asia/Kolkata', extraHTTPHeaders: { cookie } });
  const split = cookie.indexOf('=');
  await value.addCookies([{ name: cookie.slice(0, split), value: cookie.slice(split + 1), domain: base.hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }]);
  contexts.push(value);
  value.on('page', page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.dismiss(); });
    page.on('response', response => { if (response.status() >= 400 && ['script', 'stylesheet'].includes(response.request().resourceType())) assets.push({ path: new URL(response.url()).pathname, status: response.status() }); });
  });
  await value.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin === base.origin) return route.continue(); external.push(url.origin); return route.abort(); });
  return value;
}
async function api(ctx, path, method = 'GET', data, expected = 200) {
  const url = new URL(path, base); assert.equal(url.origin, base.origin);
  const response = await ctx.request.fetch(url.href, { method, timeout: 15000, maxRedirects: 0, headers: method === 'GET' ? {} : { Origin: base.origin }, ...(data === undefined ? {} : { data }) });
  const text = await response.text(); assert.equal(response.status(), expected, method + ' ' + path + ' -> ' + text.slice(0, 200));
  return text ? JSON.parse(text) : null;
}
async function open(page, path, heading) {
  await page.goto(base.origin + path, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: heading, exact: true, level: 2 })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /^Loading/ })).toHaveCount(0);
}
async function fit(page) {
  assert.equal(await page.locator('input:not([type=hidden]),select,textarea').evaluateAll(items => items.filter(item => !item.labels?.length && !item.getAttribute('aria-label') && !item.getAttribute('aria-labelledby')).length), 0, 'every control is labelled');
  const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(size.scroll <= size.width + 1, 'no horizontal overflow ' + JSON.stringify(size));
  const text = await page.locator('main').innerText();
  assert.ok(!/\bundefined\b|\bnull\b|\[object|\{"|student-a|student-other|guardian-profile|extra-student|admin-a|teacher-a|NaN/.test(text), 'no raw JSON, null or internal ids on screen: ' + text.slice(0, 200));
}
async function shot(page, name) { const path = join(outputDir, name + '.png'); await page.screenshot({ path, fullPage: true }); screenshots.push(path); }
const notice = (page, pattern, role = 'status') => page.getByRole(role).filter({ hasText: pattern });
const rowsOf = page => page.locator('ul[aria-label="Students"] > li');

const resultPath = join(outputDir, 'school-records-demo-results.json');
try {
  const admin = await context('admin-a'), second = await context('admin-a'), adminB = await context('admin-b');
  const teacher = await context('teacher-a'), guardian = await context('guardian-a'), guardianOther = await context('guardian-other');
  const learner = await context('student-user-a');
  const school = (await api(admin, '/api/session')).schoolId;
  const setupUrl = `/api/schools/${encodeURIComponent(school)}/setup`;
  const page = await admin.newPage();

  await check('Administrator edits school basics and the saved values survive a reload', async () => {
    await open(page, '/schools/setup', 'School setup');
    const form = page.getByRole('form', { name: 'School details form' });
    await expect(form.getByLabel('School name', { exact: true })).toHaveValue('Riverside Primary (synthetic)');
    await form.getByLabel('School name', { exact: true }).fill('Riverside Primary School (synthetic)');
    await form.getByLabel('Address', { exact: true }).fill('12 Synthetic Road, Demo Town');
    await form.getByLabel('Academic year', { exact: true }).fill('2026-27');
    await form.getByLabel('Contact email', { exact: true }).fill('office@riverside.example.invalid');
    await form.getByLabel('Contact phone', { exact: true }).fill('+91 80000 12345');
    await form.getByRole('button', { name: 'Save school details' }).click();
    await expect(notice(page, 'School details saved.')).toBeVisible();
    await page.reload(); await expect(page.getByRole('form', { name: 'School details form' }).getByLabel('Academic year', { exact: true })).toHaveValue('2026-27');
    await expect(page.getByLabel('Address', { exact: true })).toHaveValue('12 Synthetic Road, Demo Town');
    const saved = await api(admin, setupUrl); assert.equal(saved.school.name, 'Riverside Primary School (synthetic)'); assert.equal(saved.settings.contactPhone, '+91 80000 12345');
  });
  await check('Invalid contact details are refused in plain language and nothing is saved', async () => {
    const form = page.getByRole('form', { name: 'School details form' });
    await form.getByLabel('Contact email', { exact: true }).fill('not-an-email');
    await form.getByRole('button', { name: 'Save school details' }).click();
    await expect(notice(page, /Please check: contact email/, 'alert')).toBeVisible();
    assert.equal((await api(admin, setupUrl)).settings.contactEmail, 'office@riverside.example.invalid');
    await form.getByLabel('Contact email', { exact: true }).fill('office@riverside.example.invalid');
  });
  await check('Terms: add two, reject an overlap, edit one and choose the current term', async () => {
    const add = async (name, from, to, year = '2026-27') => {
      const form = page.getByRole('form', { name: 'Add a term' });
      await form.getByLabel('Academic year', { exact: true }).fill(year); await form.getByLabel('Term name', { exact: true }).fill(name);
      await form.getByLabel('Starts on', { exact: true }).fill(from); await form.getByLabel('Ends on', { exact: true }).fill(to);
      await form.getByRole('button', { name: 'Add term' }).click();
    };
    await add('Term 1', '2026-06-01', '2026-09-30'); await expect(notice(page, 'Term added.')).toBeVisible();
    await add('Term 2', '2026-10-01', '2027-01-31'); await expect(page.getByRole('list', { name: 'Terms' }).getByRole('listitem')).toHaveCount(2);
    await add('Term X', '2026-09-15', '2026-10-15'); await expect(notice(page, /overlap another term/, 'alert')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Terms' }).getByRole('listitem')).toHaveCount(2);
    await page.getByRole('button', { name: 'Edit Term 2' }).click();
    const editor = page.getByRole('form', { name: 'Edit Term 2' }); await editor.getByLabel('Ends on', { exact: true }).fill('2027-02-15'); await editor.getByRole('button', { name: 'Save term' }).click();
    await expect(notice(page, 'Term 2 saved.')).toBeVisible();
    const form = page.getByRole('form', { name: 'School details form' });
    await form.getByLabel('Current term', { exact: true }).selectOption({ label: 'Term 1 (2026-27)' }); await form.getByRole('button', { name: 'Save school details' }).click();
    await expect(notice(page, 'School details saved.')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Terms' }).getByRole('listitem').first()).toContainText('Current');
    const saved = await api(admin, setupUrl); assert.equal(saved.terms.length, 2); assert.equal(saved.terms.find(term => term.name === 'Term 2').endsOn, '2027-02-15');
  });
  await check('A stale school save keeps the draft, names what changed and can be saved after reloading the latest', async () => {
    const other = await second.newPage(); await open(other, '/schools/setup', 'School setup');
    await open(page, '/schools/setup', 'School setup');
    const theirs = other.getByRole('form', { name: 'School details form' }); await theirs.getByLabel('School name', { exact: true }).fill('Riverside Primary Updated (synthetic)'); await theirs.getByRole('button', { name: 'Save school details' }).click();
    await expect(notice(other, 'School details saved.')).toBeVisible();
    const mine = page.getByRole('form', { name: 'School details form' }); await mine.getByLabel('Address', { exact: true }).fill('99 Conflict Lane');
    await mine.getByRole('button', { name: 'Save school details' }).click();
    await expect(notice(page, /Someone else changed this record/, 'alert')).toBeVisible();
    await expect(mine.getByLabel('Address', { exact: true })).toHaveValue('99 Conflict Lane');
    assert.equal((await api(admin, setupUrl)).school.address, '12 Synthetic Road, Demo Town', 'a stale save changes nothing');
    await shot(page, 'setup-conflict');
    await page.getByRole('button', { name: 'Load latest and keep my edits' }).click();
    await expect(notice(page, /School name is now saved as "Riverside Primary Updated \(synthetic\)"/, 'alert')).toBeVisible();
    await expect(mine.getByLabel('Address', { exact: true })).toHaveValue('99 Conflict Lane');
    await mine.getByRole('button', { name: 'Save school details' }).click(); await expect(notice(page, 'School details saved.')).toBeVisible();
    const saved = await api(admin, setupUrl); assert.equal(saved.school.address, '99 Conflict Lane'); assert.equal(saved.school.name, 'Riverside Primary Updated (synthetic)');
    await other.close();
  });
  await check('Teacher, guardian and learner can read school setup but have no edit controls', async () => {
    for (const actor of [teacher, guardian, learner]) {
      const view = await actor.newPage(); await open(view, '/schools/setup', 'School setup');
      await expect(view.getByRole('form')).toHaveCount(0); await expect(view.getByRole('button', { name: /Save|Add term|Edit/ })).toHaveCount(0);
      await expect(view.locator('dt', { hasText: 'School name' })).toBeVisible(); await expect(view.locator('dd', { hasText: 'Riverside Primary Updated (synthetic)' })).toBeVisible(); await fit(view); await view.close();
    }
    await api(teacher, setupUrl, 'PATCH', { name: 'x' }, 403); await api(guardian, setupUrl, 'PATCH', { name: 'x' }, 403);
  });

  await check('Student directory: search, grade and status filters and paging stay inside the school', async () => {
    const all = await api(admin, '/api/records/students?status=all&limit=100'); assert.equal(all.total, 28, 'two seeded plus twenty-six synthetic students in this school');
    await open(page, '/records', 'Student records');
    await expect(page.getByText('Showing 1 to 25 of 28 students.')).toBeVisible(); await expect(rowsOf(page)).toHaveCount(25);
    await page.getByRole('navigation', { name: 'Student pages' }).getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText('Showing 26 to 28 of 28 students.')).toBeVisible(); await expect(rowsOf(page)).toHaveCount(3);
    const search = page.getByRole('searchbox', { name: 'Search by name or admission number' });
    await search.fill('asha'); await search.press('Enter');
    await expect(rowsOf(page)).toHaveCount(1); await expect(rowsOf(page).first()).toContainText('Asha Verma');
    await search.fill('rv-10'); await search.press('Enter'); await expect(page.getByText(/of 10 students/)).toBeVisible();
    await search.fill(''); await page.getByLabel('Grade', { exact: true }).selectOption('9'); await page.getByRole('button', { name: 'Search' }).click();
    const nines = await api(admin, '/api/records/students?grade=9&limit=100'); await expect(page.getByText(`of ${nines.total} students`)).toBeVisible();
    await page.getByLabel('Grade', { exact: true }).selectOption(''); await search.fill('zzzz-nobody'); await search.press('Enter');
    await expect(page.getByText('No students match these filters.')).toBeVisible();
    await search.fill('khan'); await search.press('Enter'); await expect(rowsOf(page)).toHaveCount(1);
    const foreign = await api(admin, '/api/records/students?q=chitra&status=all'); assert.equal(foreign.total, 0, 'another school is never searched');
    await fit(page);
  });

  const studentPath = '/records/students/student-a', studentApi = '/api/records/students/student-a';
  await check('Student record edit saves, refuses a taken admission number and resolves a stale edit from a second session', async () => {
    await open(page, studentPath, 'Manage student record'); await expect(page.getByRole('heading', { name: 'Asha Verma', level: 3 })).toBeVisible();
    const form = page.getByRole('form', { name: 'Student details form' });
    await form.getByLabel('Admission number', { exact: true }).fill('RV-100'); await form.getByRole('button', { name: 'Save student details' }).click();
    await expect(notice(page, /already used by another student record/, 'alert')).toBeVisible();
    await form.getByLabel('Admission number', { exact: true }).fill('RV-001'); // restore the original
    const other = await second.newPage(); await open(other, studentPath, 'Manage student record');
    const theirs = other.getByRole('form', { name: 'Student details form' }); await theirs.getByLabel('Grade', { exact: true }).fill('9'); await theirs.getByRole('button', { name: 'Save student details' }).click();
    await expect(notice(other, 'Student details saved.')).toBeVisible();
    await form.getByLabel('First name', { exact: true }).fill('Asha K'); await form.getByRole('button', { name: 'Save student details' }).click();
    await expect(notice(page, /Someone else changed this record/, 'alert')).toBeVisible(); await expect(form.getByLabel('First name', { exact: true })).toHaveValue('Asha K');
    assert.equal((await api(admin, studentApi)).student.firstName, 'Asha', 'stale save changed nothing');
    await page.getByRole('button', { name: 'Load latest and keep my edits' }).click(); await expect(notice(page, /grade is now "9"/, 'alert')).toBeVisible();
    await form.getByRole('button', { name: 'Save student details' }).click(); await expect(notice(page, 'Student details saved.')).toBeVisible();
    const saved = (await api(admin, studentApi)).student; assert.equal(saved.firstName, 'Asha K'); assert.equal(saved.gradeLevel, '9');
    await form.getByLabel('First name', { exact: true }).fill('Asha'); await form.getByRole('button', { name: 'Save student details' }).click(); await expect(notice(page, 'Student details saved.')).toBeVisible();
    await other.close();
  });
  await check('Deactivate needs a reason and a confirmation, withdraws enrolments, hides the student by default and can be reversed', async () => {
    await open(page, studentPath, 'Manage student record');
    const deactivate = page.getByRole('button', { name: 'Deactivate student' }); await expect(deactivate).toBeDisabled();
    await page.locator('#status-reason').fill('Too short'); await expect(deactivate).toBeDisabled();
    await page.locator('#status-reason').fill('Moved to another school in the district'); await deactivate.click();
    await expect(page.getByRole('group', { name: 'Confirm status change' })).toContainText('withdraw 1 active enrolment');
    await page.getByRole('button', { name: 'Yes, deactivate' }).click();
    await expect(notice(page, 'Student deactivated. No records were deleted.')).toBeVisible();
    const detail = await api(admin, studentApi); assert.equal(detail.student.status, 'inactive'); assert.equal(detail.activeEnrolments, 0); assert.equal(detail.history[0].withdrawnEnrolments, 1);
    await expect(page.getByRole('list', { name: 'Record history' })).toContainText('deactivated the student (1 enrolment withdrawn)');
    await shot(page, 'student-inactive');
    await open(page, '/records', 'Student records'); await page.getByRole('searchbox', { name: 'Search by name or admission number' }).fill('asha'); await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByText('No students match these filters.')).toBeVisible();
    await page.getByLabel('Status', { exact: true }).selectOption('inactive'); await page.getByRole('button', { name: 'Search' }).click(); await expect(rowsOf(page).first()).toContainText('Inactive');
    await open(page, studentPath, 'Manage student record'); await page.locator('#status-reason').fill('Returned after the term break'); await page.getByRole('button', { name: 'Reactivate student' }).click();
    await page.getByRole('button', { name: 'Yes, reactivate' }).click(); await expect(notice(page, 'Student reactivated.')).toBeVisible();
    assert.equal((await api(admin, studentApi)).student.status, 'active');
  });
  await check('Guardian links: link a primary contact, edit it, unlink it, and history keeps every step', async () => {
    await open(page, studentPath, 'Manage student record');
    const list = page.getByRole('list', { name: 'Linked guardians' }); await expect(list).toContainText('Meera Verma');
    const form = page.getByRole('form', { name: 'Link a guardian' });
    await form.getByLabel('Guardian', { exact: true }).selectOption({ label: 'Farah Spare' }); await expect(form.getByLabel('Relationship to the student')).toHaveValue('Aunt');
    await form.getByLabel('Primary contact for this student').check(); await form.getByLabel('Reason').fill('Aunt collects the child each day');
    await form.getByRole('button', { name: 'Link guardian' }).click(); await expect(notice(page, 'Farah Spare is now linked.')).toBeVisible();
    await expect(list.getByRole('listitem').filter({ hasText: 'Farah Spare' })).toContainText('Primary contact'); await expect(list.getByRole('listitem').filter({ hasText: 'Meera Verma' })).not.toContainText('Primary contact');
    const inventory = await api(admin, studentApi + '/guardian-links'); assert.equal(inventory.links.filter(row => row.isPrimary).length, 1, 'only one primary contact');
    await page.getByRole('button', { name: 'Edit link to Farah Spare' }).click();
    const edit = page.getByRole('form', { name: 'Edit link to Farah Spare' }); await edit.getByLabel('Relationship to the student').fill('Aunt (maternal)'); await edit.getByLabel('Reason').fill('Corrected how she is related');
    await edit.getByRole('button', { name: 'Save link' }).click(); await expect(notice(page, 'Link to Farah Spare updated.')).toBeVisible(); await expect(list).toContainText('Aunt (maternal)');
    await page.getByRole('button', { name: 'Unlink Farah Spare' }).click();
    const unlink = page.getByRole('form', { name: 'Unlink Farah Spare' }); await unlink.getByLabel('Reason').fill('Aunt no longer collects the child');
    await unlink.getByRole('button', { name: 'Unlink guardian' }).click(); await expect(notice(page, /Farah Spare is no longer linked/)).toBeVisible();
    await expect(list).not.toContainText('Farah Spare');
    const history = page.getByRole('list', { name: 'Record history' }); await expect(history).toContainText('unlinked Farah Spare'); await expect(history).toContainText('linked Farah Spare as Aunt'); await expect(history).toContainText('Reason: Aunt no longer collects the child');
    const after = await api(admin, studentApi + '/guardian-links'); assert.ok(after.history.length >= 4, 'link, demotion of the old primary, update and unlink are all recorded'); assert.ok(after.candidates.some(row => row.name === 'Farah Spare'));
    await shot(page, 'student-links-history'); await fit(page);
  });
  await check('A guardian link made from a stale second session is refused without changing anything', async () => {
    const one = await admin.newPage(), two = await second.newPage();
    await open(one, studentPath, 'Manage student record'); await open(two, studentPath, 'Manage student record');
    const link = async (view, reason) => { const form = view.getByRole('form', { name: 'Link a guardian' }); await form.getByLabel('Guardian', { exact: true }).selectOption({ label: 'Gopal Spare' }); await form.getByLabel('Relationship to the student').fill('Uncle'); await form.getByLabel('Reason').fill(reason); await form.getByRole('button', { name: 'Link guardian' }).click(); };
    await link(one, 'Uncle is an emergency contact'); await expect(notice(one, 'Gopal Spare is now linked.')).toBeVisible();
    await link(two, 'Uncle is an emergency contact too'); await expect(notice(two, /already linked|Someone else changed/, 'alert')).toBeVisible();
    assert.equal((await api(admin, studentApi + '/guardian-links')).links.filter(row => row.name === 'Gopal Spare').length, 1);
    await one.close(); await two.close();
  });

  await check('A guardian sees only linked children and their own profile, with no management controls', async () => {
    const view = await guardian.newPage(); await open(view, '/records', 'Student records');
    await expect(rowsOf(view)).toHaveCount(1); await expect(rowsOf(view).first()).toContainText('Asha'); await expect(rowsOf(view).first().getByRole('link')).toHaveAttribute('href', /^\/students\//);
    await open(view, '/records/guardians', 'Guardian records'); await expect(view.locator('ul[aria-label="Guardians"] > li')).toHaveCount(1);
    await view.locator('ul[aria-label="Guardians"] a').click(); await expect(view.getByRole('heading', { name: 'Guardian record', exact: true, level: 2 })).toBeVisible();
    await expect(view.getByRole('form')).toHaveCount(0); await expect(view.getByRole('list', { name: 'Linked children' }).getByRole('listitem')).toHaveCount(1); await fit(view);
    await api(guardian, '/api/records/guardians/guardian-profile-other', 'GET', undefined, 404); await api(guardian, '/api/records/students/student-a', 'GET', undefined, 403);
    await open(view, '/records/students/student-a', 'Manage student record'); await expect(notice(view, /Only administrators can manage student records/, 'alert')).toBeVisible();
    const peer = await guardianOther.newPage(); await open(peer, '/records', 'Student records'); await expect(rowsOf(peer)).toHaveCount(1); await expect(rowsOf(peer).first()).toContainText('Bilal'); await peer.close();
    await view.close();
  });
  await check('A learner sees only themself and a teacher only students of assigned classes', async () => {
    const view = await learner.newPage(); await open(view, '/records', 'Student records'); await expect(rowsOf(view)).toHaveCount(1); await expect(rowsOf(view).first()).toContainText('Asha');
    await open(view, '/records/guardians', 'Guardian records'); await expect(view.locator('ul[aria-label="Guardians"]')).toContainText('Meera Verma'); await expect(view.locator('ul[aria-label="Guardians"]')).not.toContainText('Imran Khan'); await view.close();
    const own = await api(teacher, '/api/records/students?status=all&limit=100'); assert.equal(own.total, 0, 'the earlier deactivation withdrew the only active enrolment and reactivation does not restore it');
    const mine = await teacher.newPage(); await open(mine, '/records', 'Student records'); await expect(mine.getByText('There are no student records to show for your account yet.')).toBeVisible(); await mine.close();
    const other = await context('teacher-other'); const expected = await api(other, '/api/records/students?status=all&limit=100'); const row = await other.newPage(); await open(row, '/records', 'Student records');
    await expect(rowsOf(row)).toHaveCount(expected.items.length); assert.equal(expected.items.length, 1); await expect(rowsOf(row).first()).toContainText('Bilal'); assert.ok(expected.items.length < 28);
    await row.close();
  });
  await check('Another school is invisible: its administrator sees only their students and cross-school records are not found', async () => {
    const view = await adminB.newPage(); await open(view, '/records', 'Student records'); await expect(rowsOf(view)).toHaveCount(1); await expect(rowsOf(view).first()).toContainText('Chitra');
    await open(view, '/records/students/student-a', 'Manage student record'); await expect(notice(view, /not available to your account/, 'alert')).toBeVisible();
    await api(adminB, '/api/records/students/student-a/guardian-links', 'GET', undefined, 404); await api(adminB, `/api/schools/${encodeURIComponent(school)}/setup`, 'GET', undefined, 404);
    await api(adminB, '/api/records/students/student-a/status', 'POST', { action: 'deactivate', reason: 'Cross school attempt', expectedVersion: 0, clientRequestId: crypto.randomUUID() }, 404);
    assert.equal((await api(admin, studentApi)).student.status, 'active'); await view.close();
  });
  await check('Keyboard use works: tab reaches search, Enter submits, and no browser dialogs were used', async () => {
    await open(page, '/records', 'Student records'); const search = page.getByRole('searchbox', { name: 'Search by name or admission number' });
    await search.focus(); await expect(search).toBeFocused(); await page.keyboard.type('khan'); await page.keyboard.press('Enter'); await expect(rowsOf(page)).toHaveCount(1);
    await page.keyboard.press('Tab'); await expect(page.getByLabel('Grade', { exact: true })).toBeFocused();
    assert.deepEqual(dialogs, []);
  });
  await check('375px phone width: setup, directories, student and guardian pages have labelled controls and no sideways scrolling', async () => {
    const phone = await context('admin-a', { width: 375, height: 800 }); const view = await phone.newPage();
    await open(view, '/schools/setup', 'School setup'); await fit(view); await shot(view, 'setup-375');
    await open(view, '/records', 'Student records'); await fit(view); await shot(view, 'directory-375');
    await open(view, '/records/guardians', 'Guardian records'); await fit(view);
    await open(view, studentPath, 'Manage student record'); await fit(view); await shot(view, 'student-375');
    await open(view, '/records/guardians/guardian-profile-a', 'Guardian record'); await fit(view); await shot(view, 'guardian-375');
    await view.close();
  });
  await shot(page, 'directory-desktop');
  await check('Observed traffic stayed on the local Worker with no page errors or failed assets', async () => { assert.deepEqual(external, []); assert.deepEqual(errors, []); assert.deepEqual(assets, []); assert.deepEqual(dialogs, []); });

  const result = { executedAt: new Date().toISOString(), passed, failed: 0, skipped: 0, externalRequests: external.length, pageErrors: errors.length, dialogs: dialogs.length, checks, screenshots,
    limits: ['Built localhost Worker, local D1 and synthetic opaque session cookies only.', 'A second browser context with the same administrator session stands in for a second session.', 'Not a real school, provider or UAT evidence; no case is accepted by this run.'] };
  writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify({ passed, failed: 0, externalRequests: external.length, pageErrors: errors.length, dialogs: dialogs.length }));
} catch (error) {
  writeFileSync(resultPath, JSON.stringify({ executedAt: new Date().toISOString(), passed, failed: 1, checks, screenshots, failure: error instanceof Error ? error.message : String(error), externalRequests: external.length, pageErrors: errors.length }, null, 2) + '\n'); throw error;
} finally { for (const item of contexts) await item.close(); await browser.close(); }
