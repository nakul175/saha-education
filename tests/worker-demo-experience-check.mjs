// Mounted check of the guided demo and the mobile/accessibility baseline, against the rich synthetic school.
// Needs: a local Worker started with SAHA_DEMO_ENABLED=true and the installation id from the fixture manifest,
// the session fixture written by tests/support/write-demo-fixture.mjs, and a Chromium executable.
// Offline: every request that leaves the Worker origin is aborted and counted. Synthetic data only.
// Automated axe rules and layout measures are evidence of specific defects. They are not accessibility acceptance.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const origin = process.env.SAHA_WORKER_TEST_URL,
  fixture = process.env.SAHA_WORKER_SESSION_FIXTURE,
  manifestPath = process.env.SAHA_WORKER_FIXTURE_MANIFEST;
const executablePath = process.env.SAHA_TEST_BROWSER;
if (!origin || !fixture || !manifestPath || !executablePath)
  throw new Error(
    'Supply the local demo Worker URL, session fixture, fixture manifest and browser executable.',
  );
const base = new URL(origin);
if (
  !['127.0.0.1', 'localhost'].includes(base.hostname) ||
  base.pathname !== '/' ||
  base.search ||
  base.hash ||
  base.username ||
  base.password
)
  throw new Error('This check needs an exact localhost origin.');
const sessions = JSON.parse(readFileSync(fixture, 'utf8'));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const outputDir = process.env.SAHA_TEST_OUTPUT_DIR || '/private/tmp';
mkdirSync(outputDir, { recursive: true });
const { classes, assessments, assignments } = manifest.ids;
const eng5a = classes[0],
  eng5aAssessment = assessments[0];
const journeys = {
  admin: [
    '/dashboard/admin',
    '/students',
    '/students/saha-demo-learner-01',
    '/guardians',
    '/schools',
    '/classes',
    '/classes/' + eng5a,
    '/courses',
    '/enrolments',
    '/attendance',
    '/classes/' + eng5a + '/attendance',
    '/assessments',
    '/assessments/' + eng5aAssessment,
    '/report-cards',
    '/report-cards/saha-demo-report-01',
    '/notifications',
    '/curriculum',
    '/curriculum/saha-demo-reference-sequence',
    '/resources',
    '/admin/users',
    '/admin/profile-links',
    '/reading-review',
  ],
  teacher: [
    '/dashboard/teacher',
    '/classes',
    '/classes/' + eng5a + '/attendance',
    '/assessments',
    '/assessments/' + eng5aAssessment,
    '/resources',
    '/resources/saha-demo-resource-seed',
    '/learning',
    '/assignments/' + assignments[0],
    '/reading-review',
    '/reading-practice',
    '/reading-imports',
    '/external-apps',
    '/curriculum',
    '/students',
    '/report-cards',
    '/notifications',
    '/attendance',
  ],
  guardian: [
    '/dashboard/guardian',
    '/students',
    '/students/saha-demo-learner-01',
    '/attendance',
    '/classes',
    '/assessments',
    '/report-cards',
    '/report-cards/saha-demo-report-01',
    '/notifications',
  ],
  student: [
    '/dashboard/student',
    '/learning',
    '/assignments/' + assignments[0],
    '/attendance',
    '/classes',
    '/assessments',
    '/report-cards',
    '/notifications',
  ],
};
const widths = [375, 1280];
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--disable-background-networking'],
});
const external = [],
  pageErrors = [],
  serverErrors = [],
  results = [],
  findings = [];
let checks = 0,
  failed = 0;
const fail = (message, detail) => {
  failed++;
  findings.push({ message, detail });
  console.error('FAIL - ' + message + (detail ? ' :: ' + JSON.stringify(detail).slice(0, 300) : ''));
};
function expect(condition, message, detail) {
  checks++;
  if (!condition) fail(message, detail);
}

async function newContext(role, width) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    serviceWorkers: 'block',
    extraHTTPHeaders: { cookie: sessions[role] },
  });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === base.origin) return route.continue();
    external.push({ origin: url.origin, path: url.pathname });
    return route.abort();
  });
  context.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin === base.origin && response.status() >= 500)
      serverErrors.push({ path: url.pathname, status: response.status() });
  });
  return context;
}

