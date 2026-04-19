import React from 'react';
import {
  Inline,
  Button,
  Text,
  DynamicTable,
  Select,
  Spinner,
  Link,
  Lozenge,
  Tooltip,
} from '@forge/react';
import { colorToLozenge } from '../../shared/constants';

const EMPTY_IMPORT_COUNT = {
  labelled: 0,
  alreadyClassified: 0,
  toClassify: 0,
  cql: { labelled: '', alreadyClassified: '', toClassify: '' },
};

const ImportCountTable = ({
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
  refreshImportCounts,
  refreshLevelCount,
}) => {
  const importLocked =
    pendingLabelJobs.some((j) => j.jobKind === 'label-import') ||
    importStep === 'running' ||
    importSettling;
  const renderCount = (levelId, n, cql) => {
    if (importLevelLoading[levelId]) {
      return <Spinner size="small" />;
    }
    if (!cql) return <Text>{String(n ?? 0)}</Text>;
    return (
      <Link href={`/wiki/search?cql=${encodeURIComponent(cql)}`} openNewTab>
        {String(n)}
      </Link>
    );
  };
  return (
    <DynamicTable
      head={{
        cells: [
          { key: 'level', content: t('admin.import.level_column') },
          { key: 'labels', content: t('admin.import.labels_column') },
          { key: 'labelled', content: t('admin.import.labelled_column') },
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
                    isDisabled={importLocked}
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
                content: renderCount(
                  level.id,
                  record.labelled,
                  record.cql?.labelled,
                ),
              },
              {
                key: 'alreadyClassified',
                content: renderCount(
                  level.id,
                  record.alreadyClassified,
                  record.cql?.alreadyClassified,
                ),
              },
              {
                key: 'toClassify',
                content: renderCount(
                  level.id,
                  record.toClassify,
                  record.cql?.toClassify,
                ),
              },
            ],
          };
        })}
    />
  );
};

export default ImportCountTable;
