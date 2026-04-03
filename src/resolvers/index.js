/**
 * Resolver registry — single entry point for all backend operations.
 * Follows the digital-signature pattern: wraps each resolver to ensure
 * database migrations run on first invocation.
 */

import Resolver from '@forge/resolver';
import { getClassificationResolver, setClassificationResolver, getDynamicPropertiesResolver, countDescendantsResolver, getClassificationProgressResolver } from './classifyResolver';
import { getConfigResolver, setConfigResolver, getAuditDataResolver } from './configResolver';
import { getSpaceConfigResolver, setSpaceConfigResolver, resetSpaceConfigResolver } from './spaceConfigResolver';
import { getPageAuditHistoryResolver, getSpaceAuditDataResolver } from './auditResolver';
import { runSchemaMigrations } from '../storage/migrations/schema';

const resolver = new Resolver();

// Track if migrations have been run in this instance
let migrationsInitialized = false;
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

/**
 * Ensures database migrations have been run.
 * Called automatically on first resolver execution in this process.
 * Non-fatal: logs the error but does not block resolvers that don't need SQL.
 */
async function ensureMigrationsRun() {
  if (!migrationsInitialized) {
    try {
      console.log('Initializing database schema...');
      await runSchemaMigrations();
      migrationsInitialized = true;
    } catch (error) {
      console.error('Migration failed (non-fatal for non-SQL resolvers):', error.message);
    }
  }
}

/**
 * Wraps a resolver function to ensure migrations run first
 * and the site URL is logged.
 */
function wrapResolver(resolverFn) {
  return async (req) => {
    logConnectedSite(req.context);
    await ensureMigrationsRun();
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

// Space config operations (used by space settings frontend)
resolver.define('getSpaceConfig', wrapResolver(getSpaceConfigResolver));
resolver.define('setSpaceConfig', wrapResolver(setSpaceConfigResolver));
resolver.define('resetSpaceConfig', wrapResolver(resetSpaceConfigResolver));

// Audit operations (used by byline history tab and space statistics)
resolver.define('getPageAuditHistory', wrapResolver(getPageAuditHistoryResolver));
resolver.define('getSpaceAuditData', wrapResolver(getSpaceAuditDataResolver));

// Manual migration trigger (admin utility)
resolver.define('runMigrations', async () => {
  try {
    await runSchemaMigrations();
    migrationsInitialized = true;
    return { success: true, message: 'Migrations completed successfully' };
  } catch (error) {
    console.error('Manual migration failed:', error);
    return { success: false, error: error.message };
  }
});

export const handler = resolver.getDefinitions();
