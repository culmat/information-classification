/**
 * Label service — reads, searches, and removes Confluence page labels.
 * Uses v1 REST API for write operations (v2 is read-only as of 2025).
 * Uses v2 API for listing all labels (supports pagination).
 */

import api, { route } from '@forge/api';
import { buildSpaceFilter } from '../shared/constants';

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
  const cql = `type=page AND label = "${labelName}"${buildSpaceFilter(spaceKey)}`;
  const requester = useApp ? api.asApp() : api.asUser();
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
 * Removes a label from a page using the v1 REST API.
 * Returns true on success.
 */
export async function removeLabelFromPage(pageId, labelName, useApp = false) {
  const requester = useApp ? api.asApp() : api.asUser();
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
  const requester = useApp ? api.asApp() : api.asUser();
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
