import assert from 'node:assert/strict';
import { bindings, freshDatabase, seedSecurityData, load } from '../support/security-db.mjs';
import { compileWithD1Limits, recordStatements } from '../support/d1-limits.mjs';

// FR-26 audit trail and corrections: one administrator-only, school-scoped, read-only timeline over
// the evidence the product already writes, plus appended reasoned correction notes. The evidence
// itself is produced by the real routes/services of each area, never by writing audit rows directly.
const { db, schema, sqlite } = freshDatabase();
await seedSecurityData(db, schema);
const executed = recordStatements(sqlite);
const audit = {
  list: await load('app/api/admin/audit/route.ts'),
  detail: await load('app/api/admin/audit/[source]/[sourceId]/route.ts'),
  notes: await load('app/api/admin/audit/annotations/route.ts'),
};
const service = await load('lib/education/audit-trail.ts');
const area = {
  users: await load('app/api/admin/users/route.ts'),
  links: await load('app/api/admin/profile-links/route.ts'),
  registry: await load('app/api/registry/students/route.ts'),
  attendance: await load('app/api/classes/[id]/attendance-editor/route.ts'),
  assessment: await load('app/api/assessments/[id]/result-editor/route.ts'),
  report: await load('app/api/report-cards/[id]/route.ts'),
  corrections: await load('app/api/reading-checks/[id]/corrections/route.ts'),
  imports: await load('app/api/reading-imports/route.ts'),
  decision: await load('app/api/reading-imports/[id]/decision/route.ts'),
  notices: await load('app/api/notices/route.ts'),
};
const resources = await load('lib/education/resources.ts'),
  submissions = await load('lib/education/submissions.ts'),
  windows = await load('lib/education/submission-windows.ts');
const readings = await load('lib/education/reading-checks.ts'),
  curriculum = await load('lib/education/curriculum.ts');
const { createSession } = await load('lib/education/session.ts');
const origin = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = origin;
let checks = 0;
const check = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  checks++;
};
const ok = (value, message) => {
  assert.ok(value, message);
  checks++;
};
const sessions = {};
for (const id of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'guardian-a', 'student-user-a'])
  sessions[id] = (await createSession(id)).split(';')[0];
const principals = {
  'admin-a': { id: 'admin-a', role: 'admin', schoolId: 'a' },
  'teacher-a': { id: 'teacher-a', role: 'teacher', schoolId: 'a' },
  'student-user-a': { id: 'student-user-a', role: 'student', schoolId: 'a' },
};
const request = (user, method = 'GET', payload, path = '/api/admin/audit', suppliedOrigin = origin) =>
  new Request(origin + path, {
    method,
    headers: {
      ...(sessions[user] ? { cookie: sessions[user] } : {}),
      origin: suppliedOrigin,
      ...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload !== undefined
      ? { body: typeof payload === 'string' ? payload : JSON.stringify(payload) }
      : {}),
  });
