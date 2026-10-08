import assert from 'node:assert/strict';
import { bindings, freshDatabase, seedSecurityData, load } from '../support/security-db.mjs';

const { db, schema, sqlite } = freshDatabase();
await seedSecurityData(db, schema);
const { createSession } = await load('lib/education/session.ts');
const identity = await load('app/api/admin/users/route.ts');
const identityStatus = await load('app/api/admin/users/[id]/route.ts');
const curriculum = await load('lib/education/curriculum.ts');
const curriculumDetail = await load('app/api/curriculum/[id]/route.ts');
const curriculumVersions = await load('app/api/curriculum/[id]/versions/route.ts');
const curriculumCollection = await load('app/api/curriculum/route.ts');
const curriculumSnapshot = await load('app/api/curriculum/[id]/snapshot/route.ts');
const curriculumDraft = await load('app/api/curriculum/[id]/draft/route.ts');
const resources = await load('lib/education/resources.ts');
const submissions = await load('app/api/assignments/[id]/submissions/route.ts');
const feedback = await load('app/api/assignments/[id]/submissions/[submissionId]/feedback/route.ts');
const tables = {
  ...schema,
  ...(await load('db/identity-admin-schema.ts')),
  ...(await load('db/curriculum-schema.ts')),
  ...(await load('db/submission-schema.ts')),
};
const origin = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = origin;
const sessions = {};
for (const id of ['admin-a', 'teacher-a', 'teacher-other', 'student-user-a'])
  sessions[id] = (await createSession(id)).split(';')[0];
