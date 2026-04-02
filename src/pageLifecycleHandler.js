import { deleteAuditForPage } from './storage/auditStore';

/**
 * Handles Confluence page lifecycle events.
 *
 * - avi:confluence:deleted:page → Permanently removes audit entries for the page.
 *   Trashed pages are ignored — audit history should survive a trash→restore cycle.
 *
 * @param {Object} event - Confluence event payload
 * @param {string} event.eventType - Event type identifier
 * @param {Object} event.content - Page content details
 * @param {string} event.content.id - Page ID
 */
export async function handler(event) {
  const pageId = event.content?.id;

  if (!pageId) {
    console.warn('Page lifecycle event received without page ID:', event.eventType);
    return;
  }

  if (event.eventType === 'avi:confluence:deleted:page') {
    const deleted = await deleteAuditForPage(pageId);
    console.log(`Deleted ${deleted} audit entries for purged page ${pageId}`);
  }
}
