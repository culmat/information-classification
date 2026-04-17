/**
 * Resolvers for global admin configuration.
 * Access control: module-level gating (confluence:globalSettings) restricts UI
 * visibility to Confluence admins, but all modules share one resolver function,
 * so we enforce admin access at runtime as defense-in-depth.
 */

import api, { route } from '@forge/api';
import { getGlobalConfig, setGlobalConfig } from '../storage/configStore';
import { isConfluenceAdmin } from '../utils/adminAuth';
import { findPagesByLevel } from '../services/classificationService';
import {
  successResponse,
  errorResponse,
  validationError,
} from '../utils/responseHelper';
import { VALID_COLORS, isValidSpaceKey } from '../shared/constants';
import { enqueueJob } from '../utils/jobQueue';

/**
 * Resolver: getConfig
 * Returns the global classification configuration.
 */
export async function getConfigResolver(req) {
  const accountId = req.context.accountId;
  if (!accountId || !(await isConfluenceAdmin(accountId))) {
    return errorResponse('Admin access required', 403);
  }

  try {
    const config = await getGlobalConfig();
    return successResponse({ config });
  } catch (error) {
    console.error('Error getting config:', error);
    return errorResponse('Failed to get configuration', 500);
  }
}

/**
 * Resolver: setConfig
 * Updates the global classification configuration.
 * Validates the config before saving.
 */
export async function setConfigResolver(req) {
  const accountId = req.context.accountId;
  if (!accountId || !(await isConfluenceAdmin(accountId))) {
    return errorResponse('Admin access required', 403);
  }

  const { config } = req.payload;
  if (!config) {
    return validationError('config is required');
  }

  // Validate the configuration
  const validationResult = validateConfig(config);
  if (!validationResult.valid) {
    return validationError(validationResult.error);
  }

  try {
    await setGlobalConfig(config);
    return successResponse({ config });
  } catch (error) {
    console.error('Error saving config:', error);
    return errorResponse('Failed to save configuration', 500);
  }
}

/**
 * Runs a CQL search and returns { totalSize, results }.
 */
async function cqlSearch(cql, limit = 0, { expandProperties = false } = {}) {
  const expand = expandProperties
    ? 'content.space,content.metadata.properties.culmat_page_classification'
    : 'content.space';
  const response = await api
    .asUser()
    .requestConfluence(
      route`/wiki/rest/api/search?cql=${cql}&limit=${limit}&expand=${expand}`,
      { headers: { Accept: 'application/json' } },
    );
  if (!response.ok) return { totalSize: 0, results: [] };
  const data = await response.json();
  return {
    totalSize: data.totalSize || 0,
    results: (data.results || []).map((r) => {
      const result = {
        id: String(r.content?.id),
        title: r.content?.title,
        spaceKey: r.content?.space?.key || r.resultGlobalContainer?.title,
        url: r.url || r.content?._links?.webui,
        lastModified: r.lastModified || r.content?.version?.when || null,
      };
      if (expandProperties) {
        const props =
          r.content?.metadata?.properties?.culmat_page_classification;
        result.levelId = props?.value?.level || null;
        result.classifiedAt = props?.value?.classifiedAt || null;
      }
      return result;
    }),
  };
}

/**
 * Resolver: getAuditData
 * Returns CQL-based classification statistics.
 * Distribution per level, total pages, coverage, and recently classified pages.
 *
 * Scoping options (all optional, combine as needed):
 * - spaceKey: restrict to a single space
 * - ancestorId: restrict to a page tree (the page and its descendants)
 * - source: 'macro' bypasses admin check (CQL runs as user, enforcing visibility)
 */
export async function getAuditDataResolver(req) {
  const { spaceKey, ancestorId, source, recentLimit } = req.payload || {};

  // Macros run as the viewing user — CQL already enforces page visibility.
  // Only require admin for unrestricted global queries from the admin panel.
  if (!spaceKey && !ancestorId && source !== 'macro') {
    const accountId = req.context.accountId;
    if (!accountId || !(await isConfluenceAdmin(accountId))) {
      return errorResponse('Admin access required', 403);
    }
  }

  // Validate inputs before embedding in CQL
  if (spaceKey && !isValidSpaceKey(spaceKey)) {
    return validationError('Invalid space key format');
  }
  if (ancestorId && !/^\d+$/.test(String(ancestorId))) {
    return validationError('Invalid ancestor ID format');
  }

  try {
    const config = await getGlobalConfig();
    const levels = config.levels || [];
    const spaceFilter = spaceKey ? ` AND space="${spaceKey}"` : '';
    // ancestor= excludes the page itself, so include it with (id=X OR ancestor=X)
    const ancestorFilter = ancestorId
      ? ` AND (id=${ancestorId} OR ancestor=${ancestorId})`
      : '';
    const scopeFilter = `${spaceFilter}${ancestorFilter}`;

    // Count pages per level + total pages in parallel
    const countPromises = levels.map((l) =>
      cqlSearch(
        `type=page${scopeFilter} AND culmat_classification_level="${l.id}"`,
      ).then(({ totalSize }) => ({ level: l.id, count: totalSize })),
    );
    const totalPagesPromise = cqlSearch(`type=page${scopeFilter}`);
    // Build an OR query for all configured levels instead of "is not null",
    // which is not reliably supported by content property search aliases.
    const levelFilter = levels
      .map((l) => `culmat_classification_level="${l.id}"`)
      .join(' OR ');
    // Sort by classification date (not page lastModified) so newly classified
    // pages appear at the top even if their content hasn't been edited recently.
    const recentCql = levelFilter
      ? `type=page${scopeFilter} AND (${levelFilter}) ORDER BY culmat_classification_date DESC`
      : `type=page${scopeFilter}`;
    const limit = Math.min(Math.max(parseInt(recentLimit, 10) || 20, 1), 50);
    const recentPromise = cqlSearch(recentCql, limit, {
      expandProperties: true,
    });

    const [distribution, totalPagesResult, recentResult] = await Promise.all([
      Promise.all(countPromises),
      totalPagesPromise,
      recentPromise,
    ]);

    const classifiedPages = distribution.reduce((sum, d) => sum + d.count, 0);

    return successResponse({
      distribution,
      totalPages: totalPagesResult.totalSize,
      classifiedPages,
      recentPages: recentResult.results,
      // Include level metadata so macros can render charts without calling getConfig
      levels: levels.map((l) => ({ id: l.id, color: l.color })),
      defaultLevelId: config.defaultLevelId,
    });
  } catch (error) {
    console.error('Error getting audit data:', error);
    return errorResponse('Failed to get audit data', 500);
  }
}

