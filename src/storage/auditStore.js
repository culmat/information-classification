/**
 * Audit trail store using Forge SQL.
 * Logs every classification change for compliance and admin reporting.
 *
 * Uses sql.prepare() for parameterized queries (prevents SQL injection).
 */

import { sql } from '@forge/sql';

/**
 * Records a classification change in the audit trail.
 *
 * @param {Object} params
 * @param {number} params.pageId - Confluence page ID
 * @param {string} params.spaceKey - Confluence space key
 * @param {string|null} params.previousLevel - previous level ID, or null if first classification
 * @param {string} params.newLevel - new level ID
 * @param {string} params.classifiedBy - Atlassian account ID
 * @param {boolean} params.recursive - whether this was a recursive operation
 * @returns {Promise<void>}
 */
export async function logClassificationChange({
  pageId,
  spaceKey,
  previousLevel,
  newLevel,
  classifiedBy,
  recursive = false,
}) {
  await sql.prepare(
    'INSERT INTO classification_audit (pageId, spaceKey, previousLevel, newLevel, classifiedBy, isRecursive) VALUES (?, ?, ?, ?, ?, ?)'
  ).bindParams(pageId, spaceKey, previousLevel, newLevel, classifiedBy, recursive ? 1 : 0).execute();
}

/**
 * Retrieves the audit history for a specific page.
 *
 * @param {number} pageId - Confluence page ID
 * @param {number} limit - max entries to return
 * @returns {Promise<Array>} audit entries, newest first
 */
export async function getAuditLogForPage(pageId, limit = 50) {
  const result = await sql.prepare(
    'SELECT id, pageId, spaceKey, previousLevel, newLevel, classifiedBy, classifiedAt, isRecursive FROM classification_audit WHERE pageId = ? ORDER BY classifiedAt DESC LIMIT ?'
  ).bindParams(pageId, limit).execute();
  return result.rows;
}

/**
 * Retrieves the audit history for a space (admin view).
 *
 * @param {string} spaceKey - Confluence space key
 * @param {number} limit - max entries to return
 * @param {number} offset - pagination offset
 * @returns {Promise<Array>} audit entries, newest first
 */
export async function getAuditLogForSpace(spaceKey, limit = 50, offset = 0) {
  const result = await sql.prepare(
    'SELECT id, pageId, spaceKey, previousLevel, newLevel, classifiedBy, classifiedAt, isRecursive FROM classification_audit WHERE spaceKey = ? ORDER BY classifiedAt DESC LIMIT ? OFFSET ?'
  ).bindParams(spaceKey, limit, offset).execute();
  return result.rows;
}

/**
 * Retrieves global audit statistics for the admin dashboard.
 *
 * @returns {Promise<Object>} { totalChanges, changesThisMonth }
 */
export async function getAuditStatistics() {
  const totalResult = await sql.prepare(
    'SELECT COUNT(*) as total FROM classification_audit'
  ).execute();
  const monthResult = await sql.prepare(
    "SELECT COUNT(*) as total FROM classification_audit WHERE classifiedAt >= DATE_FORMAT(NOW(), '%Y-%m-01')"
  ).execute();

  return {
    totalChanges: totalResult.rows[0]?.total || 0,
    changesThisMonth: monthResult.rows[0]?.total || 0,
  };
}

/**
 * Retrieves the most recent audit entries across all spaces (admin dashboard).
 *
 * @param {number} limit - max entries to return
 * @returns {Promise<Array>} audit entries, newest first
 */
export async function getRecentAuditEntries(limit = 20) {
  const result = await sql.prepare(
    'SELECT id, pageId, spaceKey, previousLevel, newLevel, classifiedBy, classifiedAt, isRecursive FROM classification_audit ORDER BY classifiedAt DESC LIMIT ?'
  ).bindParams(limit).execute();
  return result.rows;
}
