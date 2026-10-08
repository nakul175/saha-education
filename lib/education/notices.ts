import { z } from 'zod';
import { and, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { getDb } from '@/db';
import { classes, guardians, notifications, students, users } from '@/db/schema';
import { notices, noticeRecipients } from '@/db/notices-schema';
import { AccessError, assertPrincipal, classScope, livePrincipalScope, studentScope } from './access';
import { digest } from './identity';
import type { Principal } from './types';

// Staff notices are in-app only. Every recipient receives an ordinary row in
// `notifications`; no email, SMS or other provider is contacted from here.

const identifier = z
  .string()
  .min(1)
  .max(120)
  .refine((value) => value === value.trim() && !/[\x00-\x1f\x7f]/.test(value));
// Plain language only: control characters and tag-like text are refused, and the
// interface renders every saved value as text, never as markup.
const tagLike = /<\/?[a-zA-Z!?]/;
const plainLine = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !/[\x00-\x1f\x7f]/.test(value), 'No control characters')
    .refine((value) => !tagLike.test(value), 'No HTML or markup');
const plainBody = z
  .string()
  .transform((value) => value.replace(/\r\n?/g, '\n').trim())
  .pipe(
    z
      .string()
      .min(1)
      .max(2000)
      .refine((value) => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value), 'No control characters')
      .refine((value) => !tagLike.test(value), 'No HTML or markup'),
  );
const reasonText = z
  .string()
  .trim()
  .min(10)
  .max(500)
  .refine(
    (value) => Array.from(value).length >= 10 && !/[\x00-\x1f\x7f]/.test(value) && !tagLike.test(value),
    'Give a plain one-line reason',
  );

export const noticeRolesSchema = z.enum(['guardians', 'learners', 'both']);
export const sendNoticeSchema = z
  .object({
    clientRequestId: z.string().uuid(),
    title: plainLine(120),
    body: plainBody,
    audience: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('class'), classId: identifier, roles: noticeRolesSchema }).strict(),
      z
        .object({
          kind: z.literal('recipients'),
          userIds: z
            .array(identifier)
            .min(1)
            .max(50)
            .refine((ids) => new Set(ids).size === ids.length, 'Each person once'),
        })
        .strict(),
    ]),
    reviewConfirmed: z.literal(true),
  })
  .strict();
export const noticeCorrectionSchema = z
  .object({
    clientRequestId: z.string().uuid(),
    title: plainLine(120),
    body: plainBody,
    reason: reasonText,
    reviewConfirmed: z.literal(true),
  })
  .strict();
export const noticeAudienceQuerySchema = z.object({ classId: identifier, roles: noticeRolesSchema }).strict();
export type SendNoticeInput = z.infer<typeof sendNoticeSchema>;
export type NoticeCorrectionInput = z.infer<typeof noticeCorrectionSchema>;

export type SentNotice = {
  id: string;
  title: string;
  body: string;
  audienceKind: 'class' | 'recipients' | 'correction';
  audienceLabel: string;
  senderLabel: string;
  authorId: string;
  recipientCount: number;
  readCount: number;
  correctionCount: number;
  createdAt: string;
  correctsNoticeId: string | null;
  correctionReason: string | null;
};
export type NoticeRecipientView = { userId: string; name: string; role: string; readAt: string | null };
export type NoticeDetail = SentNotice & {
  corrects: { id: string; title: string } | null;
  recipients: NoticeRecipientView[];
  recipientsTruncated: boolean;
  corrections: SentNotice[];
};
export type NoticeSendResult = { notice: SentNotice; replayed: boolean };
export type NoticeAudiencePreview = {
  count: number;
  sample: { name: string; role: string }[];
  label: string;
};
export type NoticePickerPerson = {
  userId: string;
  name: string;
  role: 'student' | 'guardian';
  context: string;
};
export class NoticeConflict extends AccessError {
  constructor() {
    super('Notice conflict', 409);
    this.name = 'NoticeConflict';
  }
}

export function assertNoticeStaff(principal: Principal): void {
  assertPrincipal(principal);
  if (principal.role !== 'admin' && principal.role !== 'teacher')
    throw new AccessError('Staff access required');
}
async function liveStaff(principal: Principal): Promise<{ name: string }> {
  assertNoticeStaff(principal);
  const [actor] = await getDb()
    .select({ name: users.name })
    .from(users)
    .where(
      and(
        eq(users.id, principal.id),
        eq(users.role, principal.role),
        eq(users.schoolId, principal.schoolId!),
        livePrincipalScope(principal),
      ),
    )
    .limit(1);
  if (!actor) throw new AccessError('Staff access required');
  return actor;
}

