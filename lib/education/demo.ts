import { and, eq, getTableColumns, lt, sql, type SQL } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { z } from 'zod';
import { getDb } from '@/db';
import { assessments, assessmentResults, attendance, authRateLimits, classes, courses,
  authSessions, demoInstallations, enrolments, guardians, notifications, reportCards, resourceAssignments,
  resourceVersions, schools, studentGuardians, students, teachingResources, users } from '@/db/schema';
import { AuthError, digest, randomToken, secureCookie, setting } from './identity';
import { SESSION_COOKIE, SESSION_SECONDS, revokeSession } from './session';
import { DEMO_ISSUER, DEMO_SCHOOL_ID, demoIdentityScope, demoRuntimeAllowed } from './demo-policy';

export const demoSignInSchema = z.object({
  role: z.enum(['admin', 'teacher', 'guardian', 'student']),
  syntheticAcknowledged: z.literal(true),
}).strict();

const accounts = [
  { id: 'saha-demo-admin', role: 'admin', name: 'Demo administrator' },
  { id: 'saha-demo-teacher', role: 'teacher', name: 'Demo teacher' },
  { id: 'saha-demo-guardian', role: 'guardian', name: 'Demo guardian' },
  { id: 'saha-demo-student', role: 'student', name: 'Demo student' },
] as const;

function guardedSeed(table: SQLiteTable, row: Record<string, string | number | null>, guard: SQL) {
  // These are bounded, source-defined rows, never an arbitrary SQL/record API.
  const values = Object.entries(getTableColumns(table)).map(([key, column]) => {
    if (row[key] === undefined && column.notNull) throw new Error('Incomplete synthetic fixture');
    return sql`${row[key] ?? null}`;
  });
  return getDb().insert(table).select(sql`select ${sql.join(values, sql`, `)} where ${guard}`);
}

/** A first-use claim and all sample records commit in one D1 batch. A database
 * with any existing school/account/session/identity transaction is never seeded.
 * Later sign-ins retain existing sample edits; there is no reset/backfill path. */
