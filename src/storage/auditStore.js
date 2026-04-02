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
 * Returns classification distribution for a specific space.
 *
 * @param {string} spaceKey
 * @returns {Promise<Array<{level: string, count: number}>>}
 */
export async function getSpaceClassificationDistribution(spaceKey) {
  const result = await sql.prepare(
    `SELECT newLevel AS level, COUNT(*) AS count
     FROM (
       SELECT pageId, newLevel
       FROM classification_audit a
       WHERE spaceKey = ? AND classifiedAt = (
         SELECT MAX(classifiedAt) FROM classification_audit b WHERE b.pageId = a.pageId
       )
       GROUP BY pageId, newLevel
     ) latest
     GROUP BY level
     ORDER BY count DESC`
  ).bindParams(spaceKey).execute();
  return result.rows;
}

/**
 * Returns monthly classification change counts for a specific space.
 *
 * @param {string} spaceKey
 * @param {number} months - number of months to look back
 * @returns {Promise<Array<{month: string, count: number}>>}
 */
export async function getSpaceMonthlyTrend(spaceKey, months = 12) {
  const result = await sql.prepare(
    `SELECT DATE_FORMAT(classifiedAt, '%Y-%m') AS month, COUNT(*) AS count
     FROM classification_audit
     WHERE spaceKey = ? AND classifiedAt >= DATE_SUB(DATE_FORMAT(NOW(), '%Y-%m-01'), INTERVAL ? MONTH)
     GROUP BY month
     ORDER BY month ASC`
  ).bindParams(spaceKey, months).execute();
  return result.rows;
}

/**
 * Returns audit statistics for a specific space.
 *
 * @param {string} spaceKey
 * @returns {Promise<Object>} { totalChanges, changesThisMonth }
 */
export async function getSpaceAuditStatistics(spaceKey) {
  const totalResult = await sql.prepare(
    'SELECT COUNT(*) as total FROM classification_audit WHERE spaceKey = ?'
  ).bindParams(spaceKey).execute();
  const monthResult = await sql.prepare(
    "SELECT COUNT(*) as total FROM classification_audit WHERE spaceKey = ? AND classifiedAt >= DATE_FORMAT(NOW(), '%Y-%m-01')"
  ).bindParams(spaceKey).execute();

  return {
    totalChanges: totalResult.rows[0]?.total || 0,
    changesThisMonth: monthResult.rows[0]?.total || 0,
  };
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

/**
 * Returns the current classification distribution (latest level per page, grouped by level).
 * Used for the admin dashboard DonutChart.
 *
 * @returns {Promise<Array<{level: string, count: number}>>}
 */
export async function getClassificationDistribution() {
  const result = await sql.prepare(
    `SELECT newLevel AS level, COUNT(*) AS count
     FROM (
       SELECT pageId, newLevel
       FROM classification_audit a
       WHERE classifiedAt = (
         SELECT MAX(classifiedAt) FROM classification_audit b WHERE b.pageId = a.pageId
       )
       GROUP BY pageId, newLevel
     ) latest
     GROUP BY level
     ORDER BY count DESC`
  ).execute();
  return result.rows;
}

/**
 * Returns monthly classification change counts for the last N months.
 * Used for the admin dashboard BarChart.
 *
 * @param {number} months - number of months to look back (default 12)
 * @returns {Promise<Array<{month: string, count: number}>>}
 */
export async function getMonthlyTrend(months = 12) {
  const result = await sql.prepare(
    `SELECT DATE_FORMAT(classifiedAt, '%Y-%m') AS month, COUNT(*) AS count
     FROM classification_audit
     WHERE classifiedAt >= DATE_SUB(DATE_FORMAT(NOW(), '%Y-%m-01'), INTERVAL ? MONTH)
     GROUP BY month
     ORDER BY month ASC`
  ).bindParams(months).execute();
  return result.rows;
}

/**
 * Returns audit entries filtered by optional date range.
 *
 * @param {Object} filters
 * @param {string|null} filters.startDate - ISO date string (inclusive)
 * @param {string|null} filters.endDate - ISO date string (inclusive, end of day)
 * @param {number} filters.limit - max entries (default 100)
 * @returns {Promise<Array>} audit entries, newest first
 */
export async function getFilteredAuditEntries({ startDate, endDate, limit = 100 } = {}) {
  let query = 'SELECT id, pageId, spaceKey, previousLevel, newLevel, classifiedBy, classifiedAt, isRecursive FROM classification_audit';
  const conditions = [];
  const params = [];

  if (startDate) {
    conditions.push('classifiedAt >= ?');
    params.push(startDate);
  }
  if (endDate) {
    conditions.push('classifiedAt < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(endDate);
  }
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  query += ' ORDER BY classifiedAt DESC LIMIT ?';
  params.push(limit);

  const stmt = sql.prepare(query);
  if (params.length > 0) stmt.bindParams(...params);
  const result = await stmt.execute();
  return result.rows;
}

/**
 * Deletes all audit entries for a given page (used when a page is permanently purged).
 *
 * @param {number} pageId - Confluence page ID
 * @returns {Promise<number>} number of deleted rows
 */
export async function deleteAuditForPage(pageId) {
  const result = await sql.prepare(
    'DELETE FROM classification_audit WHERE pageId = ?'
  ).bindParams(pageId).execute();
  return result.affectedRows || 0;
}
