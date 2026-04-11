import api, { route } from '@forge/api';

/**
 * Checks if the given user is a Confluence administrator.
 * Used to gate access to admin-only resolvers (config changes, audit viewing).
 * Defence-in-depth: module gating controls UI visibility, but all modules share
 * one resolver function so we verify at runtime too.
 *
 * @param {string} accountId - Atlassian account ID
 * @returns {Promise<boolean>} true if user is in confluence-administrators group
 */
export async function isConfluenceAdmin(accountId) {
  try {
    const response = await api
      .asApp()
      .requestConfluence(
        route`/wiki/rest/api/user/memberof?accountId=${accountId}`,
        {
          headers: { Accept: 'application/json' },
        },
      );

    if (!response.ok) {
      console.error('Failed to check admin status:', response.status);
      return false;
    }

    const data = await response.json();
    return data.results.some(
      (group) => group.name === 'confluence-administrators',
    );
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

/**
 * Checks if the given user has admin permissions for a Confluence space.
 * Uses the space permissions v2 API to verify the user can administer the space.
 * Falls back to false on any error (conservative — denies access).
 *
 * @param {string} accountId - Atlassian account ID
 * @param {string} spaceKey - Confluence space key
 * @returns {Promise<boolean>} true if user is a space admin
 */
export async function isSpaceAdmin(accountId, spaceKey) {
  try {
    // Check if the user can administer this space by querying space permissions.
    // The v1 endpoint returns permissions grouped by operation type.
    const response = await api
      .asApp()
      .requestConfluence(route`/wiki/rest/api/space/${spaceKey}/permission`, {
        headers: { Accept: 'application/json' },
      });

    if (!response.ok) {
      // If we can't check, also try the simpler approach: check if user is a
      // site-level Confluence admin (they can manage any space).
      return await isConfluenceAdmin(accountId);
    }

    const permissions = await response.json();
    // Look for 'administer' operation granted to this user (directly or via group)
    for (const perm of permissions || []) {
      if (
        perm.operation?.key === 'administer' &&
        perm.subjects?.user?.results?.some((u) => u.accountId === accountId)
      ) {
        return true;
      }
    }

    // Confluence admins can always manage spaces
    return await isConfluenceAdmin(accountId);
  } catch (error) {
    console.error('Error checking space admin status:', error);
    return false;
  }
}
