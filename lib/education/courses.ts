import { getDb } from '@/db/index';
import type { InsertCourse, SelectCourse } from '@/db/schema';
import { courseSchema } from './validation';

export async function listCourses(): Promise<SelectCourse[]> {
  const db = getDb();
  return await db.select().from(db.schema.courses);
}

export async function getCourse(id: string): Promise<SelectCourse | null> {
  const db = getDb();
  const [course] = await db.select().from(db.schema.courses).where(db.sql`id = ${id}`);
  return course ?? null;
}

export async function createCourse(input: InsertCourse): Promise<SelectCourse> {
  const validatedInput = courseSchema.parse(input);
  const db = getDb();
  
  const [course] = await db.insert(db.schema.courses).values(validatedInput).returning();
  return course;
}