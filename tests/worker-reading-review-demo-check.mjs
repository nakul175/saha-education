// Real-browser procedure for FR-19 (external ORF launch), FR-20 (reviewed return path) and FR-21 (reading review and trends).
// Runs against an isolated built localhost Worker with the synthetic fixture from tests/support/write-reading-fixture.mjs and a
// LOCAL FAKE destination (tests/support/fake-orf-destination.mjs). No real external site, provider or recipient is contacted.
//
// Two phases against two Worker starts on the same port (SAHA_ORF_PHASE):
//   unconfigured  the Worker has no SAHA_ORF_APP_URL: the not-connected state and family privacy are proved.
//   configured    the Worker's SAHA_ORF_APP_URL is the fake's https://127.0.0.1:<SAHA_FAKE_ORF_PORT>/reading: the handoff, trends,
//                 reviewed return path, zero-data and mobile states are proved.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { startFakeOrf } from './support/fake-orf-destination.mjs';

const phase = process.env.SAHA_ORF_PHASE;
const fixture = process.env.SAHA_WORKER_SESSION_FIXTURE, executablePath = process.env.SAHA_TEST_BROWSER;
const fakePort = Number(process.env.SAHA_FAKE_ORF_PORT || 18907);
if (!['unconfigured', 'configured'].includes(phase)) throw new Error('Set SAHA_ORF_PHASE to unconfigured or configured.');
if (!process.env.SAHA_WORKER_TEST_URL || !fixture || !executablePath) throw new Error('Local origin, synthetic sessions and browser executable are required.');
const base = new URL(process.env.SAHA_WORKER_TEST_URL);
if (base.hostname !== '127.0.0.1' || base.protocol !== 'http:' || base.pathname !== '/' || base.search || base.hash || base.username || base.password) throw new Error('This check only runs against a 127.0.0.1 Worker.');
const sessions = JSON.parse(readFileSync(fixture, 'utf8'));
const outputDir = process.env.SAHA_TEST_OUTPUT_DIR || '/tmp'; mkdirSync(outputDir, { recursive: true });
const fake = await startFakeOrf({ port: fakePort });
const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-background-networking'] });
const contexts = [], pageErrors = [], externalRequests = [], checks = [], screenshots = [], axeResults = [];
let passed = 0, browserFakeRequests = 0, current = 'setup';
const suffix = crypto.randomUUID().slice(0, 6);
async function check(name, action) { current = name; await action(); passed++; checks.push(name); console.log('ok - ' + name); }
async function context(actor) {
  assert.equal(typeof sessions[actor], 'string', 'Missing synthetic session ' + actor);
  const value = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', ignoreHTTPSErrors: true, extraHTTPHeaders: { cookie: sessions[actor] }, timezoneId: 'Asia/Kolkata' });
  value.setDefaultTimeout(10000); value.setDefaultNavigationTimeout(20000);
  contexts.push(value);
  value.on('page', page => page.on('pageerror', error => pageErrors.push(error.message)));
  await value.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === base.origin) return route.continue();
    // The loopback fake is the only non-Worker origin a browser may reach, and only over its exact origin.
    if (url.origin === fake.origin) { browserFakeRequests++; return route.continue({ headers: route.request().headers() }); }
    externalRequests.push({ origin: url.origin, path: url.pathname }); return route.abort();
  });
  return value;
}
async function api(value, path, method = 'GET', data, expected = 200) {
  const response = await value.request.fetch(new URL(path, base).href, { method, timeout: 15000, maxRedirects: 0, headers: method === 'GET' ? {} : { Origin: base.origin }, ...(data === undefined ? {} : { data }) });
  assert.equal(response.status(), expected, 'Local API status for ' + method + ' ' + path);
  return response.json();
}
async function labelsAndOverflow(page) {
  const invalid = await page.locator('main input:not([type=hidden]), main select, main textarea').evaluateAll(items => items.filter(item => !item.labels?.length && !item.getAttribute('aria-label') && !item.getAttribute('aria-labelledby')).length);
  assert.equal(invalid, 0, 'Native form controls have accessible labels');
  // The page itself must never scroll sideways. Anything wider than the screen has to scroll inside its own labelled region;
  // absolutely positioned screen-reader text inside such a region still counts, so the strict page measurement is the assertion.
  const overflow = await page.evaluate(() => ({ fits: document.documentElement.scrollWidth <= window.innerWidth + 1,
    widest: [...document.querySelectorAll('main *')].filter(item => item.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 5).map(item => item.tagName.toLowerCase() + '.' + String(item.className).slice(0, 60) + ' right=' + Math.round(item.getBoundingClientRect().right)) }));
  assert.equal(overflow.fits, true, 'Viewport has no horizontal page overflow; elements past the edge: ' + JSON.stringify(overflow.widest));
}
async function axe(page, label) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const violations = result.violations.map(item => ({ id: item.id, impact: item.impact, targets: item.nodes.map(node => node.target.join(' ')).slice(0, 4) }));
  axeResults.push({ label, violations, incomplete: result.incomplete.length });
  assert.deepEqual(violations, [], 'Automated WCAG 2 A/AA rules on ' + label);
}
async function shot(page, name) {
  const path = join(outputDir, 'reading-review-demo-' + phase + '-' + name + '.png');
  await page.screenshot({ path, fullPage: true }); screenshots.push(path);
}
const daysAgo = days => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
const rawIdPattern = /\b(teacher-a|teacher-other|admin-a|admin-b|guardian-a|student-user-a|student-a|learner-[b-e]|class-a|class-other)\b/;
const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
async function bodyTextWithoutSupportReferences(page) {
  return (await page.locator('body').innerText()).split('\n').filter(line => !/^Observation ID /.test(line)).join('\n');
}
async function familyPrivacy(actor, label) {
  const family = await context(actor), page = await family.newPage();
  for (const path of ['/external-apps', '/reading-review']) {
    await page.goto(base.origin + path);
    await check(`${label} sees a plain privacy explanation and no reading data on ${path}`, async () => {
      await expect(page.getByText(/private to school staff/i).first()).toBeVisible();
      await expect(page.getByText(/not published|not shown to students or families/i).first()).toBeVisible();
      for (const name of ['Prepare reading app', 'Save reviewed check', 'Show readings', 'Review a correction']) await expect(page.getByRole('button', { name })).toHaveCount(0);
      await expect(page.locator('table, svg[role=img]')).toHaveCount(0);
      assert.doesNotMatch(await page.locator('body').innerText(), /correct words|wcpm|accuracy/i);
    });
  }
  await check(`${label} is refused by every reading API`, async () => {
    for (const [path, method, data] of [['/api/reading-review', 'GET'], ['/api/reading-checks', 'GET'], ['/api/reading-imports', 'GET'], ['/api/external-apps/oral-reading-fluency/launch', 'POST', {}]]) {
      const response = await family.request.fetch(new URL(path, base).href, { method, headers: method === 'GET' ? {} : { Origin: base.origin }, ...(data ? { data } : {}) });
      assert.equal(response.status(), 403, `${label} ${method} ${path}`);
    }
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base.origin + '/reading-review');
  await check(`${label} privacy page fits a phone screen`, async () => labelsAndOverflow(page));
  await family.close();
}

let failure = null;
try {
  if (phase === 'unconfigured') {
    for (const actor of ['teacher-a', 'admin-a']) {
      const staff = await context(actor), page = await staff.newPage();
      await page.goto(base.origin + '/external-apps');
      await check(`${actor}: an unconfigured destination shows a plain-language not-connected state`, async () => {
        const state = page.locator('[data-orf-state="not-configured"]');
        await expect(state).toBeVisible();
        await expect(state).toContainText('Not connected');
        await expect(state).toContainText('no information has been sent anywhere');
        await expect(page.getByRole('button', { name: 'Prepare reading app' })).toHaveCount(0);
        await expect(page.getByRole('link', { name: /Open reading app/ })).toHaveCount(0);
        await expect(page.getByRole('heading', { name: 'What opening the app does' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'How reviewed results come back to Saha' })).toBeVisible();
        await expect(page.getByText(/SAHA_ORF|https?:\/\//)).toHaveCount(0);
      });
      await check(`${actor}: the unconfigured launch API fails closed without leaking configuration`, async () => {
        const response = await staff.request.fetch(new URL('/api/external-apps/oral-reading-fluency/launch', base).href, { method: 'POST', headers: { Origin: base.origin }, data: {} });
        assert.equal(response.status(), 503); assert.deepEqual(await response.json(), { error: 'Service unavailable' });
        const registry = await api(staff, '/api/external-apps'); assert.equal(registry[0].available, false); assert.equal(Object.hasOwn(registry[0], 'url'), false);
      });
      await check(`${actor}: manual reviewed entry still works while the app is not connected`, async () => {
        await page.getByLabel('Class', { exact: false }).selectOption('class-a');
        await expect(page.getByRole('heading', { name: 'Record a reviewed check' })).toBeVisible();
        await expect(page.getByLabel('Passage reference', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Save reviewed check' })).toBeVisible();
      });
      if (actor === 'teacher-a') { await axe(page, 'external-apps not connected'); await shot(page, 'external-apps-not-connected'); }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(base.origin + '/external-apps');
      await expect(page.locator('[data-orf-state="not-configured"]')).toBeVisible();
      await check(`${actor}: not-connected page fits a phone screen`, async () => labelsAndOverflow(page));
      await staff.close();
    }
    await familyPrivacy('guardian-a', 'Guardian');
    await familyPrivacy('student-user-a', 'Learner');
    await check('The destination received no request in the unconfigured phase', async () => { assert.equal(fake.requests.length, 0); assert.equal(browserFakeRequests, 0); });
  } else {
    const teacher = await context('teacher-a'), page = await teacher.newPage();
    // ---- FR-19: the handoff, as the browser performs it ----
    await page.goto(base.origin + '/external-apps');
    await check('A configured destination shows a connected state with the handoff boundary explained', async () => {
      await expect(page.locator('[data-orf-state="ready"]')).toContainText('Connected');
      await expect(page.getByText(/sends no student names, student numbers, class details or Saha sign-in/i)).toBeVisible();
      await expect(page.getByText(/Results do not come back automatically/i)).toBeVisible();
      await expect(page.getByRole('link', { name: /Open reading app/ })).toHaveCount(0);
    });
    await page.getByLabel('Class', { exact: false }).selectOption('class-a');
    await page.getByRole('button', { name: 'Prepare reading app' }).click();
    const link = page.getByRole('link', { name: /Open reading app/ });
    await expect(link).toBeVisible();
    await check('The prepared link is the fixed destination with new-tab, no-opener and no-referrer attributes', async () => {
      assert.equal(await link.getAttribute('href'), fake.url);
      assert.equal(await link.getAttribute('target'), '_blank');
      assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
      assert.equal(await link.getAttribute('referrerpolicy'), 'no-referrer');
    });
    const popupPromise = teacher.waitForEvent('page');
    await link.click();
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    await check('Following the link opens only the fake destination page', async () => {
      assert.equal(popup.url(), fake.url);
      await expect(popup.getByRole('heading', { name: 'Fake oral reading app' })).toBeVisible();
    });
    await check('The destination received exactly one request with no Saha learner, class, cookie or referrer', async () => {
      const pageRequests = fake.requests.filter(item => item.path === fake.basePath);
      assert.equal(pageRequests.length, 1, 'One navigation reached the destination');
      const received = pageRequests[0];
      assert.deepEqual([received.method, received.path, received.query], ['GET', fake.basePath, '']);
      for (const header of ['cookie', 'referer', 'authorization', 'x-user-id', 'x-school-id']) assert.equal(header in received.headers, false, 'No ' + header + ' header');
      const serialized = JSON.stringify(received).toLowerCase();
      for (const secret of [sessions['teacher-a'].split('=')[1].toLowerCase(), 'student-a', 'teacher-a', 'class-a', 'anika', 'grade 4', '127.0.0.1:' + base.port]) assert.equal(serialized.includes(secret), false, 'Destination never sees ' + secret);
    });
    await popup.close();
    await page.screenshot({ path: join(outputDir, 'reading-review-demo-configured-external-apps.png'), fullPage: true }); screenshots.push(join(outputDir, 'reading-review-demo-configured-external-apps.png'));
    await axe(page, 'external-apps connected');

    // ---- Zero data: an honest empty state, never an invented trend ----
    const other = await context('teacher-other'), otherPage = await other.newPage();
    await otherPage.goto(base.origin + '/reading-review');
    await otherPage.getByLabel('Class', { exact: false }).selectOption('class-other');
    await check('A class with no readings says so and draws no chart', async () => {
      await expect(otherPage.getByText('No reading observations match these filters.', { exact: false })).toBeVisible();
      await expect(otherPage.getByText('No readings yet', { exact: true })).toBeVisible();
      await expect(otherPage.getByText('This student has no recorded reading yet.')).toBeVisible();
      await expect(otherPage.locator('svg[role=img]')).toHaveCount(0);
      await expect(otherPage.getByText('No comparable reading observations are available for these filters.')).toBeVisible();
    });
    await other.close();
    const emptyAdmin = await context('admin-b'), emptyAdminPage = await emptyAdmin.newPage();
    await emptyAdminPage.goto(base.origin + '/reading-review');
    await check('Another school sees only its own class and none of this school\'s learners or readings', async () => {
      await expect(emptyAdminPage.getByLabel('Class', { exact: false }).locator('option', { hasText: 'class-b' })).toHaveCount(1);
      const options = await emptyAdminPage.getByLabel('Class', { exact: false }).locator('option').allInnerTexts();
      assert.deepEqual(options, ['Select a class', 'class-b']);
      await emptyAdminPage.getByLabel('Class', { exact: false }).selectOption('class-b');
      await expect(emptyAdminPage.getByText('This student has no recorded reading yet.')).toBeVisible();
      assert.doesNotMatch(await emptyAdminPage.locator('body').innerText(), /Anika|Bilal|Chitra|Rabbit and the Moon/);
    });
    await emptyAdmin.close();

    // ---- Seed uneven, single, paired, same-day and empty histories through the real API ----
    const passage1 = 'Rabbit and the Moon ' + suffix, passage2 = 'Market Day ' + suffix, hindi = 'Hindi set ' + suffix;
    const record = (studentId, passageReference, days, wordsAttempted, wordsCorrect, extra = {}) => api(teacher, '/api/reading-checks', 'POST',
      { clientCheckId: crypto.randomUUID(), classId: 'class-a', studentId, language: 'en-IN', passageReference, readingDate: daysAgo(days), durationSeconds: 60, wordsAttempted, wordsCorrect, ...extra }, 201);
    const anika = [];
    for (const [days, attempted, correct] of [[62, 80, 62], [59, 85, 68], [52, 90, 75], [51, 92, 77], [24, 100, 86], [3, 104, 93]]) anika.push(await record('student-a', passage1, days, attempted, correct));
    await record('student-a', passage2, 10, 70, 60, { durationSeconds: 45 });
    await record('learner-b', passage1, 30, 85, 70); await record('learner-b', passage1, 9, 90, 78);
    await record('learner-c', passage1, 5, 70, 50);
    await record('learner-e', passage1, 4, 60, 45); await record('learner-e', passage1, 4, 64, 50);
    await record('learner-e', hindi, 4, 50, 38, { language: 'hi-IN' });
    await check('Seeded histories exist through the real reading API', async () => assert.equal((await api(teacher, '/api/reading-checks?classId=class-a')).length, 13));

    // ---- FR-21: the review page ----
    await page.goto(base.origin + '/reading-review');
    await page.getByLabel('Class', { exact: false }).selectOption('class-a');
    await expect(page.getByRole('heading', { name: 'Reading overview by student' })).toBeVisible();
    const overview = page.getByRole('region', { name: 'Reading overview table; scroll horizontally on small screens' });
    const rows = async () => overview.locator('tbody tr').evaluateAll(trs => trs.map(tr => [...tr.children].slice(0, 5).map(cell => cell.innerText.trim())));
    await check('The overview lists learners by name with honest counts and shows a learner with no readings', async () => {
      const actual = await rows();
      assert.deepEqual(actual.map(row => [row[0], row[1], row[3], row[4]]), [['Anika Rao', '7', '2', '1'], ['Bilal Khan', '2', '1', '1'], ['Chitra Menon', '1', '1', '0'], ['Dev Sharma', '0', '0', '0'], ['Esha Gupta', '3', '2', '1']]);
      assert.equal(actual[3][2], 'No readings yet');
      await expect(page.getByText('1 of 5 students has no recorded readings yet.')).toBeVisible();
      await expect(page.getByText(/no class average or ranking is calculated/i).first()).toBeVisible();
    });
    const seriesFor = (name, passage) => page.locator('section[data-series-kind]').filter({ hasText: name }).filter({ hasText: 'Passage reference: ' + passage });
    await check('Uneven six-reading history is described as unevenly spaced with real-date positions and a full table', async () => {
      const section = seriesFor('Anika Rao', passage1);
      await expect(section).toHaveAttribute('data-series-kind', 'series');
      await expect(section.locator('[data-series-statement]')).toContainText('6 readings');
      await expect(section.locator('[data-series-statement]')).toContainText('unevenly spaced');
      await expect(section.locator('[data-series-statement]')).toContainText('describes these readings only');
      await expect(section.locator('figure[data-reading-chart]')).toHaveCount(2);
      for (const metric of ['wcpm', 'accuracy']) {
        const chart = section.locator(`figure[data-reading-chart=${metric}] svg`);
        await expect(chart.locator('path')).toHaveCount(1);
        await expect(chart.locator('circle')).toHaveCount(6);
        assert.match(await chart.locator('desc').textContent(), /62.*68.*75.*77.*86.*93|\d+%/);
      }
      await expect(section.locator('tbody tr')).toHaveCount(6);
      const xs = await section.locator('figure[data-reading-chart=wcpm] circle').evaluateAll(items => items.map(item => Number(item.getAttribute('cx'))));
      assert.ok(xs[5] - xs[4] > 3 * (xs[1] - xs[0]), 'The 21-day gap is drawn wider than the 3-day gap');
    });
    await check('A single reading is a marker with no line and an explicit no-trend statement', async () => {
      const section = seriesFor('Chitra Menon', passage1);
      await expect(section).toHaveAttribute('data-series-kind', 'single');
      await expect(section.locator('[data-series-statement]')).toContainText('One reading cannot show a trend');
      await expect(section.locator('figure[data-reading-chart=wcpm] path')).toHaveCount(0);
      await expect(section.locator('figure[data-reading-chart=wcpm] circle')).toHaveCount(1);
      assert.doesNotMatch(await section.innerText(), /improv|declin|progress|increase/i);
    });
    await check('Two readings are a difference, never a trend', async () => {
      const section = seriesFor('Bilal Khan', passage1);
      await expect(section).toHaveAttribute('data-series-kind', 'pair');
      await expect(section.locator('[data-series-statement]')).toContainText('not a trend');
      await expect(section.locator('[data-series-statement]')).toContainText('+8 correct words per minute');
    });
    await check('Same-day readings state that their order is not recorded and report no change', async () => {
      const section = seriesFor('Esha Gupta', passage1);
      await expect(section.locator('[data-series-statement]')).toContainText('order within that date is not recorded');
      await expect(section.locator('[data-series-statement]')).not.toContainText('Change from the earliest');
    });
    await check('Different languages and passages stay in separate series and are never pooled', async () => {
      await expect(page.locator('section[data-series-kind]').filter({ hasText: 'Anika Rao' })).toHaveCount(2);
      await expect(seriesFor('Esha Gupta', hindi)).toContainText('hi-IN');
      await expect(page.getByText(/average|ranking|benchmark|target|grade level/i).filter({ hasNotText: /no .*calculated|do not assign|does not|not establish/i })).toHaveCount(0);
    });
    await check('Staff see names and dates, not user or learner IDs; only labelled support references show an ID', async () => {
      const text = await bodyTextWithoutSupportReferences(page);
      assert.doesNotMatch(text, rawIdPattern); assert.doesNotMatch(text, uuidPattern);
      await expect(page.getByText('Recorded by Asha Verma').first()).toBeVisible();
    });
    await check('The selected learner filter is keyboard operable from the overview', async () => {
      const show = overview.getByRole('button', { name: /Show readings for Chitra Menon/ });
      await show.focus(); await page.keyboard.press('Enter');
      await expect(page.locator('section[data-series-kind]')).toHaveCount(1);
      await expect(overview.getByRole('button', { name: 'Showing' })).toBeDisabled();
    });
    await page.getByRole('combobox', { name: /^Student/ }).selectOption('');
    await expect(page.locator('section[data-series-kind]')).toHaveCount(6);
    await shot(page, 'reading-review-desktop');
    await axe(page, 'reading-review with trends');

    // ---- correction with history, through the page ----
    const target = anika.find(item => item.readingDate === daysAgo(3));
    const observation = page.locator('article').filter({ hasText: 'Observation ID ' + target.id });
    await observation.getByRole('button', { name: 'Review a correction' }).click();
    const editor = observation.getByRole('form', { name: 'Append a reviewed correction' });
    await editor.getByLabel('Words correct', { exact: true }).fill('90');
    await editor.getByLabel('Reason for correction', { exact: true }).fill('Synthetic miscount found on adult re-check.');
    await editor.getByRole('checkbox').check();
    await editor.getByRole('button', { name: 'Save reviewed correction' }).click();
    await check('A reviewed correction keeps the original, shows the effective value and marks the corrected point with a diamond', async () => {
      await expect(page.getByText('Correction saved · revision 1')).toBeVisible();
      const section = seriesFor('Anika Rao', passage1);
      await expect(section.locator('figure[data-reading-chart=wcpm] rect')).toHaveCount(1);
      await expect(section.locator('figure[data-reading-chart=wcpm] g[data-corrected=true]')).toHaveCount(1);
      await expect(section.locator('tbody tr').last()).toContainText('90');
      await expect(section.locator('tbody tr').last().locator('td').last()).toHaveText('1');
      await expect(section.locator('[data-series-statement]')).toContainText('1 value uses a reviewed correction');
      const fresh = page.locator('article').filter({ hasText: 'Observation ID ' + target.id });
      await expect(fresh.getByRole('region', { name: 'Original manually recorded evidence' })).toContainText('93 / 104');
      await expect(fresh.getByRole('region', { name: 'Effective reviewed reading' })).toContainText('90 / 104');
      await fresh.locator('summary').click();
      await expect(fresh.getByText('Reason: Synthetic miscount found on adult re-check.')).toBeVisible();
      await expect(fresh.getByText(/Reviewer Asha Verma/)).toBeVisible();
    });

    // ---- the reviewed return path, end to end through the screens ----
    fake.setResults([{ externalReference: 'fake-dev-' + suffix, studentId: 'learner-d', language: 'en-IN', passageReference: passage1, readingDate: daysAgo(1), durationSeconds: 60, wordsAttempted: 88, wordsCorrect: 71 }]);
    const exported = await fake.fetchExport();
    const envelope = { format: 'saha.reading-results.v1', classId: 'class-a', sourceLabel: 'Local fake ORF app', sourceReference: 'Fake export ' + suffix, rows: exported };
    await page.goto(base.origin + '/reading-imports');
    await page.getByLabel(/^Local JSON/).fill(JSON.stringify(envelope, null, 2));
    await page.getByRole('button', { name: 'Validate and stage preview', exact: true }).click();
    await check('Exported results become a staged preview that creates no reading yet', async () => {
      await expect(page.getByRole('heading', { name: 'Saved import preview · waiting for review', exact: true })).toBeVisible();
      await expect(page.getByText('71 / 88 words correct · 60 seconds · 71 correct words/minute · 81% accuracy', { exact: true })).toBeVisible();
      assert.equal((await api(teacher, '/api/reading-checks?classId=class-a')).filter(item => item.studentId === 'learner-d').length, 0);
      await expect(page.getByRole('button', { name: 'Confirm reviewed readings', exact: true })).toBeDisabled();
    });
    await page.getByLabel('Review or rejection reason', { exact: true }).fill('Synthetic educator reviewed the fake export.');
    await page.getByRole('checkbox', { name: /I reviewed the original values/ }).check();
    await page.getByRole('button', { name: 'Confirm reviewed readings', exact: true }).click();
    await check('Confirmation after explicit review creates one reviewed reading with a receipt', async () => {
      await expect(page.getByRole('heading', { name: 'Saved import preview · confirmed', exact: true })).toBeVisible();
      assert.equal((await api(teacher, '/api/reading-checks?classId=class-a')).filter(item => item.studentId === 'learner-d').length, 1);
    });
    await page.goto(base.origin + '/reading-review');
    await page.getByLabel('Class', { exact: false }).selectOption('class-a');
    await check('The imported reading now appears in the overview and as a single-reading series', async () => {
      await expect(overview.locator('tbody tr')).toHaveCount(5);
      await expect(page.locator('[data-reading-gaps]')).toHaveCount(0);
      const dev = (await rows()).find(row => row[0] === 'Dev Sharma');
      assert.deepEqual([dev[1], dev[3], dev[4]], ['1', '1', '0']);
      await expect(seriesFor('Dev Sharma', passage1)).toHaveAttribute('data-series-kind', 'single');
    });
    await check('The destination was only ever contacted by the person following the link and the person downloading its export', async () => {
      assert.deepEqual(fake.requests.map(item => item.path), [fake.basePath, fake.basePath + '/export']);
      assert.deepEqual(externalRequests, []);
    });

    // ---- mobile ----
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ['/reading-review', '/external-apps', '/reading-imports']) {
      await page.goto(base.origin + path);
      if (path === '/reading-review') { await page.getByLabel('Class', { exact: false }).selectOption('class-a'); await expect(page.locator('section[data-series-kind]').first()).toBeVisible(); }
      if (path === '/external-apps') await page.getByLabel('Class', { exact: false }).selectOption('class-a');
      await check('Phone width: ' + path + ' has labelled controls and no page-level horizontal overflow', async () => labelsAndOverflow(page));
    }
    await page.goto(base.origin + '/reading-review'); await page.getByLabel('Class', { exact: false }).selectOption('class-a');
    await expect(page.locator('section[data-series-kind]').first()).toBeVisible();
    await check('Phone width: every chart fits inside the viewport', async () => {
      const wide = await page.locator('svg[role=img]').evaluateAll(items => items.filter(item => item.getBoundingClientRect().right > window.innerWidth).length);
      assert.equal(wide, 0);
    });
    await shot(page, 'reading-review-phone');
    await axe(page, 'reading-review phone width');
    await teacher.close();
    await familyPrivacy('guardian-a', 'Guardian');
    await familyPrivacy('student-user-a', 'Learner');
  }
  await check('No browser request left the local Worker or the loopback fake, and no page error occurred', async () => { assert.deepEqual(externalRequests, []); assert.deepEqual(pageErrors, []); });
} catch (error) {
  failure = { checkpoint: current, name: error.name, message: String(error.message).slice(0, 600) };
  console.error('FAILED at: ' + current + '\n' + error.stack);
  for (const value of contexts) for (const page of value.pages()) { try { console.error('Screen ' + new URL(page.url()).pathname + '\n' + (await page.locator('body').innerText()).slice(0, 1200)); } catch { /* page already closed */ } }
} finally {
  const result = { executedAt: new Date().toISOString(), phase, passed, failed: failure ? 1 : 0, skipped: 0, failure, externalRequests: externalRequests.length,
    pageErrors: pageErrors.length, fakeDestinationRequests: fake.requests.map(item => ({ method: item.method, path: item.path, query: item.query })), browserFakeRequests,
    axe: axeResults, screenshots, checks,
    limits: ['Local built Worker, synthetic data and a loopback fake destination only.', 'Automated WCAG rules are not a formal accessibility review.', 'The fake destination is not any real ORF app; no real handoff, sign-in or result exchange was tested.'] };
  writeFileSync(join(outputDir, 'reading-review-demo-' + phase + '-results.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ phase, passed, failed: failure ? 1 : 0, skipped: 0, externalRequests: externalRequests.length, pageErrors: pageErrors.length, axeSamples: axeResults.length }));
  await Promise.allSettled(contexts.map(value => value.close())); await browser.close(); await fake.close();
  process.exitCode = failure ? 1 : 0;
}
