/**
 * Space settings page — accessible via Space Settings → Integrations → Information Classification.
 *
 * Allows space admins to:
 * - Enable/disable specific classification levels for their space
 * - Set a different default level for the space
 * - Reset to global defaults
 */

import React, { useState, useEffect, useCallback } from 'react';
import ForgeReconciler, {
  useProductContext,
  useTranslation,
  I18nProvider,
  Box,
  Text,
  Heading,
  Button,
  ButtonGroup,
  Stack,
  Inline,
  Checkbox,
  Select,
  Lozenge,
  Spinner,
  SectionMessage,
  Label,
  Tabs,
  Tab,
  TabList,
  TabPanel,
  DonutChart,
  DynamicTable,
  Toggle,
  xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { colorToLozenge } from '../shared/constants';

function localize(obj, locale) {
  if (!obj || typeof obj === 'string') return obj || '';
  const lang = (locale || 'en').substring(0, 2);
  return obj[lang] || obj.en || Object.values(obj)[0] || '';
}

const containerStyle = xcss({ padding: 'space.400', maxWidth: '640px' });
/* TabPanel renders no top padding — add it manually (same workaround as byline.jsx). */
const tabPanelStyle = xcss({ paddingTop: 'space.100' });

const App = () => {
  const context = useProductContext();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [globalConfig, setGlobalConfig] = useState(null);
  const [_spaceConfig, setSpaceConfig] = useState(null);
  const [message, setMessage] = useState(null);

  // Track which levels are enabled in this space
  const [enabledLevelIds, setEnabledLevelIds] = useState([]);
  const [defaultLevelId, setDefaultLevelId] = useState(null);
  const [showUnclassified, setShowUnclassified] = useState(true); // coverage toggle

  // Statistics tab state (lazy-loaded)
  const [statsData, setStatsData] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const spaceKey = context?.extension?.space?.key;

  useEffect(() => {
    if (!spaceKey) return;
    (async () => {
      try {
        const result = await invoke('getSpaceConfig', { spaceKey });
        if (result.success) {
          setGlobalConfig(result.globalConfig);
          setSpaceConfig(result.spaceConfig);

          // Initialize UI state from space config or global defaults
          const globalAllowed = result.globalConfig.levels
            .filter((l) => l.allowed)
            .map((l) => l.id);

          if (result.spaceConfig) {
            setEnabledLevelIds(result.spaceConfig.allowedLevelIds || globalAllowed);
            setDefaultLevelId(result.spaceConfig.defaultLevelId || result.globalConfig.defaultLevelId);
          } else {
            setEnabledLevelIds(globalAllowed);
            setDefaultLevelId(result.globalConfig.defaultLevelId);
          }
        }
      } catch (error) {
        console.error('Failed to load space config:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [spaceKey]);

  const handleToggleLevel = (levelId) => {
    setEnabledLevelIds((prev) =>
      prev.includes(levelId)
        ? prev.filter((id) => id !== levelId)
        : [...prev, levelId]
    );
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await invoke('setSpaceConfig', {
        spaceKey,
        config: {
          allowedLevelIds: enabledLevelIds,
          defaultLevelId,
        },
      });
      if (result.success) {
        setMessage({ type: 'success', text: t('space_settings.save_success') });
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to save.' });
      }
    } catch (error) {
      console.error('Failed to save space config:', error);
      setMessage({ type: 'error', text: 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  }, [spaceKey, enabledLevelIds, defaultLevelId, t]);

  const handleReset = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await invoke('resetSpaceConfig', { spaceKey });
      if (result.success) {
        // Reset UI to global defaults
        const globalAllowed = globalConfig.levels
          .filter((l) => l.allowed)
          .map((l) => l.id);
        setEnabledLevelIds(globalAllowed);
        setDefaultLevelId(globalConfig.defaultLevelId);
        setSpaceConfig(null);
        setMessage({ type: 'success', text: t('space_settings.reset_success') });
      }
    } catch (error) {
      console.error('Failed to reset space config:', error);
    } finally {
      setSaving(false);
    }
  }, [spaceKey, globalConfig, t]);

  // Load statistics on first Statistics tab switch
  const loadStats = useCallback(async () => {
    if (statsData || statsLoading || !spaceKey) return;
    setStatsLoading(true);
    try {
      const result = await invoke('getAuditData', { spaceKey });
      if (result.success) setStatsData(result);
    } catch (error) {
      console.error('Failed to load space statistics:', error);
      setStatsData({ distribution: [], totalPages: 0, classifiedPages: 0, recentPages: [] });
    } finally {
      setStatsLoading(false);
    }
  }, [spaceKey, statsData, statsLoading]);

  if (loading) {
    return <Box xcss={containerStyle}><Spinner size="large" /></Box>;
  }

  // Only show globally-allowed levels as toggleable options
  const globalAllowedLevels = (globalConfig?.levels || []).filter((l) => l.allowed);


  return (
    <Box xcss={containerStyle}>
      <Stack space="space.300">
        <Heading size="large">{t('space_settings.title')}</Heading>

        <Tabs id="space-settings-tabs" onChange={(index) => { if (index === 1) loadStats(); }}>
          <TabList>
            <Tab>{t('admin.tabs.levels')}</Tab>
            <Tab>{t('admin.tabs.statistics')}</Tab>
          </TabList>

          {/* Configuration Tab */}
          <TabPanel>
            <Box xcss={tabPanelStyle}>
            <Stack space="space.200">
              <Text>{t('space_settings.description')}</Text>

              {/* Level enable/disable checkboxes */}
              <Stack space="space.050">
                <Heading size="small">{t('space_settings.enabled_levels')}</Heading>
                {globalAllowedLevels.map((level) => (
                  <Inline key={level.id} space="space.100" alignBlock="center">
                    <Checkbox
                      isChecked={enabledLevelIds.includes(level.id)}
                      onChange={() => handleToggleLevel(level.id)}
                      label=""
                    />
                    <Lozenge isBold appearance={colorToLozenge(level.color)}>{localize(level.name, 'en')}</Lozenge>
                  </Inline>
                ))}
              </Stack>

              {/* Default level selector */}
              <Stack space="space.050">
                <Label labelFor="space-default-level">{t('space_settings.default_level')}</Label>
                <Select
                  inputId="space-default-level"
                  value={globalAllowedLevels
                    .filter((l) => l.id === defaultLevelId)
                    .map((l) => ({ label: localize(l.name, 'en'), value: l.id }))}
                  options={globalAllowedLevels
                    .filter((l) => enabledLevelIds.includes(l.id))
                    .map((l) => ({ label: localize(l.name, 'en'), value: l.id }))}
                  onChange={(option) => setDefaultLevelId(option.value)}
                />
              </Stack>

              {/* Status message */}
              {message && (
                <SectionMessage appearance={message.type === 'error' ? 'error' : 'confirmation'}>
                  <Text>{message.text}</Text>
                </SectionMessage>
              )}

              {/* Action buttons */}
              <ButtonGroup>
                <Button appearance="primary" onClick={handleSave} isLoading={saving}>
                  {t('space_settings.save_button')}
                </Button>
                <Button appearance="subtle" onClick={handleReset} isDisabled={saving}>
                  {t('space_settings.reset_button')}
                </Button>
              </ButtonGroup>
            </Stack>
            </Box>
          </TabPanel>

          {/* Statistics Tab */}
          <TabPanel>
            <Box xcss={tabPanelStyle}>
            <Stack space="space.200">
              {statsLoading && <Spinner size="medium" />}

              {statsData && (
                <Inline space="space.400">
                  <Stack space="space.050">
                    <Text>{t('admin.audit.classified_pages')}</Text>
                    <Heading size="medium">{statsData.classifiedPages} / {statsData.totalPages}</Heading>
                  </Stack>
                </Inline>
              )}

              {/* Coverage toggle — keep in sync with the identical toggle
                 in admin.jsx (Audit tab). */}
              <Inline space="space.100" alignBlock="center">
                <Toggle
                  id="coverage-toggle"
                  isChecked={showUnclassified}
                  onChange={() => setShowUnclassified(!showUnclassified)}
                />
                <Label labelFor="coverage-toggle">{t('admin.audit.show_unclassified')}</Label>
              </Inline>

              {/* Distribution chart — when "show unclassified" is OFF, unclassified
                 pages are rolled into the default level so the chart always reflects
                 the effective classification of every page.
                 Keep chart logic in sync with admin.jsx (Audit tab). */}
              {statsData && statsData.totalPages > 0 && (() => {
                const unclassified = statsData.totalPages - statsData.classifiedPages;
                const chartData = (statsData.distribution || []).map((l) => ({ ...l }));
                if (showUnclassified) {
                  // Show unclassified as a separate slice
                  if (unclassified > 0) {
                    chartData.push({ level: t('admin.audit.unclassified'), count: unclassified });
                  }
                } else if (unclassified > 0 && defaultLevelId) {
                  // Roll unclassified pages into the default level
                  const defaultEntry = chartData.find((d) => d.level === defaultLevelId);
                  if (defaultEntry) {
                    defaultEntry.count += unclassified;
                  }
                }
                const filtered = chartData.filter((l) => l.count > 0);
                return filtered.length > 0 ? (
                  <Stack space="space.100">
                    <Heading size="small">{t('admin.audit.distribution')}</Heading>
                    <DonutChart
                      data={filtered}
                      colorAccessor="level"
                      valueAccessor="count"
                      labelAccessor="level"
                    />
                  </Stack>
                ) : null;
              })()}

              {/* Recently classified pages — same table as admin.jsx (Audit tab),
                 scoped to this space. Keep in sync with admin.jsx. */}
              <Heading size="small">{t('admin.audit.recent_changes')}</Heading>
              <DynamicTable
                head={{
                  cells: [
                    { key: 'title', content: t('admin.audit.page') },
                  ],
                }}
                rows={(statsData?.recentPages || []).map((page, index) => ({
                  key: page.id || String(index),
                  cells: [
                    { key: 'title', content: <Text>{page.title}</Text> },
                  ],
                }))}
                rowsPerPage={20}
                emptyView={<Text>{t('admin.audit.empty')}</Text>}
                isLoading={statsLoading}
              />
            </Stack>
            </Box>
          </TabPanel>
        </Tabs>
      </Stack>
    </Box>
  );
};

ForgeReconciler.render(
  <I18nProvider>
    <App />
  </I18nProvider>
);