/**
 * Validates the global configuration object.
 * Ensures data integrity before saving.
 *
 * @param {Object} config - the config to validate
 * @returns {{ valid: boolean, error?: string }}
 */
function validateConfig(config) {
  // Validate languages — English is always hardcoded at position 0
  if (!Array.isArray(config.languages) || config.languages.length === 0) {
    return {
      valid: false,
      error: 'At least one content language is required.',
    };
  }
  const langCodes = config.languages.map((l) => l.code);
  if (new Set(langCodes).size !== langCodes.length) {
    return { valid: false, error: 'Duplicate language codes are not allowed.' };
  }
  for (const lang of config.languages) {
    if (
      !lang.code ||
      typeof lang.code !== 'string' ||
      !lang.label ||
      typeof lang.label !== 'string'
    ) {
      return {
        valid: false,
        error: 'Each language must have a code and label.',
      };
    }
  }

  // Must have levels array
  if (!Array.isArray(config.levels) || config.levels.length === 0) {
    return {
      valid: false,
      error: 'At least one classification level is required.',
    };
  }

  // At least one level must be allowed
  const allowedLevels = config.levels.filter((l) => l.allowed);
  if (allowedLevels.length === 0) {
    return {
      valid: false,
      error: 'At least one classification level must be allowed.',
    };
  }

  // Default level must exist and be allowed
  const defaultLevel = config.levels.find(
    (l) => l.id === config.defaultLevelId,
  );
  if (!defaultLevel) {
    return {
      valid: false,
      error: 'Default level must reference an existing level.',
    };
  }
  if (!defaultLevel.allowed) {
    return { valid: false, error: 'Default level must be an allowed level.' };
  }

  // Level IDs must be unique
  const ids = config.levels.map((l) => l.id);
  if (new Set(ids).size !== ids.length) {
    return { valid: false, error: 'Classification level IDs must be unique.' };
  }

  // Validate each level
  for (const level of config.levels) {
    if (!level.id || typeof level.id !== 'string') {
      return { valid: false, error: 'Each level must have a string ID.' };
    }
    if (!level.name || typeof level.name !== 'object') {
      return {
        valid: false,
        error: `Level "${level.id}" must have a name object with language keys.`,
      };
    }
    if (!level.name.en) {
      return {
        valid: false,
        error: `Level "${level.id}" must have an English name.`,
      };
    }
    if (!VALID_COLORS.includes(level.color)) {
      return {
        valid: false,
        error: `Level "${level.id}" has invalid color "${level.color}". Valid: ${VALID_COLORS.join(', ')}`,
      };
    }
  }

  // Validate contacts (optional)
  if (config.contacts && !Array.isArray(config.contacts)) {
    return { valid: false, error: 'Contacts must be an array.' };
  }

  // Validate links (optional)
  if (config.links && !Array.isArray(config.links)) {
    return { valid: false, error: 'Links must be an array.' };
  }

  return { valid: true };
}

/**
 * Resolver: countLevelUsage
 * Returns the number of pages classified with a given level.
 */
export async function countLevelUsageResolver(req) {
  const accountId = req.context.accountId;
  if (!accountId || !(await isConfluenceAdmin(accountId))) {
    return errorResponse('Admin access required', 403);
  }

  const { levelId, spaceKey } = req.payload || {};
  if (!levelId) return validationError('levelId is required');

  try {
    const { totalSize } = await findPagesByLevel(levelId, 0, 0, {
      spaceKey: spaceKey || null,
    });
    return successResponse({ count: totalSize });
  } catch (error) {
    console.error('Error counting level usage:', error);
    return errorResponse('Failed to count pages', 500);
  }
}

/**
 * Resolver: reclassifyLevel
 * Reclassifies all pages from one level to another via the async queue.
 */
export async function reclassifyLevelResolver(req) {
  const accountId = req.context.accountId;
  if (!accountId || !(await isConfluenceAdmin(accountId))) {
    return errorResponse('Admin access required', 403);
  }

  const { fromLevelId, toLevelId } = req.payload || {};
  const locale = req.context.locale || 'en';

  if (!fromLevelId || !toLevelId)
    return validationError('fromLevelId and toLevelId are required');
  if (fromLevelId === toLevelId)
    return validationError('fromLevelId and toLevelId must differ');

  try {
    const { totalSize } = await findPagesByLevel(fromLevelId, 0);
    if (totalSize === 0) return successResponse({ count: 0 });

    const { jobId } = await enqueueJob(
      `reclassify-${fromLevelId}`,
      {
        fromLevelId,
        toLevelId,
        accountId,
        locale,
        totalToClassify: totalSize,
      },
      `reclassify-${fromLevelId}`,
      totalSize,
    );

    return successResponse({ count: totalSize, asyncJobId: jobId });
  } catch (error) {
    console.error('Error reclassifying level:', error);
    return errorResponse('Failed to start reclassification', 500);
  }
}
