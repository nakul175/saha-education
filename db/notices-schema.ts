import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  index,
  primaryKey,
  check,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';
import { classes, notifications, schools, users } from './schema';

// A sent notice is the immutable staff-side record of one in-app broadcast.
// Each recipient still receives an ordinary row in `notifications`; nothing
// here sends email/SMS or contacts any provider.
export const notices = sqliteTable(
  'notices',
  {
    id: text('id').primaryKey(),
    schoolId: text('school_id')
      .notNull()
      .references(() => schools.id),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id),
    audienceKind: text('audience_kind').notNull(),
    classId: text('class_id').references(() => classes.id),
    audienceRoles: text('audience_roles').notNull(),
    audienceLabel: text('audience_label').notNull(),
    senderLabel: text('sender_label').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    recipientCount: integer('recipient_count').notNull(),
    correctsNoticeId: text('corrects_notice_id').references((): AnySQLiteColumn => notices.id),
    correctionReason: text('correction_reason'),
    requestHash: text('request_hash').notNull(),
    attemptId: text('attempt_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('notices_school_time').on(t.schoolId, t.createdAt),
    index('notices_author_time').on(t.authorId, t.createdAt),
    index('notices_corrects').on(t.correctsNoticeId),
    check('notices_kind', sql`${t.audienceKind} IN ('class', 'recipients', 'correction')`),
    check(
      'notices_roles',
      sql`${t.audienceRoles} IN ('guardians', 'learners', 'both', 'selected', 'original')`,
    ),
    check('notices_title', sql`length(trim(${t.title})) BETWEEN 1 AND 120`),
    check('notices_body', sql`length(trim(${t.body})) BETWEEN 1 AND 2000`),
    check(
      'notices_count',
      sql`typeof(${t.recipientCount}) = 'integer' AND ${t.recipientCount} BETWEEN 1 AND 500`,
    ),
    check(
      'notices_class',
      sql`(${t.audienceKind} = 'class' AND ${t.classId} IS NOT NULL) OR (${t.audienceKind} <> 'class' AND ${t.classId} IS NULL)`,
    ),
    check(
      'notices_correction',
      sql`(${t.audienceKind} = 'correction' AND ${t.correctsNoticeId} IS NOT NULL AND length(trim(${t.correctionReason})) BETWEEN 10 AND 500) OR (${t.audienceKind} <> 'correction' AND ${t.correctsNoticeId} IS NULL AND ${t.correctionReason} IS NULL)`,
    ),
  ],
);

export const noticeRecipients = sqliteTable(
  'notice_recipients',
  {
    noticeId: text('notice_id')
      .notNull()
      .references(() => notices.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    notificationId: text('notification_id')
      .notNull()
      .references(() => notifications.id),
  },
  (t) => [primaryKey({ columns: [t.noticeId, t.userId] }), index('notice_recipients_user').on(t.userId)],
);

export type SelectNotice = typeof notices.$inferSelect;