export async function initializeSyntheticDemo(): Promise<void> {
  if (!demoRuntimeAllowed()) throw new AuthError('Demo unavailable', 404);
  const db = getDb();
  const installationId = setting('SAHA_DEMO_INSTALLATION_ID');
  const [existing] = await db.select({ id: demoInstallations.id }).from(demoInstallations)
    .where(and(eq(demoInstallations.id, installationId), eq(demoInstallations.schoolId, DEMO_SCHOOL_ID))).limit(1);
  if (existing) return;
  const stamp = new Date().toISOString();
  const day = stamp.slice(0, 10);
  const nonce = crypto.randomUUID();
  const pristine = sql`not exists (select 1 from schools) and not exists (select 1 from users)
    and not exists (select 1 from auth_sessions) and not exists (select 1 from oidc_transactions)
    and not exists (select 1 from demo_installations)`;
  const ownClaim = sql`exists (select 1 from demo_installations seed_claim
    where seed_claim.id = ${installationId} and seed_claim.school_id = ${DEMO_SCHOOL_ID}
      and seed_claim.seed_nonce = ${nonce})`;
  const claim = guardedSeed(demoInstallations, { id: installationId, schoolId: DEMO_SCHOOL_ID, seedNonce: nonce, createdAt: stamp }, pristine);
  const rows: Array<[SQLiteTable, Record<string, string | number | null>]> = [
    [schools, { id: DEMO_SCHOOL_ID, name: 'River School — synthetic demo', address: 'Fictional campus', createdAt: stamp, updatedAt: stamp }],
    ...accounts.map(account => [users, { ...account, schoolId: DEMO_SCHOOL_ID, email: `${account.id}@example.invalid`,
      identityIssuer: DEMO_ISSUER, identitySubject: account.id, createdAt: stamp, updatedAt: stamp }] as [SQLiteTable, Record<string, string | number | null>]),
    ...['Maya', 'Arun', 'Noor'].map((firstName, index) => [students, { id: `saha-demo-learner-${index + 1}`, schoolId: DEMO_SCHOOL_ID,
      userId: index === 0 ? 'saha-demo-student' : null, firstName, lastName: 'Sample', dateOfBirth: '2014-01-01',
      admissionNumber: `SYNTHETIC-${index + 1}`, gradeLevel: '6', createdAt: stamp, updatedAt: stamp }] as [SQLiteTable, Record<string, string | number | null>]),
    [guardians, { id: 'saha-demo-family', schoolId: DEMO_SCHOOL_ID, userId: 'saha-demo-guardian', name: 'Sam Sample',
      email: 'demo-family@example.invalid', relationship: 'parent', createdAt: stamp, updatedAt: stamp }],
    [studentGuardians, { studentId: 'saha-demo-learner-1', guardianId: 'saha-demo-family', isPrimary: 1 }],
    [studentGuardians, { studentId: 'saha-demo-learner-2', guardianId: 'saha-demo-family', isPrimary: 1 }],
    [courses, { id: 'saha-demo-course', schoolId: DEMO_SCHOOL_ID, code: 'DEMO-READING', title: 'Reading and expression',
      description: 'Fictional literacy course for exploring the demo.', gradeLevel: '6', createdAt: stamp, updatedAt: stamp }],
    [classes, { id: 'saha-demo-class', schoolId: DEMO_SCHOOL_ID, courseId: 'saha-demo-course', teacherId: 'saha-demo-teacher',
      name: 'Reading circle', term: 'Demo term', schedule: 'Fictional schedule', createdAt: stamp, updatedAt: stamp }],
    ...[1, 2, 3].map(index => [enrolments, { id: `saha-demo-enrolment-${index}`, studentId: `saha-demo-learner-${index}`,
      classId: 'saha-demo-class', status: 'active', enrolledAt: stamp, createdAt: stamp, updatedAt: stamp }] as [SQLiteTable, Record<string, string | number | null>]),
    ...[1, 2].map(index => [attendance, { id: `saha-demo-attendance-${index}`, classId: 'saha-demo-class',
      studentId: `saha-demo-learner-${index}`, date: day, status: index === 1 ? 'present' : 'late',
      recordedBy: 'saha-demo-teacher', note: 'Synthetic observation', createdAt: stamp, updatedAt: stamp }] as [SQLiteTable, Record<string, string | number | null>]),
    [assessments, { id: 'saha-demo-assessment', classId: 'saha-demo-class', title: 'Understanding a short passage', kind: 'quiz',
      maxScore: 10, date: day, createdAt: stamp, updatedAt: stamp }],
    [assessmentResults, { id: 'saha-demo-result', assessmentId: 'saha-demo-assessment', studentId: 'saha-demo-learner-1',
      score: 8, feedback: 'Synthetic feedback: explain your answer with a detail from the passage.', createdAt: stamp, updatedAt: stamp }],
    [reportCards, { id: 'saha-demo-report-published', studentId: 'saha-demo-learner-1', term: 'Demo term',
      summary: 'Synthetic report for exploring family access.', overallGrade: 'Sample', publishedAt: stamp, createdAt: stamp, updatedAt: stamp }],
    [reportCards, { id: 'saha-demo-report-draft', studentId: 'saha-demo-learner-2', term: 'Demo term',
      summary: 'Synthetic staff-only draft.', overallGrade: 'Sample', createdAt: stamp, updatedAt: stamp }],
    [notifications, { id: 'saha-demo-notice', userId: 'saha-demo-guardian', channel: 'in_app', title: 'Welcome to the synthetic demo',
      body: 'These fictional records demonstrate scoped family access. No message was sent externally.', createdAt: stamp, updatedAt: stamp }],
    [teachingResources, { id: 'saha-demo-resource', schoolId: DEMO_SCHOOL_ID, authorId: 'saha-demo-teacher', createdAt: stamp }],
    [resourceVersions, { id: 'saha-demo-resource-version', resourceId: 'saha-demo-resource', version: 1, title: 'A seed becomes a tree',
      type: 'worksheet', curriculum: 'Demonstration only', gradeLevel: '6', subject: 'Reading', language: 'English',
      objectives: 'Identify a sequence and support an answer with a passage detail.',
      body: 'Maya planted a seed in a small pot. Each morning she checked the soil and added a little water when it was dry. After a week, a green shoot appeared. She moved the pot near the window.\n\n1. What happened first?\n2. Why did Maya move the pot? Use a detail from the passage.\n3. Write one question you would ask Maya.',
      teacherNotes: 'Synthetic manual example; review for your own class before reuse.', answerKey: '1. Maya planted a seed.\n2. The shoot needs light; accept a supported explanation.\n3. Accept a relevant question.',
      createdBy: 'saha-demo-teacher', approvedBy: 'saha-demo-teacher', approvedAt: stamp, createdAt: stamp }],
    [resourceAssignments, { id: 'saha-demo-assignment', resourceId: 'saha-demo-resource', versionId: 'saha-demo-resource-version',
      classId: 'saha-demo-class', assignedBy: 'saha-demo-teacher', createdAt: stamp }],
  ];
  try { await db.batch([claim, ...rows.map(([table, row]) => guardedSeed(table, row, ownClaim))]); }
  catch {
    // A competing first-use batch can win. Read its committed marker; never
    // reset, repair or add missing fixture rows after an uncertain result.
    const [won] = await db.select({ id: demoInstallations.id }).from(demoInstallations)
      .where(and(eq(demoInstallations.id, installationId), eq(demoInstallations.schoolId, DEMO_SCHOOL_ID))).limit(1);
    if (!won) throw new AuthError('Demo initialization unavailable', 503);
  }
  const [installed] = await db.select({ id: demoInstallations.id }).from(demoInstallations)
    .where(and(eq(demoInstallations.id, installationId), eq(demoInstallations.schoolId, DEMO_SCHOOL_ID))).limit(1);
  if (!installed) throw new AuthError('Demo requires an isolated empty database', 503);
}

