/**
 * Service for checking page restrictions in Confluence.
 * Used to warn users when a classification level requires page protection
 * but the page has no view restrictions set.
 *
 * Checks both direct restrictions on the page itself and inherited
 * restrictions from ancestor pages.
 */

import api, { route } from '@forge/api';

/**
 * Checks whether a single page has direct view restrictions.
 *
 * @param {string} pageId - Confluence page ID
 * @returns {Promise<boolean>} true if the page has direct view restrictions
 */
async function checkDirectRestrictions(pageId) {
  const response = await api
    .asUser()
    .requestConfluence(
      route`/wiki/rest/api/content/${pageId}/restriction/byOperation/read`,
      { headers: { Accept: 'application/json' } },
    );

  if (!response.ok) {
    return false;
  }

  const data = await response.json();
  const hasUserRestrictions = data.restrictions?.user?.results?.length > 0;
  const hasGroupRestrictions = data.restrictions?.group?.results?.length > 0;
  return hasUserRestrictions || hasGroupRestrictions;
}

/**
 * Fetches ancestor page IDs ordered from nearest parent to root.
 *
 * @param {string} pageId - Confluence page ID
 * @returns {Promise<string[]>} ancestor IDs, nearest-first
 */
export async function getAncestorIds(pageId) {
  const response = await api
    .asUser()
    .requestConfluence(
      route`/wiki/api/v2/pages/${pageId}/ancestors?limit=250`,
      { headers: { Accept: 'application/json' } },
    );

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  // API returns root → parent; reverse for nearest-first traversal
  return (data.results || []).map((a) => String(a.id)).reverse();
}

/**
 * Checks whether a page has any view restrictions (direct or inherited).
 * First checks the page itself, then walks up the ancestor chain.
 *
 * @param {string} pageId - Confluence page ID
 * @returns {Promise<boolean>} true if the page has view restrictions
 */
export async function hasViewRestrictions(pageId) {
  try {
    // Check direct restrictions first (fast path)
    if (await checkDirectRestrictions(pageId)) {
      return true;
    }

    // Check ancestor chain for inherited restrictions
    const ancestorIds = await getAncestorIds(pageId);
    for (const ancestorId of ancestorIds) {
      if (await checkDirectRestrictions(ancestorId)) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking page restrictions:', error);
    return false;
  }
}
