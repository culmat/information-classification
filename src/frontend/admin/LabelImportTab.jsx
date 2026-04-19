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
  Toggle,
  Label,
  Link,
  Lozenge,
  ProgressBar,
  Tooltip,
  xcss,
} from '@forge/react';
import { colorToLozenge } from '../../shared/constants';
import { interpolate, formatSessionEta } from '../../shared/i18n';

const tabPanelStyle = xcss({ paddingTop: 'space.100' });

const ACTIVITY_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const EMPTY_IMPORT_COUNT = {
  labelled: 0,
  alreadyClassified: 0,
  toClassify: 0,
  cql: { labelled: '', alreadyClassified: '', toClassify: '' },
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
}) => (
  <Box xcss={tabPanelStyle}>
    <Stack space="space.200">
      {pendingLabelJobs
        .filter((j) => j.jobKind === 'label-import')
        .map((job) => (
          <SectionMessage
            key={job.jobId}
            appearance="information"
            actions={[
              <Button
                key="resume"
                testId={`admin-labels-import-resume-${job.jobId}`}
                appearance="primary"
                onClick={() => resumeLabelJob(job)}
                isDisabled={importStep === 'running' || importSettling}
              >
                {t('admin.import.resume_button')}
              </Button>,
              <Button
                key="discard"
                testId={`admin-labels-import-discard-${job.jobId}`}
                appearance="subtle"
                onClick={() => discardLabelJob(job)}
                isDisabled={importStep === 'running' || importSettling}
              >
                {t('admin.import.discard_button')}
              </Button>,
            ]}
          >
            <Text>
              {interpolate(t('admin.import.paused_banner'), {
                classified: job.classified || 0,
                total: job.totalEstimate || 0,
                labels: formatMappingLabels(job.mappings, 'label-import'),
              })}
            </Text>
          </SectionMessage>
        ))}
      <DynamicTable
        head={{
          cells: [
            {
              key: 'level',
              content: t('admin.import.level_column'),
            },
            {
              key: 'labels',
              content: t('admin.import.labels_column'),
            },
            {
              key: 'labelled',
              content: t('admin.import.labelled_column'),
            },
            {
              key: 'alreadyClassified',
              content: t('admin.import.already_classified_column'),
            },
            {
              key: 'toClassify',
              content: (
                <Inline space="space.050" alignBlock="center">
                  <Text>{t('admin.import.to_classify_column')}</Text>
                  <Tooltip content={t('admin.import.to_classify_tooltip')}>
                    <Button
                      appearance="subtle"
                      spacing="compact"
                      iconBefore="editor-info"
                      onClick={() => {}}
                    >
                      {' '}
                    </Button>
                  </Tooltip>
                  <Button
                    testId="admin-labels-import-refresh"
                    appearance="subtle"
                    spacing="compact"
                    iconBefore="refresh"
                    isLoading={importCountLoading}
                    onClick={() => refreshImportCounts()}
                  >
                    {' '}
                  </Button>
                </Inline>
              ),
            },
          ],
        }}
        rows={(config?.levels || [])
          .filter((l) => l.allowed)
          .map((level) => {
            const record = importCounts[level.id] || EMPTY_IMPORT_COUNT;
            const selected = importLabels[level.id] || [];
            const renderCount = (n, cql) => {
              if (importLevelLoading[level.id]) {
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
                  key: 'labels',
                  content: (
                    <Select
                      testId={`admin-labels-import-labels-${level.id}`}
                      isMulti
                      isSearchable
                      isClearable
                      isDisabled={
                        pendingLabelJobs.some(
                          (j) => j.jobKind === 'label-import',
                        ) ||
                        importStep === 'running' ||
                        importSettling
                      }
                      spacing="compact"
                      isLoading={labelsLoading}
                      options={availableLabels}
                      value={selected}
                      onChange={(val) => {
                        const newVal = val || [];
                        setImportLabels((prev) => ({
                          ...prev,
                          [level.id]: newVal,
                        }));
                        refreshLevelCount(level.id, newVal);
                      }}
                      placeholder={t('admin.import.labels_placeholder')}
                    />
                  ),
                },
                {
                  key: 'labelled',
                  content: renderCount(record.labelled, record.cql?.labelled),
                },
                {
                  key: 'alreadyClassified',
                  content: renderCount(
                    record.alreadyClassified,
                    record.cql?.alreadyClassified,
                  ),
                },
                {
                  key: 'toClassify',
                  content: renderCount(
                    record.toClassify,
                    record.cql?.toClassify,
                  ),
                },
              ],
            };
          })}
      />

      {!importCountLoading &&
        Object.values(importCounts).reduce(
          (s, c) => s + (c?.labelled || 0),
          0,
        ) === 0 &&
        Object.values(importLabels).some((arr) => (arr || []).length > 0) && (
          <SectionMessage appearance="information">
            <Text>{t('admin.import.no_pages_found')}</Text>
          </SectionMessage>
        )}

      {!importCountLoading &&
        Object.values(importCounts).reduce(
          (s, c) => s + (c?.labelled || 0),
          0,
        ) > 0 &&
        Object.values(importCounts).reduce(
          (s, c) => s + (c?.toClassify || 0),
          0,
        ) === 0 && (
          <SectionMessage appearance="information">
            <Text>{t('admin.import.nothing_to_classify_hint')}</Text>
          </SectionMessage>
        )}

      <Stack space="space.100">
        {(() => {
          const importLocked =
            pendingLabelJobs.some((j) => j.jobKind === 'label-import') ||
            importStep === 'running' ||
            importSettling;
          return (
            <>
              <Inline space="space.200" alignBlock="center">
                <Inline space="space.100" alignBlock="center">
                  <Radio
                    testId="admin-labels-import-scope-all"
                    value="all"
                    isChecked={importScopeAll}
                    isDisabled={importLocked}
                    onChange={() => {
                      setImportScopeAll(true);
                      onScopeChange();
                    }}
                    label=""
                  />
                  <Text>{t('admin.import.scope_all')}</Text>
                </Inline>
                <Inline space="space.100" alignBlock="center">
                  <Radio
                    testId="admin-labels-import-scope-space"
                    value="space"
                    isChecked={!importScopeAll}
                    isDisabled={importLocked}
                    onChange={() => {
                      setImportScopeAll(false);
                      onScopeChange();
                    }}
                    label=""
                  />
                  <Text>{t('admin.import.scope_space')}</Text>
                </Inline>
              </Inline>
              {!importScopeAll && (
                <Select
                  testId="admin-labels-import-spaces"
                  isMulti
                  isDisabled={importLocked}
                  options={availableSpaces}
                  value={importSpaceKeys}
                  onChange={(selected) => {
                    setImportSpaceKeys(selected || []);
                    setTimeout(() => {
                      importSpaceKeysRef.current = selected || [];
                      refreshImportCounts();
                    }, 50);
                  }}
                  placeholder={t('admin.import.scope_empty')}
                />
              )}
            </>
          );
        })()}
      </Stack>

      {(() => {
        const pendingImport = pendingLabelJobs.find(
          (j) => j.jobKind === 'label-import',
        );
        const locked =
          !!pendingImport || importStep === 'running' || importSettling;
        const effectiveValue = pendingImport
          ? !!pendingImport.removeLabels
          : importRemoveLabels;
        return (
          <>
            <Inline space="space.100" alignBlock="center">
              <Toggle
                testId="admin-labels-import-remove-labels"
                id="import-remove-labels"
                isChecked={effectiveValue}
                isDisabled={locked}
                onChange={() => setImportRemoveLabels(!importRemoveLabels)}
              />
              <Label labelFor="import-remove-labels">
                {t('admin.import.remove_labels')}
              </Label>
            </Inline>
            {!effectiveValue && (
              <SectionMessage appearance="information">
                <Text>{t('admin.import.remove_labels_help')}</Text>
              </SectionMessage>
            )}
          </>
        );
      })()}

      <Button
        testId="admin-labels-import-start"
        appearance="primary"
        onClick={startImport}
        isDisabled={
          importStep === 'running' ||
          importSettling ||
          exportLoading ||
          exportSettling ||
          pendingLabelJobs.some((j) => j.jobKind === 'label-import') ||
          Object.values(importCounts).reduce(
            (s, c) => s + (c?.toClassify || 0),
            0,
          ) === 0
        }
        isLoading={importStep === 'running' || importSettling}
      >
        {t('admin.import.start_button')}
      </Button>

      {importStep === 'running' && importProgress && (
        <Stack space="space.050" testId="admin-labels-import-progress">
          <Inline space="space.100" alignBlock="center">
            <Text>
              {ACTIVITY_FRAMES[labelActivityFrame]}{' '}
              {importProgress.classified || 0} / {importProgress.total || '?'}
            </Text>
            <Button
              testId="admin-labels-import-stop"
              appearance="subtle"
              spacing="compact"
              onClick={() => {
                importStopRef.current = true;
              }}
            >
              {t('classify.stop_button')}
            </Button>
          </Inline>
          <ProgressBar
            value={
              importProgress.total > 0
                ? (importProgress.classified || 0) / importProgress.total
                : 0
            }
          />
          {(importProgress.classified || 0) > 0 &&
            importProgress.sessionStartedAt &&
            (() => {
              const remaining = Math.max(
                0,
                (importProgress.total || 0) - (importProgress.classified || 0),
              );
              const eta = formatSessionEta(
                importProgress.sessionStartedAt,
                (importProgress.classified || 0) -
                  (importProgress.sessionClassifiedStart || 0),
                remaining,
                t,
              );
              return eta ? <Text>{eta}</Text> : null;
            })()}
        </Stack>
      )}
      {importStep === 'done' && importProgress && (
        <SectionMessage appearance="confirmation">
          <Text>
            {interpolate(t('admin.import.complete'), {
              classified: importProgress.classified || 0,
              labels: formatMappingLabels(
                importProgress.mappings,
                'label-import',
              ),
            })}
          </Text>
        </SectionMessage>
      )}
      {importSettling && (
        <SectionMessage appearance="information">
          <Text>{t('admin.import.settling_hint')}</Text>
        </SectionMessage>
      )}

      <SectionMessage appearance="information">
        <Text>{t('admin.import.never_weaken')}</Text>
      </SectionMessage>
      <SectionMessage appearance="information">
        <Text>{t('admin.import.index_lag_hint')}</Text>
      </SectionMessage>
    </Stack>
  </Box>
);

export default LabelImportTab;
