/**
 * Resolvers for space-level configuration overrides.
 * Space admins can restrict which globally-allowed levels are available in their space
 * and set a different default level.
 * Runtime space-admin check enforced as defense-in-depth (all modules share one resolver).
 */

import {
  getSpaceConfig,
  setSpaceConfig,
  deleteSpaceConfig,
} from '../storage/spaceConfigStore';
import { getGlobalConfig } from '../storage/configStore';
import {
  successResponse,
  errorResponse,
  validationError,
} from '../utils/responseHelper';
import { isSpaceAdmin } from '../utils/adminAuth';

/**
 * Resolver: getSpaceConfig
 * Returns the space-level override and the global config for reference.
 *
 * Expected payload: { spaceKey }
 */
export async function getSpaceConfigResolver(req) {
  const { spaceKey } = req.payload;

  if (!spaceKey) {
    return validationError('spaceKey is required');
  }

  try {
    const [spConfig, globalConfig] = await Promise.all([
      getSpaceConfig(spaceKey),
      getGlobalConfig(),
    ]);

    return successResponse({
      spaceConfig: spConfig,
      globalConfig,
    });
  } catch (error) {
    console.error('Error getting space config:', error);
    return errorResponse('Failed to get space configuration', 500);
  }
}

/**
 * Resolver: setSpaceConfig
 * Saves a space-level configuration override.
 * Validates that all allowedLevelIds reference globally-allowed levels.
 *
 * Expected payload: { spaceKey, config: { allowedLevelIds, defaultLevelId } }
 */
export async function setSpaceConfigResolver(req) {
  const { spaceKey, config } = req.payload;

  if (!spaceKey || !config) {
    return validationError('spaceKey and config are required');
  }

  // Verify the caller is a space admin (or Confluence admin)
  const accountId = req.context.accountId;
  if (!accountId || !(await isSpaceAdmin(accountId, spaceKey))) {
    return errorResponse('Space admin access required', 403);
  }

  // Validate against global config
  const globalConfig = await getGlobalConfig();
  const globalAllowedIds = globalConfig.levels
    .filter((l) => l.allowed)
    .map((l) => l.id);

  // Space can only include levels that are globally allowed
  const invalidIds = (config.allowedLevelIds || []).filter(
    (id) => !globalAllowedIds.includes(id),
  );
  if (invalidIds.length > 0) {
    return validationError(
      `Cannot enable levels that are not globally allowed: ${invalidIds.join(', ')}`,
    );
  }

  try {
    await setSpaceConfig(spaceKey, config);
    return successResponse({ config });
  } catch (error) {
    console.error('Error saving space config:', error);
    return errorResponse('Failed to save space configuration', 500);
  }
}

/**
 * Resolver: resetSpaceConfig
 * Removes the space-level override, reverting to global defaults.
 *
 * Expected payload: { spaceKey }
 */
export async function resetSpaceConfigResolver(req) {
  const { spaceKey } = req.payload;

  if (!spaceKey) {
    return validationError('spaceKey is required');
  }

  // Verify the caller is a space admin (or Confluence admin)
  const accountId = req.context.accountId;
  if (!accountId || !(await isSpaceAdmin(accountId, spaceKey))) {
    return errorResponse('Space admin access required', 403);
  }

  try {
    await deleteSpaceConfig(spaceKey);
    return successResponse({
      message: 'Space configuration reset to global defaults.',
    });
  } catch (error) {
    console.error('Error resetting space config:', error);
    return errorResponse('Failed to reset space configuration', 500);
  }
}
