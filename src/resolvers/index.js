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
  startLabelImportResolver,
  startLabelExportResolver,
} from './importResolver';

const resolver = new Resolver();

// Classification operations (used by byline frontend)
resolver.define('getClassification', getClassificationResolver);
resolver.define('setClassification', setClassificationResolver);
resolver.define('countDescendants', countDescendantsResolver);
resolver.define('getClassificationProgress', getClassificationProgressResolver);

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
resolver.define('startLabelImport', startLabelImportResolver);
resolver.define('startLabelExport', startLabelExportResolver);

export const handler = resolver.getDefinitions();