// Measures the page that is currently loaded: layout facts plus the axe rules. Used for every real page and for the canary page below.
async function measure(page) {
  const layout = await page.evaluate(() => {
    const doc = document.documentElement;
    const controls = [...document.querySelectorAll('input:not([type=hidden]),select,textarea')];
    const unlabelled = controls
      .filter(
        (item) =>
          !item.labels?.length &&
          !item.getAttribute('aria-label') &&
          !item.getAttribute('aria-labelledby') &&
          !item.getAttribute('title'),
      )
      .map((item) => item.outerHTML.slice(0, 120));
    const buttonsWithoutName = [...document.querySelectorAll('button,[role=button],a[href]')]
      .filter(
        (item) =>
          !(item.textContent || '').trim() &&
          !item.getAttribute('aria-label') &&
          !item.getAttribute('aria-labelledby') &&
          !item.querySelector('img[alt]'),
      )
      .map((item) => item.outerHTML.slice(0, 120));
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => Number(h.tagName[1]));
    let skipped = 0;
    for (let i = 1; i < headings.length; i++) if (headings[i] - headings[i - 1] > 1) skipped++;
    const wide = [...document.querySelectorAll('body *')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > innerWidth + 1 && getComputedStyle(el).position !== 'fixed';
      })
      .slice(0, 5)
      .map((el) => el.tagName.toLowerCase() + '.' + String(el.className).slice(0, 60));
    return {
      scrollWidth: doc.scrollWidth,
      viewport: innerWidth,
      unlabelled,
      buttonsWithoutName,
      mains: document.querySelectorAll('main').length,
      h1: headings.filter((n) => n === 1).length,
      skippedHeadingLevels: skipped,
      langAttr: doc.lang,
      hasSkipLink: Boolean(document.querySelector('a[href="#main-content"]')),
      nested: document.querySelectorAll('button a, a button').length,
      wide,
      title: document.title,
      banner: document.querySelectorAll('header').length,
    };
  });
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return {
    layout,
    axe,
    serious: axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
  };
}

async function inspect(page, role, path, width) {
  const response = await page.goto(new URL(path, base).href, { waitUntil: 'networkidle', timeout: 25000 });
  expect(response?.status() === 200, `${role} ${path} @${width}: page is served`, {
    status: response?.status(),
  });
  expect(new URL(page.url()).pathname === path, `${role} ${path} @${width}: not redirected away`, {
    landed: new URL(page.url()).pathname,
  });
  const { layout, axe, serious } = await measure(page);
  expect(layout.scrollWidth <= layout.viewport + 1, `${role} ${path} @${width}: no horizontal scroll`, {
    scrollWidth: layout.scrollWidth,
    viewport: layout.viewport,
    wide: layout.wide,
  });
  expect(
    layout.unlabelled.length === 0,
    `${role} ${path} @${width}: every form control has a name`,
    layout.unlabelled,
  );
  expect(
    layout.buttonsWithoutName.length === 0,
    `${role} ${path} @${width}: every button and link has a name`,
    layout.buttonsWithoutName,
  );
  expect(layout.mains === 1, `${role} ${path} @${width}: exactly one main landmark`, { mains: layout.mains });
  expect(layout.nested === 0, `${role} ${path} @${width}: no button inside a link or link inside a button`, {
    nested: layout.nested,
  });
  expect(layout.langAttr === 'en', `${role} ${path} @${width}: page language is declared`, {
    lang: layout.langAttr,
  });
  expect(
    serious.length === 0,
    `${role} ${path} @${width}: no serious or critical axe violations`,
    serious.map((v) => ({ id: v.id, nodes: v.nodes.length, target: v.nodes[0]?.target })),
  );
  results.push({
    role,
    path,
    width,
    layout: {
      h1: layout.h1,
      skippedHeadingLevels: layout.skippedHeadingLevels,
      mains: layout.mains,
      scrollWidth: layout.scrollWidth,
    },
    axe: axe.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
  });
  return layout;
}

async function focusVisible(page, role, width) {
  await page.goto(new URL('/dashboard/' + role, base).href, { waitUntil: 'networkidle' });
  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => {
    const el = document.activeElement;
    const s = getComputedStyle(el);
    return {
      text: (el.textContent || '').trim().slice(0, 40),
      outline: s.outlineStyle + ' ' + s.outlineWidth,
      shadow: s.boxShadow,
      offscreen: el.getBoundingClientRect().top < -50,
    };
  });
  expect(
    /Skip to main content/.test(first.text),
    `${role} @${width}: the first Tab stop is the skip link`,
    first,
  );
  await page.keyboard.press('Tab');
  const second = await page.evaluate(() => {
    const el = document.activeElement;
    const s = getComputedStyle(el);
    return {
      text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40),
      outline: s.outlineStyle + ' ' + s.outlineWidth,
      shadow: s.boxShadow,
      bg: s.backgroundColor,
    };
  });
  const visible =
    (second.outline && !/^none/.test(second.outline) && !/ 0px$/.test(second.outline)) ||
    (second.shadow && second.shadow !== 'none');
  expect(visible, `${role} @${width}: the next focused control shows a visible focus indicator`, second);
}

