/**
 * Label service — reads, searches, and removes Confluence page labels.
 * Uses v1 REST API for write operations (v2 is read-only as of 2025).
 * Uses v2 API for listing all labels (supports pagination).
 */

import api, { route } from '@forge/api';
import { buildSpaceFilter, isValidLabel } from '../shared/constants';
import { getRequester } from '../utils/requester';

/**
 * Finds pages with a specific label via CQL.
 * spaceKey supports comma-separated values: "IC, DEV".
 * Returns { results: [{ id, title }], totalSize }.
 */
export async function findPagesByLabel(
  labelName,
  limit = 0,
  startIndex = 0,
  spaceKey = null,
  { asApp: useApp = false } = {},
) {
  // Defence-in-depth: reject labels containing characters that could break out
  // of the CQL string literal. Confluence's own label rules already forbid
  // these, but validating here makes the guarantee explicit.
  if (!isValidLabel(labelName)) {
    console.warn(`Invalid label rejected: ${labelName}`);
    return { results: [], totalSize: 0 };
  }
  const cql = `type=page AND label = "${labelName}"${buildSpaceFilter(spaceKey)}`;
  const requester = getRequester(useApp);
  const response = await requester.requestConfluence(
    route`/wiki/rest/api/search?cql=${cql}&limit=${limit}&start=${startIndex}`,
    { headers: { Accept: 'application/json' } },
  );
  if (!response.ok) return { results: [], totalSize: 0 };
  const data = await response.json();
  return {
    results: (data.results || []).map((r) => ({
      id: String(r.content.id),
      title: r.content.title,
    })),
    totalSize: data.totalSize || 0,
  };
}

/**
 * Counts unique pages matching ANY of the given labels via a single CQL OR query.
 * Avoids double-counting pages that carry more than one of the listed labels.
 * Returns { totalSize }.
 */
export async function countPagesByLabels(
  labelNames,
  spaceKey = null,
  { asApp: useApp = false } = {},
) {
  const valid = (labelNames || []).filter(isValidLabel);
  if (valid.length === 0) return { totalSize: 0 };

  const labelClause =
    valid.length === 1
      ? `label = "${valid[0]}"`
      : `(${valid.map((l) => `label = "${l}"`).join(' OR ')})`;
  const cql = `type=page AND ${labelClause}${buildSpaceFilter(spaceKey)}`;
  const requester = getRequester(useApp);
  const response = await requester.requestConfluence(
    route`/wiki/rest/api/search?cql=${cql}&limit=${0}&start=${0}`,
    { headers: { Accept: 'application/json' } },
  );
  if (!response.ok) return { totalSize: 0 };
  const data = await response.json();
  return { totalSize: data.totalSize || 0 };
}

/**
 * Removes a label from a page using the v1 REST API.
 * Returns true on success.
 */
export async function removeLabelFromPage(pageId, labelName, useApp = false) {
  const requester = getRequester(useApp);
  const response = await requester.requestConfluence(
    route`/wiki/rest/api/content/${pageId}/label?name=${labelName}`,
    { method: 'DELETE' },
  );
  return response.status === 204 || response.ok;
}

/**
 * Adds a label to a page using the v1 REST API.
 * Returns true on success.
 */
export async function addLabelToPage(pageId, labelName, useApp = false) {
  const requester = getRequester(useApp);
  const response = await requester.requestConfluence(
    route`/wiki/rest/api/content/${pageId}/label`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify([{ prefix: 'global', name: labelName }]),
    },
  );
  if (!response.ok) {
    console.error(
      `addLabelToPage(${pageId}, ${labelName}): ${response.status}`,
    );
  }
  return response.ok;
}

/**
 * Fetches all global labels from the instance using the v2 API (paginated).
 * Returns array of { id, name } objects.
 */
export async function getAllLabels() {
  const labels = [];
  let cursor = null;

  while (true) {
    const url = cursor
      ? route`/wiki/api/v2/labels?prefix=global&limit=250&cursor=${cursor}`
      : route`/wiki/api/v2/labels?prefix=global&limit=250`;
    const response = await api.asUser().requestConfluence(url, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) break;
    const data = await response.json();
    for (const label of data.results || []) {
      labels.push({ id: label.id, name: label.name || label.prefix });
    }
    cursor = data._links?.next
      ? new URL(data._links.next, 'https://x').searchParams.get('cursor')
      : null;
    if (!cursor || labels.length > 5000) break; // safety cap
  }

  return labels;
}
