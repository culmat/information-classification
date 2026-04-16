/**
 * Shared statistics panel — renders classification distribution chart, CQL search links,
 * and a "recently classified pages" table. Used by both admin.jsx and spaceSettings.jsx.
 *
 * Props:
 * - data: { totalPages, classifiedPages, distribution: [{level, count}], recentPages: [{id, title, url, spaceKey}] }
 * - levels: array of level objects with { id, color }
 * - defaultLevelId: string — rolls unclassified pages into this level when toggle is off
 * - showUnclassified: boolean — whether to show unclassified as a separate chart slice
 * - onToggleUnclassified: () => void — callback for the coverage toggle
 * - isLoading: boolean — shows spinner / loading state on refresh button
 * - onRefresh: () => void — callback for the refresh button
 * - spaceFilter: string — CQL fragment for space scoping (e.g. ' AND space="KEY"'), empty string for global
 * - showSpaceColumn: boolean — whether to show the space column in the recent pages table
 * - hideSections: 'distribution' | 'recent' | null — optionally hide one section (for macro config)
 * - hideToggle: boolean — hide the unclassified toggle (macro controls it via config instead)
 * - t: translation function from useTranslation
 */

import React from 'react';
import {
  Box,
  Text,
  Heading,
  Button,
  Stack,
  Inline,
  Toggle,
  Label,
  Link,
  Spinner,
  DonutChart,
  DynamicTable,
  xcss,
} from '@forge/react';
import { colorToHex } from '../shared/constants';

/* TabPanel renders no top padding — add it manually. */
const tabPanelStyle = xcss({ paddingTop: 'space.100' });

const StatisticsPanel = ({
  data,
  levels,
  defaultLevelId,
  showUnclassified,
  onToggleUnclassified,
  isLoading,
  onRefresh,
  spaceFilter = '',
  showSpaceColumn = false,
  hideSections = null,
  hideToggle = false,
  t,
}) => {
  return (
    <Box xcss={tabPanelStyle}>
      <Stack space="space.200">
        {isLoading && !data && <Spinner size="medium" />}

        {/* Coverage stats */}
        {data && (
          <Inline space="space.400">
            <Stack space="space.050">
              <Text>{t('admin.audit.classified_pages')}</Text>
              <Heading size="medium">
                {data.classifiedPages} / {data.totalPages}
              </Heading>
            </Stack>
          </Inline>
        )}

        {/* Coverage toggle — hidden in macro context where config controls this */}
        {!hideToggle && (
          <Inline space="space.100" alignBlock="center">
            <Toggle
              id="coverage-toggle"
              isChecked={showUnclassified}
              onChange={onToggleUnclassified}
            />
            <Label labelFor="coverage-toggle">
              {t('admin.audit.show_unclassified')}
            </Label>
          </Inline>
        )}

        {/* Distribution chart — when "show unclassified" is OFF, unclassified
         pages are rolled into the default level so the chart always reflects
         the effective classification of every page. */}
        {hideSections !== 'distribution' &&
          data &&
          data.totalPages > 0 &&
          (() => {
            const unclassified = data.totalPages - data.classifiedPages;
            const chartData = (data.distribution || []).map((l) => ({ ...l }));
            if (showUnclassified) {
              if (unclassified > 0) {
                chartData.push({
                  level: t('admin.audit.unclassified'),
                  count: unclassified,
                });
              }
            } else if (unclassified > 0 && defaultLevelId) {
              const defaultEntry = chartData.find(
                (d) => d.level === defaultLevelId,
              );
              if (defaultEntry) {
                defaultEntry.count += unclassified;
              }
            }
            const allLevelIds = (levels || []).map((l) => l.id);
            const filtered = chartData.filter((l) => l.count > 0);
            const unclassifiedCql =
              allLevelIds.length > 0
                ? `type=page${spaceFilter} AND NOT (${allLevelIds.map((id) => `culmat_classification_level="${id}"`).join(' OR ')})`
                : null;
            return filtered.length > 0 ? (
              <Stack space="space.100">
                <Inline space="space.050" alignBlock="center">
                  <Heading size="small">
                    {t('admin.audit.distribution')}
                  </Heading>
                  <Button
                    appearance="subtle"
                    spacing="compact"
                    iconBefore="refresh"
                    isLoading={isLoading}
                    onClick={onRefresh}
                  >
                    {' '}
                  </Button>
                </Inline>
                <DonutChart
                  data={filtered}
                  colorAccessor="level"
                  valueAccessor="count"
                  labelAccessor="level"
                  colorPalette={[
                    ...(levels || []).map((l) => ({
                      key: l.id,
                      value: colorToHex(l.color),
                    })),
                    {
                      key: t('admin.audit.unclassified'),
                      value: '#8993A5',
                    },
                  ]}
                />
                {isLoading ? (
                  <Spinner size="small" />
                ) : (
                  <Stack space="space.050">
                    {filtered.map((entry) => {
                      const isUnclassifiedEntry =
                        entry.level === t('admin.audit.unclassified');
                      const cql = isUnclassifiedEntry
                        ? unclassifiedCql
                        : `type=page${spaceFilter} AND culmat_classification_level="${entry.level}"`;
                      return cql ? (
                        <Text key={entry.level}>
                          <Link
                            href={`/wiki/search?cql=${encodeURIComponent(cql)}`}
                            openNewTab
                          >
                            {entry.level} ({entry.count})
                          </Link>
                        </Text>
                      ) : (
                        <Text key={entry.level}>
                          {entry.level} ({entry.count})
                        </Text>
                      );
                    })}
                  </Stack>
                )}
              </Stack>
            ) : null;
          })()}

        {/* Recently classified pages — only show when there are entries */}
        {hideSections !== 'recent' && (data?.recentPages || []).length > 0 && (
          <>
            <Heading size="small">{t('admin.audit.recent_changes')}</Heading>
            <DynamicTable
              head={{
                cells: [
                  { key: 'title', content: t('admin.audit.page') },
                  ...(showSpaceColumn
                    ? [{ key: 'space', content: t('admin.audit.space') }]
                    : []),
                ],
              }}
              rows={(data.recentPages || []).map((page, index) => ({
                key: page.id || String(index),
                cells: [
                  {
                    key: 'title',
                    content: page.url ? (
                      <Link href={`/wiki${page.url}`}>{page.title}</Link>
                    ) : (
                      <Text>{page.title}</Text>
                    ),
                  },
                  ...(showSpaceColumn
                    ? [
                        {
                          key: 'space',
                          content: <Text>{page.spaceKey}</Text>,
                        },
                      ]
                    : []),
                ],
              }))}
              rowsPerPage={20}
            />
          </>
        )}
      </Stack>
    </Box>
  );
};

export default StatisticsPanel;