const teacher = { id: 'teacher-a', role: 'teacher', schoolId: 'a' };
let checks = 0;
function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  checks++;
}
function request(user, method = 'GET', payload, path = '/api/admin/users') {
  const headers = { cookie: sessions[user], origin };
  const init = { method, headers };
  if (payload !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(payload);
  }
  return new Request(origin + path, init);
}
const originalDb = globalThis.__sahaTestDb;
function beforeEvidenceRead(match, mutate) {
  let injected = false;
  globalThis.__sahaTestDb = new Proxy(originalDb, {
    get(target, property) {
      if (property === 'select')
        return (...args) => {
          const query = target.select(...args);
          return new Proxy(query, {
            get(builder, member) {
              if (member === 'from')
                return (table) => {
                  if (!injected && match(table, args[0])) {
                    injected = true;
                    globalThis.__sahaTestDb = originalDb;
                    mutate();
                  }
                  return builder.from(table);
                };
              const value = Reflect.get(builder, member, builder);
              return typeof value === 'function' ? value.bind(builder) : value;
            },
          });
        };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return () => {
    globalThis.__sahaTestDb = originalDb;
    check(injected, true, 'Authority change was injected immediately before the evidence SELECT');
  };
}
function revoke(user) {
  sqlite.prepare("UPDATE users SET disabled_at='revoked-before-evidence-read' WHERE id=?").run(user);
}
function restore(user) {
  sqlite.prepare('UPDATE users SET disabled_at=NULL WHERE id=?').run(user);
}
async function denied(response, message) {
  check([401, 403, 404, 409].includes(response.status), true, message);
  const value = await response.json();
  check(Object.keys(value), ['error'], 'Denied evidence response contains only a safe error');
}
const identityInput = {
  clientRequestId: crypto.randomUUID(),
  reviewConfirmed: true,
  reason: 'Synthetic reviewed school account provision.',
  name: 'Synthetic colleague',
  email: 'evidence-target@example.invalid',
  role: 'teacher',
  identityIssuer: 'https://identity.example.invalid',
  identitySubject: 'private-synthetic-provider-subject',
};
let response = await identity.POST(request('admin-a', 'POST', identityInput));
check(response.status, 201, 'Synthetic identity provision created for replay checks');
const provisioned = await response.json();
const referenceContent = {
  title: 'Private synthetic reference',
  curriculum: 'Synthetic only',
  gradeLevel: '8',
  subject: 'Mathematics',
  language: 'en-IN',
  objectives: 'Compare synthetic fractions.',
  body: 'Private unreviewed reference text.',
  rightsStatement: 'Original synthetic test material.',
  sourceReference: '',
  sourceUrl: null,
};
const referenceInput = { content: referenceContent, clientReferenceId: crypto.randomUUID() };
const reference = await curriculum.createCurriculumReference(teacher, referenceInput);
const approved = await curriculum.approveCurriculumReference(teacher, reference.id, {
  versionId: reference.latest.id,
  confirmReview: true,
});
const privateReference = await curriculum.createCurriculumReference(teacher, {
  content: { ...referenceContent, title: 'Still-private synthetic source' },
});
const teachingContent = {
  title: 'Synthetic assigned task',
  type: 'worksheet',
  curriculum: 'Synthetic only',
  gradeLevel: '8',
  subject: 'Mathematics',
  language: 'en-IN',
  objectives: 'Explain one comparison.',
  body: 'Explain a synthetic comparison.',
  teacherNotes: 'Private staff notes.',
  answerKey: 'Private staff answer.',
};
const resource = await resources.createResource(teacher, { content: teachingContent });
await resources.approveResource(teacher, resource.id, resource.latest.id);
const assignment = await resources.assignResource(teacher, resource.id, {
  versionId: resource.latest.id,
  classId: 'class-a',
});
const submitInput = {
  clientSubmissionId: crypto.randomUUID(),
  expectedAttempt: 0,
  response: 'Synthetic learner response.',
};
response = await submissions.POST(request('student-user-a', 'POST', submitInput), {
  params: Promise.resolve({ id: assignment.id }),
});
check(response.status, 201, 'Synthetic learner attempt created for scoped feedback checks');
const attempt = await response.json();
const feedbackInput = {
  clientFeedbackId: crypto.randomUUID(),
  expectedRevision: 0,
  reviewed: true,
  feedback: 'Private reviewed formative guidance.',
};
response = await feedback.POST(request('teacher-a', 'POST', feedbackInput), {
  params: Promise.resolve({ id: assignment.id, submissionId: attempt.id }),
});
check(response.status, 201, 'Synthetic reviewed feedback created for replay checks');
const review = await response.json();
const originalFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = async () => {
  networkCalls++;
  throw new Error('Evidence scope checks must remain local');
};
try {
  let finish = beforeEvidenceRead(
    (table) => table === tables.identityAdminEvents,
    () => revoke('admin-a'),
  );
  response = await identity.POST(request('admin-a', 'POST', identityInput));
  finish();
  await denied(
    response,
    'Revoked administrator cannot receive an identity replay after the initial live check',
  );
  restore('admin-a');
  finish = beforeEvidenceRead(
    (table, fields) => table === tables.users && fields?.user === tables.users,
    () => revoke('admin-a'),
  );
  response = await identity.POST(request('admin-a', 'POST', identityInput));
  finish();
  await denied(response, 'Target-user evidence query rechecks current administrator authority');
  restore('admin-a');
  const statusInput = {
    clientRequestId: crypto.randomUUID(),
    reviewConfirmed: true,
    reason: 'Synthetic reviewed account access change.',
    expectedVersion: provisioned.user.version,
    enabled: false,
  };
  response = await identityStatus.PATCH(request('admin-a', 'PATCH', statusInput), {
    params: Promise.resolve({ id: provisioned.user.id }),
  });
  check(response.status, 200, 'Synthetic account status review saved for replay');
  finish = beforeEvidenceRead(
    (table) => table === tables.identityAdminEvents,
    () => revoke('admin-a'),
  );
  response = await identityStatus.PATCH(request('admin-a', 'PATCH', statusInput), {
    params: Promise.resolve({ id: provisioned.user.id }),
  });
  finish();
  await denied(response, 'Revoked administrator cannot receive status-change replay evidence');
  restore('admin-a');

  for (const route of [curriculumDetail, curriculumVersions]) {
    finish = beforeEvidenceRead(
      (table) => table === tables.curriculumReferenceVersions,
      () => sqlite.prepare("UPDATE users SET role='teacher' WHERE id='admin-a'").run(),
    );
    response = await route.GET(request('admin-a'), { params: Promise.resolve({ id: privateReference.id }) });
    finish();
    await denied(response, 'Administrator demotion before version SELECT denies private source content');
    sqlite.prepare("UPDATE users SET role='admin' WHERE id='admin-a'").run();
  }
  finish = beforeEvidenceRead(
    (table) => table === tables.curriculumReferenceVersions,
    () => revoke('admin-a'),
  );
  response = await curriculumCollection.GET(request('admin-a'));
  finish();
  check(response.status, 200, 'List may return a safe empty collection after revocation');
  check(await response.json(), [], 'Revoked account receives no downstream private version bodies');
  restore('admin-a');
  finish = beforeEvidenceRead(
    (table) => table === tables.curriculumReferenceVersions,
    () =>
      sqlite
        .prepare("UPDATE curriculum_references SET author_id='teacher-other' WHERE id=?")
        .run(privateReference.id),
  );
  response = await curriculumDetail.GET(request('teacher-a'), {
    params: Promise.resolve({ id: privateReference.id }),
  });
  finish();
  await denied(response, 'Author change before actual SELECT cannot expose a now-peer private draft');
  sqlite
    .prepare("UPDATE curriculum_references SET author_id='teacher-a' WHERE id=?")
    .run(privateReference.id);
  finish = beforeEvidenceRead(
    (table) => table === tables.curriculumReferenceVersions,
    () => revoke('teacher-a'),
  );
  response = await curriculumSnapshot.GET(
    request(
      'teacher-a',
      'GET',
      undefined,
      '/api/curriculum/' + reference.id + '/snapshot?versionId=' + approved.id,
    ),
    { params: Promise.resolve({ id: reference.id }) },
  );
  finish();
  await denied(response, 'Exact approved snapshot rechecks staff authority at content SELECT');
  restore('teacher-a');
  finish = beforeEvidenceRead(
    (table) => table === tables.curriculumReferenceVersions,
    () => revoke('teacher-a'),
  );
  response = await curriculumCollection.POST(request('teacher-a', 'POST', referenceInput));
  finish();
  await denied(response, 'Creation replay cannot return source content after staff revocation');
  restore('teacher-a');
  const copyInput = { versionId: approved.id, type: 'lesson', clientResourceId: crypto.randomUUID() };
  response = await curriculumDraft.POST(request('teacher-a', 'POST', copyInput), {
    params: Promise.resolve({ id: reference.id }),
  });
  check(response.status, 201, 'Synthetic exact-source draft copy saved for replay');
  const copy = await response.json();
  finish = beforeEvidenceRead(
    (table) => table === tables.resourceVersions,
    () => revoke('teacher-a'),
  );
  response = await curriculumDraft.POST(request('teacher-a', 'POST', copyInput), {
    params: Promise.resolve({ id: reference.id }),
  });
  finish();
  await denied(response, 'Copy replay rechecks authority before returning teaching version content');
  restore('teacher-a');
  finish = beforeEvidenceRead(
    (table) => table === tables.resourceReferenceBindings,
    () => revoke('teacher-a'),
  );
  response = await curriculumDraft.POST(request('teacher-a', 'POST', copyInput), {
    params: Promise.resolve({ id: reference.id }),
  });
  finish();
  await denied(response, 'Copy attribution query cannot complete a replay after staff revocation');
  restore('teacher-a');
  check(
    sqlite.prepare('SELECT id FROM resource_versions WHERE id=?').get(copy.resource.latest.id).id,
    copy.resource.latest.id,
    'Denied replay leaves copied source evidence intact',
  );

  const isFeedbackEvidence = (table, fields) =>
    table === tables.submissionFeedback ||
    (table === tables.submissionAttempts && fields?.feedback === tables.submissionFeedback);
  finish = beforeEvidenceRead(isFeedbackEvidence, () =>
    sqlite.prepare("UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'").run(),
  );
  response = await feedback.GET(request('teacher-a'), {
    params: Promise.resolve({ id: assignment.id, submissionId: attempt.id }),
  });
  finish();
  await denied(response, 'Teacher reassignment before feedback SELECT denies newly fetched guidance');
  sqlite.prepare("UPDATE classes SET teacher_id='teacher-a' WHERE id='class-a'").run();
  finish = beforeEvidenceRead(isFeedbackEvidence, () => revoke('teacher-a'));
  response = await feedback.POST(request('teacher-a', 'POST', feedbackInput), {
    params: Promise.resolve({ id: assignment.id, submissionId: attempt.id }),
  });
  finish();
  await denied(response, 'Reviewed-feedback replay rechecks enabled account at its actual SELECT');
  restore('teacher-a');
  finish = beforeEvidenceRead(isFeedbackEvidence, () =>
    sqlite.prepare("UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'").run(),
  );
  response = await submissions.GET(request('teacher-a'), { params: Promise.resolve({ id: assignment.id }) });
  finish();
  await denied(response, 'Submission-list feedback assembly cannot bypass changed class authority');
  sqlite.prepare("UPDATE classes SET teacher_id='teacher-a' WHERE id='class-a'").run();
  finish = beforeEvidenceRead(isFeedbackEvidence, () => revoke('student-user-a'));
  response = await feedback.GET(request('student-user-a'), {
    params: Promise.resolve({ id: assignment.id, submissionId: attempt.id }),
  });
  finish();
  await denied(response, 'Student account revocation before feedback SELECT is enforced');
  restore('student-user-a');
  finish = beforeEvidenceRead(isFeedbackEvidence, () =>
    sqlite
      .prepare("UPDATE enrolments SET status='withdrawn' WHERE student_id='student-a' AND class_id='class-a'")
      .run(),
  );
  response = await submissions.POST(request('student-user-a', 'POST', submitInput), {
    params: Promise.resolve({ id: assignment.id }),
  });
  finish();
  await denied(response, 'Submission replay with freshly fetched feedback cannot bypass learner withdrawal');
  sqlite
    .prepare("UPDATE enrolments SET status='active' WHERE student_id='student-a' AND class_id='class-a'")
    .run();
  check(
    sqlite.prepare('SELECT response FROM submission_attempts WHERE id=?').get(attempt.id).response,
    submitInput.response,
    'Authorization races preserve original learner evidence',
  );
  check(
    sqlite.prepare('SELECT feedback FROM submission_feedback WHERE id=?').get(review.id).feedback,
    feedbackInput.feedback,
    'Authorization races preserve reviewed feedback evidence',
  );
  check(
    sqlite.prepare('SELECT count(*) n FROM submission_feedback').get().n,
    1,
    'Denied evidence retries append no duplicate feedback',
  );
  check(networkCalls, 0, 'Evidence authorization never contacts providers or recipients');
  console.log(
    `Evidence access contract: ${checks} checks passed (real sessions/routes and SQLite; authority changes immediately before downstream evidence SELECTs; synthetic only).`,
  );
  console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0 }));
} finally {
  globalThis.__sahaTestDb = originalDb;
  globalThis.fetch = originalFetch;
  sqlite.close();
}
