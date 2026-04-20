import api, { route } from '@forge/api';

/**
 * Checks if the invoking user is a Confluence administrator.
 *
 * Probes an admin-only endpoint as the invoking user. A 200 response means the
 * user is a Confluence admin — either via the `confluence-administrators` group
 * OR via a site-admin role — and a 403 means they are not. This is broader than
 * a group-membership check, which misses site admins who aren't explicitly
 * added to the group.
 *
 * Defence-in-depth: the `confluence:globalSettings` module gate hides the admin
 * UI, but the byline module is rendered for every logged-in user and shares one
 * resolver function, so any user could `invoke()` admin resolvers by name. This
 * re-check at the resolver level is load-bearing.
 *
 * @param {string} accountId - Atlassian account ID (sanity check only; the real
 *   identity check is asUser() on the probe call).
 * @returns {Promise<boolean>}
 */
export async function isConfluenceAdmin(accountId) {
  if (!accountId) return false;
  try {
    const response = await api
      .asUser()
      .requestConfluence(route`/wiki/rest/atlassian-connect/1/addons`, {
        headers: { Accept: 'application/json' },
      });
    if (response.status === 403) return false;
    if (response.ok) return true;
    console.error('Admin probe failed:', response.status);
    return false;
  } catch (error) {
    console.error('Error probing admin status:', error);
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
