/**
 * Service for reading and writing Confluence content properties.
 * Uses the v2 REST API to store classification data on pages.
 *
 * Two properties are written per page:
 * 1. culmat_page_classification — authoritative data (level, who, when), indexed for CQL
 * 2. culmat_page_classification_byline — display data (title, tooltip) for zero-invocation byline rendering
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
  try {
    const response = await api
      .asApp()
      .requestConfluence(
        route`/wiki/api/v2/pages/${pageId}/properties/${CONTENT_PROPERTY_KEY}`,
        { headers: { Accept: 'application/json' } }
      );

    if (response.status === 404) {
      return null; // Page has not been classified yet
    }

    if (!response.ok) {
      console.error('Failed to read classification property:', response.status);
      return null;
    }

    const data = await response.json();
    return data.value || null;
  } catch (error) {
    console.error('Error reading classification property:', error);
    return null;
  }
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
 * Creates or updates a content property on a page.
 * Tries PUT (update) first; if 404, falls back to POST (create).
 *
 * @param {string} pageId - Confluence page ID
 * @param {string} key - property key
 * @param {Object} value - property value
 * @returns {Promise<boolean>} true if successful
 */
async function upsertProperty(pageId, key, value) {
  try {
    // Try to get existing property to get its version number
    const getResponse = await api
      .asApp()
      .requestConfluence(
        route`/wiki/api/v2/pages/${pageId}/properties/${key}`,
        { headers: { Accept: 'application/json' } }
      );

    if (getResponse.status === 404) {
      // Property doesn't exist yet — create it
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

    if (!getResponse.ok) {
      console.error(`Failed to read property ${key}:`, getResponse.status);
      return false;
    }

    // Property exists — update it with incremented version
    const existing = await getResponse.json();
    const version = existing.version?.number || 1;

    const updateResponse = await api
      .asApp()
      .requestConfluence(
        route`/wiki/api/v2/pages/${pageId}/properties/${key}`,
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
