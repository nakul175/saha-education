// Client-side contract for the reviewed course / class / enrolment pages. Static source checks plus the pure client
// helpers driven with a fake fetch (no network). The mounted browser procedure is separate (tests/worker-courses-enrolment-demo-check.mjs).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { load, root } from '../support/security-db.mjs';
let passed = 0,
  externalRequests = 0;
const check = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  passed++;
};
const read = (path) => readFileSync(join(root, path), 'utf8');
const client = await load('lib/education/academic-lifecycle-client.ts');
const types = await load('lib/education/academic-lifecycle-types.ts');
const originalFetch = globalThis.fetch;
try {
  // ---- outcome mapping of one reviewed request
  const respond = (status, body) => async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  const send = async (impl) => {
    globalThis.fetch = async (...args) => {
      externalRequests += /^https?:\/\/(?!127\.0\.0\.1|localhost)/.test(String(args[0])) ? 1 : 0;
      return impl(...args);
    };
    return client.sendChangeRequest({ clientRequestId: crypto.randomUUID(), changes: [] });
  };
  const receipt = { receipt: { id: 'r', items: [] }, replayed: false };
  check((await send(respond(201, receipt))).state, 'saved', 'A 201 is saved');
  check(
    (await send(respond(200, { ...receipt, replayed: true }))).result.replayed,
    true,
    'A 200 replay is saved and flagged as a replay',
  );
  const refused = await send(respond(409, { error: 'Conflict', code: 'class-full' }));
  check(
    [refused.state, refused.status, refused.code],
    ['refused', 409, 'class-full'],
    'A conflict is refused with its stable code',
  );
  check(
    refused.message.includes('This class is full') && refused.message.includes('Nothing was saved'),
    true,
    'A conflict is explained in plain language and says nothing was saved',
  );
  check(/class-full|\{|"/.test(refused.message), false, 'The message never shows the code or raw JSON');
  check(
    (await send(respond(409, { error: 'Conflict', code: 'unheard-of-code' }))).message.startsWith(
      'The change conflicts with the current records',
    ),
    true,
    'An unknown code gets the generic plain message',
  );
  check(
    (await send(respond(400, { error: 'Invalid request' }))).message.includes('not allowed'),
    true,
    'A 400 without a code explains the entry problem',
  );
  check(
    (await send(respond(401, { error: 'Authentication required' }))).message.includes('Sign in again'),
    true,
    'A 401 asks the person to sign in',
  );
  check(
    (await send(respond(403, { error: 'Forbidden' }))).message.includes('not allowed'),
    true,
    'A 403 is a plain refusal',
  );
  check(
    (await send(respond(500, 'boom'))).state,
    'unconfirmed',
    'A server failure is an uncertain outcome, never a refusal',
  );
  check(
    (await send(respond(503, { error: 'Service unavailable' }))).state,
    'unconfirmed',
    'An unavailable service is an uncertain outcome',
  );
  check(
    (
      await send(async () => {
        throw new TypeError('network');
      })
    ).state,
    'unconfirmed',
    'A transport failure is an uncertain outcome',
  );
  check(
    (await send(respond(429, { error: 'Too many' }))).state,
    'unconfirmed',
    'A throttled request is retried with the same id, not reported as not saved',
  );
  check(
    (await send(respond(201, 'not json'))).state,
    'unconfirmed',
    'A malformed success body is not trusted as saved',
  );
  // the request id and body are sent exactly as supplied, so an identical retry is an exact replay
  let seen;
  globalThis.fetch = async (url, init) => {
    seen = { url: String(url), init };
    return respond(201, receipt)();
  };
  const request = {
    clientRequestId: crypto.randomUUID(),
    reason: 'A reason',
    changes: [{ kind: 'class.reopen', classId: 'c', expectedUpdatedAt: 't' }],
  };
  await client.sendChangeRequest(request);
  const first = seen.init.body;
  await client.sendChangeRequest(request);
  check(
    [seen.url, seen.init.method, seen.init.body],
    ['/api/academic-changes', 'POST', first],
    'A retry sends the identical body and request id',
  );
  check(JSON.parse(first).clientRequestId, request.clientRequestId, 'The request id is carried unchanged');
  // receipt recovery
  const recover = async (status) => {
    globalThis.fetch = async () => new Response('{}', { status });
    return client.checkReceipt('id');
  };
  check(
    [await recover(200), await recover(404), await recover(500)],
    ['saved', 'not-recorded', 'unknown'],
    'Receipt recovery distinguishes saved, not recorded and unknown',
  );
  globalThis.fetch = async () => {
    throw new TypeError('offline');
  };
  check(
    await client.checkReceipt('id'),
    'unknown',
    'A transport failure while checking is unknown, never "not recorded"',
  );
  // reads
  globalThis.fetch = async () => new Response('{"secret":1}', { status: 403 });
  let failure;
  try {
    await client.readJson('/x');
  } catch (error) {
    failure = error;
  }
  check(
    [failure.status, failure.message.includes('secret')],
    [403, false],
    'A failed read carries only a status',
  );
  check(
    client.readFailureMessage(failure, 'This roster').includes('unavailable to your current account'),
    true,
    'A 403 read is explained plainly',
  );
  check(
    client.readFailureMessage(new Error('x'), 'This roster'),
    'This roster could not be loaded. Reload to try again.',
    'An unexpected failure is explained plainly',
  );
  check(
    [client.formatDay('2026-10-05'), client.formatDay(null), client.formatDay('bad')],
    ['5 Oct 2026', 'Not set', 'Not set'],
    'Dates are formatted without a local-time shift',
  );
  check(
    [
      client.formatDayRange(null, null),
      client.formatDayRange('2026-10-05', null),
      client.formatDayRange(null, '2026-12-01'),
      client.formatDayRange('2026-10-05', '2026-12-01'),
    ],
    [
      'No class dates have been set.',
      'From 5 Oct 2026, with no end date.',
      'Until 1 Dec 2026, with no start date.',
      '5 Oct 2026 to 1 Dec 2026.',
    ],
    'A class date range reads as a plain sentence',
  );
  // ---- every server conflict code has a plain-language message
  const sources = [
    read('drizzle/0018_course_class_enrolment_lifecycle.sql'),
    read('lib/education/academic-lifecycle.ts'),
  ].join('\n');
  const codes = new Set(
    [...sources.matchAll(/saha_academic_conflict:([a-z-]+)/g)]
      .map((match) => match[1])
      .concat([...sources.matchAll(/LifecycleError\('([a-z-]+)'/g)].map((match) => match[1])),
  );
  for (const code of ['course-code-taken', 'already-enrolled']) codes.add(code);
  const missing = [...codes].filter((code) => !types.CONFLICT_MESSAGES[code]);
  check(missing, [], 'Every stable server code has a plain-language message');
  check(
    Object.values(types.CONFLICT_MESSAGES).every((text) => !/[{}]|saha_|constraint|SQLITE/i.test(text)),
    true,
    'No message exposes internals',
  );
  // ---- page source contract
  const pages = [
    'app/academic/page.tsx',
    'app/courses/new/page.tsx',
    'app/courses/[id]/page.tsx',
    'app/classes/new/page.tsx',
    'app/classes/[id]/manage/page.tsx',
    'app/classes/[id]/roster/page.tsx',
    'app/enrolments/history/page.tsx',
  ];
  for (const page of pages) {
    const source = read(page);
    check(/\b(alert|confirm|prompt)\(/.test(source), false, page + ' uses no browser dialogs');
    check(
      /dangerouslySetInnerHTML|localStorage|sessionStorage|document\.cookie|eval\(/.test(source),
      false,
      page + ' has no unsafe rendering or client-held authority',
    );
    check(/JSON\.stringify\([a-z]+\)\}/.test(source), false, page + ' never renders JSON');
    const ids = [...source.matchAll(/<(?:Input|Textarea|select)\b[^>]*\bid="([^"]+)"/g)].map(
      (match) => match[1],
    );
    for (const id of ids)
      check(source.includes('htmlFor="' + id + '"'), true, page + ': control ' + id + ' has a label');
    check(source.includes('AppShell'), true, page + ' renders inside the shared shell');
    check(
      source.includes("'/api/session'"),
      true,
      page + ' verifies the account with the server before showing records',
    );
    const directory = page.split('/').slice(0, 2).join('/');
    check(
      existsSync(join(root, directory, 'layout.tsx')) &&
        read(directory + '/layout.tsx').includes('getServerPrincipal'),
      true,
      page + ' sits under a server-side sign-in layout',
    );
  }
  // The mounted Worker hands a dynamic page a thenable whose `then` returns nothing, so `params.then(...).catch(...)` crashes the page.
  for (const page of pages.filter((path) => path.includes('[id]')))
    check(
      [/Promise\.resolve\(params\)/.test(read(page)), /\bparams\.then\(/.test(read(page))],
      [true, false],
      page + ' reads route params through Promise.resolve',
    );
  check(
    existsSync(join(root, 'app/academic/layout.tsx')),
    true,
    'The hub has its own server-side sign-in layout',
  );
  // submissions only through the reviewed endpoint, with a reason field wherever the server requires one
  for (const page of pages.filter((path) => /roster|manage|\[id\]\/page|new/.test(path)))
    check(
      /useChangeSubmission/.test(read(page)),
      true,
      page + ' submits through the retained-request-id hook',
    );
  const hook = read('components/academic-submission.tsx');
  check(
    /newRequestId\(\)/.test(hook) && /run\(pending\)/.test(hook),
    true,
    'The hook creates the id once and retries the same pending request',
  );
  check(
    /Check whether it was saved/.test(hook) &&
      /Try the same request again/.test(hook) &&
      /Discard this request/.test(hook),
    true,
    'Uncertain outcomes offer check, retry and discard',
  );
  const navigation = await load('lib/education/navigation.ts');
  const links = navigation.workspaceGroups('admin').flatMap((group) => group.links);
  check(
    links.some((link) => link.href === '/academic') &&
      links.some((link) => link.href === '/enrolments/history'),
    true,
    'Navigation links to the hub and enrolment history',
  );
  check(
    readdirSync(join(root, 'app/academic')).sort(),
    ['layout.tsx', 'page.tsx'],
    'The hub folder holds only its page and layout',
  );
  check(externalRequests, 0, 'No external request was attempted');
} finally {
  globalThis.fetch = originalFetch;
}
console.log(JSON.stringify({ passed, failed: 0, skipped: 0, externalRequests }));
