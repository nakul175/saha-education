import { getDb } from '@/db/index';
import type { InsertAssessment, SelectAssessment, InsertAssessmentResult, SelectAssessmentResult } from '@/db/schema';
import { sql, eq } from 'drizzle-orm';
import { assessments as assessmentsTable, assessmentResults as assessmentResultsTable } from '@/db/schema';

export async function listAssessments(classId?: string): Promise<SelectAssessment[]> {
  const db = getDb();
  
  if (classId) {
    return await db.select().from(assessmentsTable).where(eq(assessmentsTable.classId, classId));
  }
  
  return await db.select().from(assessmentsTable);
}

export async function getAssessment(id: string): Promise<SelectAssessment | null> {
  const db = getDb();
  const [assessment] = await db.select().from(assessmentsTable).where(eq(assessmentsTable.id, id)).limit(1);
  return assessment ?? null;
}

export async function createAssessment(input: Omit<InsertAssessment, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectAssessment> {
  const db = getDb();
  const now = new Date().toISOString();
  
  // Create a clean insert object without the optional fields that cause issues
  const insertData: InsertAssessment = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now
  };
  
  const [assessment] = await db.insert(assessmentsTable)
    .values(insertData)
    .returning();
    
  return assessment;
}

export async function recordResults(assessmentId: string, results: { studentId: string; score: number; feedback?: string }[]): Promise<SelectAssessmentResult[]> {
  const db = getDb();
  const now = new Date().toISOString();
  
  // Prepare the results data with computed grade and timestamps
  const insertResults: InsertAssessmentResult[] = results.map(result => {
    const grade = gradeFromScore(result.score, 100); // Assuming max score is 100
    return {
      ...result,
      assessmentId,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      grade
    };
  });
  
  // Insert new results
  const inserted = await db.insert(assessmentResultsTable)
    .values(insertResults)
    .returning();
    
  return inserted;
}

export async function listResults(assessmentId: string): Promise<SelectAssessmentResult[]> {
  const db = getDb();
  return await db.select().from(assessmentResultsTable).where(eq(assessmentResultsTable.assessmentId, assessmentId));
}

export function gradeFromScore(score: number, maxScore: number): string {
  if (maxScore <= 0) return 'F';
  
  const percentage = (score / maxScore) * 100;
  
  if (percentage >= 90) return 'A';
  if (percentage >= 75) return 'B';
  if (percentage >= 60) return 'C';
  if (percentage >= 40) return 'D';
  
  return 'F';
}