async function guided(role) {
  const context = await newContext(role, 1280);
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  // The session header is not carried across Chromium redirects, so open the dashboard directly; the sign-in flow above proves the home redirect.
  await page.goto(new URL('/dashboard/' + role, base).href, { waitUntil: 'networkidle' });
  expect(new URL(page.url()).pathname === '/dashboard/' + role, `${role}: the ${role} dashboard opens`, {
    landed: page.url(),
  });
  const guide = page.locator('[data-role-guide="' + role + '"]');
  expect((await guide.count()) === 1, `${role}: the dashboard explains what this role can do`);
  const path = page.locator('[data-demo-path="' + role + '"]');
  expect((await path.count()) === 1, `${role}: the demo path is shown`);
  expect(
    /Synthetic demo/.test(await path.innerText()) && /invented/.test(await path.innerText()),
    `${role}: the demo path says the data is synthetic`,
  );
  const links = await path
    .locator('a')
    .evaluateAll((items) => items.map((item) => item.getAttribute('href')));
  expect(links.length >= 3, `${role}: the demo path has at least three steps`, { links });
  for (const href of links) {
    const r = await page.goto(new URL(href, base).href, { waitUntil: 'networkidle' });
    expect(
      r?.status() === 200 && new URL(page.url()).pathname === href,
      `${role}: demo step ${href} opens for this role`,
      { status: r?.status(), landed: new URL(page.url()).pathname },
    );
  }
  await context.close();
}

