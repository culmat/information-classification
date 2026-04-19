import React from 'react';
import {
  Box,
  Tabs,
  Tab,
  TabList,
  TabPanel,
  ModalTransition,
  xcss,
} from '@forge/react';
import ClassificationTab from './ClassificationTab';
import ResourcesTab from './ResourcesTab';
import HistoryTab from './HistoryTab';
import ClassifyModal from './ClassifyModal';

const popupContentStyle = xcss({
  padding: 'space.200',
  maxWidth: '400px',
});

const BylineView = ({
  t,
  config,
  locale,
  canEdit,
  currentLevel,
  currentLevelId,
  restrictionWarning,
  relevantContacts,
  relevantLinks,
  history,
  historyEntries,
  levelAppearance,
  formatDate,
  selectedLevel,
  setSelectedLevel,
  selectedLevelAllowed,
  recursive,
  setRecursive,
  countLoading,
  totalDescendants,
  descendantCount,
  etaText,
  ownerJob,
  otherJobs,
  actions,
}) => (
  <Box xcss={popupContentStyle}>
    <Tabs id="byline-tabs">
      <TabList>
        <Tab>{t('byline.tab_classification')}</Tab>
        <Tab>{t('byline.tab_resources')}</Tab>
        <Tab>{t('byline.tab_history')}</Tab>
      </TabList>

      <TabPanel>
        <ClassificationTab
          t={t}
          locale={locale}
          currentLevel={currentLevel}
          restrictionWarning={restrictionWarning}
          canEdit={canEdit}
          openModal={actions.openModal}
        />
      </TabPanel>

      <TabPanel>
        <ResourcesTab
          t={t}
          locale={locale}
          relevantContacts={relevantContacts}
          relevantLinks={relevantLinks}
        />
      </TabPanel>

      <TabPanel>
        <HistoryTab
          t={t}
          history={history}
          historyEntries={historyEntries}
          levelAppearance={levelAppearance}
          formatDate={formatDate}
        />
      </TabPanel>
    </Tabs>

    <ModalTransition>
      {actions.showModal && (
        <ClassifyModal
          t={t}
          config={config}
          locale={locale}
          ownerJob={ownerJob}
          otherJobs={otherJobs}
          asyncJob={actions.asyncJob}
          asyncProgress={actions.asyncProgress}
          stopConfirmVisible={actions.stopConfirmVisible}
          selectedLevel={selectedLevel}
          setSelectedLevel={setSelectedLevel}
          selectedLevelAllowed={selectedLevelAllowed}
          saving={actions.saving}
          recursive={recursive}
          setRecursive={setRecursive}
          countLoading={countLoading}
          totalDescendants={totalDescendants}
          descendantCount={descendantCount}
          currentLevelId={currentLevelId}
          activityFrame={actions.activityFrame}
          etaText={etaText}
          resolveLevelName={actions.resolveLevelName}
          levelAppearance={levelAppearance}
          resumePendingJob={actions.resumePendingJob}
          stopPendingJob={actions.stopPendingJob}
          abandonStop={actions.abandonStop}
          confirmStop={actions.confirmStop}
          requestStop={actions.requestStop}
          closeModal={actions.closeModal}
          handleClassify={actions.handleClassify}
          message={actions.message}
        />
      )}
    </ModalTransition>
  </Box>
);

export default BylineView;