const params = (id) => ({ params: Promise.resolve({ id }) });
const uuid = () => crypto.randomUUID();
const count = (table) => sqlite.prepare('SELECT count(*) n FROM ' + table).get().n;
async function denied(response, status, message) {
  check(response.status, status, message);
  check(Object.keys(await response.json()), ['error'], 'Denial exposes only a safe error');
}
const list = async (query = '', user = 'admin-a') => {
  const response = await audit.list.GET(request(user, 'GET', undefined, '/api/admin/audit' + query));
  return { response, body: await response.json() };
};
let networkCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  networkCalls++;
  throw new Error('The audit trail is local only');
};
try {
  // ---- evidence from the real flows ----
  let response = await area.users.POST(
    request(
      'admin-a',
      'POST',
      {
        clientRequestId: uuid(),
        name: 'Audit synthetic teacher',
        email: 'audit-teacher@example.invalid',
        role: 'teacher',
        identityIssuer: 'https://identity.example.invalid',
        identitySubject: 'audit-subject-1',
        reviewConfirmed: true,
        reason: 'Reviewed synthetic identity against the school roster',
      },
      '/api/admin/users',
    ),
  );
  check(response.status, 201, 'Account created');
  response = await area.links.POST(
    request(
      'admin-a',
      'POST',
      {
        profileType: 'guardian',
        profileId: 'guardian-profile-other',
        userId: null,
        expectedVersion: 0,
        clientRequestId: uuid(),
        reviewConfirmed: true,
        reason: 'Synthetic profile ownership review.',
      },
      '/api/admin/profile-links',
    ),
  );
  check(response.status, 200, 'Profile link changed');
  response = await area.registry.POST(
    request(
      'admin-a',
      'POST',
      {
        clientRequestId: uuid(),
        reviewConfirmed: true,
        reason: 'Synthetic administrator creation review',
        profile: {
          firstName: 'Audit',
          lastName: 'Created',
          dateOfBirth: '2012-01-01',
          admissionNumber: 'AUDIT-ONE',
          gradeLevel: '8',
        },
      },
      '/api/registry/students',
    ),
  );
  check(response.status, 201, 'Student record created');
  response = await area.attendance.POST(
    request(
      'teacher-a',
      'POST',
      {
        date: '2026-10-05',
        clientRequestId: uuid(),
        reviewConfirmed: true,
        reason: 'Synthetic human reviewed attendance change.',
        entries: [
          { studentId: 'student-a', status: 'absent', note: 'Private synthetic note', expectedRecord: null },
        ],
      },
      '/api/classes/class-a/attendance-editor',
    ),
    params('class-a'),
  );
  check(response.status, 201, 'Attendance reviewed');
  const editor = await (
    await area.assessment.GET(
      request('teacher-a', 'GET', undefined, '/api/assessments/assessment-a/result-editor'),
      params('assessment-a'),
    )
  ).json();
  response = await area.assessment.POST(
    request(
      'teacher-a',
      'POST',
      {
        clientRequestId: uuid(),
        reviewConfirmed: true,
        reason: 'Synthetic explicit assessment result review.',
        expectedAssessment: editor.assessment,
        entries: [{ studentId: 'student-a', score: 17, grade: 'A', feedback: null, expectedRecord: null }],
      },
      '/api/assessments/assessment-a/result-editor',
    ),
    params('assessment-a'),
  );
  check(response.status, 201, 'Assessment results reviewed');
  response = await area.report.PATCH(
    request('admin-a', 'PATCH', { publish: true }, '/api/report-cards/draft-a'),
    params('draft-a'),
  );
  check(response.status, 200, 'Report published');
  const reading = await readings.createReadingCheck(principals['teacher-a'], {
    classId: 'class-a',
    studentId: 'student-a',
    language: 'en-IN',
    passageReference: 'Synthetic passage A',
    readingDate: new Date().toISOString().slice(0, 10),
    durationSeconds: 60,
    wordsAttempted: 100,
    wordsCorrect: 91,
  });
  response = await area.corrections.POST(
    request(
      'teacher-a',
      'POST',
      {
        language: 'en-IN',
        passageReference: 'Synthetic passage A',
        readingDate: reading.readingDate,
        durationSeconds: 60,
        wordsAttempted: 100,
        wordsCorrect: 88,
        clientCorrectionId: uuid(),
        expectedRevision: 0,
        confirmReviewed: true,
        reason: 'Educator checked the manually entered word count.',
      },
      `/api/reading-checks/${reading.id}/corrections`,
    ),
    params(reading.id),
  );
  check(response.status, 201, 'Reading corrected');
  const staged = await (
    await area.imports.POST(
      request(
        'teacher-a',
        'POST',
        {
          clientImportId: uuid(),
          envelope: {
            format: 'saha.reading-results.v1',
            classId: 'class-a',
            sourceLabel: 'Synthetic namespace',
            sourceReference: 'Synthetic batch',
            rows: [
              {
                externalReference: 'audit-result-1',
                studentId: 'student-a',
                language: 'en-IN',
                passageReference: 'Synthetic passage B',
                readingDate: new Date().toISOString().slice(0, 10),
                durationSeconds: 60,
                wordsAttempted: 100,
                wordsCorrect: 90,
              },
            ],
          },
        },
        '/api/reading-imports',
      ),
    )
  ).json();
  response = await area.decision.POST(
    request(
      'teacher-a',
      'POST',
      {
        clientDecisionId: uuid(),
        expectedRevision: 0,
        action: 'confirm',
        confirmReviewed: true,
        reason: 'Reviewed synthetic counts against local source.',
      },
      `/api/reading-imports/${staged.draft.id}/decision`,
    ),
    params(staged.draft.id),
  );
  check(response.status, 200, 'Import confirmed');
  const content = {
    title: 'Audit synthetic task',
    type: 'worksheet',
    curriculum: 'Synthetic curriculum',
    gradeLevel: '8',
    subject: 'Mathematics',
    language: 'en-IN',
    objectives: 'Compare.',
    body: 'Compare one half and one quarter.',
    teacherNotes: 'Private.',
    answerKey: 'Private key.',
  };
  const resource = await resources.createResource(principals['teacher-a'], { content });
  await resources.approveResource(principals['teacher-a'], resource.id, resource.latest.id);
  const assignment = await resources.assignResource(principals['teacher-a'], resource.id, {
    versionId: resource.latest.id,
    classId: 'class-a',
  });
  await windows.reviewSubmissionWindow(principals['teacher-a'], assignment.id, {
    clientPolicyId: uuid(),
    expectedRevision: 0,
    state: 'closed',
    closesAt: null,
    reviewConfirmed: true,
    reason: 'Synthetic window close review.',
  });
  const attempt = await submissions
    .submitAssignment(principals['student-user-a'], assignment.id, {
      response: 'Synthetic private answer text.',
      expectedAttempt: 0,
      clientSubmissionId: uuid(),
    })
    .catch(() => null);
  if (!attempt) {
    await windows.reviewSubmissionWindow(principals['teacher-a'], assignment.id, {
      clientPolicyId: uuid(),
      expectedRevision: 1,
      state: 'open',
      closesAt: null,
      reviewConfirmed: true,
      reason: 'Synthetic window reopen review.',
    });
  }
  const submitted =
    attempt ??
    (await submissions.submitAssignment(principals['student-user-a'], assignment.id, {
      response: 'Synthetic private answer text.',
      expectedAttempt: 0,
      clientSubmissionId: uuid(),
    }));
  await submissions.reviewSubmission(principals['teacher-a'], assignment.id, submitted.id, {
    feedback: 'Synthetic private feedback text.',
    reviewed: true,
    expectedRevision: 0,
    clientFeedbackId: uuid(),
  });
  const reference = await curriculum.createCurriculumReference(principals['teacher-a'], {
    content: {
      title: 'Audit synthetic reference',
      curriculum: 'Synthetic curriculum',
      gradeLevel: '8',
      subject: 'Mathematics',
      language: 'en-IN',
      objectives: 'Compare.',
      body: 'Compare 1/2 and 1/4.',
      rightsStatement: 'Original synthetic content approved for copying.',
      sourceReference: 'SYN-1',
      sourceUrl: null,
    },
  });
  await curriculum.approveCurriculumReference(principals['teacher-a'], reference.id, {
    versionId: reference.latest.id,
    confirmReview: true,
  });
  response = await area.notices.POST(
    request(
      'teacher-a',
      'POST',
      {
        clientRequestId: uuid(),
        title: 'Audit synthetic notice',
        body: 'Plain notice text.',
        audience: { kind: 'class', classId: 'class-a', roles: 'both' },
        reviewConfirmed: true,
      },
      '/api/notices',
    ),
  );
  check(response.status, 201, 'Notice sent');

  // ---- access ----
  await denied(await audit.list.GET(request('anonymous')), 401, 'Anonymous audit trail denied');
  for (const user of ['teacher-a', 'guardian-a', 'student-user-a']) {
    await denied(await audit.list.GET(request(user)), 403, 'Only administrators read the audit trail');
    await denied(
      await audit.detail.GET(request(user, 'GET', undefined, '/api/admin/audit/account/x'), {
        params: Promise.resolve({ source: 'account', sourceId: 'x' }),
      }),
      403,
      'Only administrators open an entry',
    );
    await denied(
      await audit.notes.POST(request(user, 'POST', '{bad json', '/api/admin/audit/annotations')),
      403,
      'Role denial precedes body parsing for correction notes',
    );
  }
  await denied(
    await audit.notes.POST(
      request('admin-a', 'POST', {}, '/api/admin/audit/annotations', 'https://foreign.example.invalid'),
    ),
    403,
    'Foreign origin cannot add a note',
  );
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE'])
    check(audit.list[method], undefined, `The audit list has no ${method} handler`);
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE'])
    check(audit.detail[method], undefined, `The audit entry has no ${method} handler`);
  check(Object.keys(audit.notes).sort(), ['POST'], 'The only write path appends a correction note');

  // ---- coverage of every evidence area, school scope, safe fields ----
  let { response: listResponse, body: all } = await list('?limit=50');
  check(listResponse.status, 200, 'Administrator reads the trail');
  const sourcesSeen = [...new Set(all.items.map((item) => item.source))].sort();
  check(
    sourcesSeen,
    Object.keys(service.AUDIT_SOURCES)
      .filter((key) => key !== 'audit-note')
      .sort(),
    'Every evidence area appears in the trail',
  );
  ok(
    all.items.every(
      (item) =>
        item.id === `${item.source}:${item.sourceId}` &&
        item.sourceLabel &&
        item.action &&
        item.occurredAt &&
        item.subject &&
        item.actor?.name,
    ),
    'Each entry names what, who, when and about whom',
  );
  ok(
    all.items.every((item) => item.before !== undefined && item.after !== undefined),
    'Each entry carries a before and after summary',
  );
  const text = JSON.stringify(all);
  for (const secret of [
    'requestHash',
    'request_hash',
    'attemptId',
    'attempt_id',
    'Private synthetic note',
    'Synthetic private answer text',
    'Synthetic private feedback text',
    'Private key',
    'identitySubject',
    'audit-subject-1',
  ])
    ok(!text.includes(secret), 'Trail never exposes ' + secret);
  const times = all.items.map((item) => item.occurredAt);
  check(times, [...times].sort().reverse(), 'Newest first');
  check(
    (await list('?limit=50', 'admin-b')).body.items,
    [],
    "Another school sees none of this school's entries",
  );
  const feedbackEntry = all.items.find((item) => item.source === 'feedback');
  check(
    feedbackEntry.after,
    'Feedback text is not repeated in the audit trail',
    'Learner feedback text stays out of the trail',
  );
  const attendanceEntry = all.items.find((item) => item.source === 'attendance');
  check(
    [attendanceEntry.actor.id, attendanceEntry.subject, attendanceEntry.reason],
    ['teacher-a', 'class-a, 2026-10-05', 'Synthetic human reviewed attendance change.'],
    'Attendance entry has actor, class/date and reason',
  );
  const correctionEntry = all.items.find((item) => item.source === 'reading-correction');
  check(
    [correctionEntry.before, correctionEntry.after],
    ['91 of 100 words correct', '88 of 100 words correct'],
    'Reading correction shows original and corrected values',
  );
  const windowEntries = all.items.filter((item) => item.source === 'submission-window');
  check(
    windowEntries.map((entry) => [entry.before, entry.after]),
    [
      ['Closed', 'Open'],
      ['No window (open)', 'Closed'],
    ],
    'Submission window shows the previous and new policy for each change',
  );
  const accountEntry = all.items.find((item) => item.source === 'account');
  check(
    [accountEntry.action, accountEntry.before, accountEntry.after],
    ['Account created', 'No account yet', 'Access enabled'],
    'Account entry before/after',
  );
  const linkEntry = all.items.find((item) => item.source === 'profile-link');
  check(
    [linkEntry.action, linkEntry.before, linkEntry.after],
    ['Login removed from profile', 'guardian-other', 'No login'],
    'Profile link entry before/after',
  );

  // ---- filters ----
  for (const source of Object.keys(service.AUDIT_SOURCES).filter((key) => key !== 'audit-note')) {
    const { body } = await list('?source=' + source);
    ok(
      body.items.length >= 1 && body.items.every((item) => item.source === source),
      'Source filter: ' + source,
    );
  }
  check(
    (await list('?actorId=teacher-a&limit=50')).body.items.every((item) => item.actor.id === 'teacher-a'),
    true,
    "Actor filter returns only that person's actions",
  );
  ok(
    (await list('?actorId=teacher-a&limit=50')).body.items.length >= 8,
    "Actor filter finds that person's actions",
  );
  check((await list('?actorId=nobody')).body.items, [], 'Unknown actor has no entries');
  const today = new Date().toISOString().slice(0, 10),
    tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  check(
    (await list(`?from=${today}&to=${today}&limit=50`)).body.items.length,
    all.items.length,
    'A date window covering today keeps everything',
  );
  check((await list(`?from=${tomorrow}`)).body.items, [], 'A window starting tomorrow is empty');
  check((await list(`?to=${yesterday}`)).body.items, [], 'A window ending yesterday is empty');
  check(
    (await list('?q=class-a&limit=50')).body.items.every((item) =>
      /class-a/i.test(item.subject + item.reason),
    ),
    true,
    'Text search matches subject or reason',
  );
  ok(
    (await list('?q=roster')).body.items.some((item) => item.source === 'account'),
    'Text search matches the reason',
  );
  check((await list('?q=%25')).body.items, [], 'A percent sign in search is literal');
  check((await list('?q=zzz-no-such-text')).body.items, [], 'No match is an empty list');
  check(
    (await list('?source=attendance&actorId=teacher-a&q=class-a')).body.items.length,
    1,
    'Filters combine',
  );
  for (const bad of [
    '?limit=0',
    '?limit=51',
    '?limit=x',
    '?source=everything',
    '?from=2026-13-40',
    '?from=2026-10-05&to=2026-10-01',
    '?from=yesterday',
    '?cursor=bad',
    '?extra=1',
    '?source=account&source=notice',
    '?q=' + 'x'.repeat(61),
    '?q=%00',
  ])
    check((await list(bad)).response.status, 400, 'Malformed filter rejected: ' + bad);

  // ---- paging ----
  for (const size of [1, 4, 7]) {
    const seen = [];
    let cursor = null,
      pages = 0;
    do {
      const { body } = await list(`?limit=${size}` + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
      ok(body.items.length <= size, 'Page size respected');
      seen.push(...body.items.map((item) => item.id));
      cursor = body.nextCursor;
      pages++;
    } while (cursor && pages < 60);
    check(
      seen,
      all.items.map((item) => item.id),
      `Paging by ${size} visits every entry once in the same order`,
    );
  }

  // ---- entry detail ----
  const open = async (user, source, id) =>
    audit.detail.GET(
      request(user, 'GET', undefined, `/api/admin/audit/${source}/${encodeURIComponent(id)}`),
      { params: Promise.resolve({ source, sourceId: id }) },
    );
  response = await open('admin-a', 'attendance', attendanceEntry.sourceId);
  check(response.status, 200, 'Attendance entry opens');
  let detail = await response.json();
  check(
    detail.changes,
    [{ label: 'student-a Synthetic', before: 'No earlier record', after: 'absent (Private synthetic note)' }],
    'Per-pupil before and after',
  );
  const assessmentEntry = all.items.find((item) => item.source === 'assessment');
  detail = await (await open('admin-a', 'assessment', assessmentEntry.sourceId)).json();
  check(
    detail.changes,
    [{ label: 'student-a Synthetic', before: 'No earlier result', after: 'Score 17, grade A' }],
    'Assessment result before and after',
  );
  await denied(
    await open('admin-b', 'attendance', attendanceEntry.sourceId),
    404,
    'Another school cannot open the entry',
  );
  await denied(await open('admin-a', 'attendance', 'missing'), 404, 'Unknown entry is not found');
  await denied(await open('admin-a', 'bogus', 'x'), 400, 'Unknown area is rejected');

  // ---- correction notes append; originals never change ----
  const evidenceTables = [
    'identity_admin_events',
    'profile_link_events',
    'registry_creation_receipts',
    'attendance_reviews',
    'attendance_review_entries',
    'assessment_reviews',
    'assessment_review_entries',
    'reading_corrections',
    'report_publication_receipts',
    'assignment_submission_windows',
    'submission_feedback',
    'reading_import_receipts',
    'notices',
    'notice_recipients',
  ];
  const dump = () =>
    JSON.stringify(
      evidenceTables.map((table) => sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all()),
    );
  const before = dump(),
    note = {
      clientRequestId: uuid(),
      source: 'attendance',
      sourceId: attendanceEntry.sourceId,
      note: 'Entered under the wrong date; the 6 October register is correct.',
      reviewConfirmed: true,
    };
  const addNote = (user, payload) =>
    audit.notes.POST(request(user, 'POST', payload, '/api/admin/audit/annotations'));
  for (const altered of [
    { note: '' },
    { note: 'too short' },
    { note: '<b>bold</b> correction note' },
    { note: 'x'.repeat(501) },
    { note: 'bell\u0007 character here' },
    { reviewConfirmed: false },
    { reviewConfirmed: undefined },
    { source: 'bogus' },
    { sourceId: '' },
    { clientRequestId: 'x' },
    { notedBy: 'admin-b' },
    { schoolId: 'b' },
    { createdAt: '2020-01-01T00:00:00.000Z' },
  ]) {
    const payload = { ...note, ...altered };
    for (const key of Object.keys(payload)) if (payload[key] === undefined) delete payload[key];
    await denied(
      await addNote('admin-a', payload),
      400,
      'Strict note input rejects ' + JSON.stringify(altered).slice(0, 50),
    );
  }
  await denied(
    await addNote('admin-a', { ...note, sourceId: 'missing' }),
    404,
    'A note needs an existing entry',
  );
  await denied(await addNote('admin-b', note), 404, 'Another school cannot annotate this entry');
  check(count('audit_annotations'), 0, 'Rejected notes stored nothing');
  response = await addNote('admin-a', note);
  check(response.status, 201, 'Administrator adds a reasoned correction note');
  let result = await response.json();
  check(
    [result.replayed, result.note.notedBy, result.entry.noteCount, result.entry.notes.length],
    [false, 'admin-a', 1, 1],
    'The note is attributed and attached to the entry',
  );
  check(dump(), before, 'Every original evidence row is byte-for-byte unchanged by the correction');
  response = await addNote('admin-a', note);
  check(
    [response.status, (await response.json()).replayed],
    [200, true],
    'Exact retry returns the original note',
  );
  check(count('audit_annotations'), 1, 'Retry stored no duplicate');
  await denied(
    await addNote('admin-a', { ...note, note: 'A different note under the same request id.' }),
    409,
    'Changed text under one request id conflicts',
  );
  const otherAdmin = await db
    .insert(schema.users)
    .values({
      id: 'admin-a2',
      name: 'admin-a2',
      email: 'admin-a2@example.invalid',
      role: 'admin',
      schoolId: 'a',
      identityIssuer: 'https://identity.example.invalid',
      identitySubject: 'sub-admin-a2',
      createdAt: '2026-10-05T00:00:00.000Z',
      updatedAt: '2026-10-05T00:00:00.000Z',
    })
    .then(() => true);
  sessions['admin-a2'] = (await createSession('admin-a2')).split(';')[0];
  ok(otherAdmin, 'Second administrator exists');
  await denied(await addNote('admin-a2', note), 409, 'Another administrator cannot take over a request id');
  response = await addNote('admin-a2', {
    ...note,
    clientRequestId: uuid(),
    note: 'Second administrator agrees: wrong date on the register.',
  });
  check(response.status, 201, 'A second note is appended, not merged');
  ({ body: all } = await list('?limit=50'));
  check(
    all.items.find((item) => item.id === attendanceEntry.id).noteCount,
    2,
    'The entry shows how many correction notes exist',
  );
  check(
    all.items.filter((item) => item.source === 'audit-note').length,
    2,
    'Correction notes are themselves part of the trail',
  );
  detail = await (await open('admin-a', 'attendance', attendanceEntry.sourceId)).json();
  check(
    detail.notes.map((item) => item.notedBy),
    ['admin-a', 'admin-a2'],
    'Notes list who corrected and when, oldest first',
  );
  check(detail.reason, attendanceEntry.reason, 'The original reason is shown unchanged beside the notes');

  // ---- privacy follows the learner's current school ----
  sqlite.exec("UPDATE students SET school_id='b' WHERE id='student-a'");
  ({ body: all } = await list('?limit=50'));
  ok(
    !all.items.some(
      (item) => item.source === 'attendance' || item.source === 'assessment' || item.source === 'feedback',
    ),
    'Batches about a pupil who left the school are hidden',
  );
  sqlite.exec("UPDATE students SET school_id='a' WHERE id='student-a'");
  ({ body: all } = await list('?limit=50'));
  ok(
    all.items.some((item) => item.source === 'attendance'),
    'They return when the pupil is back',
  );
  sqlite.exec("UPDATE users SET disabled_at='2026-10-05T00:00:00.000Z' WHERE id='admin-a'");
  await denied(
    await audit.list.GET(request('admin-a')),
    401,
    'A disabled administrator loses access at once',
  );
  sqlite.exec("UPDATE users SET disabled_at=NULL WHERE id='admin-a'");

  // ---- immutability: the database refuses to change or delete evidence ----
  const immutable = [...evidenceTables, 'audit_annotations', 'submission_attempts'];
  for (const table of immutable)
    for (const statement of [`UPDATE ${table} SET rowid=rowid`, `DELETE FROM ${table}`]) {
      assert.throws(() => sqlite.exec(statement), /immutable/i, `${table}: ${statement}`);
      checks++;
    }
  check(dump(), before, 'Mutation attempts changed nothing');

  // ---- TC-085: approval evidence stays reproducible after a later version and a retried earlier approval ----
  const firstApproval = (await list('?source=resource-approval&limit=50')).body.items.find(
    (item) => item.subject === 'Audit synthetic task (version 1)',
  );
  ok(firstApproval, 'The first approval is in the trail');
  const revised = await resources.reviseResource(principals['teacher-a'], resource.id, {
    expectedVersion: 1,
    content: { ...content, body: 'Compare one half and one third.' },
  });
  await resources.approveResource(principals['teacher-a'], resource.id, revised.latest.id);
  await resources.approveResource(principals['teacher-a'], resource.id, resource.latest.id);
  const afterEdit = (await list('?source=resource-approval&limit=50')).body.items;
  check(
    afterEdit.find((item) => item.id === firstApproval.id),
    firstApproval,
    'The first approval entry (who, when, subject) is unchanged by a later version and a retried approval',
  );
  ok(
    afterEdit.some(
      (item) => item.subject === 'Audit synthetic task (version 2)' && item.id !== firstApproval.id,
    ),
    'The later version is its own entry',
  );

  // ---- ties: identical timestamps across areas must still page without skipping or repeating ----
  const tie = '2026-10-05T12:00:00.000Z';
  for (const trigger of sqlite
    .prepare("SELECT name FROM sqlite_schema WHERE type='trigger' AND name LIKE '%no_update'")
    .all())
    sqlite.exec(`DROP TRIGGER ${trigger.name}`);
  for (const [table, column] of [
    ['identity_admin_events', 'reviewed_at'],
    ['profile_link_events', 'reviewed_at'],
    ['registry_creation_receipts', 'created_at'],
    ['attendance_reviews', 'created_at'],
    ['assessment_reviews', 'created_at'],
    ['reading_corrections', 'corrected_at'],
    ['report_publication_receipts', 'published_at'],
    ['assignment_submission_windows', 'reviewed_at'],
    ['submission_feedback', 'reviewed_at'],
    ['reading_import_receipts', 'reviewed_at'],
    ['notices', 'created_at'],
    ['audit_annotations', 'created_at'],
    ['resource_versions', 'approved_at WHERE approved_at IS NOT NULL'],
    ['curriculum_reference_versions', 'approved_at WHERE approved_at IS NOT NULL'],
  ]) {
    sqlite.exec(
      `UPDATE ${table} SET ${column.includes(' WHERE ') ? column.replace(' WHERE ', `='${tie}' WHERE `) : column + `='${tie}'`}`,
    );
  }
  ({ body: all } = await list('?limit=50'));
  ok(
    all.items.length >= 15 && all.items.every((item) => item.occurredAt === tie),
    'Every entry now shares one timestamp',
  );
  const order = all.items.map((item) => [item.source, item.sourceId]);
  check(
    order,
    [...order].sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0)),
    'Ties break by area then id, both descending',
  );
  for (const size of [1, 2, 5]) {
    const seen = [];
    let cursor = null,
      pages = 0;
    do {
      const { body } = await list(`?limit=${size}` + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
      seen.push(...body.items.map((item) => item.id));
      cursor = body.nextCursor;
      pages++;
    } while (cursor && pages < 80);
    check(
      seen,
      all.items.map((item) => item.id),
      `Tied entries page by ${size} without a gap or repeat`,
    );
  }

  // ---- limits and locality ----
  const compiled = compileWithD1Limits(executed);
  check(
    compiled.failures,
    [],
    'Every statement run by this suite fits the D1 variable and expression-depth limits',
  );
  ok(compiled.checked > 60, 'The limit check covered the real audit queries');
  check(networkCalls, 0, 'No outbound request was made');
  console.log(
    `Audit trail contract: ${checks} checks passed (real flows produce the evidence; admin-only, school-scoped, immutable; synthetic only).`,
  );
  console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0 }));
} finally {
  globalThis.fetch = originalFetch;
  sqlite.close();
}
