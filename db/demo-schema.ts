import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Operator-enabled, synthetic installation evidence. Never a school identity.
export const demoInstallations = sqliteTable('demo_installations', {
  id: text('id').primaryKey(),
  // The claim is inserted first in one atomic pristine-database seed batch.
  // Deliberately no immediate FK: users/profiles retain their normal school FKs.
  schoolId: text('school_id').notNull(),
  seedNonce: text('seed_nonce').notNull(),
  createdAt: text('created_at').notNull(),
}, table => [uniqueIndex('demo_installations_school').on(table.schoolId)]);
