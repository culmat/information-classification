/**
 * Resolvers for audit history.
 * Used by the byline History tab and space Statistics tab.
 */

import {
  getAuditLogForPage,
  getAuditLogForSpace,
  getSpaceAuditStatistics,
  getSpaceClassificationDistribution,
  getSpaceMonthlyTrend,
} from '../storage/auditStore';
import { successResponse, errorResponse, validationError } from '../utils/responseHelper';

/**
 * Resolver: getPageAuditHistory
 * Returns audit entries for a specific page.
 *
 * Expected payload: { pageId }
 */
export async function getPageAuditHistoryResolver(req) {
  const { pageId } = req.payload;

  if (!pageId) {
    return validationError('pageId is required');
  }

  try {
    const entries = await getAuditLogForPage(Number(pageId), 50);
    return successResponse({ entries });
  } catch (error) {
    console.error('Error getting page audit history:', error);
    return errorResponse('Failed to get audit history', 500);
  }
}

/**
 * Resolver: getSpaceAuditData
 * Returns audit entries and statistics for a specific space.
 *
 * Expected payload: { spaceKey, limit, offset }
 */
export async function getSpaceAuditDataResolver(req) {
  const { spaceKey, limit, offset } = req.payload;

  if (!spaceKey) {
    return validationError('spaceKey is required');
  }

  try {
    const [statistics, entries, distribution, monthlyTrend] = await Promise.all([
      getSpaceAuditStatistics(spaceKey),
      getAuditLogForSpace(spaceKey, limit || 50, offset || 0),
      getSpaceClassificationDistribution(spaceKey),
      getSpaceMonthlyTrend(spaceKey, 12),
    ]);
    return successResponse({ statistics, entries, distribution, monthlyTrend });
  } catch (error) {
    console.error('Error getting space audit data:', error);
    return errorResponse('Failed to get space audit data', 500);
  }
}
