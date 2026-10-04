import { getDb } from '@/db/index';
import type { InsertAssessment, SelectAssessment, InsertAssessmentResult, SelectAssessmentResult } from '@/db/schema';
import { assessmentSchema, assessmentResultSchema } from './validation';
import { sql } from 'drizzle-orm';
import { assessments as assessmentsTable, assessmentResults as assessmentResultsTable } from '@/db/schema';

export async function listAssessments(): Promise<SelectAssessment[]> {
  const db = getDb();
  return await db.select().from(assessmentsTable);
}

export async function getAssessment(id: string): Promise<SelectAssessment | null> {
  const db = getDb();
  const [assessment] = await db.select().from(assessmentsTable).where(sql`id = ${id}`);
  return assessment ?? null;
}

export async function createAssessment(input: InsertAssessment): Promise<SelectAssessment> {
  const validatedInput = assessmentSchema.parse(input);
  const db = getDb();
  
  const [assessment] = await db.insert(assessmentsTable).values(validatedInput).returning();
  return assessment;
}

export async function recordResults(assessmentId: string, studentId: string, score: number, grade?: string, feedback?: string): Promise<SelectAssessmentResult> {
  const db = getDb();
  
  // Check if result already exists for this student and assessment
  const existing = await db.select().from(assessmentResultsTable)
    .where(sql`assessment_id = ${assessmentId} AND student_id = ${studentId}`);
  
  const validatedInput = assessmentResultSchema.parse({
    assessmentId,
    studentId,
    score,
    grade,
    feedback
  });
  
  if (existing.length > 0) {
    // Update existing result
    const [updated] = await db.update(assessmentResultsTable)
      .set(validatedInput)
      .where(sql`id = ${existing[0].id}`)
      .returning();
    return updated;
  } else {
    // Create new result
    const [result] = await db.insert(assessmentResultsTable)
      .values(validatedInput)
      .returning();
    return result;
  }
}

export async function listResults(assessmentId: string): Promise<SelectAssessmentResult[]> {
  const db = getDb();
  return await db.select().from(assessmentResultsTable).where(sql`assessment_id = ${assessmentId}`);
}