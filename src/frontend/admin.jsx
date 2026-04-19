/**
 * Admin configuration page — accessible via Confluence Settings → Information Classification.
 *
 * Four tabs:
 * 1. Levels — manage classification levels (add, edit, delete, reorder)
 * 2. Contacts — manage contact persons (user, email, free text)
 * 3. Links — manage reference links
 * 4. Audit — view statistics and recent classification changes
 */

import React, { useCallback, useEffect, useState } from 'react';
import ForgeReconciler, {
  useProductContext,
  useTranslation,
  I18nProvider,
  Box,
  Text,
  Spinner,
  SectionMessage,
  xcss,
} from '@forge/react';
import { invoke, showFlag } from '@forge/bridge';
import useImportState from './admin/useImportState';
import useExportState from './admin/useExportState';
import useLabelSyncJobs from './admin/useLabelSyncJobs';
import useConfigEditing from './admin/useConfigEditing';
import AdminView from './admin/AdminView';

const containerStyle = xcss({ padding: 'space.400', maxWidth: '960px' });

const App = () => {
  const context = useProductContext();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState(null);
  const [savedConfig, setSavedConfig] = useState(null);
  const [auditData, setAuditData] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [showUnclassified, setShowUnclassified] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [message, setMessage] = useState(null);
  const isDirty =
    config &&
    savedConfig &&
    JSON.stringify(config) !== JSON.stringify(savedConfig);

  const importApi = useImportState({ config });
  const exportApi = useExportState({ config });
  const jobsApi = useLabelSyncJobs({ config, importApi, exportApi });
  const editor = useConfigEditing({ config, setConfig, t });

  // Memoised: StatisticsPanel subscribes to changes of this callback's
  // identity (useEffect dep). When admin re-renders frequently (e.g. under
  // the 120 ms activity-indicator tick during a label-sync job), an
  // unmemoised function identity would tear down and rebuild the realtime
  // subscription 8×/sec — a measurable gateway-call flood.
  const refreshAuditData = useCallback(async () => {
    setAuditLoading(true);
    try {
      const auditResult = await invoke('getAuditData');
      if (auditResult.success) setAuditData(auditResult);
    } catch (error) {
      console.error('Failed to load audit data:', error);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const configResult = await invoke('getConfig');
        if (configResult.success) {
          setConfig(configResult.config);
          setSavedConfig(configResult.config);
        }
      } catch (error) {
        console.error('Failed to load config:', error);
        setMessage({ type: 'error', text: t('admin.save_error') });
      }
      await refreshAuditData();
      setLoading(false);
    })();
  }, [t, refreshAuditData]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await invoke('setConfig', { config });
      if (result.success) {
        setSavedConfig(config);
        setMessage(null);
        showFlag({
          id: 'config-saved',
          title: t('admin.save_success'),
          type: 'success',
          isAutoDismiss: true,
        });
      } else {
        setMessage({
          type: 'error',
          text: result.error || t('admin.save_error'),
        });
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      setMessage({ type: 'error', text: t('admin.save_error') });
    } finally {
      setSaving(false);
    }
  }, [config, t]);

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

  return (
    <AdminView
      t={t}
      config={config}
      setConfig={setConfig}
      message={message}
      saving={saving}
      isDirty={isDirty}
      handleSave={handleSave}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      auditData={auditData}
      auditLoading={auditLoading}
      showUnclassified={showUnclassified}
      setShowUnclassified={setShowUnclassified}
      refreshAuditData={refreshAuditData}
      importApi={importApi}
      exportApi={exportApi}
      jobsApi={jobsApi}
      editor={editor}
    />
  );
};

ForgeReconciler.render(
  <I18nProvider>
    <App />
  </I18nProvider>,
);
