import type { Principal } from './types';
import { getDb } from '@/db/index';
import type { SelectAssessment, InsertAssessment } from '@/db/schema';
import { assessments, assessmentResults, students } from '@/db/schema';
import { assessmentSchema, assessmentResultSchema } from './validation';
import { and, eq, sql } from 'drizzle-orm';
import { AccessError, classReferenceScope, studentScope, assertClassWrite, assertStudentInClass } from './access';

export async function listAssessments(principal: Principal, filter?: { classId?: string }): Promise<SelectAssessment[]> {
  return await getDb().select().from(assessments).where(and(classReferenceScope(principal, assessments.classId), filter?.classId ? eq(assessments.classId, filter.classId) : undefined));
}
export async function getAssessment(principal: Principal, id: string): Promise<SelectAssessment | null> {
  const [record] = await getDb().select().from(assessments).where(and(eq(assessments.id, id), classReferenceScope(principal, assessments.classId))).limit(1);
  return record ?? null;
}
export async function createAssessment(principal: Principal, input: Omit<InsertAssessment, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectAssessment> {
  const data = assessmentSchema.parse(input);
  await assertClassWrite(principal, data.classId);
  const now = new Date().toISOString();
  const [record] = await getDb().insert(assessments).values({ ...data, id: crypto.randomUUID(), createdAt: now, updatedAt: now }).returning();
  return record;
}
export async function updateAssessment(principal: Principal, id: string, input: Omit<InsertAssessment, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectAssessment | null> {
  const existing = await getAssessment(principal, id);
  if (!existing) throw new AccessError('Assessment not found', 404);
  await assertClassWrite(principal, existing.classId);
  const data = assessmentSchema.omit({ id: true, createdAt: true, updatedAt: true }).parse(input);
  if (data.classId !== existing.classId) throw new AccessError('An assessment cannot be moved to another class', 400);
  await assertClassWrite(principal, data.classId);
  const [record] = await getDb().update(assessments).set({ ...data, updatedAt: new Date().toISOString() }).where(and(eq(assessments.id, id), classReferenceScope(principal, assessments.classId))).returning();
  return record ?? null;
}
export async function recordResults(principal: Principal, assessmentId: string, results: { studentId: string; score: number; grade?: string; feedback?: string }[]): Promise<void> {
  const assessment = await getAssessment(principal, assessmentId);
  if (!assessment) throw new AccessError('Assessment not found', 404);
  await assertClassWrite(principal, assessment.classId);
  const seen = new Set<string>();
  const rows = [];
  for (const result of results) {
    const row = assessmentResultSchema.parse({ ...result, assessmentId });
    if (seen.has(row.studentId)) throw new AccessError('Duplicate student in result batch', 400);
    if (row.score > assessment.maxScore) throw new AccessError('Score exceeds the maximum assessment score', 400);
    seen.add(row.studentId);
    await assertStudentInClass(principal, row.studentId, assessment.classId);
    rows.push(row);
  }
  if (!rows.length) return;
  const db = getDb();
  const now = new Date().toISOString();
  const queries = [];
  for (const row of rows) {
    // A result belongs to the assessment/student pair, not just the assessment.
    const [existing] = await db.select({ id: assessmentResults.id }).from(assessmentResults)
      .where(and(eq(assessmentResults.assessmentId, assessmentId), eq(assessmentResults.studentId, row.studentId))).limit(1);
    if (existing) queries.push(db.update(assessmentResults).set({ score: row.score, grade: row.grade ?? null, feedback: row.feedback ?? null, updatedAt: now })
      .where(and(eq(assessmentResults.id, existing.id), eq(assessmentResults.assessmentId, assessmentId), eq(assessmentResults.studentId, row.studentId))).returning());
    else queries.push(db.insert(assessmentResults).values({ ...row, id: crypto.randomUUID(), createdAt: now, updatedAt: now }).returning());
  }
  await db.batch(queries as [typeof queries[number], ...typeof queries[number][]]);
}
export async function listResults(principal: Principal, assessmentId: string): Promise<{ studentId: string; studentName: string; score: number; grade: string | null; feedback: string | null }[]> {
  if (principal.role === 'guardian' || principal.role === 'student') throw new AccessError('Assessment results are not yet published for family access');
  if (!await getAssessment(principal, assessmentId)) throw new AccessError('Assessment not found', 404);
  return await getDb().select({ studentId: students.id, studentName: sql<string>`${students.firstName} || ' ' || ${students.lastName}`, score: assessmentResults.score, grade: assessmentResults.grade, feedback: assessmentResults.feedback })
    .from(assessmentResults).innerJoin(students, eq(assessmentResults.studentId, students.id))
    .where(and(eq(assessmentResults.assessmentId, assessmentId), studentScope(principal)));
}
