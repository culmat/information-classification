/**
 * Resolvers for the label import/export wizards.
 * Discovers labels, matches them to levels, and starts import/export jobs.
 * Runtime admin check enforced as defense-in-depth (all modules share one resolver).
 */

import api, { route } from '@forge/api';
import { countPagesByLabels, getAllLabels } from '../services/labelService';
import { successResponse, errorResponse } from '../utils/responseHelper';
import { isConfluenceAdmin } from '../utils/adminAuth';
import { getGlobalConfig } from '../storage/configStore';
import { enqueueJob } from '../utils/jobQueue';
import { buildSpaceFilter, isValidLabel } from '../shared/constants';

// Helpers to build the CQL strings shown to the admin alongside the counts.
// Kept next to the resolvers that return them so any format tweak stays local.
function labelClause(labels) {
  if (labels.length === 1) return `label = "${labels[0]}"`;
  return `(${labels.map((l) => `label = "${l}"`).join(' OR ')})`;
}
function cqlLabelled(labels, spaceKey) {
  return `type=page AND ${labelClause(labels)}${buildSpaceFilter(spaceKey)}`;
}
function cqlLabelledAtLevel(labels, levelId, spaceKey) {
  return `type=page AND ${labelClause(labels)} AND culmat_classification_level = "${levelId}"${buildSpaceFilter(spaceKey)}`;
}
function cqlLabelledNotAtLevel(labels, levelId, spaceKey) {
  return `type=page AND ${labelClause(labels)} AND culmat_classification_level != "${levelId}"${buildSpaceFilter(spaceKey)}`;
}
function cqlAtLevel(levelId, spaceKey) {
  return `type=page AND culmat_classification_level = "${levelId}"${buildSpaceFilter(spaceKey)}`;
}
function cqlAtLevelWithLabel(levelId, labelName, spaceKey) {
  return `type=page AND culmat_classification_level = "${levelId}" AND label = "${labelName}"${buildSpaceFilter(spaceKey)}`;
}
function cqlAtLevelWithoutLabel(levelId, labelName, spaceKey) {
  return `type=page AND culmat_classification_level = "${levelId}" AND label != "${labelName}"${buildSpaceFilter(spaceKey)}`;
}

async function cqlCount(cql) {
  const response = await api
    .asUser()
    .requestConfluence(
      route`/wiki/rest/api/search?cql=${cql}&limit=${0}&start=${0}`,
      { headers: { Accept: 'application/json' } },
    );
  if (!response.ok) return 0;
  const data = await response.json();
  return data.totalSize || 0;
}

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
 * Resolver: listLabels
 * Returns all global labels from the instance for the label chooser.
 */
export async function listLabelsResolver(req) {
  const accountId = req.context.accountId;
  if (!accountId || !(await isConfluenceAdmin(accountId))) {
    return errorResponse('Admin access required', 403);
  }

  try {
    const labels = await getAllLabels();
    return successResponse({ labels });
  } catch (error) {
    console.error('Error listing labels:', error);
    return successResponse({ labels: [] });
  }
}

/**
 * Resolver: countLabelPages
 * For the label-import UI: per (labels → levelId) mapping, returns the three
 * numbers that drive the work estimate + the CQL strings so the frontend can
 * render each as a Confluence-search link:
 *
 *   labelled           — pages that carry any of the selected labels
 *   alreadyClassified  — subset already at the target level (no-ops on import)
 *   toClassify         — labelled − alreadyClassified (upper bound on actual writes;
 *                        pages already at a more restrictive level are skipped by
 *                        the never_weaken rule and hence over-counted here)
 *
 * Payload: { labels: string[], levelId?: string, label?: string, spaceKey?: string }
 * `label` (singular) and omitted `levelId` are accepted for back-compat and
 * return only { labelled, cql: { labelled } }.
 */
export async function countLabelPagesResolver(req) {
  const accountId = req.context.accountId;
  if (!accountId || !(await isConfluenceAdmin(accountId))) {
    return errorResponse('Admin access required', 403);
  }

  const { label, labels, levelId, spaceKey } = req.payload || {};

  // Normalise to an array; accept either single label or labels array
  const labelList = labels || (label ? [label] : []);
  if (labelList.length === 0) {
    return successResponse({
      labelled: 0,
      alreadyClassified: 0,
      toClassify: 0,
      cql: { labelled: '', alreadyClassified: '', toClassify: '' },
    });
  }
  for (const l of labelList) {
    if (!isValidLabel(l))
      return errorResponse(`Invalid label format: ${l}`, 400);
  }

  try {
    // Always fetch the labelled count (same CQL as before via labelService).
    const { totalSize: labelled } = await countPagesByLabels(
      labelList,
      spaceKey,
    );

    // Without a levelId we can't compute the gap — return labelled only so
    // callers expecting the old shape keep working.
    if (!levelId) {
      return successResponse({
        labelled,
        alreadyClassified: 0,
        toClassify: labelled,
        cql: {
          labelled: cqlLabelled(labelList, spaceKey),
          alreadyClassified: '',
          toClassify: '',
        },
      });
    }

    const alreadyClassifiedCql = cqlLabelledAtLevel(
      labelList,
      levelId,
      spaceKey,
    );
    const alreadyClassified = await cqlCount(alreadyClassifiedCql);

    return successResponse({
      labelled,
      alreadyClassified,
      toClassify: Math.max(0, labelled - alreadyClassified),
      cql: {
        labelled: cqlLabelled(labelList, spaceKey),
        alreadyClassified: alreadyClassifiedCql,
        toClassify: cqlLabelledNotAtLevel(labelList, levelId, spaceKey),
      },
    });
  } catch (error) {
    console.error('Error counting label pages:', error);
    return successResponse({
      labelled: 0,
      alreadyClassified: 0,
      toClassify: 0,
      cql: { labelled: '', alreadyClassified: '', toClassify: '' },
    });
  }
}

