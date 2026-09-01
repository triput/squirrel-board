import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const ideas = sqliteTable('ideas', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  why: text('why').notNull(),
  status: text('status').notNull().default('Captured'),
  nextAction: text('next_action'),
  notes: text('notes'),
  source: text('source').notNull().default('Human'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const proposals = sqliteTable('proposals', {
  id: text('id').primaryKey(),
  ideaId: text('idea_id').notNull(),
  field: text('field').notNull(),
  proposedValue: text('proposed_value').notNull(),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('Pending'),
  createdAt: integer('created_at').notNull(),
  resolvedAt: integer('resolved_at'),
});

export const decisions = sqliteTable('decisions', {
  id: text('id').primaryKey(),
  ideaId: text('idea_id'),
  decision: text('decision').notNull(),
  reason: text('reason').notNull(),
  source: text('source').notNull().default('Human'),
  createdAt: integer('created_at').notNull(),
});
