import { getDb } from '@/db/index';
import type { SelectCourse, InsertCourse } from '@/db/schema';
import { courseSchema } from './validation';
import { eq } from 'drizzle-orm';
import { courses } from '@/db/schema';

export async function listCourses(schoolId?: string): Promise<SelectCourse[]> {
  const db = getDb();
  
  if (schoolId) {
    return await db.select().from(courses).where(eq(courses.schoolId, schoolId));
  }
  
  return await db.select().from(courses);
}

export async function getCourse(id: string): Promise<SelectCourse | null> {
  const db = getDb();
  const [course] = await db.select().from(courses).where(eq(courses.id, id)).limit(1);
  return course ?? null;
}

export async function createCourse(input: Omit<InsertCourse, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectCourse> {
  const validatedInput = courseSchema.parse(input);
  const db = getDb();
  
  const now = new Date().toISOString();
  const [course] = await db.insert(courses).values({ 
    ...validatedInput, 
    id: crypto.randomUUID(), 
    createdAt: now, 
    updatedAt: now 
  }).returning();
  return course;
}

export async function updateCourse(id: string, input: Omit<InsertCourse, 'id' | 'createdAt' | 'updatedAt'>): Promise<SelectCourse | null> {
  const validatedInput = courseSchema.parse(input);
  const db = getDb();
  
  const now = new Date().toISOString();
  const [course] = await db.update(courses)
    .set({ ...validatedInput, updatedAt: now })
    .where(eq(courses.id, id))
    .returning();
  
  return course ?? null;
}