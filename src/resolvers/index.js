/**
 * Resolver registry — single entry point for all backend operations.
 */

import Resolver from '@forge/resolver';
import {
  getClassificationResolver,
  setClassificationResolver,
  getDynamicPropertiesResolver,
  countDescendantsResolver,
  getClassificationProgressResolver,
} from './classifyResolver';
import {
  startRecursiveClassifyResolver,
  processClassifyBatchResolver,
  cancelClassifyJobResolver,
  getUserPendingJobsResolver,
} from './classifyJobResolver';
import {
  getConfigResolver,
  setConfigResolver,
  getAuditDataResolver,
  countLevelUsageResolver,
  reclassifyLevelResolver,
} from './configResolver';
import {
  getSpaceConfigResolver,
  setSpaceConfigResolver,
  resetSpaceConfigResolver,
} from './spaceConfigResolver';
import {
  listSpacesResolver,
  listLabelsResolver,
  countLabelPagesResolver,
  countLevelGapResolver,
} from './importResolver';
import {
  startLabelImportResolver,
  startLabelExportResolver,
  processLabelBatchResolver,
  cancelLabelJobResolver,
  getUserPendingLabelJobsResolver,
} from './labelJobResolver';
import { getVersionInfoResolver } from './versionInfoResolver';

const resolver = new Resolver();

// Classification operations (used by byline frontend)
resolver.define('getClassification', getClassificationResolver);
resolver.define('setClassification', setClassificationResolver);
resolver.define('countDescendants', countDescendantsResolver);
resolver.define('getClassificationProgress', getClassificationProgressResolver);

// Client-driven recursive classification (runs asUser, respects restrictions)
resolver.define('startRecursiveClassify', startRecursiveClassifyResolver);
resolver.define('processClassifyBatch', processClassifyBatchResolver);
resolver.define('cancelClassifyJob', cancelClassifyJobResolver);
resolver.define('getUserPendingJobs', getUserPendingJobsResolver);

// Dynamic properties — called by Confluence to set byline title/icon before popup opens
resolver.define('getDynamicProperties', getDynamicPropertiesResolver);

// Global admin config operations (used by admin frontend)
resolver.define('getConfig', getConfigResolver);
resolver.define('setConfig', setConfigResolver);
resolver.define('getAuditData', getAuditDataResolver);
resolver.define('countLevelUsage', countLevelUsageResolver);
resolver.define('reclassifyLevel', reclassifyLevelResolver);

// Space config operations (used by space settings frontend)
resolver.define('getSpaceConfig', getSpaceConfigResolver);
resolver.define('setSpaceConfig', setSpaceConfigResolver);
resolver.define('resetSpaceConfig', resetSpaceConfigResolver);

// Label import wizard (used by admin frontend)
resolver.define('listSpaces', listSpacesResolver);
resolver.define('listLabels', listLabelsResolver);
resolver.define('countLabelPages', countLabelPagesResolver);
resolver.define('countLevelGap', countLevelGapResolver);

// Client-driven label import/export (runs asUser, respects restrictions)
resolver.define('startLabelImport', startLabelImportResolver);
resolver.define('startLabelExport', startLabelExportResolver);
resolver.define('processLabelBatch', processLabelBatchResolver);
resolver.define('cancelLabelJob', cancelLabelJobResolver);
resolver.define('getUserPendingLabelJobs', getUserPendingLabelJobsResolver);

// About panel — returns Forge version + upgrade status for the admin UI
resolver.define('getVersionInfo', getVersionInfoResolver);

export const handler = resolver.getDefinitions();
