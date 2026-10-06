// Manual localhost-only browser procedure for FR-12 in-app notices and FR-26 audit and corrections.
// Runs against the final migrated Worker built from this checkout with the synthetic fixture written by
// tests/support/write-notices-audit-fixture.mjs. Real sign-in, ORF sync, paid AI and delivery stay disabled:
// every non-local request is aborted and counted, and the run must finish with zero of them.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';

const origin = process.env.SAHA_WORKER_TEST_URL, fixture = process.env.SAHA_WORKER_SESSION_FIXTURE, executablePath = process.env.SAHA_TEST_BROWSER;
if (!origin || !fixture || !executablePath) throw new Error('Supply a local built Worker, private synthetic sessions and local browser.');
const base = new URL(origin);
const outputDir = process.env.SAHA_TEST_OUTPUT_DIR || '/tmp'; mkdirSync(outputDir, { recursive: true });
if (!['127.0.0.1', 'localhost'].includes(base.hostname) || base.protocol !== 'http:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('Notices/audit procedure requires a plain local http origin.');
expect.configure({ timeout: 15000 });
const sessions = JSON.parse(readFileSync(fixture, 'utf8'));
const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-background-networking'] });
const contexts = [], pageErrors = [], externalRequests = [], failedResources = [], dialogs = [], checks = [], screenshots = [];
let passed = 0;
const suffix = crypto.randomUUID().slice(0, 8);
const check = async (name, action) => { await action(); passed++; checks.push(name); console.log('ok - ' + name); };
async function context(user, viewport = { width: 1280, height: 900 }) {
  if (user && typeof sessions[user] !== 'string') throw new Error('Missing a required synthetic session: ' + user);
  const value = await browser.newContext({ viewport, serviceWorkers: 'block', extraHTTPHeaders: user ? { cookie: sessions[user] } : {} });
  if (user) { const separator = sessions[user].indexOf('='); await value.addCookies([{ name: sessions[user].slice(0, separator), value: sessions[user].slice(separator + 1), domain: base.hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }]); }
  value.label = user ?? 'anonymous'; contexts.push(value);
  value.on('page', page => {
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
    page.on('response', response => { if (response.status() >= 400 && ['script', 'stylesheet'].includes(response.request().resourceType())) failedResources.push({ path: new URL(response.url()).pathname, status: response.status() }); });
  });
  await value.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin === base.origin) return route.continue(); externalRequests.push({ origin: url.origin, pathname: url.pathname }); return route.abort(); });
  return value;
}
async function raw(value, path, method = 'GET', data) {
  const url = new URL(path, base); if (url.origin !== base.origin) throw new Error('Synthetic requests must remain local.');
  try { return await value.request.fetch(url.href, { method, timeout: 30000, maxRedirects: 0, headers: method === 'GET' ? {} : { Origin: base.origin }, ...(data === undefined ? {} : { data }) }); }
  catch (failure) { throw new Error(`Local request failed for ${value.label ?? 'anonymous'}: ${method} ${path}: ${failure instanceof Error ? failure.message.split('\n')[0] : failure}`); }
}
async function api(value, path, method = 'GET', data, expected = 200) {
  const response = await raw(value, path, method, data); const body = await response.text();
  assert.equal(response.status(), expected, `Local API status for ${method} ${path}: ${body.slice(0, 200)}`);
  return body ? JSON.parse(body) : null;
}
async function open(page, path, headingName, level = 1) {
  const response = await page.goto(base.origin + path, { waitUntil: 'domcontentloaded', timeout: 30000 });
  assert.equal(response?.status(), 200, 'Page status for ' + path);
  if (headingName) await expect(page.getByRole('heading', { name: headingName, level }).first()).toBeVisible();
}
const shot = async (page, name) => { const file = join(outputDir, `notices-audit-${name}.png`); await page.screenshot({ path: file, fullPage: true }); screenshots.push(file); };
const noOverflow = async page => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'No horizontal page scroll at ' + page.viewportSize().width + 'px');
const allLabelled = async page => assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('input, select, textarea')].filter(el => el.offsetParent !== null && el.type !== 'hidden'
  && !(el.labels && el.labels.length) && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')).map(el => el.outerHTML.slice(0, 80))), [], 'Every visible control has a label');
const plainScreen = async page => { const text = await page.locator('body').innerText(); assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text), 'No internal UUID is shown'); assert.ok(!/[{]"|\[object Object\]|undefined|NaN/.test(text), 'No raw JSON or placeholder text is shown'); };
const uuid = () => crypto.randomUUID();
const sendBody = (title, body, audience) => ({ clientRequestId: uuid(), title, body, audience, reviewConfirmed: true });
const classAudience = roles => ({ kind: 'class', classId: 'class-a', roles });
const attack = 'Trip on <img src=x onerror=alert(1)> & "quotes"';
const literal = 'Bring 5 > 3 sheets, a &lt;b&gt;bold&lt;/b&gt; pen and Tom & Jerry’s "ruler"';

try {
  const teacher = await context('teacher-a'), admin = await context('admin-a'), guardian = await context('guardian-a'), otherGuardian = await context('guardian-other');
  const otherStudent = await context('student-user-other'), otherTeacher = await context('teacher-other'), foreignAdmin = await context('admin-b'), learner = await context('student-user-a');
  const extraGuardian = await context('guardian-extra-one');
  const shared = {};

  // ---------- FR-12 sending ----------
  const page = await teacher.newPage();
  await check('Staff open the send form: plain-language, labelled, class audience preview counts the class guardians', async () => {
    await open(page, '/notices', 'Send a notice');
    await expect(page.getByText('It appears in their in-app notifications only. It is not sent by email or text message.')).toBeVisible();
    await page.getByLabel('Class', { exact: true }).selectOption({ label: 'class-a (T1)' });
    await expect(page.getByText(/This will reach 3 people:/)).toBeVisible();
    await page.getByLabel('Send to', { exact: true }).selectOption('both');
    await expect(page.getByText(/This will reach 6 people:/)).toBeVisible();
    await page.getByLabel('Send to', { exact: true }).selectOption('guardians');
    await expect(page.getByText(/This will reach 3 people:/)).toBeVisible();
    await allLabelled(page); await plainScreen(page); await shot(page, 'send-desktop');
  });
  await check('Keyboard works: Tab moves from title to message and Space ticks the confirmation', async () => {
    await page.getByLabel('Title', { exact: true }).focus(); await page.keyboard.press('Tab'); await expect(page.getByLabel('Message', { exact: true })).toBeFocused();
    const box = page.getByRole('checkbox', { name: /I have checked who will receive this notice/ }); await box.focus(); await page.keyboard.press('Space'); await expect(box).toBeChecked(); await page.keyboard.press('Space'); await expect(box).not.toBeChecked();
  });
  const send = page.getByRole('button', { name: 'Send notice', exact: true });
  await check('Send stays disabled until the sender confirms; markup-like text is refused in plain language without alert()', async () => {
    await page.getByLabel('Title', { exact: true }).fill(attack); await page.getByLabel('Message', { exact: true }).fill('Plain message');
    await expect(send).toBeDisabled();
    await page.getByRole('checkbox', { name: /I have checked who will receive this notice/ }).check(); await expect(send).toBeEnabled();
    await send.click();
    await expect(page.getByRole('alert')).toContainText('Titles and messages are plain text');
    await expect(page.getByRole('alert')).not.toContainText('<img');
    assert.deepEqual(await api(teacher, '/api/notices?limit=50').then(result => result.items.filter(item => item.title.includes('onerror'))), [], 'The refused notice was not saved');
    assert.deepEqual(dialogs, []);
  });
  const firstTitle = 'Trip money due ' + suffix;
  await check('A class notice is sent once, shown as text, and appears in the sender list with read counts', async () => {
    await page.getByLabel('Title', { exact: true }).fill(firstTitle); await page.getByLabel('Message', { exact: true }).fill(literal + '\nSecond line');
    await page.getByRole('checkbox', { name: /I have checked who will receive this notice/ }).check();
    const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/notices' && response.request().method() === 'POST');
    await send.click(); assert.equal((await saved).status(), 201);
    await expect(page.getByRole('status').filter({ hasText: 'was sent to 3 people.' })).toBeVisible();
    await expect(page.getByRole('link', { name: firstTitle, exact: true })).toBeVisible();
    await expect(page.getByText('0 of 3 people have read it').first()).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('');
    await plainScreen(page);
  });
  await check('Exact retry of a send returns the original (200 replay) and a changed payload with the same reference is a 409 conflict', async () => {
    const payload = sendBody('Replay ' + suffix, 'Replay body', classAudience('learners'));
    const first = await raw(teacher, '/api/notices', 'POST', payload); assert.equal(first.status(), 201);
    const again = await raw(teacher, '/api/notices', 'POST', payload); assert.equal(again.status(), 200); assert.equal((await again.json()).replayed, true);
    const changed = await raw(teacher, '/api/notices', 'POST', { ...payload, body: 'Different body' }); assert.equal(changed.status(), 409);
    const stolen = await raw(admin, '/api/notices', 'POST', payload); assert.equal(stolen.status(), 409);
  });

  // ---------- recipients ----------
  const inbox = await guardian.newPage();
  await check('A recipient sees the notice in their inbox as plain text with sender, unread state and counts', async () => {
    await open(inbox, '/notifications', 'Notifications');
    const card = inbox.locator('article', { hasText: firstTitle });
    await expect(card).toBeVisible(); await expect(card).toContainText(literal.split('\n')[0]); await expect(card).toContainText(/Sent by teacher-a/); await expect(card.getByText('Unread', { exact: true })).toBeVisible();
    assert.equal(await card.locator('b, img, script').count(), 0, 'No injected element is created');
    await expect(inbox.getByText(/\d+ unread of \d+ notices\./)).toBeVisible(); await plainScreen(inbox); await shot(inbox, 'inbox-desktop');
  });
  await check('Marking read is confirmed from the saved inbox and the sender sees the read state', async () => {
    const card = inbox.locator('article', { hasText: firstTitle });
    await card.getByRole('button', { name: 'Mark as Read' }).click();
    await expect(inbox.getByRole('status').filter({ hasText: 'Read status confirmed from your saved inbox.' })).toBeVisible();
    await expect(inbox.locator('article', { hasText: firstTitle }).getByText('Unread', { exact: true })).toHaveCount(0);
    const list = await api(teacher, '/api/notices?limit=50'); const notice = list.items.find(item => item.title === firstTitle); shared.firstId = notice.id; assert.equal(notice.readCount, 1);
  });
  await check('People outside the class receive nothing: other-class guardian, other-class learner, other teacher and other school', async () => {
    for (const person of [otherGuardian, otherStudent]) { const items = await api(person, '/api/notifications?limit=100'); assert.equal(items.filter(item => item.title === firstTitle).length, 0); }
    for (const outsider of [otherTeacher, foreignAdmin]) { await raw(outsider, '/api/notices/' + shared.firstId).then(response => assert.equal(response.status(), 404)); assert.deepEqual((await api(outsider, '/api/notices')).items.filter(item => item.title === firstTitle), []); }
    for (const person of [guardian, learner]) { assert.equal((await raw(person, '/api/notices')).status(), 403); assert.equal((await raw(person, '/api/notices', 'POST', sendBody('x', 'y', classAudience('both')))).status(), 403); }
    const screen = await otherGuardian.newPage(); await open(screen, '/notifications', 'Notifications'); await expect(screen.locator('article', { hasText: firstTitle })).toHaveCount(0); await screen.close();
    const staffOnly = await guardian.newPage(); await open(staffOnly, '/notices', 'Send a notice'); await expect(staffOnly.getByText('Sending notices is available to teachers and school administrators.')).toBeVisible(); await expect(staffOnly.getByLabel('Title', { exact: true })).toHaveCount(0); await staffOnly.close();
  });
  await check('A teacher cannot address another teacher\'s class or learners; the audience route is not shadowed by the notice id route', async () => {
    assert.equal((await raw(teacher, '/api/notices', 'POST', sendBody('No', 'No', { kind: 'class', classId: 'class-other', roles: 'both' }))).status(), 404);
    assert.equal((await raw(teacher, '/api/notices', 'POST', sendBody('No', 'No', { kind: 'recipients', userIds: ['guardian-other'] }))).status(), 404);
    const preview = await api(teacher, '/api/notices/audience?classId=class-a&roles=both'); assert.equal(preview.count, 6);
    const people = await api(teacher, '/api/notices/recipients?limit=50'); assert.ok(Array.isArray(people) && people.length === 6 && !people.some(person => person.userId.includes('other')));
    assert.equal((await raw(teacher, '/api/notices/audience?classId=class-other&roles=both')).status(), 404);
    assert.equal((await raw(admin, '/api/notices/audience?classId=class-b&roles=both')).status(), 404);
  });
  await check('Chosen people: the picker lists only the sender\'s own class people and only chosen people receive the notice', async () => {
    await open(page, '/notices', 'Send a notice');
    await page.getByRole('radio', { name: 'Chosen people' }).check();
    await page.getByLabel('Search by name', { exact: true }).fill('Synthetic Guardian');
    await expect(page.getByRole('checkbox', { name: /Synthetic Guardian one/ })).toBeVisible();
    await expect(page.getByText('guardian-other')).toHaveCount(0);
    await page.getByRole('checkbox', { name: /Synthetic Guardian one/ }).check();
    await expect(page.getByText('1 person chosen (up to 50).')).toBeVisible();
    await page.getByLabel('Title', { exact: true }).fill('Private word ' + suffix); await page.getByLabel('Message', { exact: true }).fill('Only for one family.');
    await page.getByRole('checkbox', { name: /I have checked who will receive this notice \(1 person\)/ }).check();
    await send.click(); await expect(page.getByRole('status').filter({ hasText: 'was sent to 1 person.' })).toBeVisible();
    const chosen = await api(extraGuardian, '/api/notifications?limit=100'); assert.equal(chosen.filter(item => item.title === 'Private word ' + suffix).length, 1);
    const notChosen = await api(guardian, '/api/notifications?limit=100'); assert.equal(notChosen.filter(item => item.title === 'Private word ' + suffix).length, 0);
  });

  // ---------- corrections ----------
  await check('A correction keeps the original, states a reason and reaches the same recipients', async () => {
    await open(page, '/notices/' + encodeURIComponent(shared.firstId), firstTitle);
    await expect(page.getByText('1 of 3 people').first()).toBeVisible(); await expect(page.getByText('Not read yet').first()).toBeVisible(); await expect(page.getByText(/^Read /).first()).toBeVisible();
    await expect(page.getByText('No corrections have been sent for this notice.')).toBeVisible();
    const submit = page.getByRole('button', { name: 'Send correction', exact: true }); await expect(submit).toBeDisabled();
    await page.getByLabel('Correction title', { exact: true }).fill('Trip money is due Friday'); await page.getByLabel('Corrected message', { exact: true }).fill('The earlier notice gave the wrong day.');
    await page.getByLabel('Why is this correction needed?', { exact: true }).fill('The due date was typed wrongly');
    await page.getByRole('checkbox', { name: /I have checked the correction/ }).check();
    const saved = page.waitForResponse(response => /\/corrections$/.test(new URL(response.url()).pathname) && response.request().method() === 'POST');
    await submit.click(); assert.equal((await saved).status(), 201);
    await expect(page.getByRole('status').filter({ hasText: 'The original notice is unchanged and stays on record.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Trip money is due Friday' })).toBeVisible();
    const original = (await api(teacher, '/api/notices/' + shared.firstId)); assert.equal(original.title, firstTitle); assert.equal(original.body, literal + '\nSecond line'); assert.equal(original.correctionCount, 1);
    await plainScreen(page); await shot(page, 'detail-correction');
    await inbox.reload(); const corrected = inbox.locator('article', { hasText: 'Correction: Trip money is due Friday' });
    await expect(corrected).toBeVisible(); await expect(corrected).toContainText('Reason: The due date was typed wrongly'); await expect(inbox.locator('article', { hasText: firstTitle }).first()).toBeVisible();
  });

  // ---------- paging ----------
  await check('The inbox pages 25 at a time with Older/Newer buttons, honest counts and a hide-read filter', async () => {
    for (let index = 1; index <= 26; index++) await api(teacher, '/api/notices', 'POST', sendBody(`Bulk ${String(index).padStart(2, '0')} ${suffix}`, 'Filler for paging', classAudience('guardians')), 201);
    const head = await raw(guardian, '/api/notifications'); const total = Number(head.headers()['x-total-count']), unread = Number(head.headers()['x-unread-count']);
    assert.ok(total > 25 && (await head.json()).length === 25);
    await inbox.reload(); await expect(inbox.getByText(`${unread} unread of ${total} notices.`)).toBeVisible(); await expect(inbox.locator('article')).toHaveCount(25);
    await expect(inbox.getByRole('button', { name: 'Newer notices' })).toBeDisabled();
    await inbox.getByRole('button', { name: 'Older notices' }).click();
    await expect(inbox.locator('article')).toHaveCount(total - 25); await expect(inbox.getByRole('button', { name: 'Older notices' })).toBeDisabled();
    await expect(inbox.locator('article', { hasText: 'Synthetic notice' })).toBeVisible();
    await inbox.getByRole('button', { name: 'Newer notices' }).click(); await expect(inbox.locator('article')).toHaveCount(25);
    await inbox.locator('article').first().getByRole('button', { name: 'Mark as Read' }).click();
    await expect(inbox.getByRole('status').filter({ hasText: 'Read status confirmed from your saved inbox.' })).toBeVisible(); await expect(inbox.getByText(`${unread - 1} unread of ${total} notices.`)).toBeVisible();
    await inbox.getByLabel('Hide notices I have already read (on this page)').check(); await expect(inbox.locator('article')).toHaveCount(24);
    await inbox.getByLabel('Hide notices I have already read (on this page)').uncheck(); await expect(inbox.locator('article')).toHaveCount(25);
  });
  await check('The sender list pages 10 at a time with an honest "Showing N of M" and no duplicates', async () => {
    await open(page, '/notices', 'Send a notice');
    const total = (await api(teacher, '/api/notices?limit=1')).total;
    await expect(page.getByText(`Showing 10 of ${total}, newest first.`)).toBeVisible();
    await page.getByRole('button', { name: 'Show older notices' }).click(); await expect(page.getByText(`Showing 20 of ${total}, newest first.`)).toBeVisible();
    const titles = await page.getByRole('heading', { level: 3 }).allInnerTexts(); assert.equal(new Set(titles).size, titles.length);
  });
  await check('Empty and failed-load states are plain language', async () => {
    const quiet = await otherTeacher.newPage(); await open(quiet, '/notices', 'Send a notice'); await expect(quiet.getByText('No notices have been sent yet.')).toBeVisible(); await quiet.close();
    const broken = await teacher.newPage(); await broken.route('**/api/notices?*', route => route.abort());
    await open(broken, '/notices', 'Send a notice'); await expect(broken.getByRole('alert')).toContainText('The connection was lost'); await expect(broken.getByLabel('Title', { exact: true })).toHaveCount(0); await broken.close();
  });

  // ---------- FR-26 audit ----------
  const evidence = {};
  await check('Real flows write evidence: account, attendance review, assessment review', async () => {
    await api(admin, '/api/admin/users', 'POST', { clientRequestId: uuid(), name: 'Audit Teacher ' + suffix, email: `audit-${suffix}@example.invalid`, role: 'teacher', identityIssuer: 'https://identity.example.invalid', identitySubject: 'audit-' + suffix, reviewConfirmed: true, reason: `Reviewed synthetic identity ${suffix}` }, 201);
    evidence.attendance = await api(teacher, '/api/classes/class-a/attendance-editor', 'POST', { date: '2026-10-06', clientRequestId: uuid(), reviewConfirmed: true, reason: 'att-' + suffix + ' synthetic attendance review', entries: [{ studentId: 'student-a', status: 'absent', note: null, expectedRecord: null }] }, 201);
    const editor = await api(teacher, '/api/assessments/assessment-a/result-editor');
    evidence.assessment = await api(teacher, '/api/assessments/assessment-a/result-editor', 'POST', { clientRequestId: uuid(), reviewConfirmed: true, reason: 'asm-' + suffix + ' synthetic result review', expectedAssessment: editor.assessment, entries: [{ studentId: 'student-a', score: 17, grade: 'A', feedback: null, expectedRecord: null }] }, 201);
  });
  const audit = await admin.newPage();
  await check('The administrator sees who, what, when and before/after across areas, newest first, in plain language', async () => {
    await open(audit, '/admin/audit', 'Audit trail');
    await expect(audit.getByRole('heading', { name: 'Recent entries' })).toBeVisible();
    for (const text of ['Notice sent', 'Account created', 'Attendance reviewed and saved', 'Assessment results reviewed and saved']) await expect(audit.getByRole('heading', { name: text, level: 3 }).first()).toBeVisible();
    const entry = audit.locator('li', { hasText: 'att-' + suffix });
    await expect(entry).toContainText('Attendance corrections'); await expect(entry).toContainText('Done by: teacher-a (Teacher)'); await expect(entry).toContainText('Reason: att-' + suffix); await expect(entry.getByText('Before', { exact: true })).toBeVisible(); await expect(entry.getByText('After', { exact: true })).toBeVisible();
    await allLabelled(audit); await plainScreen(audit); await shot(audit, 'audit-desktop');
  });
  await check('Filters narrow by area, person, words and dates; a no-match window gives a plain empty state; Clear returns', async () => {
    await audit.getByLabel('Area', { exact: true }).selectOption({ label: 'Notices sent' }); await audit.getByRole('button', { name: 'Show entries' }).click();
    await expect(audit.getByRole('heading', { name: 'Matching entries' })).toBeVisible();
    const cards = audit.locator('#entries-title ~ ul > li'); await expect(cards.first()).toContainText('Notices sent');
    for (const text of await cards.allInnerTexts()) assert.ok(text.includes('Notices sent'));
    await audit.getByLabel('Area', { exact: true }).selectOption(''); await audit.getByLabel('Words in the entry', { exact: true }).fill('asm-' + suffix); await audit.getByRole('button', { name: 'Show entries' }).click();
    await expect(cards).toHaveCount(1); await expect(cards.first()).toContainText('Assessment result corrections');
    await audit.getByLabel('Words in the entry', { exact: true }).fill(''); await audit.getByLabel('Done by', { exact: true }).selectOption({ label: 'admin-a (Administrator)' }); await audit.getByRole('button', { name: 'Show entries' }).click();
    await expect(cards.first()).toContainText('Done by: admin-a (Administrator)'); for (const text of await cards.allInnerTexts()) assert.ok(text.includes('Done by: admin-a'));
    await audit.getByLabel('From date', { exact: true }).fill('2099-01-01'); await audit.getByRole('button', { name: 'Show entries' }).click();
    await expect(audit.getByText('No entries match these filters. Try a wider date range or clear the filters.')).toBeVisible();
    await audit.getByLabel('From date', { exact: true }).fill('2099-02-01'); await audit.getByLabel('To date', { exact: true }).fill('2099-01-01'); await audit.getByRole('button', { name: 'Show entries' }).click();
    await expect(audit.getByRole('alert')).toContainText('start date must not be after the end date');
    await audit.getByRole('button', { name: 'Clear filters' }).click(); await expect(audit.getByRole('heading', { name: 'Recent entries' })).toBeVisible(); await expect(cards.first()).toBeVisible();
  });
  await check('Paging: older entries load without repeats', async () => {
    let total = 0, next = null; do { const page = await api(admin, '/api/admin/audit?limit=50' + (next ? '&cursor=' + encodeURIComponent(next) : '')); total += page.items.length; next = page.nextCursor; } while (next);
    assert.ok(total > 20, 'Enough synthetic entries to page: ' + total);
    await audit.reload(); await expect(audit.getByRole('heading', { name: 'Recent entries' })).toBeVisible();
    const cards = audit.locator('#entries-title ~ ul > li'); await expect(cards).toHaveCount(20);
    await audit.getByRole('button', { name: 'Show older entries' }).click(); await expect(cards).toHaveCount(Math.min(total, 40));
    await expect(audit.getByText(`Showing ${Math.min(total, 40)} entries, newest first.`)).toBeVisible();
  });
  await check('An entry opens to per-pupil before/after; a reasoned correction note is added beside it and the original is untouched', async () => {
    await audit.getByLabel('Words in the entry', { exact: true }).fill('att-' + suffix); await audit.getByRole('button', { name: 'Show entries' }).click();
    const entry = audit.locator('li', { hasText: 'att-' + suffix }); await expect(entry).toHaveCount(1);
    await entry.getByRole('button', { name: 'Show details and notes' }).click();
    await expect(entry.getByText('What changed')).toBeVisible(); await expect(entry.getByText('No earlier record', { exact: false }).first()).toBeVisible(); await expect(entry.getByText('No correction notes yet.')).toBeVisible();
    const add = entry.getByRole('button', { name: 'Add note', exact: true }); await expect(add).toBeDisabled();
    await entry.getByLabel('Note', { exact: true }).fill('Register paper confirmed the absence ' + suffix); await entry.getByRole('checkbox', { name: /I have checked this note/ }).check();
    await add.click(); await expect(audit.getByRole('status').filter({ hasText: 'Your correction note was added beside the entry. The original record is unchanged.' })).toBeVisible();
    await expect(entry.getByText('Register paper confirmed the absence ' + suffix)).toBeVisible(); await expect(entry.getByText('1 correction note')).toBeVisible();
    const detail = await api(admin, `/api/admin/audit/attendance/${evidence.attendance.review.id}`); assert.equal(detail.notes.length, 1); assert.equal(detail.after, (await api(admin, '/api/admin/audit?source=attendance&q=att-' + suffix)).items[0].after);
    await plainScreen(audit); await shot(audit, 'audit-detail-note');
  });
  await check('The trail is immutable over HTTP: no change/delete methods; notes replay exactly once and conflict when changed', async () => {
    for (const method of ['PATCH', 'PUT', 'DELETE', 'POST']) { const response = await raw(admin, '/api/admin/audit', method, method === 'POST' ? {} : undefined); assert.ok([404, 405].includes(response.status()), `${method} audit list gave ${response.status()}`); }
    for (const method of ['PATCH', 'PUT', 'DELETE', 'POST']) { const response = await raw(admin, `/api/admin/audit/attendance/${evidence.attendance.review.id}`, method, method === 'POST' ? {} : undefined); assert.ok([404, 405].includes(response.status()), `${method} audit entry gave ${response.status()}`); }
    const note = { clientRequestId: uuid(), source: 'attendance', sourceId: evidence.attendance.review.id, note: 'Second reviewed note ' + suffix, reviewConfirmed: true };
    assert.equal((await raw(admin, '/api/admin/audit/annotations', 'POST', note)).status(), 201);
    assert.equal((await raw(admin, '/api/admin/audit/annotations', 'POST', note)).status(), 200);
    assert.equal((await raw(admin, '/api/admin/audit/annotations', 'POST', { ...note, note: 'A different note text ' + suffix })).status(), 409);
    assert.equal((await api(admin, `/api/admin/audit/attendance/${evidence.attendance.review.id}`)).notes.length, 2);
  });
  await check('Audit is administrator-only and school-scoped: staff, family and other schools see nothing of it', async () => {
    for (const person of [teacher, guardian, learner, otherTeacher]) { assert.equal((await raw(person, '/api/admin/audit')).status(), 403); assert.equal((await raw(person, '/api/admin/audit/annotations', 'POST', {})).status(), 403); }
    assert.deepEqual((await api(foreignAdmin, '/api/admin/audit?limit=50')).items, []);
    assert.equal((await raw(foreignAdmin, `/api/admin/audit/attendance/${evidence.attendance.review.id}`)).status(), 404);
    const staffScreen = await teacher.newPage(); await open(staffScreen, '/admin/audit', 'Account administration'); await expect(staffScreen.getByText('This workspace is available to school administrators.')).toBeVisible(); await expect(staffScreen.getByLabel('Area', { exact: true })).toHaveCount(0); await staffScreen.close();
    const other = await foreignAdmin.newPage(); await open(other, '/admin/audit', 'Audit trail'); await expect(other.getByText('Nothing has been recorded yet.')).toBeVisible(); await other.close();
    const anonymous = await context(null); const signedOut = await anonymous.newPage(); await signedOut.goto(base.origin + '/admin/audit', { waitUntil: 'domcontentloaded' }); await expect(signedOut).toHaveURL(base.origin + '/login');
  });

  // ---------- layout at 375px ----------
  await check('375px: no horizontal scroll, labelled controls and plain screens on notices, detail, inbox and audit', async () => {
    for (const [user, path, heading] of [['teacher-a', '/notices', 'Send a notice'], ['teacher-a', '/notices/' + shared.firstId, firstTitle], ['guardian-a', '/notifications', 'Notifications'], ['admin-a', '/admin/audit', 'Audit trail']]) {
      const phone = await context(user, { width: 375, height: 800 }); const screen = await phone.newPage(); await open(screen, path, heading);
      if (path === '/notices') { await screen.getByLabel('Class', { exact: true }).selectOption({ label: 'class-a (T1)' }); await expect(screen.getByText(/This will reach 3 people:/)).toBeVisible(); }
      if (path === '/admin/audit') { await expect(screen.locator('#entries-title ~ ul > li').first()).toBeVisible(); await screen.getByRole('button', { name: 'Show details and notes' }).first().click(); await expect(screen.getByText('Correction notes').first()).toBeVisible(); }
      await noOverflow(screen); await allLabelled(screen); await plainScreen(screen); await shot(screen, 'phone-' + path.split('/').filter(Boolean).join('-').slice(0, 24));
    }
  });
  await check('No alert() dialogs, page errors, external requests or failed assets across the whole run', async () => {
    assert.deepEqual(dialogs, []); assert.deepEqual(pageErrors, []); assert.deepEqual(externalRequests, []); assert.deepEqual(failedResources, []);
  });
  const result = { executedAt: new Date().toISOString(), passed, failed: 0, skipped: 0, externalRequests: externalRequests.length, pageErrors: pageErrors.length, dialogs: dialogs.length, checks, screenshots,
    note: 'Fixture is synthetic and isolated; one injected network fault (blocked /api/notices) exercises the failed-load state. Results do not imply business acceptance.' };
  writeFileSync(join(outputDir, 'saha-notices-audit-ui-results.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ passed, failed: 0, skipped: 0, externalRequests: externalRequests.length, pageErrors: pageErrors.length, dialogs: dialogs.length }));
} catch (error) {
  const result = { executedAt: new Date().toISOString(), passed, failed: 1, skipped: 0, externalRequests: externalRequests.length, pageErrors: pageErrors.length, dialogs: dialogs.length, checks, screenshots, failure: error instanceof Error ? error.message : String(error) };
  writeFileSync(join(outputDir, 'saha-notices-audit-ui-results.json'), JSON.stringify(result, null, 2) + '\n');
  for (const value of contexts) for (const page of value.pages()) if (page.url().startsWith(base.origin)) console.error('Local screen: ' + new URL(page.url()).pathname + '\n' + (await page.locator('body').innerText().catch(() => '')).slice(0, 1600));
  console.log(JSON.stringify({ passed, failed: 1, externalRequests: externalRequests.length, pageErrors: pageErrors.length })); throw error;
} finally { for (const value of contexts) await value.close(); await browser.close(); }
