import React from 'react';
import {
  Box,
  Stack,
  Inline,
  Button,
  Text,
  SectionMessage,
  DynamicTable,
  Select,
  Spinner,
  Radio,
  Textfield,
  Link,
  Lozenge,
  ProgressBar,
  xcss,
} from '@forge/react';
import { colorToLozenge, isValidLabel } from '../../shared/constants';
import { interpolate, formatSessionEta } from '../../shared/i18n';

const tabPanelStyle = xcss({ paddingTop: 'space.100' });

const ACTIVITY_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const EMPTY_EXPORT_COUNT = {
  classified: 0,
  alreadyLabelled: 0,
  toLabel: 0,
  cql: { classified: '', alreadyLabelled: '', toLabel: '' },
};

function formatMappingLabels(mappings, jobKind) {
  const seen = new Set();
  for (const m of mappings || []) {
    if (jobKind === 'label-import') {
      for (const l of m.labels || []) if (l) seen.add(l);
    } else if (m?.labelName) {
      seen.add(m.labelName);
    }
  }
  return Array.from(seen).join(', ');
}

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
}) => (
  <Box xcss={tabPanelStyle}>
    <Stack space="space.100">
      <Text>{t('admin.export.description')}</Text>
      {pendingLabelJobs
        .filter((j) => j.jobKind === 'label-export')
        .map((job) => (
          <SectionMessage
            key={job.jobId}
            appearance="information"
            actions={[
              <Button
                key="resume"
                testId={`admin-labels-export-resume-${job.jobId}`}
                appearance="primary"
                onClick={() => resumeLabelJob(job)}
                isDisabled={exportLoading || exportSettling}
              >
                {t('admin.export.resume_button')}
              </Button>,
              <Button
                key="discard"
                testId={`admin-labels-export-discard-${job.jobId}`}
                appearance="subtle"
                onClick={() => discardLabelJob(job)}
                isDisabled={exportLoading || exportSettling}
              >
                {t('admin.export.discard_button')}
              </Button>,
            ]}
          >
            <Text>
              {interpolate(t('admin.export.paused_banner'), {
                classified: job.classified || 0,
                total: job.totalEstimate || 0,
                labels: formatMappingLabels(job.mappings, 'label-export'),
              })}
            </Text>
          </SectionMessage>
        ))}
      <DynamicTable
        head={{
          cells: [
            { key: 'level', content: t('admin.export.level_column') },
            { key: 'label', content: t('admin.export.label_name') },
            {
              key: 'classified',
              content: t('admin.export.classified_column'),
            },
            {
              key: 'alreadyLabelled',
              content: t('admin.export.already_labelled_column'),
            },
            {
              key: 'toLabel',
              content: (
                <Inline space="space.050" alignBlock="center">
                  <Text>{t('admin.export.to_label_column')}</Text>
                  <Button
                    testId="admin-labels-export-refresh"
                    appearance="subtle"
                    spacing="compact"
                    iconBefore="refresh"
                    isLoading={exportCountLoading}
                    onClick={() => refreshExportCounts()}
                  >
                    {' '}
                  </Button>
                </Inline>
              ),
            },
          ],
        }}
        rows={(config?.levels || []).map((level) => {
          const record = exportCounts[level.id] || EMPTY_EXPORT_COUNT;
          const renderCount = (n, cql) => {
            if (exportLevelLoading[level.id]) {
              return <Spinner size="small" />;
            }
            if (!cql) return <Text>{String(n ?? 0)}</Text>;
            return (
              <Link
                href={`/wiki/search?cql=${encodeURIComponent(cql)}`}
                openNewTab
              >
                {String(n)}
              </Link>
            );
          };
          return {
            key: level.id,
            cells: [
              {
                key: 'level',
                content: (
                  <Lozenge isBold appearance={colorToLozenge(level.color)}>
                    {level.id}
                  </Lozenge>
                ),
              },
              {
                key: 'label',
                content: (() => {
                  const value = exportMappings[level.id] ?? level.id;
                  const invalid = value.length > 0 && !isValidLabel(value);
                  const exportLocked =
                    pendingLabelJobs.some(
                      (j) => j.jobKind === 'label-export',
                    ) ||
                    exportLoading ||
                    exportSettling;
                  return (
                    <Stack space="space.050">
                      <Textfield
                        testId={`admin-labels-export-label-${level.id}`}
                        value={value}
                        isInvalid={invalid}
                        isDisabled={exportLocked}
                        onChange={(e) => {
                          const next = e.target.value.replace(/\s+/g, '');
                          setExportMappings((prev) => ({
                            ...prev,
                            [level.id]: next,
                          }));
                          refreshExportLevelCount(level.id, next);
                        }}
                      />
                      <Text>
                        {invalid ? t('admin.export.label_invalid_hint') : ''}
                      </Text>
                    </Stack>
                  );
                })(),
              },
              {
                key: 'classified',
                content: renderCount(record.classified, record.cql?.classified),
              },
              {
                key: 'alreadyLabelled',
                content: renderCount(
                  record.alreadyLabelled,
                  record.cql?.alreadyLabelled,
                ),
              },
              {
                key: 'toLabel',
                content: renderCount(record.toLabel, record.cql?.toLabel),
              },
            ],
          };
        })}
      />

      {Object.keys(exportCounts).length > 0 &&
        Object.values(exportCounts).reduce(
          (s, c) => s + (c?.classified || 0),
          0,
        ) === 0 && (
          <SectionMessage appearance="warning">
            <Text>{t('admin.export.no_classifications')}</Text>
          </SectionMessage>
        )}

      {Object.keys(exportCounts).length > 0 &&
        Object.values(exportCounts).reduce(
          (s, c) => s + (c?.classified || 0),
          0,
        ) > 0 &&
        Object.values(exportCounts).reduce(
          (s, c) => s + (c?.toLabel || 0),
          0,
        ) === 0 && (
          <SectionMessage appearance="information">
            <Text>{t('admin.export.nothing_to_label_hint')}</Text>
          </SectionMessage>
        )}

      <Stack space="space.100">
        <Inline space="space.200" alignBlock="center">
          <Inline space="space.100" alignBlock="center">
            <Radio
              testId="admin-labels-export-scope-all"
              value="all"
              isChecked={exportScopeAll}
              isDisabled={
                pendingLabelJobs.some((j) => j.jobKind === 'label-export') ||
                exportLoading ||
                exportSettling
              }
              onChange={() => {
                setExportScopeAll(true);
                setTimeout(() => refreshExportCounts(), 50);
              }}
              label=""
            />
            <Text>{t('admin.import.scope_all')}</Text>
          </Inline>
          <Inline space="space.100" alignBlock="center">
            <Radio
              testId="admin-labels-export-scope-space"
              value="space"
              isChecked={!exportScopeAll}
              isDisabled={
                pendingLabelJobs.some((j) => j.jobKind === 'label-export') ||
                exportLoading ||
                exportSettling
              }
              onChange={() => {
                setExportScopeAll(false);
                setTimeout(() => refreshExportCounts(), 50);
              }}
              label=""
            />
            <Text>{t('admin.import.scope_space')}</Text>
          </Inline>
        </Inline>
        {!exportScopeAll && (
          <Select
            testId="admin-labels-export-spaces"
            isMulti
            isDisabled={
              pendingLabelJobs.some((j) => j.jobKind === 'label-export') ||
              exportLoading ||
              exportSettling
            }
            options={availableSpaces}
            value={exportSpaceKeys}
            onChange={(selected) => {
              setExportSpaceKeys(selected || []);
              setTimeout(() => {
                exportSpaceKeysRef.current = selected || [];
                refreshExportCounts();
              }, 50);
            }}
            placeholder={t('admin.import.scope_empty')}
          />
        )}
      </Stack>

      <Button
        testId="admin-labels-export-start"
        appearance="primary"
        onClick={startExport}
        isLoading={exportLoading || exportSettling}
        isDisabled={
          exportLoading ||
          exportSettling ||
          importSettling ||
          pendingLabelJobs.some((j) => j.jobKind === 'label-export') ||
          (exportProgress && !exportProgress.done) ||
          (Object.keys(exportCounts).length > 0 &&
            Object.values(exportCounts).reduce(
              (s, c) => s + (c?.toLabel || 0),
              0,
            ) === 0)
        }
      >
        {t('admin.export.start_button')}
      </Button>
      {exportProgress && !exportProgress.done && (
        <Stack space="space.050" testId="admin-labels-export-progress">
          <Inline space="space.100" alignBlock="center">
            <Text>
              {ACTIVITY_FRAMES[labelActivityFrame]}{' '}
              {exportProgress.classified || 0} / {exportProgress.total || '?'}
            </Text>
            <Button
              testId="admin-labels-export-stop"
              appearance="subtle"
              spacing="compact"
              onClick={() => {
                exportStopRef.current = true;
              }}
            >
              {t('classify.stop_button')}
            </Button>
          </Inline>
          <ProgressBar
            value={
              exportProgress.total > 0
                ? (exportProgress.classified || 0) / exportProgress.total
                : 0
            }
          />
          {(exportProgress.classified || 0) > 0 &&
            exportProgress.sessionStartedAt &&
            (() => {
              const remaining = Math.max(
                0,
                (exportProgress.total || 0) - (exportProgress.classified || 0),
              );
              const eta = formatSessionEta(
                exportProgress.sessionStartedAt,
                (exportProgress.classified || 0) -
                  (exportProgress.sessionClassifiedStart || 0),
                remaining,
                t,
              );
              return eta ? <Text>{eta}</Text> : null;
            })()}
        </Stack>
      )}
      {exportProgress && exportProgress.done && (
        <SectionMessage appearance="confirmation">
          <Text>
            {interpolate(t('admin.export.complete'), {
              exported: exportProgress.classified || 0,
              labels: formatMappingLabels(
                exportProgress.mappings,
                'label-export',
              ),
            })}
          </Text>
        </SectionMessage>
      )}
      {exportSettling && (
        <SectionMessage appearance="information">
          <Text>{t('admin.export.settling_hint')}</Text>
        </SectionMessage>
      )}
    </Stack>
  </Box>
);

export default LabelExportTab;
