import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db/index';
import { registryCreationReceipts } from '@/db/registry-create-schema';
import type { guardians, students } from '@/db/schema';
import { AccessError, assertAdmin, assertPrincipal, livePrincipalScope } from './access';
import type { Principal } from './types';
import { guardianSchema, studentSchema } from './validation';

const reason = z.string().trim().refine(value => {
  const length = Array.from(value).length;
  return length >= 10 && length <= 500 && !value.includes('\0');
}, 'Explain the reviewed creation in 10 to 500 characters');
const requestId = z.string().uuid().transform(value => value.toLowerCase());
const reviewed = { clientRequestId: requestId, reviewConfirmed: z.literal(true), reason };
const studentProfileSchema = studentSchema.pick({
  firstName: true, lastName: true, dateOfBirth: true, admissionNumber: true, gradeLevel: true,
}).strict();
const guardianProfileSchema = guardianSchema.pick({ name: true, phone: true, email: true, relationship: true }).strict();

export const studentCreationSchema = z.object({ ...reviewed, profile: studentProfileSchema }).strict();
export const guardianCreationSchema = z.object({ ...reviewed, profile: guardianProfileSchema }).strict();
export type StudentCreationInput = z.infer<typeof studentCreationSchema>;
export type GuardianCreationInput = z.infer<typeof guardianCreationSchema>;
export type CreatedStudentProfile = typeof students.$inferSelect & { userId: null };
export type CreatedGuardianProfile = typeof guardians.$inferSelect & { userId: null; schoolId: string };
type ReceiptBase = { id: string; schoolId: string; createdBy: string; reason: string; createdAt: string };
export type RegistryCreationReceipt = ReceiptBase & (
  { kind: 'student'; profile: CreatedStudentProfile } | { kind: 'guardian'; profile: CreatedGuardianProfile }
);
export type RegistryCreationResult = { receipt: RegistryCreationReceipt; replayed: boolean };
type ReceiptRow = typeof registryCreationReceipts.$inferSelect;

export class RegistryCreationConflict extends AccessError {
  constructor() { super('Registry creation conflict', 409); }
}

function receiptScope(principal: Principal) {
  assertAdmin(principal);
  assertPrincipal(principal);
  return and(eq(registryCreationReceipts.schoolId, principal.schoolId),
    eq(registryCreationReceipts.createdBy, principal.id), livePrincipalScope(principal))!;
}
async function scopedReceipt(principal: Principal, id: string): Promise<ReceiptRow | null> {
  const [row] = await getDb().select().from(registryCreationReceipts)
    .where(and(eq(registryCreationReceipts.id, id), receiptScope(principal))).limit(1);
  return row ?? null;
}
function receiptView(row: ReceiptRow): RegistryCreationReceipt {
  const base = { id: row.id, schoolId: row.schoolId, createdBy: row.createdBy, reason: row.reason, createdAt: row.createdAt };
  // Only server-created immutable snapshots are returned, never the request hash
  // or current identity metadata, and never a later edited profile as a receipt.
  return row.kind === 'student'
    ? { ...base, kind: 'student', profile: JSON.parse(row.profileSnapshot) as CreatedStudentProfile }
    : { ...base, kind: 'guardian', profile: JSON.parse(row.profileSnapshot) as CreatedGuardianProfile };
}
function matches(row: ReceiptRow, kind: 'student' | 'guardian', hash: string) {
  if (row.kind !== kind || row.requestHash !== hash) throw new RegistryCreationConflict();
}
async function requestDigest(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
function creationConflict(error: unknown): boolean {
  // Drizzle and D1 wrap SQLite errors. Map only known constraints; an unrelated
  // transport/database error remains an uncertain outcome rather than a claim
  // that the reviewed creation was rejected before committing.
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    if (/saha_registry_creation_conflict|UNIQUE constraint failed: students\.(admission_number|id)|UNIQUE constraint failed: guardians\.id|UNIQUE constraint failed: registry_creation_receipts\.(id|profile_id)/.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}

async function createReviewed(principal: Principal, kind: 'student' | 'guardian', input: StudentCreationInput | GuardianCreationInput): Promise<RegistryCreationResult> {
  assertAdmin(principal);
  assertPrincipal(principal);
  const data = kind === 'student' ? studentCreationSchema.parse(input) : guardianCreationSchema.parse(input);
  const profile = kind === 'student'
    ? { ...(data as StudentCreationInput).profile }
    : { ...(data as GuardianCreationInput).profile,
      phone: (data as GuardianCreationInput).profile.phone ?? null,
      email: (data as GuardianCreationInput).profile.email ?? null };
  const hash = await requestDigest(JSON.stringify({ kind, reviewConfirmed: true, reason: data.reason, profile }));
  const existing = await scopedReceipt(principal, data.clientRequestId);
  if (existing) {
    matches(existing, kind, hash);
    return { receipt: receiptView(existing), replayed: true };
  }

  const profileId = crypto.randomUUID(), createdAt = new Date().toISOString();
  const snapshot = { id: profileId, userId: null, schoolId: principal.schoolId, ...profile, createdAt, updatedAt: createdAt };
  let created = false;
  try {
    // The same SQL statement checks the exact request session and live account.
    // Its trigger creates the unlinked profile atomically with this receipt.
    const rows = await getDb().insert(registryCreationReceipts).select(sql`select
      ${data.clientRequestId}, ${kind}, ${principal.schoolId}, ${principal.id}, ${profileId},
      ${data.reason}, ${hash}, ${JSON.stringify(snapshot)}, ${createdAt}
      where ${livePrincipalScope(principal)}`)
      .onConflictDoNothing({ target: registryCreationReceipts.id }).returning({ id: registryCreationReceipts.id });
    created = rows.length > 0;
  } catch (error) {
    if (!creationConflict(error)) throw error;
    // Another identical request may have won. It is still an original replay;
    // a different payload or a fresh admission collision is a safe conflict.
    const raced = await scopedReceipt(principal, data.clientRequestId);
    if (raced) {
      matches(raced, kind, hash);
      return { receipt: receiptView(raced), replayed: true };
    }
    throw new RegistryCreationConflict();
  }
  const saved = await scopedReceipt(principal, data.clientRequestId);
  if (!saved) {
    if (created) throw new AccessError('Creation receipt unavailable', 404);
    throw new RegistryCreationConflict();
  }
  matches(saved, kind, hash);
  return { receipt: receiptView(saved), replayed: !created };
}

export async function reviewStudentCreation(principal: Principal, input: StudentCreationInput): Promise<RegistryCreationResult> {
  return createReviewed(principal, 'student', input);
}
export async function reviewGuardianCreation(principal: Principal, input: GuardianCreationInput): Promise<RegistryCreationResult> {
  return createReviewed(principal, 'guardian', input);
}
export async function getRegistryCreation(principal: Principal, id: string): Promise<RegistryCreationReceipt> {
  assertAdmin(principal);
  const row = await scopedReceipt(principal, requestId.parse(id));
  if (!row) throw new AccessError('Creation receipt unavailable', 404);
  return receiptView(row);
}
