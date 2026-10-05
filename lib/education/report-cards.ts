import type { Principal } from './types';
import { getDb } from '@/db/index';
import type { SelectReportCard, InsertReportCard } from '@/db/schema';
import { reportCards, guardians, studentGuardians, users, students, notifications } from '@/db/schema';
import { reportCardSchema } from './validation';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { AccessError, assertAdmin, assertStudentAccess, studentReferenceScope } from './access';

function scope(principal: Principal) {
  return and(studentReferenceScope(principal, reportCards.studentId),
    principal.role === 'guardian' || principal.role === 'student' ? isNotNull(reportCards.publishedAt) : undefined);
}
export async function listReportCards(principal: Principal, studentId?: string): Promise<SelectReportCard[]> {
  return await getDb().select().from(reportCards).where(and(scope(principal), studentId ? eq(reportCards.studentId, studentId) : undefined));
}
export async function getReportCard(principal: Principal, id: string): Promise<SelectReportCard | null> {
  const [record] = await getDb().select().from(reportCards).where(and(eq(reportCards.id, id), scope(principal))).limit(1);
  return record ?? null;
}
export async function createReportCard(principal: Principal, input: Omit<InsertReportCard, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectReportCard> {
  assertAdmin(principal);
  const data = reportCardSchema.parse(input);
  await assertStudentAccess(principal, data.studentId);
  const now = new Date().toISOString();
  const [record] = await getDb().insert(reportCards).values({ ...data, publishedAt: null, id: crypto.randomUUID(), createdAt: now, updatedAt: now }).returning();
  return record;
}
export async function publishReportCard(principal: Principal, id: string): Promise<SelectReportCard | null> {
  assertAdmin(principal);
  const existing = await getReportCard(principal, id);
  if (!existing) throw new AccessError('Report card not found', 404);
  if (existing.publishedAt) return existing;
  const db = getDb();
  const now = new Date().toISOString();
  const [student] = await db.select({ firstName: students.firstName, lastName: students.lastName }).from(students)
    .where(and(eq(students.id, existing.studentId), eq(students.schoolId, principal.schoolId!))).limit(1);
  if (!student) throw new AccessError('Student not found', 404);
  const recipients = await db.selectDistinct({ userId: users.id }).from(studentGuardians)
    .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId)).innerJoin(users, eq(users.id, guardians.userId))
    .where(and(eq(studentGuardians.studentId, existing.studentId), eq(guardians.schoolId, principal.schoolId!),
      eq(users.schoolId, principal.schoolId!), eq(users.role, 'guardian'), isNull(users.disabledAt)));
  const publication = db.update(reportCards).set({ publishedAt: now, updatedAt: now })
    .where(and(eq(reportCards.id, id), scope(principal), isNull(reportCards.publishedAt))).returning();
  const notices = recipients.map(recipient => db.insert(notifications).values({
    id: `report-card-published:${id}:${recipient.userId}`, userId: recipient.userId, channel: 'in_app',
    title: 'Report Card Published', body: `Your child ${student.firstName} ${student.lastName}'s report card has been published.`,
    createdAt: now, updatedAt: now,
  }).onConflictDoNothing().returning());
  // Publication and notices commit together. Deterministic IDs make retries safe.
  await db.batch([publication, ...notices]);
  return await getReportCard(principal, id);
}
