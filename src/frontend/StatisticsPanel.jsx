/**
 * Shared statistics panel — renders classification coverage, distribution chart
 * with colored legend, and a "recently classified pages" table.
 *
 * Used by admin.jsx, spaceSettings.jsx, and statsMacro.jsx.
 *
 * The chart + colored Lozenge legend is the primary visual — no redundant text stats.
 * Toggle and refresh sit in a compact row above the chart.
 *
 * Props:
 * - data: { totalPages, classifiedPages, distribution, recentPages, levels?, defaultLevelId? }
 * - levels: [{ id, color }] — level metadata for chart colors and Lozenges
 * - defaultLevelId: string — when toggle is on, unclassified are rolled into this level
 * - showUnclassified: boolean — true = roll into default; false = show separate slice
 * - onToggleUnclassified: () => void
 * - isLoading: boolean
 * - onRefresh: () => void
 * - spaceFilter: string — CQL fragment for links (e.g. ' AND space="KEY"')
 * - showSpaceColumn: boolean — show Space column in recent table
 * - hideSections: 'distribution' | 'recent' | null
 * - hideToggle: boolean — hide the toggle (macro controls it via config)
 * - t: translation function
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
  Lozenge,
  Badge,
  Spinner,
  DonutChart,
  DynamicTable,
  xcss,
} from '@forge/react';
import { colorToHex, colorToLozenge } from '../shared/constants';
import { interpolate } from '../shared/i18n';

const panelStyle = xcss({ paddingTop: 'space.100' });

/**
 * Formats an ISO date string as a relative time string ("2 hours ago", "yesterday", etc.).
 */
function relativeTime(isoDate, t) {
  if (!isoDate) return '';
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return t('admin.audit.just_now');
  if (diffMin < 60)
    return interpolate(t('admin.audit.minutes_ago'), { count: diffMin });
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24)
    return interpolate(t('admin.audit.hours_ago'), { count: diffHours });
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return t('admin.audit.yesterday');
  if (diffDays < 30)
    return interpolate(t('admin.audit.days_ago'), { count: diffDays });
  return new Date(isoDate).toLocaleDateString();
}

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
  // Build a lookup for level color by ID
  const levelColorMap = {};
  for (const l of levels || []) {
    levelColorMap[l.id] = l.color;
  }

  return (
    <Box xcss={panelStyle}>
      <Stack space="space.200">
        {isLoading && !data && <Spinner size="medium" />}

        {/* Controls: toggle + refresh in one row */}
        {data && (
          <Inline space="space.200" alignBlock="center">
            {!hideToggle && (
              <Inline space="space.100" alignBlock="center">
                <Toggle
                  id="coverage-toggle"
                  isChecked={showUnclassified}
                  onChange={onToggleUnclassified}
                />
                <Label labelFor="coverage-toggle">
                  {interpolate(t('admin.audit.count_as_default'), {
                    level: defaultLevelId || '',
                  })}
                </Label>
              </Inline>
            )}
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
        )}

        {/* Distribution: chart + colored legend side by side */}
        {hideSections !== 'distribution' &&
          data &&
          data.totalPages > 0 &&
          (() => {
            const unclassified = data.totalPages - data.classifiedPages;
            const chartData = (data.distribution || []).map((l) => ({
              ...l,
            }));
            if (showUnclassified && unclassified > 0 && defaultLevelId) {
              const defaultEntry = chartData.find(
                (d) => d.level === defaultLevelId,
              );
              if (defaultEntry) {
                defaultEntry.count += unclassified;
              }
            } else if (unclassified > 0) {
              chartData.push({
                level: t('admin.audit.unclassified'),
                count: unclassified,
              });
            }
            const allLevelIds = (levels || []).map((l) => l.id);
            const filtered = chartData.filter((l) => l.count > 0);
            const unclassifiedCql =
              allLevelIds.length > 0
                ? `type=page${spaceFilter} AND NOT (${allLevelIds.map((id) => `culmat_classification_level="${id}"`).join(' OR ')})`
                : null;
            return filtered.length > 0 ? (
              <Stack space="space.100">
                <Heading size="small">{t('admin.audit.distribution')}</Heading>
                <Inline space="space.300" alignBlock="start">
                  {/* Chart */}
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
                  {/* Legend with colored Lozenges */}
                  {!isLoading && (
                    <Stack space="space.100">
                      {filtered.map((entry) => {
                        const isUnclassifiedEntry =
                          entry.level === t('admin.audit.unclassified');
                        const cql = isUnclassifiedEntry
                          ? unclassifiedCql
                          : `type=page${spaceFilter} AND culmat_classification_level="${entry.level}"`;
                        const lozengeAppearance = isUnclassifiedEntry
                          ? 'default'
                          : colorToLozenge(levelColorMap[entry.level]);
                        const content = (
                          <Inline space="space.100" alignBlock="center">
                            <Lozenge
                              isBold
                              appearance={lozengeAppearance || 'default'}
                            >
                              {entry.level}
                            </Lozenge>
                            <Badge appearance="default">{entry.count}</Badge>
                          </Inline>
                        );
                        return cql ? (
                          <Link
                            key={entry.level}
                            href={`/wiki/search?cql=${encodeURIComponent(cql)}`}
                            openNewTab
                          >
                            {content}
                          </Link>
                        ) : (
                          <Box key={entry.level}>{content}</Box>
                        );
                      })}
                    </Stack>
                  )}
                  {isLoading && <Spinner size="small" />}
                </Inline>
              </Stack>
            ) : null;
          })()}

        {/* Recently classified pages */}
        {hideSections !== 'recent' && (data?.recentPages || []).length > 0 && (
          <Stack space="space.100">
            <Heading size="small">{t('admin.audit.recent_changes')}</Heading>
            <DynamicTable
              head={{
                cells: [
                  { key: 'title', content: t('admin.audit.page') },
                  { key: 'level', content: t('admin.audit.level') },
                  ...(showSpaceColumn
                    ? [
                        {
                          key: 'space',
                          content: t('admin.audit.space'),
                        },
                      ]
                    : []),
                  {
                    key: 'date',
                    content: t('admin.audit.classified_at'),
                  },
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
                  {
                    key: 'level',
                    content: page.levelId ? (
                      <Lozenge
                        isBold
                        appearance={
                          colorToLozenge(levelColorMap[page.levelId]) ||
                          'default'
                        }
                      >
                        {page.levelId}
                      </Lozenge>
                    ) : (
                      <Text>—</Text>
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
                  {
                    key: 'date',
                    content: <Text>{relativeTime(page.lastModified, t)}</Text>,
                  },
                ],
              }))}
              rowsPerPage={20}
            />
          </Stack>
        )}
      </Stack>
    </Box>
  );
};

export default StatisticsPanel;
