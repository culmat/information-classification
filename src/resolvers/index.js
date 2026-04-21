/**
 * Resolver registry — single entry point for all backend operations.
 */

import Resolver from '@forge/resolver';
import {
  getClassificationResolver,
  setClassificationResolver,
  countDescendantsResolver,
  getClassificationProgressResolver,
} from './classifyResolver';
import {
  startBulkClassifyResolver,
  processClassifyBatchResolver,
  cancelClassifyJobResolver,
  countBulkClassifyScopeResolver,
  getUserJobsResolver,
} from './classifyJobResolver';
import {
  getConfigResolver,
  setConfigResolver,
  getAuditDataResolver,
  countLevelUsageResolver,
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
} from './labelJobResolver';
import { getVersionInfoResolver } from './versionInfoResolver';

const resolver = new Resolver();

// Classification operations (used by byline frontend)
resolver.define('getClassification', getClassificationResolver);
resolver.define('setClassification', setClassificationResolver);
resolver.define('countDescendants', countDescendantsResolver);
resolver.define('getClassificationProgress', getClassificationProgressResolver);

// Client-driven bulk classify (runs asUser, respects restrictions).
// Unified across byline "apply to sub-pages" (scope=descendants) and admin
// Bulk Classify tab (scope=fromLevel). `getUserJobs` returns both classify
// and label jobs so every surface shows one coherent queue.
resolver.define('startBulkClassify', startBulkClassifyResolver);
resolver.define('processClassifyBatch', processClassifyBatchResolver);
resolver.define('cancelClassifyJob', cancelClassifyJobResolver);
resolver.define('countBulkClassifyScope', countBulkClassifyScopeResolver);
resolver.define('getUserJobs', getUserJobsResolver);

// Global admin config operations (used by admin frontend)
resolver.define('getConfig', getConfigResolver);
resolver.define('setConfig', setConfigResolver);
resolver.define('getAuditData', getAuditDataResolver);
resolver.define('countLevelUsage', countLevelUsageResolver);

// Space config operations (used by space settings frontend)
resolver.define('getSpaceConfig', getSpaceConfigResolver);
resolver.define('setSpaceConfig', setSpaceConfigResolver);
resolver.define('resetSpaceConfig', resetSpaceConfigResolver);

// Label import wizard (used by admin frontend)
resolver.define('listSpaces', listSpacesResolver);
resolver.define('listLabels', listLabelsResolver);
resolver.define('countLabelPages', countLabelPagesResolver);
resolver.define('countLevelGap', countLevelGapResolver);

// Client-driven label import/export (runs asUser, respects restrictions).
// Label jobs share the unified user queue with bulk-classify; list them
// via `getUserJobs` above.
resolver.define('startLabelImport', startLabelImportResolver);
resolver.define('startLabelExport', startLabelExportResolver);
resolver.define('processLabelBatch', processLabelBatchResolver);
resolver.define('cancelLabelJob', cancelLabelJobResolver);

// About panel — returns Forge version + upgrade status for the admin UI
resolver.define('getVersionInfo', getVersionInfoResolver);

export const handler = resolver.getDefinitions();
