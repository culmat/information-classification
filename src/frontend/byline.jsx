/**
 * Byline frontend — renders the classification badge in the page byline area.
 *
 * User journey:
 * - Viewer: sees colored badge → clicks → popup with level info, contacts, links
 * - Editor: same popup but with "Change Classification" button → opens modal
 *
 * The badge text/icon is rendered by Confluence natively via contentPropertyKey
 * (zero function invocations for page views). The popup content is loaded on click
 * via the getClassification resolver.
 */

import React, { useCallback, useMemo, useState } from 'react';
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
import { localize, formatSessionEta } from '../shared/i18n';
import BylineView from './byline/BylineView';
import useClassifyActions from './byline/useClassifyActions';
import useClassificationData from './byline/useClassificationData';
import useDescendantCount from './byline/useDescendantCount';
import {
  formatDate,
  makeLevelAppearance,
  partitionPendingJobs,
  filterForLevel,
} from './byline/bylineHelpers';

const popupContentStyle = xcss({
  padding: 'space.200',
  maxWidth: '400px',
});

const App = () => {
  const context = useProductContext();
  const { t } = useTranslation();

  const pageId = context?.extension?.content?.id;
  const spaceKey = context?.extension?.space?.key;
  const locale = context?.locale || 'en';
  const canEdit = context?.extension?.content?.type === 'page';

  const [selectedLevel, setSelectedLevel] = useState(null);
  const [recursive, setRecursive] = useState(false);

  const {
    loading,
    classification,
    config,
    restrictionWarning,
    history,
    loadClassification,
  } = useClassificationData({ pageId, spaceKey });

  const selectedLevelAllowed = config?.levels?.find(
    (l) => l.id === selectedLevel,
  )?.allowed;

  const {
    descendantCount,
    setDescendantCount,
    totalDescendants,
    setTotalDescendants,
    countLoading,
    setCountLoading,
  } = useDescendantCount({
    pageId,
    selectedLevel,
    selectedLevelAllowed,
    recursive,
  });

  const resolveLevelName = useCallback(
    (levelId) => {
      if (!levelId) return '';
      const level = config?.levels?.find((l) => l.id === levelId);
      return level ? localize(level.name, locale) || levelId : levelId;
    },
    [config, locale],
  );

  const currentLevel = config?.levels?.find(
    (l) => l.id === (classification?.level || config?.defaultLevelId),
  );
  const currentLevelId =
    currentLevel?.id || config?.defaultLevelId || 'internal';

  const actions = useClassifyActions({
    pageId,
    spaceKey,
    locale,
    t,
    currentLevelId,
    selectedLevel,
    setSelectedLevel,
    recursive,
    setRecursive,
    setDescendantCount,
    setTotalDescendants,
    setCountLoading,
    resolveLevelName,
    loadClassification,
  });

  const etaText = useMemo(() => {
    if (!actions.asyncJob?.sessionStartedAt) return '';
    const classified = actions.asyncProgress?.classified || 0;
    const sessionProgressed =
      classified - (actions.asyncJob.sessionClassifiedStart || 0);
    const remainingCount = Math.max(0, actions.asyncJob.total - classified);
    return formatSessionEta(
      actions.asyncJob.sessionStartedAt,
      sessionProgressed,
      remainingCount,
      t,
    );
  }, [
    actions.asyncProgress?.classified,
    actions.asyncJob?.sessionStartedAt,
    actions.asyncJob?.sessionClassifiedStart,
    actions.asyncJob?.total,
    t,
  ]);

  const licensed =
    context?.environmentType !== 'PRODUCTION' ||
    context?.license?.active === true;

  if (loading) return <Spinner size="small" />;

  if (!licensed) {
    return (
      <Box xcss={popupContentStyle}>
        <SectionMessage
          appearance="warning"
          title={t('license.inactive_title')}
        >
          <Text>{t('license.inactive_message')}</Text>
        </SectionMessage>
      </Box>
    );
  }

  const { ownerJob, otherJobs } = partitionPendingJobs(
    actions.pendingJobs,
    actions.asyncJob,
  );

  return (
    <BylineView
      t={t}
      config={config}
      locale={locale}
      canEdit={canEdit}
      currentLevel={currentLevel}
      currentLevelId={currentLevelId}
      restrictionWarning={restrictionWarning}
      relevantContacts={filterForLevel(config?.contacts, currentLevelId)}
      relevantLinks={filterForLevel(config?.links, currentLevelId)}
      history={history}
      historyEntries={[...(history.entries || [])].reverse()}
      levelAppearance={makeLevelAppearance(config)}
      formatDate={formatDate}
      selectedLevel={selectedLevel}
      setSelectedLevel={setSelectedLevel}
      selectedLevelAllowed={selectedLevelAllowed}
      recursive={recursive}
      setRecursive={setRecursive}
      countLoading={countLoading}
      totalDescendants={totalDescendants}
      descendantCount={descendantCount}
      etaText={etaText}
      ownerJob={ownerJob}
      otherJobs={otherJobs}
      actions={actions}
    />
  );
};

ForgeReconciler.render(
  <I18nProvider>
    <App />
  </I18nProvider>,
);
