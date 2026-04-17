/**
 * Shared statistics panel — distribution chart with colored legend and
 * a "recently classified pages" table, presented as sub-tabs.
 *
 * Used by admin.jsx, spaceSettings.jsx, and statsMacro.jsx.
 * Keep props in sync across all three callers.
 *
 * Features:
 * - Freshness line: "Updated Xs ago · Reload" — always present, no DOM churn
 * - Smart auto-reload: polls every 10s while data is changing, 120s when stable
 * - Chart + Lozenge legend side by side
 * - Recent pages table with Level, relative date, smart Space column
 *
 * Props:
 * - data: { totalPages, classifiedPages, distribution, recentPages, levels?, defaultLevelId? }
 * - levels: [{ id, color }]
 * - defaultLevelId: string — when toggle is on, unclassified are rolled into this level
 * - showUnclassified: boolean — true = roll into default; false = show separate slice
 * - onToggleUnclassified: () => void
 * - isLoading: boolean
 * - onRefresh: () => void
 * - spaceFilter: string — CQL fragment for links
 * - showSpaceColumn: boolean
 * - hideToggle: boolean — macro controls this via config
 * - t: translation function
 */

import React, { useEffect, useRef } from 'react';
import { realtime } from '@forge/bridge';
import {
  Box,
  Text,
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
  Tabs,
  Tab,
  TabList,
  TabPanel,
  xcss,
} from '@forge/react';
import { colorToHex, colorToLozenge } from '../shared/constants';
import { interpolate } from '../shared/i18n';

const panelStyle = xcss({ paddingTop: 'space.100' });
const tabPanelPadding = xcss({ paddingTop: 'space.100' });

// Auto-reload intervals (ms)
const POLL_FAST = 10000; // data still changing
const POLL_SLOW = 120000; // data stable
const POLL_INITIAL = 15000; // first auto-poll after initial load

/**
 * Formats an ISO date string as a relative time string.
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
  hideToggle = false,
  t,
}) => {
  // --- Internal state for freshness + auto-reload ---
  const prevDataRef = useRef(null);
  const timerRef = useRef(null);
  const isFirstLoad = useRef(true);

  // Track when data finishes loading; schedule next auto-reload
  useEffect(() => {
    if (!isLoading && data) {
      // Compare with previous data to pick poll interval
      const prevJson = prevDataRef.current;
      const newJson = JSON.stringify({
        d: data.distribution,
        c: data.classifiedPages,
        t: data.totalPages,
      });
      const changed = prevJson !== null && prevJson !== newJson;
      const isFirst = isFirstLoad.current;
      prevDataRef.current = newJson;
      isFirstLoad.current = false;

      // Schedule next auto-reload
      clearTimeout(timerRef.current);
      const delay = isFirst ? POLL_INITIAL : changed ? POLL_FAST : POLL_SLOW;
      timerRef.current = setTimeout(onRefresh, delay);
    }
    return () => clearTimeout(timerRef.current);
  }, [isLoading, data, onRefresh]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  // Live-refresh when a classification commits anywhere in the instance.
  // Debounced so a reclassify burst doesn't trigger a storm of refetches.
  useEffect(() => {
    let subscription = null;
    let debounce = null;
    realtime
      .subscribeGlobal('classification-changed', () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => onRefresh(), 1000);
      })
      .then((sub) => {
        subscription = sub;
      });
    return () => {
      if (debounce) clearTimeout(debounce);
      if (subscription) subscription.unsubscribe();
    };
  }, [onRefresh]);

  // --- Build chart data ---
  const levelColorMap = {};
  for (const l of levels || []) {
    levelColorMap[l.id] = l.color;
  }

  const unclassified = data ? data.totalPages - data.classifiedPages : 0;
  const chartData = (data?.distribution || []).map((l) => ({ ...l }));
  if (data && showUnclassified && unclassified > 0 && defaultLevelId) {
    const defaultEntry = chartData.find((d) => d.level === defaultLevelId);
    if (defaultEntry) {
      defaultEntry.count += unclassified;
    }
  } else if (data && unclassified > 0) {
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

  const recentPages = data?.recentPages || [];

  return (
    <Box xcss={panelStyle}>
      <Stack space="space.200">
        {/* Initial load spinner — only when no data yet */}
        {isLoading && !data && <Spinner size="medium" />}

        {data && (
          <Stack space="space.100">
            {/* Toggle row — hidden in macro (config controls it) */}
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

            {/* Sub-tabs: Distribution and Recently Classified */}
            <Tabs id="stats-subtabs">
              <TabList>
                <Tab>{t('admin.audit.distribution')}</Tab>
                <Tab>{t('admin.audit.recent_changes')}</Tab>
              </TabList>

              {/* Distribution tab */}
              <TabPanel>
                <Box xcss={tabPanelPadding}>
                  {data.totalPages > 0 && filtered.length > 0 && (
                    <Inline space="space.300" alignBlock="start">
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
                    </Inline>
                  )}
                </Box>
              </TabPanel>

              {/* Recently Classified tab */}
              <TabPanel>
                <Box xcss={tabPanelPadding}>
                  {recentPages.length > 0 ? (
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
                      rows={recentPages.map((page, index) => ({
                        key: page.id || String(index),
                        cells: [
                          {
                            key: 'title',
                            content: page.url ? (
                              <Link href={`/wiki${page.url}`}>
                                {page.title}
                              </Link>
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
                            content: (
                              <Text>
                                {relativeTime(
                                  page.classifiedAt || page.lastModified,
                                  t,
                                )}
                              </Text>
                            ),
                          },
                        ],
                      }))}
                      rowsPerPage={20}
                    />
                  ) : (
                    <Text>{t('admin.audit.empty')}</Text>
                  )}
                </Box>
              </TabPanel>
            </Tabs>
          </Stack>
        )}
      </Stack>
    </Box>
  );
};

export default StatisticsPanel;
