import { sql } from 'drizzle-orm';
import { check, index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { schools, users } from './schema';

// A receipt preserves the originally created, unlinked profile. It deliberately
// does not reference a current profile: later legitimate edits never rewrite it.
export const registryCreationReceipts = sqliteTable(
  'registry_creation_receipts',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    schoolId: text('school_id')
      .notNull()
      .references(() => schools.id),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    profileId: text('profile_id').notNull(),
    reason: text('reason').notNull(),
    requestHash: text('request_hash').notNull(),
    profileSnapshot: text('profile_snapshot').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('registry_creation_receipts_profile').on(table.profileId),
    index('registry_creation_receipts_actor_time').on(table.schoolId, table.createdBy, table.createdAt),
    check('registry_creation_kind', sql`${table.kind} IN ('student', 'guardian')`),
    check(
      'registry_creation_reason',
      sql`length(${table.reason}) BETWEEN 10 AND 500 AND instr(${table.reason}, char(0)) = 0`,
    ),
    check(
      'registry_creation_hash',
      sql`length(${table.requestHash}) = 64 AND ${table.requestHash} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      'registry_creation_snapshot',
      sql`json_valid(${table.profileSnapshot}) AND json_type(${table.profileSnapshot}) = 'object'`,
    ),
  ],
);
