// Automated WCAG-rule sampling of rendered localhost workflows, not formal acceptance.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const origin = process.env.SAHA_WORKER_TEST_URL, fixture = process.env.SAHA_WORKER_SESSION_FIXTURE, executablePath = process.env.SAHA_TEST_BROWSER;
if (!origin || !fixture || !executablePath) throw new Error('Supply a synthetic local Worker, private session fixture and browser executable.');
const base = new URL(origin);
if (!['127.0.0.1', 'localhost'].includes(base.hostname) || !['http:', 'https:'].includes(base.protocol) || base.pathname !== '/' || base.search || base.hash || base.username || base.password) throw new Error('Accessibility sampling requires an exact localhost origin.');
const sessions = JSON.parse(readFileSync(fixture, 'utf8'));
// Add an isolated approved assignment and saved response so staff feedback and
// learner response controls are sampled, rather than only an empty learning list.
async function syntheticApi(path, user, input, status) {
  const url = new URL(path, base);
  assert.equal(url.origin, base.origin, 'Synthetic accessibility setup remains local');
  assert.equal(typeof sessions[user], 'string', 'Required setup session exists');
  const response = await fetch(url, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(20000),
    headers: { cookie: sessions[user], origin: base.origin, 'content-type': 'application/json' }, body: JSON.stringify(input) });
  const text = await response.text();
  assert.equal(response.status, status, 'Synthetic accessibility setup status: ' + path);
  return JSON.parse(text);
}
const suffix = crypto.randomUUID().slice(0, 8);
const resource = await syntheticApi('/api/resources', 'teacher-a', { content: {
  title: 'Accessibility learning ' + suffix, type: 'worksheet', curriculum: 'Synthetic curriculum',
  gradeLevel: '8', subject: 'Mathematics', language: 'en-IN', objectives: 'Explain a synthetic comparison.',
  body: 'Write a synthetic response.', teacherNotes: 'Private synthetic note.', answerKey: 'Private synthetic answer.',
} }, 201);
await syntheticApi('/api/resources/' + resource.id + '/approve', 'teacher-a', { versionId: resource.latest.id }, 200);
const assignment = await syntheticApi('/api/resources/' + resource.id + '/assign', 'teacher-a',
  { versionId: resource.latest.id, classId: 'class-a' }, 201);
await syntheticApi('/api/assignments/' + assignment.id + '/submissions', 'student-user-a',
  { clientSubmissionId: crypto.randomUUID(), expectedAttempt: 0, response: 'Synthetic saved accessibility response.' }, 201);
const assignmentPage = '/assignments/' + assignment.id;
const journeys = {
  'admin-a': ['/dashboard/admin', '/admin/users', '/admin/profile-links', '/schools', '/courses', '/classes', '/enrolments', '/students', '/guardians', '/report-cards', '/notifications', '/attendance', '/classes/class-a/attendance', '/assessments', '/assessments/assessment-a'],
  'teacher-a': ['/dashboard/teacher', '/resources', '/curriculum', '/external-apps', '/reading-imports', '/reading-review', '/learning', '/classes', '/assessments', '/notifications', '/attendance', '/classes/class-a/attendance', '/assessments/assessment-a'],
  'student-user-a': ['/dashboard/student', '/learning', '/report-cards', '/classes', '/notifications', '/attendance', '/classes/class-a/attendance', '/assessments', '/assessments/assessment-a'],
  'guardian-a': ['/dashboard/guardian', '/students', '/report-cards', '/classes', '/notifications', '/attendance', '/classes/class-a/attendance', '/assessments', '/assessments/assessment-a'],
};
for (const paths of Object.values(journeys)) paths.push(assignmentPage);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-background-networking'] });
const results = [], externalRequests = [], pageErrors = [];
let failed = 0;
try {
  for (const [user, paths] of Object.entries(journeys)) for (const width of [1280, 390]) {
    assert.equal(typeof sessions[user], 'string', 'Required synthetic session exists');
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', extraHTTPHeaders: { cookie: sessions[user] } });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === base.origin) return route.continue();
      externalRequests.push({ origin: url.origin, path: url.pathname });
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    for (const path of paths) {
      const response = await page.goto(new URL(path, base).href, { waitUntil: 'networkidle', timeout: 20000 });
      assert.equal(response?.status(), 200, 'Authenticated page is rendered');
      assert.equal(new URL(page.url()).pathname, path, 'An authenticated workflow, not a login redirect, is audited');
      const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const violations = audit.violations.map(item => ({ id: item.id, impact: item.impact, description: item.description,
        nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }));
      results.push({ role: user, width, path, violations, incompleteRuleCount: audit.incomplete.length });
      if (violations.length) { failed++; console.log('not ok - ' + user + ' ' + width + ' ' + path + ': ' + violations.map(item => item.id).join(', ')); }
      else console.log('ok - ' + user + ' ' + width + ' ' + path);
    }
    await context.close();
  }
  if (externalRequests.length || pageErrors.length) failed++;
  const summary = { passed: results.filter(row => row.violations.length === 0).length, failed, skipped: 0, sampledPages: results.length,
    externalRequests: externalRequests.length, pageErrors: pageErrors.length, formalAccessibilityAcceptance: false,
    limits: 'Automated visible resting-page WCAG-rule sample; incomplete checks, keyboard/screen-reader testing and all interactive states require separate review.' };
  const output = process.env.SAHA_ACCESSIBILITY_RESULTS;
  if (output) writeFileSync(output, JSON.stringify({ executedAt: new Date().toISOString(), ...summary, results, externalRequestDetails: externalRequests, pageErrorDetails: pageErrors }, null, 2) + '\n');
  console.log(JSON.stringify(summary));
  process.exitCode = failed ? 1 : 0;
} finally { await browser.close(); }
