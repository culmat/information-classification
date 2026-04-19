import React from 'react';
import { Box, Stack, Button, Text, SectionMessage, xcss } from '@forge/react';
import { interpolate } from '../../shared/i18n';
import ExportCountTable from './ExportCountTable';
import ScopeSelector from './ScopeSelector';
import SyncProgress, { PausedBanners } from './SyncProgress';
import { formatMappingLabels } from './labelSyncHelpers';

const tabPanelStyle = xcss({ paddingTop: 'space.100' });

const LabelExportTab = ({
  t,
  config,
  pendingLabelJobs,
  exportLoading,
  exportSettling,
  importSettling,
  exportCounts,
  exportLevelLoading,
  exportCountLoading,
  exportMappings,
  setExportMappings,
  exportScopeAll,
  setExportScopeAll,
  availableSpaces,
  exportSpaceKeys,
  setExportSpaceKeys,
  exportSpaceKeysRef,
  exportProgress,
  labelActivityFrame,
  exportStopRef,
  resumeLabelJob,
  discardLabelJob,
  refreshExportCounts,
  refreshExportLevelCount,
  startExport,
}) => {
  const exportLocked =
    pendingLabelJobs.some((j) => j.jobKind === 'label-export') ||
    exportLoading ||
    exportSettling;

  const totalClassified = Object.values(exportCounts).reduce(
    (s, c) => s + (c?.classified || 0),
    0,
  );
  const totalToLabel = Object.values(exportCounts).reduce(
    (s, c) => s + (c?.toLabel || 0),
    0,
  );
  const hasCounts = Object.keys(exportCounts).length > 0;

  return (
    <Box xcss={tabPanelStyle}>
      <Stack space="space.100">
        <Text>{t('admin.export.description')}</Text>
        <PausedBanners
          t={t}
          jobKind="label-export"
          testIdPrefix="admin-labels-export"
          translationPrefix="admin.export"
          pendingLabelJobs={pendingLabelJobs}
          locked={exportLoading || exportSettling}
          resumeLabelJob={resumeLabelJob}
          discardLabelJob={discardLabelJob}
          formatMappingLabels={formatMappingLabels}
        />
        <ExportCountTable
          t={t}
          config={config}
          pendingLabelJobs={pendingLabelJobs}
          exportLoading={exportLoading}
          exportSettling={exportSettling}
          exportCounts={exportCounts}
          exportLevelLoading={exportLevelLoading}
          exportCountLoading={exportCountLoading}
          exportMappings={exportMappings}
          setExportMappings={setExportMappings}
          refreshExportCounts={refreshExportCounts}
          refreshExportLevelCount={refreshExportLevelCount}
        />

        {hasCounts && totalClassified === 0 && (
          <SectionMessage appearance="warning">
            <Text>{t('admin.export.no_classifications')}</Text>
          </SectionMessage>
        )}

        {hasCounts && totalClassified > 0 && totalToLabel === 0 && (
          <SectionMessage appearance="information">
            <Text>{t('admin.export.nothing_to_label_hint')}</Text>
          </SectionMessage>
        )}

        <ScopeSelector
          t={t}
          testIdPrefix="admin-labels-export"
          locked={exportLocked}
          scopeAll={exportScopeAll}
          setScopeAll={setExportScopeAll}
          availableSpaces={availableSpaces}
          spaceKeys={exportSpaceKeys}
          setSpaceKeys={setExportSpaceKeys}
          spaceKeysRef={exportSpaceKeysRef}
          onScopeChange={refreshExportCounts}
          onSpaceKeysChange={refreshExportCounts}
        />

        <Button
          testId="admin-labels-export-start"
          appearance="primary"
          onClick={startExport}
          isLoading={exportLoading || exportSettling}
          isDisabled={
            exportLocked ||
            importSettling ||
            (exportProgress && !exportProgress.done) ||
            (hasCounts && totalToLabel === 0)
          }
        >
          {t('admin.export.start_button')}
        </Button>

        <SyncProgress
          t={t}
          testIdPrefix="admin-labels-export"
          labelActivityFrame={labelActivityFrame}
          isRunning={!!(exportProgress && !exportProgress.done)}
          progress={exportProgress}
          stopRef={exportStopRef}
          isDone={!!(exportProgress && exportProgress.done)}
          doneMessage={
            exportProgress &&
            interpolate(t('admin.export.complete'), {
              exported: exportProgress.classified || 0,
              labels: formatMappingLabels(
                exportProgress.mappings,
                'label-export',
              ),
            })
          }
          settling={exportSettling}
          settlingKey="admin.export.settling_hint"
        />
      </Stack>
    </Box>
  );
};

export default LabelExportTab;