async function limitDemoSignIn(request: Request) {
  const db = getDb();
  const now = Date.now();
  const window = 600000;
  const bucket = `demo-login:${Math.floor(now / window)}:${await digest(request.headers.get('cf-connecting-ip') || 'unknown')}`;
  await db.delete(authRateLimits).where(lt(authRateLimits.expiresAt, now));
  const [row] = await db.insert(authRateLimits).values({ bucket, count: 1, expiresAt: now + window })
    .onConflictDoUpdate({ target: authRateLimits.bucket, set: { count: sql`${authRateLimits.count} + 1` } })
    .returning({ count: authRateLimits.count });
  if (!row || row.count > 40) throw new AuthError('Too many demo sign-ins; try again later', 429);
}

export async function signInToSyntheticDemo(request: Request, input: z.infer<typeof demoSignInSchema>): Promise<Response> {
  const data = demoSignInSchema.parse(input);
  if (!demoRuntimeAllowed()) throw new AuthError('Demo unavailable', 404);
  await initializeSyntheticDemo();
  const account = accounts.find(candidate => candidate.role === data.role)!;
  const [current] = await getDb().select({ id: users.id }).from(users)
    .where(and(eq(users.id, account.id), eq(users.role, account.role), eq(users.schoolId, DEMO_SCHOOL_ID),
      eq(users.identityIssuer, DEMO_ISSUER), eq(users.identitySubject, account.id), sql`${users.disabledAt} is null`,
      demoIdentityScope(DEMO_ISSUER, DEMO_SCHOOL_ID))).limit(1);
  if (!current) throw new AuthError('This demo account is unavailable', 403);
  await limitDemoSignIn(request);
  const token = randomToken(), tokenHash = await digest(token), now = Date.now();
  await getDb().delete(authSessions).where(lt(authSessions.expiresAt, now));
  // A fixed role choice must remain that account at the actual session INSERT,
  // even if operator changes occur after the earlier account lookup.
  const saved = await getDb().insert(authSessions).select(sql`select ${tokenHash}, ${current.id},
    ${now + SESSION_SECONDS * 1000}, ${now} from users
    where ${users.id} = ${account.id} and ${users.role} = ${account.role}
      and ${users.schoolId} = ${DEMO_SCHOOL_ID} and ${users.identityIssuer} = ${DEMO_ISSUER}
      and ${users.identitySubject} = ${account.id} and ${users.disabledAt} is null
      and ${demoIdentityScope(DEMO_ISSUER, DEMO_SCHOOL_ID)}`)
    .returning({ tokenHash: authSessions.tokenHash });
  if (saved.length !== 1) throw new AuthError('This demo account is unavailable', 403);
  const [confirmed] = await getDb().select({ id: users.id }).from(users)
    .innerJoin(authSessions, eq(authSessions.userId, users.id))
    .where(and(eq(authSessions.tokenHash, tokenHash), eq(users.id, account.id), eq(users.role, account.role),
      eq(users.schoolId, DEMO_SCHOOL_ID), eq(users.identityIssuer, DEMO_ISSUER), eq(users.identitySubject, account.id),
      sql`${users.disabledAt} is null`, demoIdentityScope(DEMO_ISSUER, DEMO_SCHOOL_ID))).limit(1);
  if (!confirmed) {
    await getDb().delete(authSessions).where(eq(authSessions.tokenHash, tokenHash));
    throw new AuthError('This demo account is unavailable', 403);
  }
  await revokeSession(request);
  return Response.json({ destination: '/', synthetic: true }, { headers: {
    'Set-Cookie': secureCookie(SESSION_COOKIE, token, SESSION_SECONDS), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
  } });
}