try {
  // 0. Canary: the same measurement must catch deliberate defects, otherwise a clean result on the real pages would mean nothing.
  {
    const context = await browser.newContext({
      viewport: { width: 375, height: 800 },
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    await page.setContent(`<!doctype html><html><head><title>Canary</title></head><body>
      <main><h1>One</h1><h3>Skipped a level</h3><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
      <input type="text"><a href="/x"><button type="button">Nested</button></a><button type="button"></button>
      <div style="width:1500px;height:10px;background:#ccc"></div><p style="color:#bbb;background:#fff">Pale grey words on white</p></main><main><h1>Two</h1></main></body></html>`);
    const { layout, serious } = await measure(page);
    const seen = new Set(serious.map((v) => v.id));
    expect(
      layout.scrollWidth > layout.viewport + 1,
      'canary: a 1500px element is reported as horizontal scroll',
      { scrollWidth: layout.scrollWidth },
    );
    expect(layout.unlabelled.length >= 1, 'canary: an input with no label is reported');
    expect(layout.buttonsWithoutName.length >= 1, 'canary: a button with no name is reported');
    expect(layout.mains === 2, 'canary: two main landmarks are reported', { mains: layout.mains });
    expect(layout.nested >= 1, 'canary: a button inside a link is reported');
    expect(layout.skippedHeadingLevels >= 1, 'canary: a skipped heading level is reported');
    expect(layout.h1 === 2, 'canary: two h1 headings are reported', { h1: layout.h1 });
    expect(layout.langAttr !== 'en', 'canary: a missing page language is reported', {
      lang: layout.langAttr,
    });
    expect(
      seen.has('image-alt') && seen.has('label') && seen.has('button-name'),
      'canary: axe reports the image, label and button defects as serious or critical',
      [...seen],
    );
    expect(serious.length >= 3, 'canary: axe finds at least three serious or critical problems', {
      found: serious.length,
    });
    await context.close();
  }
  // 1. Real first-visit flow: the sign-in page, the acknowledgement, then each role entry button.
  for (const [role, label] of [
    ['admin', 'administrator'],
    ['teacher', 'teacher'],
    ['guardian', 'guardian'],
    ['student', 'student'],
  ]) {
    const context = await browser.newContext({
      viewport: { width: 375, height: 800 },
      serviceWorkers: 'block',
    });
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin === base.origin) return route.continue();
      external.push({ origin: url.origin, path: url.pathname });
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(new URL('/login', base).href, { waitUntil: 'networkidle' });
    const text = await page.locator('main').innerText();
    expect(
      /fictional/.test(text) && /Explore Saha Education/.test(text),
      'login: first-time visitor sees that the school is fictional',
    );
    expect(
      await page.getByRole('button', { name: 'Explore as ' + label, exact: true }).isDisabled(),
      `login: ${label} entry stays disabled until the fictional-records box is ticked`,
    );
    for (const r of ['administrator', 'teacher', 'guardian', 'student'])
      expect(
        (await page
          .getByText(
            new RegExp(
              '^' +
                (r === 'administrator'
                  ? 'See school totals'
                  : r === 'teacher'
                    ? 'Take attendance'
                    : r === 'guardian'
                      ? 'See your children'
                      : 'Open class resources'),
            ),
          )
          .count()) >= 1,
        `login: ${r} entry says what the role does`,
      );
    await page.getByRole('checkbox', { name: /exploring fictional records/ }).check();
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/dashboard/' + role, { timeout: 20000 }),
      page.getByRole('button', { name: 'Explore as ' + label, exact: true }).click(),
    ]);
    expect(
      (await page.locator('[data-role-guide="' + role + '"]').count()) === 1,
      `login: ${label} entry lands on a dashboard with guidance`,
    );
    await page
      .locator('aside[aria-label="Synthetic demo"]')
      .waitFor({ timeout: 10000 })
      .catch(() => {});
    expect(
      (await page.locator('aside[aria-label="Synthetic demo"]').count()) === 1,
      `login: ${label} sees the synthetic demo banner`,
    );
    await context.close();
  }
  // 2. Guided path per role with the seeded session fixture.
  for (const role of Object.keys(journeys)) await guided(role);
  // 3. Seeded content is present and role-scoped.
  {
    const context = await newContext('admin', 1280);
    const page = await context.newPage();
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(new URL('/dashboard/admin', base).href, { waitUntil: 'networkidle' });
    const counts = await page.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll('[data-dashboard-count]')].map((el) => [
          el.getAttribute('data-dashboard-count'),
          Number(el.textContent),
        ]),
      ),
    );
    expect(
      counts.Students === manifest.counts.learners &&
        counts.Courses === manifest.counts.courses &&
        counts.Classes === manifest.counts.classes &&
        counts['Enabled teachers'] === 4,
      'admin: school totals match the seeded school',
      counts,
    );
    await context.close();
  }
  {
    const context = await newContext('teacher', 1280);
    const page = await context.newPage();
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(new URL('/dashboard/teacher', base).href, { waitUntil: 'networkidle' });
    expect(
      (await page.locator('[data-dashboard-class]').count()) === 3,
      "teacher: three assigned classes are listed (other teachers' classes are not)",
    );
    expect(
      (await page.locator('[data-dashboard-assessment]').count()) >= 6,
      'teacher: assessments for the assigned classes are listed',
    );
    await context.close();
  }
  {
    const context = await newContext('guardian', 1280);
    const page = await context.newPage();
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(new URL('/dashboard/guardian', base).href, { waitUntil: 'networkidle' });
    const profiles = await page.locator('[data-dashboard-profile]').count();
    expect(profiles === 2, 'guardian: both linked children appear and no other student does', { profiles });
    const body = await page.locator('main').innerText();
    expect(
      /Maya Iyer/.test(body) && /Arun Iyer/.test(body),
      'guardian: names of the two linked children are shown',
    );
    expect(
      !new RegExp(manifest.expect.learnerNames[2]).test(body),
      "guardian: another family's children are not shown",
    );
    const cards = await page.locator('[data-dashboard-profile="saha-demo-learner-21"]').innerText();
    expect(
      /No published report cards available/.test(cards),
      'guardian: the unpublished draft for the second child stays hidden',
    );
    await context.close();
  }
  // 4. Mobile and desktop baseline across the main pages of each role.
  for (const [role, paths] of Object.entries(journeys))
    for (const width of widths) {
      const context = await newContext(role, width);
      const page = await context.newPage();
      page.on('pageerror', (e) => pageErrors.push(e.message));
      for (const path of paths) await inspect(page, role, path, width);
      await focusVisible(page, role, width);
      await context.close();
    }
} finally {
  await browser.close();
  const summary = {
    checks,
    failed,
    pagesAudited: results.length,
    externalRequests: external.length,
    pageErrors: pageErrors.length,
    serverErrors: serverErrors.length,
    axeRuleCounts: Object.fromEntries(
      Object.entries(
        results
          .flatMap((r) => r.axe)
          .reduce((acc, v) => {
            acc[v.id + ':' + v.impact] = (acc[v.id + ':' + v.impact] ?? 0) + 1;
            return acc;
          }, {}),
      ).sort(),
    ),
    multipleH1Pages: results.filter((r) => r.layout.h1 > 1).length,
    skippedHeadingPages: results.filter((r) => r.layout.skippedHeadingLevels > 0).length,
    scope:
      'Mounted Chromium against the local synthetic Worker. Automated rules and measured layout only; no assistive-technology, keyboard-journey or educator acceptance.',
  };
  writeFileSync(
    join(outputDir, 'demo-experience-results.json'),
    JSON.stringify({ summary, findings, results }, null, 2),
  );
  console.log(JSON.stringify(summary));
}
assert.equal(external.length, 0, 'No request left the Worker origin');
assert.equal(pageErrors.length, 0, 'No page errors');
assert.equal(serverErrors.length, 0, 'No server errors');
assert.equal(failed, 0, failed + ' mounted checks failed');
console.log('Demo experience check passed: ' + checks + ' checks');
