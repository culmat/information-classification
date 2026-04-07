/**
 * Resolver registry — single entry point for all backend operations.
 */

import Resolver from '@forge/resolver';
import { getClassificationResolver, setClassificationResolver, getDynamicPropertiesResolver, countDescendantsResolver, getClassificationProgressResolver } from './classifyResolver';
import { getConfigResolver, setConfigResolver, getAuditDataResolver, countLevelUsageResolver, reclassifyLevelResolver } from './configResolver';
import { getSpaceConfigResolver, setSpaceConfigResolver, resetSpaceConfigResolver } from './spaceConfigResolver';
import { listSpacesResolver, countLabelPagesResolver, startLabelImportResolver, startLabelExportResolver } from './importResolver';

const resolver = new Resolver();

let siteUrlLogged = false;

/**
 * Logs the connected site URL on first resolver call (helps with debugging)
 */
function logConnectedSite(context) {
  if (!siteUrlLogged && context?.siteUrl) {
    console.log('=====================================');
    console.log(`Connected to: ${context.siteUrl}`);
    console.log('=====================================');
    siteUrlLogged = true;
  }
}

function wrapResolver(resolverFn) {
  return async (req) => {
    logConnectedSite(req.context);
    return resolverFn(req);
  };
}

// Classification operations (used by byline frontend)
resolver.define('getClassification', wrapResolver(getClassificationResolver));
resolver.define('setClassification', wrapResolver(setClassificationResolver));
resolver.define('countDescendants', wrapResolver(countDescendantsResolver));
resolver.define('getClassificationProgress', wrapResolver(getClassificationProgressResolver));

// Dynamic properties — called by Confluence to set byline title/icon before popup opens
resolver.define('getDynamicProperties', wrapResolver(getDynamicPropertiesResolver));

// Global admin config operations (used by admin frontend)
resolver.define('getConfig', wrapResolver(getConfigResolver));
resolver.define('setConfig', wrapResolver(setConfigResolver));
resolver.define('getAuditData', wrapResolver(getAuditDataResolver));
resolver.define('countLevelUsage', wrapResolver(countLevelUsageResolver));
resolver.define('reclassifyLevel', wrapResolver(reclassifyLevelResolver));

// Space config operations (used by space settings frontend)
resolver.define('getSpaceConfig', wrapResolver(getSpaceConfigResolver));
resolver.define('setSpaceConfig', wrapResolver(setSpaceConfigResolver));
resolver.define('resetSpaceConfig', wrapResolver(resetSpaceConfigResolver));

// Label import wizard (used by admin frontend)
resolver.define('listSpaces', wrapResolver(listSpacesResolver));
resolver.define('countLabelPages', wrapResolver(countLabelPagesResolver));
resolver.define('startLabelImport', wrapResolver(startLabelImportResolver));
resolver.define('startLabelExport', wrapResolver(startLabelExportResolver));

export const handler = resolver.getDefinitions();
