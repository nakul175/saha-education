// Manual checks of the built four-hour development candidate. Synthetic local D1 only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const origin = process.env.SAHA_WORKER_TEST_URL,
  fixture = process.env.SAHA_WORKER_SESSION_FIXTURE;
if (!origin || !fixture) throw new Error('Supply the local Worker origin and synthetic session fixture.');
const base = new URL(origin);
if (
  !['localhost', '127.0.0.1'].includes(base.hostname) ||
  !['http:', 'https:'].includes(base.protocol) ||
  base.pathname !== '/' ||
  base.username ||
  base.password
)
  throw new Error('Synthetic development checks require a localhost origin.');
const sessions = JSON.parse(readFileSync(fixture, 'utf8'));
for (const id of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'guardian-a', 'student-user-a'])
  if (typeof sessions[id] !== 'string') throw new Error('Missing synthetic session: ' + id);
let passed = 0;
const check = (actual, expected, name) => {
  assert.deepEqual(actual, expected, name);
  passed++;
  console.log('ok - ' + name);
};
async function request(path, user, method = 'GET', value, suppliedOrigin = base.origin) {
  const response = await fetch(new URL(path, base), {
    method,
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
    headers: {
      ...(user ? { Cookie: sessions[user] } : {}),
      ...(method === 'GET' ? {} : { Origin: suppliedOrigin, 'Content-Type': 'application/json' }),
    },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }),
  });
  return new Response(await response.arrayBuffer(), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
async function json(path, user, method = 'GET', value, expected = 200) {
  const response = await request(path, user, method, value);
  check(response.status, expected, method + ' ' + path + ' status');
  check(response.headers.get('cache-control'), 'no-store', 'Sensitive response uncached');
  return response.json();
}
const suffix = crypto.randomUUID().slice(0, 8);
try {
  for (const path of [
    '/api/admin/profile-links',
    '/api/admin/profile-links/history',
    '/api/reading-imports',
    '/api/reading-imports/missing',
    '/api/reading-imports/missing/decision',
    '/api/assignments/missing/submission-window',
    '/api/assignments/missing/submission-window/history',
  ]) {
    check(
      (
        await request(
          path,
          undefined,
          path.endsWith('/decision') ? 'POST' : 'GET',
          path.endsWith('/decision') ? {} : undefined,
        )
      ).status,
      401,
      'Anonymous denied: ' + path,
    );
  }
  for (const path of ['/admin/profile-links', '/reading-imports']) {
    const response = await request(path);
    check(response.status, 307, 'Protected page redirects');
    check(new URL(response.headers.get('location'), base).pathname, '/login', 'Redirect targets login');
  }
  for (const user of ['teacher-a', 'guardian-a', 'student-user-a'])
    check(
      (await request('/api/admin/profile-links', user)).status,
      403,
      'Only school admins list profile links',
    );
  for (const user of ['guardian-a', 'student-user-a'])
    check(
      (await request('/api/reading-imports', user)).status,
      403,
      'Reading import workspace is staff-only',
    );
  for (const path of [
    '/api/admin/profile-links',
    '/api/reading-imports',
    '/api/assignments/missing/submission-window',
  ])
    check(
      (await request(path, 'admin-a', 'POST', {}, 'https://attacker.example.invalid')).status,
      403,
      'Foreign-origin mutation denied',
    );
  check(
    (await request('/api/admin/profile-links', 'teacher-a', 'POST', {})).status,
    403,
    'Profile mutation role checked before invalid body',
  );
  check(
    (await request('/api/reading-imports', 'guardian-a', 'POST', {})).status,
    403,
    'Import mutation role checked before invalid body',
  );

  const student = await json(
    '/api/students',
    'admin-a',
    'POST',
    {
      schoolId: 'a',
      firstName: 'Synthetic served ' + suffix,
      lastName: 'Development',
      dateOfBirth: '2012-01-01',
      admissionNumber: 'DEV-' + suffix,
      gradeLevel: '8',
    },
    201,
  );
  check(student.userId, null, 'Ordinary profile creation starts unlinked');
  const account = await json(
    '/api/admin/users',
    'admin-a',
    'POST',
    {
      name: 'Synthetic served learner ' + suffix,
      email: 'development-' + suffix + '@example.invalid',
      role: 'student',
      identityIssuer: 'https://identity.example.invalid',
      identitySubject: 'development-' + suffix,
      reason: 'Synthetic reviewed account provision.',
      reviewConfirmed: true,
      clientRequestId: crypto.randomUUID(),
    },
    201,
  );
  const link = {
    profileType: 'student',
    profileId: student.id,
    userId: account.user.id,
    expectedVersion: 0,
    clientRequestId: crypto.randomUUID(),
    reason: 'Synthetic reviewed profile ownership.',
    reviewConfirmed: true,
  };
  const linked = await json('/api/admin/profile-links', 'admin-a', 'POST', link);
  check(linked.profile.userId, account.user.id, 'Reviewed student link saved');
  check(linked.profile.version, 1, 'Link increments optimistic version');
  check(linked.event.previousUserId, null, 'Original ownership retained in review');
  check(linked.event.nextUserId, account.user.id, 'Selected new account retained in review');
  check(
    await json('/api/admin/profile-links', 'admin-a', 'POST', link),
    linked,
    'Exact reviewed link retry returns original event',
  );
  check(
    (await request('/api/students/' + student.id, 'admin-a', 'PATCH', { ...student, userId: null })).status,
    400,
    'Legacy profile endpoint cannot silently unlink',
  );
  check(
    (
      await request('/api/admin/profile-links', 'admin-b', 'POST', {
        ...link,
        clientRequestId: crypto.randomUUID(),
      })
    ).status,
    404,
    'Foreign school profile link hidden',
  );
  const unlinked = await json('/api/admin/profile-links', 'admin-a', 'POST', {
    ...link,
    userId: null,
    expectedVersion: 1,
    clientRequestId: crypto.randomUUID(),
    reason: 'Synthetic explicit unlink review.',
  });
  check(unlinked.profile.userId, null, 'Reviewed unlink saved without deleting profile');
  const replay = await json('/api/admin/profile-links', 'admin-a', 'POST', link);
  check(replay.event.id, linked.event.id, 'Old link retry preserves original review');
  check(replay.profile.userId, null, 'Old link retry returns current unlinked state');
  check(replay.profile.version, 2, 'Old retry does not reapply ownership');
  const events = await json(
    '/api/admin/profile-links/history?profileType=student&profileId=' + student.id,
    'admin-a',
  );
  check(events.length, 2, 'Both reviewed ownership decisions retained');
  check(JSON.stringify(events).includes('requestHash'), false, 'Profile review omits private retry digest');
  check(JSON.stringify(events).includes('attemptId'), false, 'Profile review omits private batch marker');

  const readings = async () =>
    (await json('/api/reading-checks?classId=class-a', 'teacher-a')).filter(
      (row) => row.passageReference === 'Development passage ' + suffix,
    );
  const envelope = {
    format: 'saha.reading-results.v1',
    classId: 'class-a',
    sourceLabel: 'Development source ' + suffix,
    sourceReference: 'Synthetic local batch',
    rows: [1, 2].map((n) => ({
      externalReference: 'result-' + n,
      studentId: 'student-a',
      language: 'en-IN',
      passageReference: 'Development passage ' + suffix,
      readingDate: '2026-10-05',
      durationSeconds: 60,
      wordsAttempted: 100,
      wordsCorrect: 88 + n,
    })),
  };
  const stage = { clientImportId: crypto.randomUUID(), envelope },
    draft = await json('/api/reading-imports', 'teacher-a', 'POST', stage, 201);
  const importPath = '/api/reading-imports/' + draft.draft.id;
  check(draft.draft.status, 'staged', 'Import begins as preview');
  check(draft.items.length, 2, 'Saved preview preserves every row');
  check(
    draft.items.every((item) => item.receipt === null && item.eligible),
    true,
    'Staged rows have current eligibility and no receipt',
  );
  check((await readings()).length, 0, 'Staging creates no original readings');
  check(
    (await json('/api/reading-imports', 'teacher-a', 'POST', stage, 201)).draft.id,
    draft.draft.id,
    'Staging UUID retry retains draft',
  );
  for (const user of ['teacher-other', 'admin-b'])
    check((await request(importPath, user)).status, 404, 'Unauthorized import details hidden');
  const decision = {
    clientDecisionId: crypto.randomUUID(),
    expectedRevision: 0,
    action: 'confirm',
    confirmReviewed: true,
    reason: 'Synthetic educator review of exact source counts.',
  };
  const confirmed = await json(importPath + '/decision', 'teacher-a', 'POST', decision);
  check(confirmed.draft.status, 'confirmed', 'Educator confirmation saved');
  check(
    confirmed.items.every((item) => item.receipt?.readingCheckId === item.readingCheckId),
    true,
    'Every confirmed result has one receipt',
  );
  const originals = await readings();
  check(originals.length, 2, 'Confirmation creates exactly two originals');
  check(
    originals.every((row) => row.provenance === 'manual-reviewed-external'),
    true,
    'Observations remain educator-reviewed external counts',
  );
  check(
    (await json(importPath + '/decision', 'teacher-a', 'POST', decision)).draft.decisionId,
    decision.clientDecisionId,
    'Decision UUID retry preserves original outcome',
  );
  check((await readings()).length, 2, 'Decision retry does not duplicate observations');
  const duplicate = await json(
    '/api/reading-imports',
    'teacher-a',
    'POST',
    { ...stage, clientImportId: crypto.randomUUID() },
    201,
  );
  const duplicatePath = '/api/reading-imports/' + duplicate.draft.id;
  check(
    (
      await request(duplicatePath + '/decision', 'teacher-a', 'POST', {
        ...decision,
        clientDecisionId: crypto.randomUUID(),
      })
    ).status,
    409,
    'Consumed source references conflict across different drafts',
  );
  check(
    (await json(duplicatePath, 'teacher-a')).draft.status,
    'staged',
    'Receipt conflict rolls back decision entirely',
  );
  check((await readings()).length, 2, 'Receipt conflict creates no partial readings');
  const rejected = await json(duplicatePath + '/decision', 'teacher-a', 'POST', {
    ...decision,
    clientDecisionId: crypto.randomUUID(),
    action: 'reject',
    reason: 'Synthetic duplicate draft rejected after review.',
  });
  check(rejected.draft.status, 'rejected', 'Duplicate preview may be explicitly rejected');
  check(
    rejected.items.every((item) => item.receipt === null),
    true,
    'Rejected draft creates no receipts',
  );

  const resource = await json(
    '/api/resources',
    'teacher-a',
    'POST',
    {
      clientResourceId: crypto.randomUUID(),
      content: {
        title: 'Development response ' + suffix,
        type: 'worksheet',
        curriculum: 'Synthetic curriculum',
        gradeLevel: '8',
        subject: 'Mathematics',
        language: 'en-IN',
        objectives: 'Explain equal fractions.',
        body: 'Compare one half and one quarter.',
        teacherNotes: 'PRIVATE_DEVELOPMENT_STAFF_NOTE',
        answerKey: 'PRIVATE_DEVELOPMENT_KEY',
      },
    },
    201,
  );
  const resourcePath = '/api/resources/' + resource.id;
  await json(resourcePath + '/approve', 'teacher-a', 'POST', { versionId: resource.latest.id });
  const assignment = await json(
    resourcePath + '/assign',
    'teacher-a',
    'POST',
    { versionId: resource.latest.id, classId: 'class-a', dueDate: '2020-01-01' },
    201,
  );
  const windowPath = '/api/assignments/' + assignment.id + '/submission-window',
    attemptsPath = '/api/assignments/' + assignment.id + '/submissions';
  const initialWindow = await json(windowPath, 'student-user-a');
  check(initialWindow.revision, 0, 'Unconfigured policy starts at revision zero');
  check(initialWindow.acceptingSubmissions, true, 'Past informational due date does not close submissions');
  check(initialWindow.configured, false, 'Default window identified as unconfigured');
  for (const user of ['teacher-other', 'admin-b'])
    check((await request(windowPath, user)).status, 404, 'Other class or school window hidden');
  check(
    (await request(windowPath, 'guardian-a')).status,
    403,
    'Guardian cannot inspect raw assignment window',
  );
  check(
    (await request(windowPath, 'student-user-a', 'POST', {})).status,
    403,
    'Learner window write denied before parsing',
  );
  const input = {
    clientSubmissionId: crypto.randomUUID(),
    expectedAttempt: 0,
    response: 'Synthetic learner fraction explanation.',
  };
  const first = await json(attemptsPath, 'student-user-a', 'POST', input, 201);
  const closedInput = {
    clientPolicyId: crypto.randomUUID(),
    expectedRevision: 0,
    state: 'closed',
    closesAt: null,
    reviewConfirmed: true,
    reason: 'Synthetic reviewed end of response window.',
  };
  const closed = await json(windowPath, 'teacher-a', 'POST', closedInput, 201);
  check(closed.window.acceptingSubmissions, false, 'Reviewed closure takes effect');
  check(closed.review.revision, 1, 'Closure appends first review');
  const blocked = await request(attemptsPath, 'student-user-a', 'POST', {
    ...input,
    clientSubmissionId: crypto.randomUUID(),
    expectedAttempt: 1,
    response: 'New attempt during closure.',
  });
  check(blocked.status, 409, 'Closed window prevents a new attempt');
  check((await blocked.json()).code, 'submission-window-closed', 'Closure has a safe user-action code');
  check(
    (await json(attemptsPath, 'student-user-a', 'POST', input, 201)).id,
    first.id,
    'Committed submission UUID safely replays after closure',
  );
  const feedback = await json(
    attemptsPath + '/' + first.id + '/feedback',
    'teacher-a',
    'POST',
    {
      clientFeedbackId: crypto.randomUUID(),
      expectedRevision: 0,
      feedback: 'Synthetic reviewed formative guidance.',
      reviewed: true,
    },
    201,
  );
  check(feedback.submissionId, first.id, 'Staff can review saved attempt after closure');
  check(
    (await json(attemptsPath, 'student-user-a'))[0].feedback[0].id,
    feedback.id,
    'Learner retains reviewed feedback after closure',
  );
  check(
    (await request(windowPath + '/history', 'student-user-a')).status,
    403,
    'Staff window-review reasons not exposed to learner',
  );
  const learnerWindow = await json(windowPath, 'student-user-a');
  check(Object.hasOwn(learnerWindow, 'reason'), false, 'Learner current state omits staff review reason');
  check(Object.hasOwn(learnerWindow, 'requestHash'), false, 'Current state omits private digest');
  const reopened = await json(
    windowPath,
    'teacher-a',
    'POST',
    {
      ...closedInput,
      clientPolicyId: crypto.randomUUID(),
      expectedRevision: 1,
      state: 'open',
      reason: 'Synthetic reviewed reopening of response access.',
    },
    201,
  );
  check(reopened.window.acceptingSubmissions, true, 'Explicit reviewed reopening enables new attempts');
  const oldPolicy = await json(windowPath, 'teacher-a', 'POST', closedInput, 201);
  check(oldPolicy.review.id, closed.review.id, 'Old window UUID retry retains original closed review');
  check(oldPolicy.window.revision, 2, 'Old retry reports current later window');
  check(oldPolicy.window.acceptingSubmissions, true, 'Old retry cannot reclose current window');
  const secondInput = {
      ...input,
      clientSubmissionId: crypto.randomUUID(),
      expectedAttempt: 1,
      response: 'Synthetic revised learner explanation.',
    },
    second = await json(attemptsPath, 'student-user-a', 'POST', secondInput, 201);
  check(second.attempt, 2, 'Reopening appends another attempt');
  const elapsed = await json(
    windowPath,
    'teacher-a',
    'POST',
    {
      ...closedInput,
      clientPolicyId: crypto.randomUUID(),
      expectedRevision: 2,
      state: 'open',
      closesAt: '2020-01-01T00:00:00.000Z',
      reason: 'Synthetic explicit elapsed cutoff test.',
    },
    201,
  );
  check(elapsed.window.state, 'open', 'Elapsed cutoff preserves reviewed requested state');
  check(elapsed.window.acceptingSubmissions, false, 'Actual effective state closes at elapsed UTC cutoff');
  check(
    (
      await request(attemptsPath, 'student-user-a', 'POST', {
        ...secondInput,
        clientSubmissionId: crypto.randomUUID(),
        expectedAttempt: 2,
        response: 'Third attempt after elapsed cutoff.',
      })
    ).status,
    409,
    'Actual built database enforces elapsed cutoff',
  );
  check(
    (await json(attemptsPath, 'student-user-a', 'POST', secondInput, 201)).id,
    second.id,
    'Committed second attempt retries after cutoff',
  );
  check(
    (await request(windowPath, 'teacher-a', 'POST', { ...closedInput, clientPolicyId: crypto.randomUUID() }))
      .status,
    409,
    'Stale window revision conflicts',
  );
  const reviews = await json(windowPath + '/history', 'teacher-a');
  check(
    reviews.map((row) => row.revision),
    [3, 2, 1],
    'Review history retains ordered closing/reopening/cutoff evidence',
  );
  check(JSON.stringify(reviews).includes('requestHash'), false, 'Window history omits private digest');
  check(
    (await json(attemptsPath, 'student-user-a')).length,
    2,
    'Closure attempts cannot alter saved history',
  );

  const enrolInput = {
    studentId: student.id,
    classId: 'class-a',
    status: 'active',
    enrolledAt: '2026-10-05T00:00:00.000Z',
  };
  const enrolment = await json('/api/enrolments', 'admin-a', 'POST', enrolInput, 201);
  check(enrolment.studentId, student.id, 'Eligible new student enrols');
  check(
    (await request('/api/enrolments', 'admin-a', 'POST', enrolInput)).status,
    409,
    'Duplicate enrolment pair prevented in built database',
  );
  const resultPath = '/api/assessments/assessment-a/results';
  await json(resultPath, 'teacher-a', 'POST', {
    results: [
      {
        studentId: 'student-a',
        score: 0,
        grade: 'Synthetic zero',
        feedback: 'Synthetic existing zero feedback.',
      },
      { studentId: student.id, score: 13, feedback: 'Synthetic existing thirteen feedback.' },
    ],
  });
  const savedResults = await json(resultPath, 'teacher-a');
  check(
    savedResults.filter((row) => row.studentId === 'student-a').length,
    1,
    'Zero score retains exactly one result pair',
  );
  check(
    savedResults.find((row) => row.studentId === 'student-a').score,
    0,
    'Zero is a legitimate saved assessment score',
  );
  check(savedResults.find((row) => row.studentId === student.id).score, 13, 'Other saved score retained');
  check(
    (await request(resultPath, 'student-user-a')).status,
    403,
    'Unpublished assessment results remain staff-only',
  );
  const before = await json(resultPath, 'teacher-a');
  check(
    (
      await request(resultPath, 'teacher-a', 'POST', {
        results: [
          { studentId: 'student-a', score: 1 },
          { studentId: student.id, score: 21 },
        ],
      })
    ).status,
    400,
    'Invalid member rejects result batch',
  );
  check(await json(resultPath, 'teacher-a'), before, 'Invalid result batch preserves all confirmed rows');
  console.log(JSON.stringify({ passed, failed: 0, skipped: 0 }));
} catch (error) {
  console.log(JSON.stringify({ passed, failed: 1, skipped: 0 }));
  throw error;
}
