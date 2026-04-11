/**
 * Resolvers for the label import/export wizards.
 * Discovers labels, matches them to levels, and starts import/export jobs.
 * Runtime admin check enforced as defense-in-depth (all modules share one resolver).
 */

import api, { route } from '@forge/api';
import { Queue } from '@forge/events';
import { kvs } from '@forge/kvs';
import { findPagesByLabel } from '../services/labelService';
import { findPagesByLevel } from '../services/classificationService';
import { asyncJobKey } from '../shared/constants';
import { successResponse, errorResponse } from '../utils/responseHelper';
import { isConfluenceAdmin } from '../utils/adminAuth';
import { getGlobalConfig } from '../storage/configStore';

/**
 * Resolver: listSpaces
 * Returns all spaces for the space picker.
 */
export async function listSpacesResolver(req) {
  const accountId = req.context.accountId;
  if (!accountId || !(await isConfluenceAdmin(accountId))) {
    return errorResponse('Admin access required', 403);
  }

  try {
    const response = await api
      .asUser()
      .requestConfluence(route`/wiki/api/v2/spaces?limit=250&sort=name`, {
        headers: { Accept: 'application/json' },
      });
    if (!response.ok) return successResponse({ spaces: [] });
    const data = await response.json();
    const spaces = (data.results || []).map((s) => ({
      key: s.key,
      name: s.name,
    }));
    return successResponse({ spaces });
  } catch (error) {
    console.error('Error listing spaces:', error);
    return successResponse({ spaces: [] });
  }
}

/**
 * Resolver: countLabelPages
 * Returns the number of pages with a given label.
 */
export async function countLabelPagesResolver(req) {
  const accountId = req.context.accountId;
  if (!accountId || !(await isConfluenceAdmin(accountId))) {
    return errorResponse('Admin access required', 403);
  }

  const { label, spaceKey } = req.payload || {};
  if (!label) return successResponse({ count: 0 });

  try {
    const { totalSize } = await findPagesByLabel(label, 0, 0, spaceKey);
    return successResponse({ count: totalSize });
  } catch (error) {
    console.error('Error counting label pages:', error);
    return successResponse({ count: 0 });
  }
}

/**
 * Resolver: startLabelImport
 * Accepts confirmed mappings and pushes the import job to the async queue.
 *
 * Payload: { mappings: [{ levelId, labels: string[] }], removeLabels: boolean, spaceKey?: string }
 */
export async function startLabelImportResolver(req) {
  const accountId = req.context.accountId;
  if (!accountId || !(await isConfluenceAdmin(accountId))) {
    return errorResponse('Admin access required', 403);
  }

  const { mappings, removeLabels, spaceKey } = req.payload || {};
  const locale = req.context.locale || 'en';

  if (!mappings || !Array.isArray(mappings) || mappings.length === 0) {
    return errorResponse('No mappings provided', 400);
  }

  // Validate each mapping: levelId must exist and be allowed, labels must be non-empty strings
  const config = await getGlobalConfig();
  const allowedIds = new Set(
    config.levels.filter((l) => l.allowed).map((l) => l.id),
  );
  for (const mapping of mappings) {
    if (!mapping.levelId || !allowedIds.has(mapping.levelId)) {
      return errorResponse(
        `Invalid or disallowed level: ${mapping.levelId}`,
        400,
      );
    }
    if (!Array.isArray(mapping.labels) || mapping.labels.length === 0) {
      return errorResponse(
        `Mapping for level "${mapping.levelId}" must have at least one label`,
        400,
      );
    }
    for (const label of mapping.labels) {
      if (!label || typeof label !== 'string') {
        return errorResponse('Each label must be a non-empty string', 400);
      }
    }
  }

  try {
    // Count total pages to classify
    let totalToClassify = 0;
    for (const mapping of mappings) {
      for (const label of mapping.labels) {
        const { totalSize } = await findPagesByLabel(label, 0, 0, spaceKey);
        totalToClassify += totalSize;
      }
    }

    if (totalToClassify === 0) {
      return successResponse({ count: 0 });
    }

    const queue = new Queue({ key: 'classification-queue' });
    const { jobId } = await queue.push({
      body: {
        mode: 'import',
        mappings,
        removeLabels: removeLabels || false,
        spaceKey: spaceKey || null,
        accountId,
        locale,
        totalToClassify,
      },
      concurrency: { key: 'label-import', limit: 1 },
    });

    await kvs.set(asyncJobKey('label-import'), {
      jobId,
      total: totalToClassify,
      startedAt: Date.now(),
      classified: 0,
      failed: 0,
    });

    return successResponse({ count: totalToClassify, asyncJobId: jobId });
  } catch (error) {
    console.error('Error starting label import:', error);
    return errorResponse('Failed to start import', 500);
  }
}

/**
 * Resolver: startLabelExport
 * Exports classifications back to page labels.
 *
 * Payload: { mappings: [{ levelId, labelName }], spaceKey?: string }
 */
export async function startLabelExportResolver(req) {
  const accountId = req.context.accountId;
  if (!accountId || !(await isConfluenceAdmin(accountId))) {
    return errorResponse('Admin access required', 403);
  }

  const { mappings, spaceKey } = req.payload || {};

  if (!mappings || !Array.isArray(mappings) || mappings.length === 0) {
    return errorResponse('No mappings provided', 400);
  }

  // Validate each mapping: levelId must exist, labelName must be a non-empty string
  const config = await getGlobalConfig();
  const knownIds = new Set(config.levels.map((l) => l.id));
  for (const mapping of mappings) {
    if (!mapping.levelId || !knownIds.has(mapping.levelId)) {
      return errorResponse(`Unknown level: ${mapping.levelId}`, 400);
    }
    if (!mapping.labelName || typeof mapping.labelName !== 'string') {
      return errorResponse(
        `Mapping for level "${mapping.levelId}" must have a labelName string`,
        400,
      );
    }
  }

  try {
    // Count total pages to export
    let totalToExport = 0;
    for (const mapping of mappings) {
      const { totalSize } = await findPagesByLevel(mapping.levelId, 0, 0, {
        spaceKey,
      });
      totalToExport += totalSize;
    }

    if (totalToExport === 0) {
      return successResponse({ count: 0 });
    }

    const queue = new Queue({ key: 'classification-queue' });
    const { jobId } = await queue.push({
      body: {
        mode: 'export',
        mappings,
        spaceKey: spaceKey || null,
        accountId,
        totalToExport,
      },
      concurrency: { key: 'label-export', limit: 1 },
    });

    await kvs.set(asyncJobKey('label-export'), {
      jobId,
      total: totalToExport,
      startedAt: Date.now(),
      classified: 0,
      failed: 0,
    });

    return successResponse({ count: totalToExport, asyncJobId: jobId });
  } catch (error) {
    console.error('Error starting label export:', error);
    return errorResponse('Failed to start export', 500);
  }
}
