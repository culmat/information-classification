/**
 * Service for checking page restrictions in Confluence.
 * Used to warn users when a classification level requires page protection
 * but the page has no view restrictions set.
 */

import api, { route } from '@forge/api';

/**
 * Checks whether a page has any view restrictions (direct or inherited).
 *
 * @param {string} pageId - Confluence page ID
 * @returns {Promise<boolean>} true if the page has view restrictions
 */
export async function hasViewRestrictions(pageId) {
  try {
    const response = await api
      .asUser()
      .requestConfluence(
        route`/wiki/rest/api/content/${pageId}/restriction/byOperation/read`,
        { headers: { Accept: 'application/json' } }
      );

    if (!response.ok) {
      console.error('Failed to check page restrictions:', response.status);
      // If we can't check, assume not restricted (safer to warn than to miss)
      return false;
    }

    const data = await response.json();

    // Check if there are any user or group restrictions for read operations
    const hasUserRestrictions = data.restrictions?.user?.results?.length > 0;
    const hasGroupRestrictions = data.restrictions?.group?.results?.length > 0;

    return hasUserRestrictions || hasGroupRestrictions;
  } catch (error) {
    console.error('Error checking page restrictions:', error);
    return false;
  }
}
