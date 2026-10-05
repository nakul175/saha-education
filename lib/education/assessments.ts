import type { Principal } from './types';
import { getDb } from '@/db/index';
import type { SelectAssessment, InsertAssessment } from '@/db/schema';
import { assessments, assessmentResults, students } from '@/db/schema';
import { assessmentSchema, assessmentResultSchema } from './validation';
import { and, eq, sql } from 'drizzle-orm';
import { AccessError, classReferenceScope, studentScope, assertClassWrite, assertStudentInClass } from './access';
import { AcademicConflict, academicClassWrite, academicStudentInClass, liveAcademicPrincipal, rethrowAcademicConflict } from './academic-integrity';

export async function listAssessments(principal: Principal, filter?: { classId?: string }): Promise<SelectAssessment[]> {
  return await getDb().select().from(assessments).where(and(liveAcademicPrincipal(principal), classReferenceScope(principal, assessments.classId), filter?.classId ? eq(assessments.classId, filter.classId) : undefined));
}
export async function getAssessment(principal: Principal, id: string): Promise<SelectAssessment | null> {
  const [record] = await getDb().select().from(assessments).where(and(eq(assessments.id, id), liveAcademicPrincipal(principal), classReferenceScope(principal, assessments.classId))).limit(1);
  return record ?? null;
}
export async function createAssessment(principal: Principal, input: Omit<InsertAssessment, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectAssessment> {
  const data = assessmentSchema.parse(input);
  await assertClassWrite(principal, data.classId);
  const now = new Date().toISOString();
  const [record] = await getDb().insert(assessments).select(sql`select ${crypto.randomUUID()}, ${data.classId}, ${data.title},
    ${data.kind}, ${data.maxScore}, ${data.date}, ${now}, ${now} where ${academicClassWrite(principal, data.classId)}`).returning();
  if (!record) throw new AcademicConflict();
  return record;
}
export async function updateAssessment(principal: Principal, id: string, input: Omit<InsertAssessment, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectAssessment | null> {
  const existing = await getAssessment(principal, id);
  if (!existing) throw new AccessError('Assessment not found', 404);
  await assertClassWrite(principal, existing.classId);
  const data = assessmentSchema.omit({ id: true, createdAt: true, updatedAt: true }).parse(input);
  if (data.classId !== existing.classId) throw new AccessError('An assessment cannot be moved to another class', 400);
  await assertClassWrite(principal, data.classId);
  const [record] = await getDb().update(assessments).set({ ...data, updatedAt: new Date().toISOString() }).where(and(eq(assessments.id, id),
    eq(assessments.classId, data.classId), academicClassWrite(principal, sql`${assessments.classId}`))).returning();
  if (!record) throw new AcademicConflict();
  return record;
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
  const payload = JSON.stringify(rows.map(row => ({ id: crypto.randomUUID(), studentId: row.studentId, score: row.score, grade: row.grade ?? null, feedback: row.feedback ?? null })));
  // Existing duplicate evidence is ambiguous: never pick an arbitrary row or
  // silently merge it. Both statements guard every member of the full batch.
  const eligible = sql`exists (select 1 from assessments current_assessment where current_assessment.id = ${assessmentId}
    and current_assessment.class_id = ${assessment.classId} and ${academicClassWrite(principal, sql`current_assessment.class_id`)}
    and not exists (select 1 from json_each(${payload}) pending where json_extract(pending.value, '$.score') > current_assessment.max_score
      or not (${academicStudentInClass(principal, sql`json_extract(pending.value, '$.studentId')`, sql`current_assessment.class_id`)})
      or (select count(*) from assessment_results duplicate where duplicate.assessment_id = ${assessmentId}
        and duplicate.student_id = json_extract(pending.value, '$.studentId')) > 1))`;
  let saved: (typeof assessmentResults.$inferSelect)[];
  try {
    const [, updated] = await db.batch([
      db.insert(assessmentResults).select(sql`select json_extract(pending.value, '$.id'), ${assessmentId},
        json_extract(pending.value, '$.studentId'), json_extract(pending.value, '$.score'), json_extract(pending.value, '$.grade'),
        json_extract(pending.value, '$.feedback'), ${now}, ${now} from json_each(${payload}) pending where ${eligible}
        and not exists (select 1 from assessment_results existing where existing.assessment_id = ${assessmentId}
          and existing.student_id = json_extract(pending.value, '$.studentId'))`).returning(),
      db.update(assessmentResults).set({
        score: sql`(select json_extract(pending.value, '$.score') from json_each(${payload}) pending where json_extract(pending.value, '$.studentId') = ${assessmentResults.studentId})`,
        grade: sql`(select json_extract(pending.value, '$.grade') from json_each(${payload}) pending where json_extract(pending.value, '$.studentId') = ${assessmentResults.studentId})`,
        feedback: sql`(select json_extract(pending.value, '$.feedback') from json_each(${payload}) pending where json_extract(pending.value, '$.studentId') = ${assessmentResults.studentId})`,
        updatedAt: now,
      }).where(and(eq(assessmentResults.assessmentId, assessmentId), eligible,
        sql`${assessmentResults.studentId} in (select json_extract(pending.value, '$.studentId') from json_each(${payload}) pending)`)).returning(),
    ]);
    saved = updated;
  } catch (error) { rethrowAcademicConflict(error); }
  if (saved.length !== rows.length) throw new AcademicConflict();
}
export async function listResults(principal: Principal, assessmentId: string): Promise<{ studentId: string; studentName: string; score: number; grade: string | null; feedback: string | null }[]> {
  if (principal.role === 'guardian' || principal.role === 'student') throw new AccessError('Assessment results are not yet published for family access');
  if (!await getAssessment(principal, assessmentId)) throw new AccessError('Assessment not found', 404);
  return await getDb().select({ studentId: students.id, studentName: sql<string>`${students.firstName} || ' ' || ${students.lastName}`, score: assessmentResults.score, grade: assessmentResults.grade, feedback: assessmentResults.feedback })
    .from(assessmentResults).innerJoin(students, eq(assessmentResults.studentId, students.id))
    .where(and(eq(assessmentResults.assessmentId, assessmentId), liveAcademicPrincipal(principal), studentScope(principal),
      sql`exists (select 1 from assessments where ${assessments.id} = ${assessmentId} and ${classReferenceScope(principal, assessments.classId)})`));
}
