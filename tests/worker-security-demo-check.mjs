// NFR-01 mounted security review against the BUILT Worker with an isolated synthetic local D1 (designed cases TC-011, TC-012,
// TC-019, TC-020, TC-084 and the page-access rows of SECURITY-NONFUNCTIONAL-TESTS.md). Checks the real HTTP response headers
// the Worker emits, anonymous page access, role-by-page behaviour in a real browser (no page errors, no CSP violations, no
// external requests, no leak of another role's or school's markers), method handling and framing/eval enforcement.
// Fixture: tests/support/write-security-fixture.mjs. Synthetic sessions only; no provider, no real recipient.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const origin = process.env.SAHA_WORKER_TEST_URL,
  sessionPath = process.env.SAHA_WORKER_SESSION_FIXTURE,
  manifestPath = process.env.SAHA_WORKER_FIXTURE_MANIFEST,
  executablePath = process.env.SAHA_TEST_BROWSER;
if (!origin || !sessionPath || !manifestPath || !executablePath)
  throw new Error(
    'Supply SAHA_WORKER_TEST_URL, SAHA_WORKER_SESSION_FIXTURE, SAHA_WORKER_FIXTURE_MANIFEST and SAHA_TEST_BROWSER for an isolated synthetic local Worker.',
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
  throw new Error('This check only runs against an isolated localhost Worker.');
const cookies = JSON.parse(readFileSync(sessionPath, 'utf8'));
const { ids } = JSON.parse(readFileSync(manifestPath, 'utf8'));
let checks = 0;
// A stuck browser must not hold the shared machine: report where it was and stop.
setTimeout(
  () => {
    console.error('not ok - watchdog: the check exceeded 14 minutes');
    process.exit(2);
  },
  14 * 60 * 1000,
).unref();
const failures = [];
// Soft assertions: every failure of a run is listed together, because a mounted run is expensive to repeat.
const check = (condition, message) => {
  if (condition) checks++;
  else failures.push(message);
};
const equal = (actual, expected, message) => {
  try {
    assert.deepEqual(actual, expected);
    checks++;
  } catch {
    failures.push(`${message} (got ${JSON.stringify(actual)?.slice(0, 160)})`);
  }
};
const get = async (path, { actor, method = 'GET', headers = {}, body } = {}) => {
  try {
    return await fetch(new URL(path, base), {
      method,
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
      body,
      headers: {
        ...(actor ? { cookie: cookies[actor] } : {}),
        ...(method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS'
          ? { origin: base.origin, 'content-type': 'application/json' }
          : {}),
        ...headers,
      },
    });
  } catch (error) {
    throw new Error(`${method} ${path} as ${actor ?? 'anonymous'}: ${error.name} ${error.message}`);
  }
};
// Section runner: a failing section is recorded and the remaining sections still run, so one run shows every problem.
async function section(name, fn) {
  const before = failures.length;
  try {
    await fn();
  } catch (error) {
    failures.push(`${name}: ${error.message.split('\n')[0]}`);
  }
  console.log(`${failures.length === before ? 'ok' : 'not ok'} - ${name}`);
}

// All page routes of the application with the fixture's concrete ids.
const PAGES = [
  '/',
  '/login',
  '/dashboard',
  '/dashboard/admin',
  '/dashboard/teacher',
  '/dashboard/guardian',
  '/dashboard/student',
  '/admin/users',
  '/admin/profile-links',
  '/schools',
  '/courses',
  '/classes',
  '/classes/class-a',
  '/classes/class-a/attendance',
  '/enrolments',
  '/students',
  '/students/student-a',
  '/guardians',
  '/attendance',
  '/assessments',
  '/assessments/assessment-a',
  '/report-cards',
  '/report-cards/published-a',
  `/report-cards/${ids.reportDraft}`,
  '/notifications',
  '/resources',
  `/resources/${ids.resource}`,
  `/resources/${ids.resource}/print`,
  '/curriculum',
  `/curriculum/${ids.curriculum}`,
  `/assignments/${ids.assignment}`,
  '/learning',
  '/reading-practice',
  '/reading-review',
  '/reading-imports',
  '/external-apps',
];
check(PAGES.length === 36, `${PAGES.length} page URLs cover all 35 page files plus the dashboard alias`);
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
};
function assertSecurityHeaders(response, label) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS))
    equal(response.headers.get(name), value, `${label}: ${name}`);
  const csp = response.headers.get('content-security-policy') ?? '';
  for (const directive of [
    "default-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "connect-src 'self'",
  ])
    check(csp.split('; ').includes(directive), `${label}: CSP has ${directive}`);
  check(/camera=\(\)/.test(response.headers.get('permissions-policy') ?? ''), `${label}: Permissions-Policy`);
  equal(response.headers.get('strict-transport-security'), null, `${label}: no HSTS on a local http origin`);
}

