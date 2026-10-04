import { getDb } from '@/db/index';
import type { SelectAssessment, InsertAssessment } from '@/db/schema';
import { assessmentSchema } from './validation';
import { eq } from 'drizzle-orm';
import { assessments, assessmentResults, students } from '@/db/schema';

export async function listAssessments(filter?: { classId?: string }): Promise<SelectAssessment[]> {
  const db = getDb();
  
  if (filter?.classId) {
    return await db.select().from(assessments).where(eq(assessments.classId, filter.classId));
  }
  
  return await db.select().from(assessments);
}

export async function getAssessment(id: string): Promise<SelectAssessment | null> {
  const db = getDb();
  const [assessment] = await db.select().from(assessments).where(eq(assessments.id, id)).limit(1);
  return assessment ?? null;
}

export async function createAssessment(input: Omit<InsertAssessment, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectAssessment> {
  const validatedInput = assessmentSchema.parse(input);
  const db = getDb();
  
  const now = new Date().toISOString();
  const [assessment] = await db.insert(assessments).values({ 
    ...validatedInput, 
    id: crypto.randomUUID(), 
    createdAt: now, 
    updatedAt: now 
  }).returning();
  return assessment;
}

export async function updateAssessment(id: string, input: Omit<InsertAssessment, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectAssessment | null> {
  const validatedInput = assessmentSchema.parse(input);
  const db = getDb();
  
  const now = new Date().toISOString();
  const [assessment] = await db.update(assessments)
    .set({ ...validatedInput, updatedAt: now })
    .where(eq(assessments.id, id))
    .returning();
  
  return assessment ?? null;
}

export async function recordResults(assessmentId: string, results: { studentId: string; score: number; grade?: string; feedback?: string }[]): Promise<void> {
  const db = getDb();
  
  for (const result of results) {
    // Check if a result already exists for this assessment and student
    const existingResult = await db.select({ id: assessmentResults.id })
      .from(assessmentResults)
      .where(eq(assessmentResults.assessmentId, assessmentId))
      .limit(1);
    
    const now = new Date().toISOString();
    
    if (existingResult.length > 0) {
      // Update existing result
      await db.update(assessmentResults)
        .set({
          score: result.score,
          grade: result.grade,
          feedback: result.feedback,
          updatedAt: now
        })
        .where(eq(assessmentResults.id, existingResult[0].id));
    } else {
      // Create new result
      await db.insert(assessmentResults).values({
        id: crypto.randomUUID(),
        assessmentId,
        studentId: result.studentId,
        score: result.score,
        grade: result.grade,
        feedback: result.feedback,
        createdAt: now,
        updatedAt: now
      });
    }
  }
}

export async function listResults(assessmentId: string): Promise<{ 
  studentName: string; 
  score: number; 
  grade: string | null; 
  feedback: string | null 
}[]> {
  const db = getDb();
  
  return await db.select({
    studentName: students.firstName,
    score: assessmentResults.score,
    grade: assessmentResults.grade,
    feedback: assessmentResults.feedback
  })
  .from(assessmentResults)
  .innerJoin(students, eq(assessmentResults.studentId, students.id))
  .where(eq(assessmentResults.assessmentId, assessmentId));
}