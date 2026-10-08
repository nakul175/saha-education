import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db/index';
import { guardians, students, studentGuardians, users } from '@/db/schema';
import { studentGuardianDetails, studentRecordStatus } from '@/db/school-records-schema';
import { AccessError, assertPrincipal, assertAdmin, guardianScope, studentScope } from './access';
import {
  RecordConflict,
  constraintFailure,
  nextStamp,
  optionalText,
  plainText,
  timestampSchema,
} from './record-support';
import { profileActorScope, profileAdminScope } from './profile-links';
import { directoryQuerySchema } from './student-records';
import type { Principal } from './types';

export type GuardianRecord = {
  id: string;
  schoolId: string;
  name: string;
  phone: string | null;
  email: string | null;
  relationship: string;
  hasLogin: boolean;
  createdAt: string;
  updatedAt: string;
};
export type GuardianDirectoryRow = GuardianRecord & { linkedStudents: number };
export type GuardianDirectory = {
  items: GuardianDirectoryRow[];
  total: number;
  limit: number;
  offset: number;
};
export type GuardianChild = {
  id: string;
  firstName: string;
  lastName: string;
  gradeLevel: string;
  relationship: string;
  status: 'active' | 'inactive';
  isPrimary?: boolean;
};
export type GuardianDetail = { guardian: GuardianRecord; children: GuardianChild[] };

const phone = optionalText('Phone', 30).refine(
  (value) => value === null || (/^[0-9+() .-]{3,30}$/.test(value) && /\d{3}/.test(value)),
  'Enter a valid phone number',
);
const email = optionalText('Email', 254).refine(
  (value) => value === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  'Enter a valid email address',
);
export const guardianEditSchema = z
  .object({
    name: plainText('Name', 120),
    phone,
    email,
    relationship: plainText('Relationship', 60),
    expectedUpdatedAt: timestampSchema,
  })
  .strict();
export const guardianDirectoryQuerySchema = directoryQuerySchema
  .pick({ q: true, limit: true, offset: true })
  .strict();
export type GuardianEditInput = z.input<typeof guardianEditSchema>;

const recordColumns = {
  id: guardians.id,
  schoolId: sql<string>`${guardians.schoolId}`,
  name: guardians.name,
  phone: guardians.phone,
  email: guardians.email,
  relationship: guardians.relationship,
  hasLogin: sql<number>`case when ${guardians.userId} is null then 0 else 1 end`,
  createdAt: guardians.createdAt,
  updatedAt: guardians.updatedAt,
};
const view = <T extends { hasLogin: number | boolean }>(
  row: T,
): Omit<T, 'hasLogin'> & { hasLogin: boolean } => ({ ...row, hasLogin: Boolean(row.hasLogin) });

/** Guardians visible to the caller: administrator all school profiles, guardian only their own profile,
 * teacher/student only guardians of children they already see. `linkedStudents` counts only visible children. */
export async function listGuardianDirectory(
  principal: Principal,
  value: z.input<typeof guardianDirectoryQuerySchema> = {},
): Promise<GuardianDirectory> {
  assertPrincipal(principal);
  const query = guardianDirectoryQuerySchema.parse(value);
  const terms = (query.q ?? '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5);
  const haystack = sql`lower(${guardians.name} || ' ' || coalesce(${guardians.email}, '') || ' ' || coalesce(${guardians.phone}, ''))`;
  const where = and(
    guardianScope(principal),
    profileActorScope(principal),
    ...terms.map((term) => sql`instr(${haystack}, ${term}) > 0`),
  );
  const db = getDb();
  const rows = await db
    .select({
      ...recordColumns,
      linkedStudents: sql<number>`(select count(*) from student_guardians sg join students on students.id = sg.student_id
      where sg.guardian_id = guardians.id and ${studentScope(principal)})`,
    })
    .from(guardians)
    .where(where)
    .orderBy(guardians.name, guardians.id)
    .limit(query.limit)
    .offset(query.offset);
  const [count] = await db
    .select({ total: sql<number>`count(*)` })
    .from(guardians)
    .where(where);
  const [actor] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, principal.id), profileActorScope(principal)))
    .limit(1);
  if (!actor) throw new AccessError('School access required');
  return {
    items: rows.map((row) => ({ ...view(row), linkedStudents: Number(row.linkedStudents) })),
    total: Number(count?.total ?? 0),
    limit: query.limit,
    offset: query.offset,
  };
}

export async function getGuardianRecord(principal: Principal, id: string): Promise<GuardianDetail> {
  assertPrincipal(principal);
  const db = getDb();
  const [guardian] = await db
    .select(recordColumns)
    .from(guardians)
    .where(and(eq(guardians.id, id), guardianScope(principal), profileActorScope(principal)))
    .limit(1);
  if (!guardian) throw new AccessError('Guardian not found', 404);
  // Children are scoped again by the caller's own student scope; the primary flag is administrator-only evidence.
  const children = await db
    .select({
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      gradeLevel: students.gradeLevel,
      relationship: sql<string>`coalesce(${studentGuardianDetails.relationship}, ${guardians.relationship})`,
      status: sql<'active' | 'inactive'>`coalesce(${studentRecordStatus.status}, 'active')`,
      isPrimary: studentGuardians.isPrimary,
    })
    .from(studentGuardians)
    .innerJoin(students, eq(students.id, studentGuardians.studentId))
    .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
    .leftJoin(
      studentGuardianDetails,
      and(
        eq(studentGuardianDetails.studentId, studentGuardians.studentId),
        eq(studentGuardianDetails.guardianId, studentGuardians.guardianId),
      ),
    )
    .leftJoin(studentRecordStatus, eq(studentRecordStatus.studentId, students.id))
    .where(and(eq(studentGuardians.guardianId, id), studentScope(principal), guardianScope(principal)))
    .orderBy(students.lastName, students.firstName, students.id)
    .limit(100);
  const [actor] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, principal.id), profileActorScope(principal)))
    .limit(1);
  if (!actor) throw new AccessError('School access required');
  return {
    guardian: view(guardian),
    children: children.map(({ isPrimary, ...child }) =>
      principal.role === 'admin' ? { ...child, isPrimary: Boolean(isPrimary) } : child,
    ),
  };
}

export async function updateGuardianRecord(
  principal: Principal,
  id: string,
  value: GuardianEditInput,
): Promise<GuardianDetail> {
  assertAdmin(principal);
  const input = guardianEditSchema.parse(value);
  const db = getDb();
  const [existing] = await db
    .select({ updatedAt: guardians.updatedAt })
    .from(guardians)
    .where(and(eq(guardians.id, id), guardianScope(principal), profileAdminScope(principal)))
    .limit(1);
  if (!existing) throw new AccessError('Guardian not found', 404);
  let updated: { id: string }[] = [];
  try {
    updated = await db
      .update(guardians)
      .set({
        name: input.name,
        phone: input.phone,
        email: input.email,
        relationship: input.relationship,
        updatedAt: nextStamp(existing.updatedAt),
      })
      .where(
        and(
          eq(guardians.id, id),
          guardianScope(principal),
          profileAdminScope(principal),
          eq(guardians.updatedAt, input.expectedUpdatedAt),
        ),
      )
      .returning({ id: guardians.id });
  } catch (error) {
    if (constraintFailure(error, /constraint/i)) throw new RecordConflict('stale');
    throw error;
  }
  if (!updated[0]) {
    const [actor] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, principal.id), profileAdminScope(principal)))
      .limit(1);
    if (!actor) throw new AccessError('Administrator access required');
    throw new RecordConflict('stale');
  }
  return getGuardianRecord(principal, id);
}
