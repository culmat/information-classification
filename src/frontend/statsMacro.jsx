/**
 * Classification Statistics macro — embeds distribution chart and/or
 * recently classified pages on any Confluence page.
 *
 * Config options:
 * - scope: 'subtree' (default) | 'space' | 'global'
 * - show: 'both' (default) | 'distribution' | 'recent'
 * - showUnclassified: checkbox (default checked)
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
  CheckboxGroup,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import StatisticsPanel from './StatisticsPanel';

const defaultConfig = {
  scope: 'subtree',
  show: 'both',
  showUnclassified: ['yes'], // CheckboxGroup returns array
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
  const show = selectValue(config.show, 'both');
  const showUnclassified = (config.showUnclassified || []).includes('yes');

  // Fetch stats when context + config scope are ready
  const fetchStats = useCallback(async () => {
    if (!pageId && !spaceKey) return; // context not yet available
    setLoading(true);
    try {
      const payload = { source: 'macro' };
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
  }, [pageId, spaceKey, scope]);

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

  if (loading) {
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

  // Derive hideSections from the normalised "show" value
  const hideSections =
    show === 'distribution'
      ? 'recent'
      : show === 'recent'
        ? 'distribution'
        : null;

  // Build CQL scope filter for clickable links
  let spaceFilter = '';
  if (scope === 'subtree' && pageId) {
    spaceFilter = ` AND (id=${pageId} OR ancestor=${pageId})`;
  } else if (scope === 'space' && spaceKey) {
    spaceFilter = ` AND space="${spaceKey}"`;
  }

  return (
    <StatisticsPanel
      data={data}
      levels={data?.levels || []}
      defaultLevelId={data?.defaultLevelId}
      showUnclassified={showUnclassified}
      onToggleUnclassified={() => {}}
      isLoading={loading}
      onRefresh={fetchStats}
      spaceFilter={spaceFilter}
      showSpaceColumn={scope === 'global'}
      hideSections={hideSections}
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

      <Label>Display</Label>
      <Select
        name="show"
        options={[
          { label: 'Distribution and recent changes', value: 'both' },
          { label: 'Distribution only', value: 'distribution' },
          { label: 'Recent changes only', value: 'recent' },
        ]}
        defaultValue={{
          label: 'Distribution and recent changes',
          value: 'both',
        }}
      />

      <CheckboxGroup
        name="showUnclassified"
        options={[
          { label: 'Include unclassified pages in chart', value: 'yes' },
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
