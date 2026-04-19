import React from 'react';
import {
  Stack,
  Inline,
  Button,
  Text,
  DynamicTable,
  Spinner,
  Textfield,
  Link,
  Lozenge,
} from '@forge/react';
import { colorToLozenge, isValidLabel } from '../../shared/constants';

const EMPTY_EXPORT_COUNT = {
  classified: 0,
  alreadyLabelled: 0,
  toLabel: 0,
  cql: { classified: '', alreadyLabelled: '', toLabel: '' },
};

const ExportCountTable = ({
  t,
  config,
  pendingLabelJobs,
  exportLoading,
  exportSettling,
  exportCounts,
  exportLevelLoading,
  exportCountLoading,
  exportMappings,
  setExportMappings,
  refreshExportCounts,
  refreshExportLevelCount,
}) => {
  const exportLocked =
    pendingLabelJobs.some((j) => j.jobKind === 'label-export') ||
    exportLoading ||
    exportSettling;
  const renderCount = (levelId, n, cql) => {
    if (exportLevelLoading[levelId]) {
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
          { key: 'level', content: t('admin.export.level_column') },
          { key: 'label', content: t('admin.export.label_name') },
          { key: 'classified', content: t('admin.export.classified_column') },
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
        const value = exportMappings[level.id] ?? level.id;
        const invalid = value.length > 0 && !isValidLabel(value);
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
              content: (
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
              ),
            },
            {
              key: 'classified',
              content: renderCount(
                level.id,
                record.classified,
                record.cql?.classified,
              ),
            },
            {
              key: 'alreadyLabelled',
              content: renderCount(
                level.id,
                record.alreadyLabelled,
                record.cql?.alreadyLabelled,
              ),
            },
            {
              key: 'toLabel',
              content: renderCount(
                level.id,
                record.toLabel,
                record.cql?.toLabel,
              ),
            },
          ],
        };
      })}
    />
  );
};

export default ExportCountTable;
