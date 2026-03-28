/**
 * SQL Schema Migrations for Information Classification audit trail.
 *
 * Uses the Forge migration runner to version database changes.
 * Each migration is idempotent and runs in order on first resolver invocation.
 *
 * Note: Forge SQL supports a subset of MySQL. Column/table COMMENTs and
 * some DDL features may not work. Keep migrations simple.
 */

import { migrationRunner } from '@forge/sql';

// Table: classification_audit — logs every classification change for compliance
// Forge SQL migrations run exactly once per migration name.
// Using same patterns as digital-signature (TIMESTAMP(6), COMMENT).
export const CREATE_AUDIT_TABLE = `
  CREATE TABLE classification_audit (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    pageId BIGINT NOT NULL,
    spaceKey VARCHAR(255) NOT NULL,
    previousLevel VARCHAR(64),
    newLevel VARCHAR(64) NOT NULL,
    classifiedBy VARCHAR(128) NOT NULL,
    classifiedAt TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    recursive TINYINT(1) NOT NULL DEFAULT 0
  )
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
