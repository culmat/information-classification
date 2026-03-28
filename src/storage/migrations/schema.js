/**
 * SQL Schema Migrations for Information Classification audit trail.
 *
 * Uses the Forge migration runner to version database changes.
 * Each migration is idempotent and runs in order on first resolver invocation.
 */

import { migrationRunner } from '@forge/sql';

// Table: classification_audit — logs every classification change for compliance
export const CREATE_AUDIT_TABLE = `
  CREATE TABLE IF NOT EXISTS classification_audit (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    pageId BIGINT NOT NULL COMMENT 'Confluence page ID',
    spaceKey VARCHAR(255) NOT NULL COMMENT 'Confluence space key',
    previousLevel VARCHAR(64) COMMENT 'Previous classification level ID, NULL if first classification',
    newLevel VARCHAR(64) NOT NULL COMMENT 'New classification level ID',
    classifiedBy VARCHAR(128) NOT NULL COMMENT 'Atlassian account ID of user who made the change',
    classifiedAt TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'When the change was made (UTC)',
    recursive BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Whether this was a recursive (sub-pages) operation'
  ) COMMENT = 'Audit trail of all classification changes'
`;

export const CREATE_AUDIT_INDEX_PAGE_ID = `
  CREATE INDEX IF NOT EXISTS idx_audit_pageId ON classification_audit(pageId)
`;

export const CREATE_AUDIT_INDEX_SPACE_KEY = `
  CREATE INDEX IF NOT EXISTS idx_audit_spaceKey ON classification_audit(spaceKey)
`;

export const CREATE_AUDIT_INDEX_CLASSIFIED_AT = `
  CREATE INDEX IF NOT EXISTS idx_audit_classifiedAt ON classification_audit(classifiedAt)
`;

export const CREATE_AUDIT_INDEX_CLASSIFIED_BY = `
  CREATE INDEX IF NOT EXISTS idx_audit_classifiedBy ON classification_audit(classifiedBy)
`;

// Enqueue all migrations in order — each runs exactly once
const migrations = migrationRunner
  .enqueue('v001_create_audit_table', CREATE_AUDIT_TABLE)
  .enqueue('v002_create_audit_index_page_id', CREATE_AUDIT_INDEX_PAGE_ID)
  .enqueue('v003_create_audit_index_space_key', CREATE_AUDIT_INDEX_SPACE_KEY)
  .enqueue('v004_create_audit_index_classified_at', CREATE_AUDIT_INDEX_CLASSIFIED_AT)
  .enqueue('v005_create_audit_index_classified_by', CREATE_AUDIT_INDEX_CLASSIFIED_BY);

/**
 * Run all pending schema migrations.
 * Called during app initialization (first resolver invocation).
 */
export async function runSchemaMigrations() {
  try {
    console.log('Starting database schema migrations...');
    const successfulMigrations = await migrations.run();
    console.log('Migrations applied:', successfulMigrations);

    const migrationHistory = (await migrationRunner.list())
      .map((m) => `${m.id}, ${m.name}, ${m.migratedAt.toUTCString()}`)
      .join('\n');
    console.log('Migration history:\nid, name, migrated_at\n', migrationHistory);

    console.log('Database schema migrations completed successfully');
  } catch (error) {
    console.error('Schema migration failed:', error);
    throw new Error(`Database schema migration failed: ${error.message}`);
  }
}
