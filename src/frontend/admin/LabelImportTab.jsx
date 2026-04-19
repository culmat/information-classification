import React from 'react';
import {
  Box,
  Stack,
  Inline,
  Button,
  Text,
  SectionMessage,
  Toggle,
  Label,
  xcss,
} from '@forge/react';
import { interpolate } from '../../shared/i18n';
import ImportCountTable from './ImportCountTable';
import ScopeSelector from './ScopeSelector';
import SyncProgress, { PausedBanners } from './SyncProgress';
import { formatMappingLabels } from './labelSyncHelpers';

const tabPanelStyle = xcss({ paddingTop: 'space.100' });

const LabelImportTab = ({
  t,
  config,
  pendingLabelJobs,
  importStep,
  importSettling,
  importCounts,
  importLabels,
  setImportLabels,
  importLevelLoading,
  importCountLoading,
  labelsLoading,
  availableLabels,
  importScopeAll,
  setImportScopeAll,
  availableSpaces,
  importSpaceKeys,
  setImportSpaceKeys,
  importSpaceKeysRef,
  importRemoveLabels,
  setImportRemoveLabels,
  exportLoading,
  exportSettling,
  importProgress,
  labelActivityFrame,
  importStopRef,
  resumeLabelJob,
  discardLabelJob,
  refreshImportCounts,
  refreshLevelCount,
  onScopeChange,
  startImport,
}) => {
  const importLocked =
    pendingLabelJobs.some((j) => j.jobKind === 'label-import') ||
    importStep === 'running' ||
    importSettling;

  const totalLabelled = Object.values(importCounts).reduce(
    (s, c) => s + (c?.labelled || 0),
    0,
  );
  const totalToClassify = Object.values(importCounts).reduce(
    (s, c) => s + (c?.toClassify || 0),
    0,
  );
  const anyLabelsPicked = Object.values(importLabels).some(
    (arr) => (arr || []).length > 0,
  );

  const pendingImport = pendingLabelJobs.find(
    (j) => j.jobKind === 'label-import',
  );
  const effectiveRemoveLabels = pendingImport
    ? !!pendingImport.removeLabels
    : importRemoveLabels;

  return (
    <Box xcss={tabPanelStyle}>
      <Stack space="space.200">
        <PausedBanners
          t={t}
          jobKind="label-import"
          testIdPrefix="admin-labels-import"
          translationPrefix="admin.import"
          pendingLabelJobs={pendingLabelJobs}
          locked={importStep === 'running' || importSettling}
          resumeLabelJob={resumeLabelJob}
          discardLabelJob={discardLabelJob}
          formatMappingLabels={formatMappingLabels}
        />
        <ImportCountTable
          t={t}
          config={config}
          pendingLabelJobs={pendingLabelJobs}
          importStep={importStep}
          importSettling={importSettling}
          importCounts={importCounts}
          importLabels={importLabels}
          setImportLabels={setImportLabels}
          importLevelLoading={importLevelLoading}
          importCountLoading={importCountLoading}
          labelsLoading={labelsLoading}
          availableLabels={availableLabels}
          refreshImportCounts={refreshImportCounts}
          refreshLevelCount={refreshLevelCount}
        />

        {!importCountLoading && totalLabelled === 0 && anyLabelsPicked && (
          <SectionMessage appearance="information">
            <Text>{t('admin.import.no_pages_found')}</Text>
          </SectionMessage>
        )}

        {!importCountLoading && totalLabelled > 0 && totalToClassify === 0 && (
          <SectionMessage appearance="information">
            <Text>{t('admin.import.nothing_to_classify_hint')}</Text>
          </SectionMessage>
        )}

        <ScopeSelector
          t={t}
          testIdPrefix="admin-labels-import"
          locked={importLocked}
          scopeAll={importScopeAll}
          setScopeAll={setImportScopeAll}
          availableSpaces={availableSpaces}
          spaceKeys={importSpaceKeys}
          setSpaceKeys={setImportSpaceKeys}
          spaceKeysRef={importSpaceKeysRef}
          onScopeChange={onScopeChange}
          onSpaceKeysChange={refreshImportCounts}
        />

        <Inline space="space.100" alignBlock="center">
          <Toggle
            testId="admin-labels-import-remove-labels"
            id="import-remove-labels"
            isChecked={effectiveRemoveLabels}
            isDisabled={importLocked}
            onChange={() => setImportRemoveLabels(!importRemoveLabels)}
          />
          <Label labelFor="import-remove-labels">
            {t('admin.import.remove_labels')}
          </Label>
        </Inline>
        {!effectiveRemoveLabels && (
          <SectionMessage appearance="information">
            <Text>{t('admin.import.remove_labels_help')}</Text>
          </SectionMessage>
        )}

        <Button
          testId="admin-labels-import-start"
          appearance="primary"
          onClick={startImport}
          isDisabled={
            importLocked ||
            exportLoading ||
            exportSettling ||
            totalToClassify === 0
          }
          isLoading={importStep === 'running' || importSettling}
        >
          {t('admin.import.start_button')}
        </Button>

        <SyncProgress
          t={t}
          testIdPrefix="admin-labels-import"
          labelActivityFrame={labelActivityFrame}
          isRunning={importStep === 'running'}
          progress={importProgress}
          stopRef={importStopRef}
          isDone={importStep === 'done' && !!importProgress}
          doneMessage={
            importProgress &&
            interpolate(t('admin.import.complete'), {
              classified: importProgress.classified || 0,
              labels: formatMappingLabels(
                importProgress.mappings,
                'label-import',
              ),
            })
          }
          settling={importSettling}
          settlingKey="admin.import.settling_hint"
        />

        <SectionMessage appearance="information">
          <Text>{t('admin.import.never_weaken')}</Text>
        </SectionMessage>
        <SectionMessage appearance="information">
          <Text>{t('admin.import.index_lag_hint')}</Text>
        </SectionMessage>
      </Stack>
    </Box>
  );
};

export default LabelImportTab;