/**
 * Resolver: countLevelGap
 * For the label-export UI: per (levelId → labelName) mapping, returns:
 *
 *   classified       — pages classified to the level
 *   alreadyLabelled  — subset that already carries the target label (no-ops)
 *   toLabel          — classified − alreadyLabelled (actual work)
 *
 * Plus the CQL strings for each so the frontend can render Confluence-search links.
 *
 * Payload: { levelId: string, labelName: string, spaceKey?: string }
 */
export async function countLevelGapResolver(req) {
  const accountId = req.context.accountId;
  if (!accountId || !(await isConfluenceAdmin(accountId))) {
    return errorResponse('Admin access required', 403);
  }

  const { levelId, labelName, spaceKey } = req.payload || {};
  if (!levelId) return errorResponse('levelId is required', 400);

  try {
    const classifiedCql = cqlAtLevel(levelId, spaceKey);
    const classified = await cqlCount(classifiedCql);

    // Blank or invalid labelName → opt-out for this row. Classified is still
    // returned so the admin sees how many pages exist at this level; the
    // label-dependent queries are skipped (and never receive the unsafe
    // value), so CQL injection via Textfield is structurally impossible.
    if (!labelName || !isValidLabel(labelName)) {
      return successResponse({
        classified,
        alreadyLabelled: 0,
        toLabel: 0,
        cql: { classified: classifiedCql, alreadyLabelled: '', toLabel: '' },
      });
    }

    const alreadyLabelledCql = cqlAtLevelWithLabel(
      levelId,
      labelName,
      spaceKey,
    );
    const alreadyLabelled = await cqlCount(alreadyLabelledCql);

    return successResponse({
      classified,
      alreadyLabelled,
      toLabel: Math.max(0, classified - alreadyLabelled),
      cql: {
        classified: classifiedCql,
        alreadyLabelled: alreadyLabelledCql,
        toLabel: cqlAtLevelWithoutLabel(levelId, labelName, spaceKey),
      },
    });
  } catch (error) {
    console.error('Error counting level gap:', error);
    return successResponse({
      classified: 0,
      alreadyLabelled: 0,
      toLabel: 0,
      cql: { classified: '', alreadyLabelled: '', toLabel: '' },
    });
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
      if (!isValidLabel(label)) {
        return errorResponse(`Invalid label format: ${label}`, 400);
      }
    }
  }

  try {
    // Estimate the ACTUAL work (toClassify gap) per mapping — pages already
    // at the target level are skipped by classifySinglePage so don't count
    // them in the progress total. Upper bound because more-restrictive
    // pages (never_weaken) still show up in `labelled - alreadyClassified`.
    let totalToClassify = 0;
    for (const mapping of mappings) {
      const labelledCql = cqlLabelled(mapping.labels, spaceKey);
      const atLevelCql = cqlLabelledAtLevel(
        mapping.labels,
        mapping.levelId,
        spaceKey,
      );
      const labelled = await cqlCount(labelledCql);
      const alreadyClassified = await cqlCount(atLevelCql);
      totalToClassify += Math.max(0, labelled - alreadyClassified);
    }

    if (totalToClassify === 0) {
      return successResponse({ count: 0 });
    }

    const { jobId } = await enqueueJob(
      'label-import',
      {
        mode: 'import',
        mappings,
        removeLabels: removeLabels || false,
        spaceKey: spaceKey || null,
        accountId,
        locale,
        totalToClassify,
      },
      'label-import',
      totalToClassify,
    );

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
    if (!isValidLabel(mapping.labelName)) {
      return errorResponse(
        `Mapping for level "${mapping.levelId}" has invalid labelName: ${mapping.labelName}`,
        400,
      );
    }
  }

  try {
    // Estimate the ACTUAL work (toLabel gap) per mapping — pages already
    // carrying the target label are no-ops during export.
    let totalToExport = 0;
    for (const mapping of mappings) {
      const classifiedCql = cqlAtLevel(mapping.levelId, spaceKey);
      const alreadyLabelledCql = cqlAtLevelWithLabel(
        mapping.levelId,
        mapping.labelName,
        spaceKey,
      );
      const classified = await cqlCount(classifiedCql);
      const alreadyLabelled = await cqlCount(alreadyLabelledCql);
      totalToExport += Math.max(0, classified - alreadyLabelled);
    }

    if (totalToExport === 0) {
      return successResponse({ count: 0 });
    }

    const { jobId } = await enqueueJob(
      'label-export',
      {
        mode: 'export',
        mappings,
        spaceKey: spaceKey || null,
        accountId,
        totalToExport,
      },
      'label-export',
      totalToExport,
    );

    return successResponse({ count: totalToExport, asyncJobId: jobId });
  } catch (error) {
    console.error('Error starting label export:', error);
    return errorResponse('Failed to start export', 500);
  }
}
