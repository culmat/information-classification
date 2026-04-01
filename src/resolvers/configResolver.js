/**
 * Resolvers for global admin configuration.
 * Access control: the confluence:globalSettings module restricts access
 * to Confluence admins at the module level — no additional auth check needed here.
 */

import api, { route } from '@forge/api';
import { getGlobalConfig, setGlobalConfig } from '../storage/configStore';
import { getAuditStatistics, getRecentAuditEntries } from '../storage/auditStore';
import { successResponse, errorResponse, validationError } from '../utils/responseHelper';
import { VALID_COLORS } from '../shared/constants';

/**
 * Resolver: getConfig
 * Returns the global classification configuration.
 */
export async function getConfigResolver(_req) {
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
 * Resolver: getAuditData
 * Returns audit statistics and recent entries for the admin dashboard.
 */
export async function getAuditDataResolver(_req) {
  try {
    const [statistics, recentEntries] = await Promise.all([
      getAuditStatistics(),
      getRecentAuditEntries(20),
    ]);
    return successResponse({ statistics, recentEntries });
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
  // Validate languages
  if (!Array.isArray(config.languages) || config.languages.length === 0) {
    return { valid: false, error: 'At least one content language is required.' };
  }
  const langCodes = config.languages.map((l) => l.code);
  if (!langCodes.includes('en')) {
    return { valid: false, error: 'English (en) must always be included as a content language.' };
  }
  if (new Set(langCodes).size !== langCodes.length) {
    return { valid: false, error: 'Duplicate language codes are not allowed.' };
  }
  for (const lang of config.languages) {
    if (!lang.code || typeof lang.code !== 'string' || !lang.label || typeof lang.label !== 'string') {
      return { valid: false, error: 'Each language must have a code and label.' };
    }
  }

  // Must have levels array
  if (!Array.isArray(config.levels) || config.levels.length === 0) {
    return { valid: false, error: 'At least one classification level is required.' };
  }

  // At least one level must be allowed
  const allowedLevels = config.levels.filter((l) => l.allowed);
  if (allowedLevels.length === 0) {
    return { valid: false, error: 'At least one classification level must be allowed.' };
  }

  // Default level must exist and be allowed
  const defaultLevel = config.levels.find((l) => l.id === config.defaultLevelId);
  if (!defaultLevel) {
    return { valid: false, error: 'Default level must reference an existing level.' };
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
      return { valid: false, error: `Level "${level.id}" must have a name object with language keys.` };
    }
    if (!level.name.en) {
      return { valid: false, error: `Level "${level.id}" must have an English name.` };
    }
    if (!VALID_COLORS.includes(level.color)) {
      return { valid: false, error: `Level "${level.id}" has invalid color "${level.color}". Valid: ${VALID_COLORS.join(', ')}` };
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
 * Resolver: searchPages
 * Searches Confluence pages by title using CQL.
 * Used by the admin UI to pick a Confluence page for link configuration.
 */
export async function searchPagesResolver(req) {
  try {
    const query = req.payload?.query?.trim();
    if (!query || query.length < 2) {
      return successResponse({ results: [] });
    }

    const cql = `type=page AND title~"${query.replace(/"/g, '\\"')}"`;
    const response = await api.asUser().requestConfluence(
      route`/wiki/rest/api/content/search?cql=${cql}&limit=10`,
      { headers: { Accept: 'application/json' } }
    );

    if (!response.ok) {
      console.error('Page search failed:', response.status);
      return successResponse({ results: [] });
    }

    const data = await response.json();
    const results = (data.results || []).map((page) => ({
      id: page.id,
      title: page.title,
      url: page._links?.webui
        ? `${data._links?.base || ''}${page._links.webui}`
        : '',
      space: page.space?.name || '',
    }));

    return successResponse({ results });
  } catch (error) {
    console.error('Error searching pages:', error);
    return successResponse({ results: [] });
  }
}
