/**
 * Resolver backing the admin About panel.
 *
 * Returns the live Forge-assigned version (from `getAppContext()`), plus a
 * "latest deployed" reference read from the `LATEST_VERSION` env var. The
 * env var is a single semver string maintained by CI; it is only ever
 * overwritten with a strictly-newer value, so backports to an older major
 * never clobber a live pointer to a newer major.
 *
 * All failure modes degrade silently — the panel falls back to showing the
 * bundled commit SHA only.
 *
 * Access control: defense-in-depth. `confluence:globalSettings` gates the UI
 * to Confluence admins, but resolvers are shared across modules, so we
 * re-check.
 */

import { getAppContext } from '@forge/api';
import { isConfluenceAdmin } from '../utils/adminAuth';
import { successResponse, errorResponse } from '../utils/responseHelper';

/** Extract the major-version int from a canonical "X.Y.Z" string. */
function majorOf(canonicalVersion) {
  return Number.parseInt(canonicalVersion.split('.')[0], 10);
}

export async function getVersionInfoResolver(req) {
  const accountId = req?.context?.accountId;
  if (!accountId || !(await isConfluenceAdmin(accountId))) {
    return errorResponse('Admin access required', 403);
  }

  let appContext;
  try {
    appContext = getAppContext();
  } catch (e) {
    // Shouldn't happen inside a managed invocation; handle defensively.
    console.warn('getAppContext failed:', e?.message || e);
    return successResponse({
      myVersion: null,
      latestVersion: null,
      status: 'unknown',
      environmentType: null,
      license: null,
    });
  }

  const myVersion = appContext.appVersion || null;
  const envLatest = (process.env.LATEST_VERSION || '').trim();
  // If the env var is missing or malformed, fall back to my own version so
  // comparison yields `current` (no false-positive upgrade prompts).
  const latestVersion =
    envLatest && /^\d+\.\d+\.\d+$/.test(envLatest) ? envLatest : myVersion;

  let status = 'unknown';
  if (myVersion && latestVersion) {
    status =
      majorOf(latestVersion) > majorOf(myVersion) ? 'older-major' : 'current';
  }

  return successResponse({
    myVersion,
    latestVersion,
    status,
    environmentType: appContext.environmentType || null,
    license: appContext.license || null,
  });
}
