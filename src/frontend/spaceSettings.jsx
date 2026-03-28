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
  xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { COLOR_TO_LOZENGE } from '../shared/constants';

function localize(obj, locale) {
  if (!obj || typeof obj === 'string') return obj || '';
  const lang = (locale || 'en').substring(0, 2);
  return obj[lang] || obj.en || Object.values(obj)[0] || '';
}

const containerStyle = xcss({ padding: 'space.400', maxWidth: '640px' });

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

  if (loading) {
    return <Box xcss={containerStyle}><Spinner size="large" /></Box>;
  }

  // Only show globally-allowed levels as toggleable options
  const globalAllowedLevels = (globalConfig?.levels || []).filter((l) => l.allowed);

  return (
    <Box xcss={containerStyle}>
      <Stack space="space.300">
        <Heading size="large">{t('space_settings.title')}</Heading>
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
              <Lozenge appearance={COLOR_TO_LOZENGE[level.color] || 'default'} isBold>
                {localize(level.name, 'en')}
              </Lozenge>
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
  );
};

ForgeReconciler.render(
  <I18nProvider>
    <App />
  </I18nProvider>
);