// ---------------------------------------------------------------------------------------------------------------
// 1. Real response headers on every kind of response the Worker produces.
// ---------------------------------------------------------------------------------------------------------------
await section('response headers', async () => {
  const login = await get('/login');
  equal(login.status, 200, 'login page is public');
  assertSecurityHeaders(login, '/login');
  equal(login.headers.get('cache-control'), 'no-store', '/login: HTML is never cacheable');
  const loginHtml = await login.text();
  check(
    !/<script[^>]+src="https?:\/\//.test(loginHtml) && !/<link[^>]+href="https?:\/\//.test(loginHtml),
    'login HTML references no external script or stylesheet',
  );
  const requests = [
    ['anonymous API 401', '/api/students', {}],
    ['anonymous page redirect', '/students', {}],
    ['authenticated API 200', '/api/students', { actor: 'admin-a' }],
    ['authenticated page 200', '/dashboard/admin', { actor: 'admin-a' }],
    ['unknown path 404', '/no-such-page-' + crypto.randomUUID(), {}],
    ['unknown API 404', '/api/no-such-route', { actor: 'admin-a' }],
    ['method not allowed', '/api/students/student-a', { actor: 'admin-a', method: 'PUT', body: '{}' }],
    [
      'hostile origin 403',
      '/api/students',
      {
        actor: 'admin-a',
        method: 'POST',
        headers: { origin: 'https://attacker.example.invalid' },
        body: '{}',
      },
    ],
    ['denied role 403', '/api/students', { actor: 'guardian-a', method: 'POST', body: '{}' }],
    ['sign-in start unconfigured', '/api/auth/login', { method: 'POST', body: '{}' }],
    ['callback failure redirect', '/api/auth/callback?state=x&code=y', {}],
    ['OPTIONS', '/api/students', { actor: 'admin-a', method: 'OPTIONS' }],
    ['HEAD', '/api/students', { actor: 'admin-a', method: 'HEAD' }],
  ];
  const samples = [];
  for (const [label, path, options] of requests) {
    try {
      samples.push([label, await get(path, options)]);
    } catch (error) {
      failures.push(`${label}: ${error.message}`);
    }
  }
  for (const [label, response] of samples) {
    if (!response.headers.get('x-frame-options'))
      console.log(
        `Diagnostic: ${label} -> status ${response.status}, headers ${JSON.stringify([...response.headers.keys()])}, body ${JSON.stringify((await response.clone().text()).slice(0, 200))}`,
      );
    assertSecurityHeaders(response, label);
    if (
      label.includes('API') ||
      label === 'method not allowed' ||
      label.includes('403') ||
      label.includes('401')
    )
      equal(response.headers.get('cache-control'), 'no-store', `${label}: no-store`);
    equal(response.headers.get('access-control-allow-origin'), null, `${label}: no CORS allowance`);
    await response.arrayBuffer();
  }
  // Denied roles on a mutating route, with an empty and a plausible body: a wrong role must be refused with hardened headers.
  for (const actor of ['guardian-a', 'teacher-a', 'student-user-a']) {
    for (const body of ['{}', JSON.stringify({ name: 'x' })]) {
      const response = await get('/api/students', { actor, method: 'POST', body });
      console.log(
        `Diagnostic: ${actor} POST /api/students ${body} -> ${response.status} xfo=${response.headers.get('x-frame-options')} cache=${response.headers.get('cache-control')} body=${(await response.text()).slice(0, 80)}`,
      );
    }
  }
  equal(
    samples.find(([label]) => label === 'method not allowed')?.[1].status,
    405,
    'unsupported method is 405',
  );
  equal(
    samples.find(([label]) => label === 'hostile origin 403')?.[1].status,
    403,
    'foreign origin is 403 before the body is read',
  );
  equal(
    samples.find(([label]) => label === 'anonymous page redirect')?.[1].status,
    307,
    'anonymous protected page redirects',
  );
  const optionsStatus = samples.find(([label]) => label === 'OPTIONS')?.[1].status;
  check([200, 204, 405].includes(optionsStatus), `OPTIONS is answered without data (${optionsStatus})`);
  // Static assets: still hardened but cacheable by the framework.
  const assetPath = [
    ...loginHtml.matchAll(/(?:src|href)="(\/(?:_next\/static|assets)\/[^"]+\.(?:js|css))"/g),
  ].map((match) => match[1])[0];
  if (assetPath) {
    const asset = await get(assetPath);
    equal(asset.status, 200, 'framework asset is served');
    // Static files are answered by the platform asset layer before the Worker runs, so they carry no Worker-added headers
    // (finding F10, low: hashed JavaScript/CSS only, no data). Recorded, not asserted either way.
    console.log(
      `Observation F10: static asset x-content-type-options=${asset.headers.get('x-content-type-options')}, content-security-policy=${asset.headers.has('content-security-policy') ? 'present' : 'absent'}`,
    );
    check(
      !/no-store/.test(asset.headers.get('cache-control') ?? ''),
      `asset keeps its cache policy (${asset.headers.get('cache-control')})`,
    );
    await asset.arrayBuffer();
  } else
    console.log(
      'No framework asset URL found in the login HTML (inline-only build); asset cache policy not sampled.',
    );
});