type Audience =
  | { kind: 'class'; classId: string; roles: 'guardians' | 'learners' | 'both' }
  | { kind: 'recipients'; userIds: string[] }
  | { kind: 'correction'; originalId: string };

// The one definition of "who may receive". It is evaluated by the preview, the
// header guard and both fan-out INSERTs, so a recipient whose authority changed
// after the preview is never silently included.
function recipientBase(principal: Principal): SQL {
  return and(
    eq(users.schoolId, principal.schoolId!),
    isNull(users.disabledAt),
    inArray(users.role, ['student', 'guardian']),
    livePrincipalScope(principal),
    sql`${users.identityIssuer} is not null and ${users.identityIssuer} <> '' and ${users.identitySubject} is not null and ${users.identitySubject} <> ''`,
  )!;
}
// A teacher reaches only learners in their active classes and those learners' guardians.
function staffRelated(principal: Principal): SQL | undefined {
  if (principal.role === 'admin') return undefined;
  return or(
    and(
      eq(users.role, 'student'),
      sql`exists (select 1 from students where ${students.userId} = ${users.id} and ${studentScope(principal)})`,
    ),
    and(
      eq(users.role, 'guardian'),
      sql`exists (select 1 from guardians join student_guardians on student_guardians.guardian_id = guardians.id
      join students on students.id = student_guardians.student_id where ${guardians.userId} = ${users.id}
      and ${guardians.schoolId} = ${principal.schoolId!} and ${studentScope(principal)})`,
    ),
  );
}
function eligibleRecipients(principal: Principal, audience: Audience): SQL {
  const school = principal.schoolId!,
    base = recipientBase(principal);
  if (audience.kind === 'class') {
    const learners = and(
      eq(users.role, 'student'),
      sql`exists (select 1 from students join enrolments on enrolments.student_id = students.id
      where ${students.userId} = ${users.id} and ${students.schoolId} = ${school} and enrolments.class_id = ${audience.classId} and enrolments.status = 'active')`,
    );
    const families = and(
      eq(users.role, 'guardian'),
      sql`exists (select 1 from guardians join student_guardians on student_guardians.guardian_id = guardians.id
      join enrolments on enrolments.student_id = student_guardians.student_id where ${guardians.userId} = ${users.id} and ${guardians.schoolId} = ${school}
      and enrolments.class_id = ${audience.classId} and enrolments.status = 'active')`,
    );
    const members =
      audience.roles === 'learners'
        ? learners
        : audience.roles === 'guardians'
          ? families
          : or(learners, families);
    return and(
      base,
      sql`exists (select 1 from classes where ${classes.id} = ${audience.classId} and ${classScope(principal)})`,
      members,
    )!;
  }
  // One bound JSON array instead of one variable per ID keeps the statement inside D1's 100-variable limit.
  if (audience.kind === 'recipients')
    return and(
      base,
      sql`${users.id} in (select value from json_each(${JSON.stringify(audience.userIds)}))`,
      staffRelated(principal),
    )!;
  return and(
    base,
    sql`${users.id} in (select user_id from notice_recipients where notice_id = ${audience.originalId})`,
    staffRelated(principal),
  )!;
}

