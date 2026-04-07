import api, { route } from '@forge/api';

/**
 * Checks if the given user is a Confluence administrator.
 * Used to gate access to admin-only resolvers (config changes, audit viewing).
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
