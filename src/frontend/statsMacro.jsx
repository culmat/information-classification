/**
 * Classification Statistics macro — embeds distribution chart and/or
 * recently classified pages on any Confluence page.
 *
 * Config options:
 * - scope: 'subtree' (default) | 'space' | 'global'
 * - maxRecent: number (default 10)
 * - countAsDefault: checkbox (default checked)
 */

import React, { useState, useEffect, useCallback } from 'react';
import ForgeReconciler, {
  useProductContext,
  useConfig,
  useTranslation,
  I18nProvider,
  Text,
  Spinner,
  SectionMessage,
  Label,
  Select,
  Textfield,
  CheckboxGroup,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import StatisticsPanel from './StatisticsPanel';

const defaultConfig = {
  scope: 'subtree',
  countAsDefault: ['yes'], // CheckboxGroup returns array; checked = roll into default
  maxRecent: '10',
};

/** Extract plain string value from a Select config entry ({label,value} or string). */
const selectValue = (v, fallback) =>
  (typeof v === 'object' ? v?.value : v) || fallback;

const App = () => {
  const context = useProductContext();
  const { t } = useTranslation();
  const rawConfig = useConfig();
  const config = rawConfig || defaultConfig;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Page context from Forge (same pattern as byline.jsx)
  const pageId = context?.extension?.content?.id;
  const spaceKey = context?.extension?.space?.key;

  // Normalise config values
  const scope = selectValue(config.scope, 'subtree');
  const countAsDefault = (config.countAsDefault || []).includes('yes');
  const maxRecent = parseInt(config.maxRecent, 10) || 10;

  // Fetch stats when context + config scope are ready
  const fetchStats = useCallback(async () => {
    if (!pageId && !spaceKey) return; // context not yet available
    setLoading(true);
    try {
      const payload = { source: 'macro', recentLimit: maxRecent };
      if (scope === 'subtree' && pageId) {
        payload.ancestorId = pageId;
      } else if (scope === 'space' && spaceKey) {
        payload.spaceKey = spaceKey;
      }
      // scope === 'global' → no filters, just source: 'macro'
      const result = await invoke('getAuditData', payload);
      if (result.success) {
        setData(result);
      }
    } catch (error) {
      console.error('Failed to load classification stats:', error);
    } finally {
      setLoading(false);
    }
  }, [pageId, spaceKey, scope, maxRecent]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // License check — only enforce in production
  const licensed =
    context?.environmentType !== 'PRODUCTION' ||
    context?.license?.active === true;

  if (!licensed) {
    return (
      <SectionMessage appearance="warning">
        <Text>{t('license.inactive_message')}</Text>
      </SectionMessage>
    );
  }

  if (loading && !data) {
    return <Spinner size="medium" />;
  }

  // Empty state when no pages at all in this scope
  if (data && data.totalPages === 0) {
    return (
      <SectionMessage appearance="information">
        <Text>{t('macro.stats.empty')}</Text>
      </SectionMessage>
    );
  }

  // Build CQL scope filter for clickable links
  let spaceFilter = '';
  if (scope === 'subtree' && pageId) {
    spaceFilter = ` AND (id=${pageId} OR ancestor=${pageId})`;
  } else if (scope === 'space' && spaceKey) {
    spaceFilter = ` AND space="${spaceKey}"`;
  }

  // Visuals come from shared StatisticsPanel; keep props in sync with admin.jsx and spaceSettings.jsx
  return (
    <StatisticsPanel
      data={data}
      levels={data?.levels || []}
      defaultLevelId={data?.defaultLevelId}
      showUnclassified={countAsDefault}
      onToggleUnclassified={() => {}}
      isLoading={loading}
      onRefresh={fetchStats}
      spaceFilter={spaceFilter}
      showSpaceColumn={scope === 'global'}
      hideToggle
      t={t}
    />
  );
};

// Macro configuration panel — uses only allowed config components
const Config = () => {
  return (
    <>
      <Label>Scope</Label>
      <Select
        name="scope"
        options={[
          { label: 'This page and sub-pages', value: 'subtree' },
          { label: 'Current space', value: 'space' },
          { label: 'Entire instance', value: 'global' },
        ]}
        defaultValue={{ label: 'This page and sub-pages', value: 'subtree' }}
      />

      <Label>Max recent pages</Label>
      <Textfield name="maxRecent" defaultValue="10" />

      <CheckboxGroup
        name="countAsDefault"
        options={[
          { label: 'Count unclassified as default level', value: 'yes' },
        ]}
      />
    </>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>,
);

ForgeReconciler.addConfig(<Config />);
