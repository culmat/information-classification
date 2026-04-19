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
  Lozenge,
  Spinner,
  SectionMessage,
  Tabs,
  Tab,
  TabList,
  TabPanel,
  Image,
  xcss,
} from '@forge/react';
import { invoke, showFlag } from '@forge/bridge';
import { colorToLozenge } from '../shared/constants';
import { localize } from '../shared/i18n';
import StatisticsPanel from './StatisticsPanel';
import appIcon from './assets/app-icon.png';

const containerStyle = xcss({ padding: 'space.400', maxWidth: '640px' });
/* TabPanel renders no top padding — add it manually (same workaround as byline.jsx). */
const tabPanelStyle = xcss({ paddingTop: 'space.100' });
/* See admin.jsx for why we clamp the header logo via a Box wrapper. */
const headerIconStyle = xcss({ width: '28px', height: '28px' });

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
  const [savedEnabledLevelIds, setSavedEnabledLevelIds] = useState([]);
  const [showUnclassified, setShowUnclassified] = useState(true); // coverage toggle
  const isDirty =
    JSON.stringify([...enabledLevelIds].sort()) !==
    JSON.stringify([...savedEnabledLevelIds].sort());

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
          const globalAllowed = (result.globalConfig.levels || [])
            .filter((l) => l.allowed)
            .map((l) => l.id);

          if (result.spaceConfig) {
            const ids = result.spaceConfig.allowedLevelIds || globalAllowed;
            setEnabledLevelIds(ids);
            setSavedEnabledLevelIds(ids);
          } else {
            setEnabledLevelIds(globalAllowed);
            setSavedEnabledLevelIds(globalAllowed);
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
        : [...prev, levelId],
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
        },
      });
      if (result.success) {
        setSavedEnabledLevelIds(enabledLevelIds);
        setMessage(null);
        showFlag({
          id: 'space-settings-saved',
          title: t('space_settings.save_success'),
          type: 'success',
          isAutoDismiss: true,
        });
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to save.' });
      }
    } catch (error) {
      console.error('Failed to save space config:', error);
      setMessage({ type: 'error', text: 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  }, [spaceKey, enabledLevelIds, t]);

  const handleReset = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await invoke('resetSpaceConfig', { spaceKey });
      if (result.success) {
        // Reset UI to global defaults
        const globalAllowed = (globalConfig.levels || [])
          .filter((l) => l.allowed)
          .map((l) => l.id);
        setEnabledLevelIds(globalAllowed);
        setSavedEnabledLevelIds(globalAllowed);
        setSpaceConfig(null);
        setMessage(null);
        showFlag({
          id: 'space-settings-reset',
          title: t('space_settings.reset_success'),
          type: 'success',
          isAutoDismiss: true,
        });
      }
    } catch (error) {
      console.error('Failed to reset space config:', error);
    } finally {
      setSaving(false);
    }
  }, [spaceKey, globalConfig, t]);

  const refreshStats = async () => {
    setStatsLoading(true);
    try {
      const result = await invoke('getAuditData', { spaceKey });
      if (result.success) setStatsData(result);
    } catch (error) {
      console.error('Failed to load space statistics:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  // Load statistics — now the default tab, so load on mount
  const loadStats = useCallback(async () => {
    if (statsData || statsLoading || !spaceKey) return;
    setStatsLoading(true);
    try {
      const result = await invoke('getAuditData', { spaceKey });
      if (result.success) setStatsData(result);
    } catch (error) {
      console.error('Failed to load space statistics:', error);
      setStatsData({
        distribution: [],
        totalPages: 0,
        classifiedPages: 0,
        recentPages: [],
      });
    } finally {
      setStatsLoading(false);
    }
  }, [spaceKey, statsData, statsLoading]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // License check: only enforce in production where Marketplace injects license info.
  const licensed =
    context?.environmentType !== 'PRODUCTION' ||
    context?.license?.active === true;

  if (loading) {
    return (
      <Box xcss={containerStyle}>
        <Spinner size="large" />
      </Box>
    );
  }

  if (!licensed) {
    return (
      <Box xcss={containerStyle}>
        <SectionMessage
          appearance="warning"
          title={t('license.inactive_title')}
        >
          <Text>{t('license.inactive_message')}</Text>
        </SectionMessage>
      </Box>
    );
  }

  // Only show globally-allowed levels as toggleable options
  const globalAllowedLevels = (globalConfig?.levels || []).filter(
    (l) => l.allowed,
  );

  return (
    <Box xcss={containerStyle}>
      <Stack space="space.300">
        <Inline space="space.100" alignBlock="center" alignInline="start">
          <Box xcss={headerIconStyle}>
            <Image src={appIcon} alt="" width={28} height={28} />
          </Box>
          <Heading size="large">{t('space_settings.title')}</Heading>
        </Inline>

        <Tabs id="space-settings-tabs">
          <TabList>
            <Tab>{t('admin.tabs.statistics')}</Tab>
            <Tab>{t('admin.tabs.levels')}</Tab>
          </TabList>

          {/* Statistics Tab — visuals come from shared StatisticsPanel;
              keep props in sync with admin.jsx and statsMacro.jsx */}
          <TabPanel>
            <StatisticsPanel
              data={statsData}
              levels={globalAllowedLevels}
              defaultLevelId={globalConfig?.defaultLevelId}
              showUnclassified={showUnclassified}
              onToggleUnclassified={() =>
                setShowUnclassified(!showUnclassified)
              }
              isLoading={statsLoading}
              onRefresh={refreshStats}
              spaceFilter={` AND space="${spaceKey}"`}
              t={t}
            />
          </TabPanel>

          {/* Configuration Tab */}
          <TabPanel>
            <Box xcss={tabPanelStyle}>
              <Stack space="space.200">
                <Text>{t('space_settings.description')}</Text>

                {/* Level enable/disable checkboxes */}
                <Stack space="space.050">
                  <Heading size="small">
                    {t('space_settings.enabled_levels')}
                  </Heading>
                  {globalAllowedLevels.map((level) => (
                    <Inline
                      key={level.id}
                      space="space.100"
                      alignBlock="center"
                    >
                      <Checkbox
                        isChecked={enabledLevelIds.includes(level.id)}
                        onChange={() => handleToggleLevel(level.id)}
                        label=""
                      />
                      <Lozenge isBold appearance={colorToLozenge(level.color)}>
                        {localize(level.name, 'en')}
                      </Lozenge>
                    </Inline>
                  ))}
                </Stack>

                {/* Status message */}
                {message && (
                  <SectionMessage
                    appearance={
                      message.type === 'error' ? 'error' : 'confirmation'
                    }
                  >
                    <Text>{message.text}</Text>
                  </SectionMessage>
                )}

                {/* Action buttons */}
                <ButtonGroup>
                  <Button
                    appearance="primary"
                    onClick={handleSave}
                    isLoading={saving}
                    isDisabled={!isDirty}
                  >
                    {t('space_settings.save_button')}
                  </Button>
                  <Button
                    appearance="subtle"
                    onClick={handleReset}
                    isDisabled={saving}
                  >
                    {t('space_settings.reset_button')}
                  </Button>
                </ButtonGroup>
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
  </I18nProvider>,
);
