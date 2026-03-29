/**
 * Service for reading and writing Confluence content properties.
 * Uses the REST API to store classification data on pages.
 *
 * Two properties are written per page:
 * 1. culmat_page_classification — authoritative data (level, who, when), indexed for CQL
 * 2. culmat_page_classification_byline — display data (title, tooltip) for byline rendering
 */

import api, { route } from '@forge/api';
import { CONTENT_PROPERTY_KEY, BYLINE_PROPERTY_KEY } from '../shared/constants';

/**
 * Reads the classification content property from a page.
 *
 * @param {string} pageId - Confluence page ID
 * @returns {Promise<Object|null>} { level, classifiedBy, classifiedAt } or null if not set
 */
export async function getClassification(pageId) {
  return await getProperty(pageId, CONTENT_PROPERTY_KEY);
}

/**
 * Writes both the classification data property and the byline display property.
 * Uses upsert semantics — creates the property if it doesn't exist, updates if it does.
 *
 * @param {string} pageId - Confluence page ID
 * @param {Object} classificationData - { level, classifiedBy, classifiedAt }
 * @param {Object} bylineData - { title, tooltip }
 * @returns {Promise<boolean>} true if successful
 */
export async function setClassification(pageId, classificationData, bylineData) {
  const results = await Promise.all([
    upsertProperty(pageId, CONTENT_PROPERTY_KEY, classificationData),
    upsertProperty(pageId, BYLINE_PROPERTY_KEY, bylineData),
  ]);

  return results.every((r) => r === true);
}

/**
 * Reads a content property by key using the v2 REST API.
 * The v2 API uses granular scopes (read:content.property:confluence).
 * Returns the property value or null if not found.
 */
async function getProperty(pageId, key) {
  try {
    // v2 API: list all properties, then find by key
    const response = await api
      .asApp()
      .requestConfluence(
        route`/wiki/api/v2/pages/${pageId}/properties?key=${key}`,
        { headers: { Accept: 'application/json' } }
      );

    if (!response.ok) {
      if (response.status === 404) return null;
      const errorBody = await response.text();
      console.error(`Failed to read property ${key}:`, response.status, errorBody);
      return null;
    }

    const data = await response.json();
    // v2 returns { results: [...] } when filtering by key
    const prop = data.results?.[0];
    return prop?.value || null;
  } catch (error) {
    console.error(`Error reading property ${key}:`, error);
    return null;
  }
}

/**
 * Creates or updates a content property on a page using the v2 REST API.
 */
async function upsertProperty(pageId, key, value) {
  try {
    // First check if property exists
    const listResponse = await api
      .asApp()
      .requestConfluence(
        route`/wiki/api/v2/pages/${pageId}/properties?key=${key}`,
        { headers: { Accept: 'application/json' } }
      );

    if (!listResponse.ok && listResponse.status !== 404) {
      const errorBody = await listResponse.text();
      console.error(`Failed to list property ${key}:`, listResponse.status, errorBody);
      return false;
    }

    const listData = listResponse.ok ? await listResponse.json() : { results: [] };
    const existing = listData.results?.[0];

    if (!existing) {
      // Property doesn't exist — create it
      const createResponse = await api
        .asApp()
        .requestConfluence(route`/wiki/api/v2/pages/${pageId}/properties`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ key, value }),
        });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error(`Failed to create property ${key}:`, createResponse.status, errorText);
        return false;
      }
      return true;
    }

    // Property exists — update it
    const propId = existing.id;
    const version = existing.version?.number || 1;

    const updateResponse = await api
      .asApp()
      .requestConfluence(
        route`/wiki/api/v2/pages/${pageId}/properties/${propId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            key,
            value,
            version: { number: version + 1 },
          }),
        }
      );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error(`Failed to update property ${key}:`, updateResponse.status, errorText);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`Error upserting property ${key}:`, error);
    return false;
  }
}