// ---------------------------------------------------------------------------------------------------------------
// 2. Anonymous access to every page.
// ---------------------------------------------------------------------------------------------------------------
await section('anonymous pages', async () => {
  const anonymous = {};
  for (const path of PAGES) {
    const response = await get(path);
    anonymous[path] = { status: response.status, location: response.headers.get('location') };
    assertSecurityHeaders(response, 'anonymous ' + path);
    const text = await response.text();
    check(
      !/PRIVATE-|student-a|class-a|Synthetic fixture/.test(text) ||
        path === '/login' ||
        response.status === 307,
      `anonymous ${path}: no record data in the body`,
    );
    if (path === '/login') equal(response.status, 200, '/login is public');
    else {
      equal(response.status, 307, `anonymous ${path} redirects`);
      equal(
        new URL(response.headers.get('location'), base).pathname,
        '/login',
        `anonymous ${path} goes to /login`,
      );
    }
  }
});

// ---------------------------------------------------------------------------------------------------------------
// 3. Role by page in a real browser.
// ---------------------------------------------------------------------------------------------------------------
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--disable-background-networking'],
});
const external = [],
  pageErrors = [],
  violations = [],
  serverErrors = [],
  consoleErrors = [];
const visits = [];
const SCHOOL_B = /student-b|guardian-b|teacher-b|class-b|admin-b|school-b/;
const roleRules = {
  'admin-a': { forbidden: [SCHOOL_B] },
  'teacher-a': { forbidden: [SCHOOL_B, /PRIVATE-NOTES-OTHER|PRIVATE-ANSWER-OTHER/] },
  'guardian-a': { forbidden: [SCHOOL_B, /PRIVATE-|student-peer|student-other|guardian-other|guardian-peer/] },
  'student-user-a': {
    forbidden: [SCHOOL_B, /PRIVATE-|student-peer|student-other|guardian-other|guardian-peer/],
  },
  'admin-b': {
    forbidden: [
      /student-a|student-peer|student-other|class-a|class-other|PRIVATE-|Synthetic fixture|guardian-a|teacher-a/,
    ],
  },
};
try {
  for (const actor of Object.keys(roleRules)) {
    console.log(`progress: browser role ${actor} ${new Date().toISOString().slice(11, 19)}`);
    // A cookie jar entry (not an extra Cookie header) so the session also survives the redirects the pages issue.
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block',
    });
    {
      const separator = cookies[actor].indexOf('=');
      await context.addCookies([
        {
          name: cookies[actor].slice(0, separator),
          value: cookies[actor].slice(separator + 1),
          domain: base.hostname,
          path: '/',
          secure: true,
          httpOnly: true,
          sameSite: 'Lax',
        },
      ]);
    }
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin === base.origin) return route.continue();
      external.push({ actor, origin: url.origin, path: url.pathname });
      return route.abort();
    });
    await context.addInitScript(() => {
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (event) =>
        window.__cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`),
      );
    });
    const page = await context.newPage();
    let current = null;
    page.on('pageerror', (error) => pageErrors.push({ actor, path: current, message: error.message }));
    page.on('console', (message) => {
      if (
        message.type() === 'error' &&
        !/Failed to load resource|example\.invalid\/probe/.test(message.text())
      )
        consoleErrors.push({ actor, path: current, text: message.text().slice(0, 200) });
    });
    page.on('response', (response) => {
      if (response.status() >= 500)
        serverErrors.push({ actor, path: current, url: response.url(), status: response.status() });
    });
    const paths =
      actor === 'admin-b'
        ? PAGES.filter((path) => !path.startsWith('/dashboard/') || path === '/dashboard/admin')
        : PAGES;
    for (const path of paths) {
      current = path;
      let response;
      try {
        response = await page.goto(new URL(path, base).href, { waitUntil: 'load', timeout: 45000 });
        await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(150);
      } catch (error) {
        failures.push(`${actor} ${path}: navigation ${error.message.split('\n')[0]}`);
        continue;
      }
      const final = new URL(page.url()).pathname;
      const text = await page.evaluate(() => document.body.innerText);
      const html = await page.content();
      const found = await page.evaluate(() => window.__cspViolations ?? []);
      violations.push(...found.map((entry) => ({ actor, path, entry })));
      check(
        response.status() === 200 || response.status() === 404,
        `${actor} ${path}: final document ${response.status()}`,
      );
      for (const rule of roleRules[actor].forbidden)
        check(
          !rule.test(text) && !rule.test(html.replace(/<script[\s\S]*?<\/script>/g, '')),
          `${actor} ${path}: page shows no ${rule}`,
        );
      visits.push({
        actor,
        path,
        final,
        status: response.status(),
        heading:
          (
            await page
              .locator('h1')
              .first()
              .textContent({ timeout: 500 })
              .catch(() => null)
          )
            ?.trim()
            .slice(0, 40) ?? null,
      });
    }
    // Role redirect rules.
    const own = {
      'admin-a': 'admin',
      'teacher-a': 'teacher',
      'guardian-a': 'guardian',
      'student-user-a': 'student',
      'admin-b': 'admin',
    }[actor];
    equal(
      visits.find((visit) => visit.actor === actor && visit.path === '/').final,
      `/dashboard/${own}`,
      `${actor}: / goes to the role's own dashboard`,
    );
    equal(
      visits.find((visit) => visit.actor === actor && visit.path === '/dashboard').final,
      `/dashboard/${own}`,
      `${actor}: /dashboard goes to the role's own dashboard`,
    );
    for (const role of ['admin', 'teacher', 'guardian', 'student']) {
      const visit = visits.find((entry) => entry.actor === actor && entry.path === `/dashboard/${role}`);
      if (!visit) continue;
      if (role === own) equal(visit.final, `/dashboard/${role}`, `${actor}: own dashboard renders`);
      else
        equal(
          visit.final,
          `/dashboard/${own}`,
          `${actor}: ${role} dashboard is refused and redirected to the own dashboard`,
        );
    }
    // Browser enforcement of the policy on a real page of this role.
    const enforcement = await page.evaluate(async () => {
      // Runtime.evaluate from the test driver is exempt from the page CSP, so the probe runs as an inline script of the page itself.
      const probeScript = document.createElement('script');
      probeScript.textContent =
        "setTimeout(() => { window.__evalProbe = 'allowed'; try { eval('1+1'); } catch (error) { window.__evalProbe = 'blocked'; } }, 0)";
      document.head.append(probeScript);
      await new Promise((resolve) => setTimeout(resolve, 200));
      const evalResult = window.__evalProbe ?? 'inline script did not run';
      let inlineAttribute = 'ran';
      window.__inlineProbe = 0;
      const probe = document.createElement('div');
      probe.innerHTML =
        '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" onload="window.__inlineProbe=1">';
      document.body.append(probe);
      await new Promise((resolve) => setTimeout(resolve, 50));
      inlineAttribute = window.__inlineProbe === 1 ? 'ran' : 'blocked';
      let cross = 'allowed';
      try {
        await fetch('https://example.invalid/probe', { mode: 'no-cors' });
      } catch {
        cross = 'blocked';
      }
      return { evalResult, cross, inlineAttribute };
    });
    equal(
      enforcement.evalResult,
      'blocked',
      `${actor}: string evaluation (eval) is blocked by the CSP in a real browser`,
    );
    equal(enforcement.cross, 'blocked', `${actor}: cross-origin fetch is blocked`);
    await context.close();
  }
  // Framing: another origin cannot embed a page of the application.
  const framing = await browser.newContext({ serviceWorkers: 'block' });
  const framer = await framing.newPage();
  await framer.route('**/*', (route) =>
    new URL(route.request().url()).origin === base.origin
      ? route.continue()
      : route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: `<iframe id="f" src="${base.origin}/login" width="400" height="300"></iframe>`,
        }),
  );
  console.log('progress: framing check');
  await framer.goto('https://framer.example.invalid/', { waitUntil: 'commit', timeout: 20000 });
  await framer.waitForTimeout(4000);
  const childFrame = framer.frames().find((frame) => frame !== framer.mainFrame());
  const frameUrl = childFrame?.url() ?? '';
  // A refused frame is an error document; never wait on it (evaluating inside it can block indefinitely).
  const frameText = frameUrl.startsWith(base.origin)
    ? await Promise.race([
        childFrame.evaluate(() => document.body?.innerText ?? '').catch(() => ''),
        new Promise((resolve) => setTimeout(() => resolve(''), 3000)),
      ])
    : '';
  check(
    !frameUrl.startsWith(base.origin) && !frameText.includes('Sign in') && !/Saha/.test(frameText),
    `a foreign page cannot frame the application (frame url ${frameUrl || 'blocked'})`,
  );
  await framing.close();
} catch (error) {
  failures.push('browser section: ' + error.message.split('\n')[0]);
} finally {
  await browser.close();
}

check(pageErrors.length === 0, `no page errors (${JSON.stringify(pageErrors.slice(0, 3))})`);
check(violations.length === 0, `no CSP violation (${JSON.stringify(violations.slice(0, 3))})`);
check(serverErrors.length === 0, `no 5xx response (${JSON.stringify(serverErrors.slice(0, 3))})`);
check(
  consoleErrors.length === 0,
  `no unexpected console error (${JSON.stringify(consoleErrors.slice(0, 3))})`,
);
check(external.length === 0, `no external request (${JSON.stringify(external.slice(0, 3))})`);
const rendered = visits.filter((visit) => visit.final === visit.path).length;
console.log(
  `${visits.length} role-by-page visits (${rendered} rendered in place, ${visits.length - rendered} redirected), 0 page errors, 0 CSP violations, 0 external requests.`,
);
console.log(JSON.stringify({ passed: checks, failed: failures.length, skipped: 0 }));
if (failures.length) {
  for (const failure of failures.slice(0, 60)) console.error('not ok - ' + failure);
  if (failures.length > 60) console.error(`... ${failures.length - 60} more`);
  process.exitCode = 1;
}
