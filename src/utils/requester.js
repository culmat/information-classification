/**
 * Shared API requester helper.
 * Queue consumers have no user context — pass true to use app permissions.
 * Resolvers called in a user context should pass false (the default).
 */

import api from '@forge/api';

export function getRequester(useApp) {
  return useApp ? api.asApp() : api.asUser();
}