async function countAudience(principal: Principal, audience: Audience): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)` })
    .from(users)
    .where(eligibleRecipients(principal, audience));
  return Number(row?.n ?? 0);
}

async function classLabel(
  principal: Principal,
  classId: string,
  roles: 'guardians' | 'learners' | 'both',
): Promise<string> {
  const [row] = await getDb()
    .select({ name: classes.name, term: classes.term })
    .from(classes)
    .where(and(eq(classes.id, classId), classScope(principal)))
    .limit(1);
  if (!row) throw new AccessError('Class not found', 404);
  return `${row.name} (${row.term}): ${roles === 'both' ? 'guardians and students' : roles === 'learners' ? 'students' : roles}`;
}

export async function previewNoticeAudience(
  principal: Principal,
  value: z.infer<typeof noticeAudienceQuerySchema>,
): Promise<NoticeAudiencePreview> {
  await liveStaff(principal);
  const input = noticeAudienceQuerySchema.parse(value);
  const label = await classLabel(principal, input.classId, input.roles);
  const audience: Audience = { kind: 'class', ...input };
  const sample = await getDb()
    .select({ name: users.name, role: users.role })
    .from(users)
    .where(eligibleRecipients(principal, audience))
    .orderBy(users.name, users.id)
    .limit(5);
  const count = await countAudience(principal, audience);
  await liveStaff(principal);
  return { count, sample, label };
}

export async function listNoticePeople(
  principal: Principal,
  filter: { q?: string; limit?: number } = {},
): Promise<NoticePickerPerson[]> {
  await liveStaff(principal);
  const q = filter.q?.trim().slice(0, 60) ?? '';
  const limit = Math.min(Math.max(Math.trunc(filter.limit ?? 50), 1), 50);
  const escaped = q.replace(/[\\%_]/g, (match) => '\\' + match);
  const rows = await getDb()
    .select({
      userId: users.id,
      name: users.name,
      role: users.role,
      // Literal `users.*`: single-table select fields render unqualified and would bind to the subquery's own table.
      context: sql<string | null>`case users.role
      when 'student' then (select 'Student, grade ' || students.grade_level from students where students.user_id = users.id limit 1)
      else (select 'Guardian of ' || group_concat(learner.first_name || ' ' || learner.last_name, ', ') from guardians join student_guardians on student_guardians.guardian_id = guardians.id
        join students learner on learner.id = student_guardians.student_id where guardians.user_id = users.id and guardians.school_id = ${principal.schoolId!}) end`,
    })
    .from(users)
    .where(
      and(
        recipientBase(principal),
        staffRelated(principal),
        q ? sql`${users.name} like ${'%' + escaped + '%'} escape '\\'` : undefined,
      ),
    )
    .orderBy(users.name, users.id)
    .limit(limit);
  await liveStaff(principal);
  return rows.map((row) => ({
    userId: row.userId,
    name: row.name,
    role: row.role as 'student' | 'guardian',
    context: row.context ?? '',
  }));
}

// ---- sent-notice reads ----
// Literal `notices.id`: a single-table select renders column references unqualified, which would bind to the subquery's own table.
const readCountSql = sql<number>`(select count(*) from notice_recipients join notifications on notifications.id = notice_recipients.notification_id
  where notice_recipients.notice_id = notices.id and notifications.read_at is not null)`;
const correctionCountSql = sql<number>`(select count(*) from notices later where later.corrects_notice_id = notices.id)`;
const sentFields = {
  id: notices.id,
  title: notices.title,
  body: notices.body,
  audienceKind: notices.audienceKind,
  audienceLabel: notices.audienceLabel,
  senderLabel: notices.senderLabel,
  authorId: notices.authorId,
  recipientCount: notices.recipientCount,
  readCount: readCountSql,
  correctionCount: correctionCountSql,
  createdAt: notices.createdAt,
  correctsNoticeId: notices.correctsNoticeId,
  correctionReason: notices.correctionReason,
};
function sentView(row: { [K in keyof typeof sentFields]: unknown }): SentNotice {
  return {
    ...row,
    audienceKind: row.audienceKind as SentNotice['audienceKind'],
    recipientCount: Number(row.recipientCount),
    readCount: Number(row.readCount),
    correctionCount: Number(row.correctionCount),
  } as SentNotice;
}
// Admin: every notice in the current school. Teacher: only notices they sent.
function sentScope(principal: Principal): SQL {
  assertNoticeStaff(principal);
  return and(
    eq(notices.schoolId, principal.schoolId!),
    principal.role === 'teacher' ? eq(notices.authorId, principal.id) : undefined,
    livePrincipalScope(principal),
  )!;
}
const cursorSchema = z
  .string()
  .max(300)
  .regex(/^[^|]{1,40}\|[^|]{1,200}$/);
export const noticeListQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(50).optional(), cursor: cursorSchema.optional() })
  .strict();
export type NoticePage = { items: SentNotice[]; total: number; nextCursor: string | null };
export async function listSentNotices(
  principal: Principal,
  filter: z.infer<typeof noticeListQuerySchema> = {},
): Promise<NoticePage> {
  await liveStaff(principal);
  const { limit = 20, cursor } = noticeListQuerySchema.parse(filter);
  const [boundary, boundaryId] = cursor ? cursor.split('|') : [];
  const rows = await getDb()
    .select(sentFields)
    .from(notices)
    .where(
      and(
        sentScope(principal),
        cursor
          ? or(
              sql`${notices.createdAt} < ${boundary}`,
              and(eq(notices.createdAt, boundary!), sql`${notices.id} < ${boundaryId}`),
            )
          : undefined,
      ),
    )
    .orderBy(desc(notices.createdAt), desc(notices.id))
    .limit(limit + 1);
  const [total] = await getDb()
    .select({ n: sql<number>`count(*)` })
    .from(notices)
    .where(sentScope(principal));
  await liveStaff(principal);
  const page = rows.slice(0, limit).map(sentView);
  const last = page.at(-1);
  return {
    items: page,
    total: Number(total?.n ?? 0),
    nextCursor: rows.length > limit && last ? `${last.createdAt}|${last.id}` : null,
  };
}
export async function getSentNotice(principal: Principal, id: string): Promise<NoticeDetail> {
  await liveStaff(principal);
  const noticeId = identifier.parse(id);
  const [row] = await getDb()
    .select(sentFields)
    .from(notices)
    .where(and(eq(notices.id, noticeId), sentScope(principal)))
    .limit(1);
  if (!row) throw new AccessError('Notice not found', 404);
  const recipients = await getDb()
    .select({ userId: users.id, name: users.name, role: users.role, readAt: notifications.readAt })
    .from(noticeRecipients)
    .innerJoin(users, eq(users.id, noticeRecipients.userId))
    .innerJoin(notifications, eq(notifications.id, noticeRecipients.notificationId))
    .where(eq(noticeRecipients.noticeId, noticeId))
    .orderBy(users.name, users.id)
    .limit(501);
  const corrections = await getDb()
    .select(sentFields)
    .from(notices)
    .where(and(eq(notices.correctsNoticeId, noticeId), sentScope(principal)))
    .orderBy(notices.createdAt, notices.id)
    .limit(50);
  const [original] = row.correctsNoticeId
    ? await getDb()
        .select({ id: notices.id, title: notices.title })
        .from(notices)
        .where(and(eq(notices.id, row.correctsNoticeId), eq(notices.schoolId, principal.schoolId!)))
        .limit(1)
    : [];
  await liveStaff(principal);
  return {
    ...sentView(row),
    corrects: original ?? null,
    recipients: recipients.slice(0, 500),
    recipientsTruncated: recipients.length > 500,
    corrections: corrections.map(sentView),
  };
}

// ---- sending ----
async function replay(principal: Principal, id: string, hash: string): Promise<NoticeSendResult | null> {
  const [row] = await getDb()
    .select({ ...sentFields, hash: notices.requestHash })
    .from(notices)
    .where(and(eq(notices.id, id), eq(notices.schoolId, principal.schoolId!)))
    .limit(1);
  if (!row) return null;
  if (row.authorId !== principal.id || row.hash !== hash) throw new NoticeConflict();
  return { notice: sentView(row), replayed: true };
}
function uniqueFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    (/UNIQUE constraint failed|PRIMARY KEY constraint failed/i.test(error.message) ||
      uniqueFailure(error.cause))
  );
}

type Prepared = {
  id: string;
  audience: Audience;
  kind: 'class' | 'recipients' | 'correction';
  classId: string | null;
  roles: string;
  label: string;
  title: string;
  body: string;
  deliveredTitle: string;
  deliveredBody: string;
  correctsId: string | null;
  reason: string | null;
  hash: string;
};
async function deliver(
  principal: Principal,
  actor: { name: string },
  prepared: Prepared,
): Promise<NoticeSendResult> {
  const expected = await countAudience(principal, prepared.audience);
  if (
    expected < 1 ||
    expected > 500 ||
    (prepared.audience.kind === 'recipients' && expected !== prepared.audience.userIds.length)
  ) {
    await liveStaff(principal);
    throw new AccessError('Notice recipients not found', prepared.audience.kind === 'recipients' ? 404 : 400);
  }
  const db = getDb(),
    attemptId = crypto.randomUUID(),
    now = new Date().toISOString();
  const senderLabel = `Sent by ${actor.name} (${principal.role})`;
  const eligible = eligibleRecipients(principal, prepared.audience);
  const originalAllowed =
    prepared.correctsId === null
      ? sql`1 = 1`
      : sql`exists (select 1 from notices original where original.id = ${prepared.correctsId} and original.school_id = ${principal.schoolId!}
      ${principal.role === 'admin' ? sql`` : sql`and original.author_id = ${principal.id}`})`;
  const own = sql`exists (select 1 from notices where notices.id = ${prepared.id} and notices.attempt_id = ${attemptId})`;
  const deliveredBody = `${prepared.deliveredBody}\n\n${senderLabel}`;
  try {
    await db.batch([
      // Column order matches the table. The audience is counted once, and that exact count is both guarded and stored.
      db.insert(notices)
        .select(sql`select ${prepared.id}, ${principal.schoolId!}, ${principal.id}, ${prepared.kind}, ${prepared.classId}, ${prepared.roles}, ${prepared.label},
        ${senderLabel}, ${prepared.title}, ${prepared.body}, audience.n, ${prepared.correctsId}, ${prepared.reason}, ${prepared.hash}, ${attemptId}, ${now}
        from users join (select count(*) n from users where ${eligible}) audience
        where ${and(
          eq(users.id, principal.id),
          eq(users.role, principal.role),
          eq(users.schoolId, principal.schoolId!),
          livePrincipalScope(principal),
          originalAllowed,
          sql`not exists (select 1 from notices where notices.id = ${prepared.id})`,
          sql`audience.n = ${expected}`,
        )}`),
      db.insert(notifications)
        .select(sql`select 'notice:' || ${prepared.id} || ':' || ${users.id}, ${users.id}, 'in_app', ${prepared.deliveredTitle}, ${deliveredBody}, null, ${now}, ${now}
        from users where ${and(eligible, own)}`),
      db.insert(noticeRecipients)
        .select(sql`select ${prepared.id}, ${users.id}, 'notice:' || ${prepared.id} || ':' || ${users.id}
        from users where ${and(eligible, own)}`),
    ]);
  } catch (error) {
    if (!uniqueFailure(error)) throw error;
  }
  const saved = await replay(principal, prepared.id, prepared.hash);
  if (!saved) {
    await liveStaff(principal);
    throw new NoticeConflict();
  }
  await liveStaff(principal);
  return { notice: saved.notice, replayed: false };
}

export async function sendNotice(principal: Principal, value: SendNoticeInput): Promise<NoticeSendResult> {
  const actor = await liveStaff(principal);
  const input = sendNoticeSchema.parse(value);
  const hash = await digest(JSON.stringify({ actor: principal.id, school: principal.schoolId, input }));
  const prior = await replay(principal, input.clientRequestId, hash);
  if (prior) return prior;
  let label: string,
    roles: string,
    classId: string | null = null;
  if (input.audience.kind === 'class') {
    classId = input.audience.classId;
    roles = input.audience.roles;
    label = await classLabel(principal, classId, input.audience.roles);
  } else {
    roles = 'selected';
    label = `${input.audience.userIds.length} selected ${input.audience.userIds.length === 1 ? 'person' : 'people'}`;
  }
  return deliver(principal, actor, {
    id: input.clientRequestId,
    audience:
      input.audience.kind === 'class'
        ? { kind: 'class', classId: classId!, roles: input.audience.roles }
        : { kind: 'recipients', userIds: input.audience.userIds },
    kind: input.audience.kind,
    classId,
    roles,
    label,
    title: input.title,
    body: input.body,
    deliveredTitle: input.title,
    deliveredBody: input.body,
    correctsId: null,
    reason: null,
    hash,
  });
}

// A correction keeps the original notice untouched and sends a new, clearly
// labelled notice to the people who received the original and are still eligible.
export async function sendNoticeCorrection(
  principal: Principal,
  originalId: string,
  value: NoticeCorrectionInput,
): Promise<NoticeSendResult> {
  const actor = await liveStaff(principal);
  const id = identifier.parse(originalId),
    input = noticeCorrectionSchema.parse(value);
  const [original] = await getDb()
    .select({ id: notices.id, title: notices.title, authorId: notices.authorId, kind: notices.audienceKind })
    .from(notices)
    .where(and(eq(notices.id, id), sentScope(principal)))
    .limit(1);
  if (!original) throw new AccessError('Notice not found', 404);
  const hash = await digest(
    JSON.stringify({ actor: principal.id, school: principal.schoolId, original: id, input }),
  );
  const prior = await replay(principal, input.clientRequestId, hash);
  if (prior) return prior;
  return deliver(principal, actor, {
    id: input.clientRequestId,
    audience: { kind: 'correction', originalId: id },
    kind: 'correction',
    classId: null,
    roles: 'original',
    label: `People who received “${original.title}”`,
    title: input.title,
    body: input.body,
    deliveredTitle: `Correction: ${input.title}`,
    deliveredBody: `This corrects an earlier notice titled “${original.title}”. Reason: ${input.reason}\n\n${input.body}`,
    correctsId: id,
    reason: input.reason,
    hash,
  });
}
