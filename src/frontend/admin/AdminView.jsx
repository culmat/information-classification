import React from 'react';
import {
  Box,
  Stack,
  Button,
  Text,
  SectionMessage,
  Tabs,
  Tab,
  TabList,
  TabPanel,
  ModalTransition,
  xcss,
} from '@forge/react';
import StatisticsPanel from '../StatisticsPanel';
import AboutPanel from '../AboutPanel';
import LevelModal from './LevelModal';
import ContactModal from './ContactModal';
import LinkModal from './LinkModal';
import LabelImportTab from './LabelImportTab';
import LabelExportTab from './LabelExportTab';
import LevelsTab from './LevelsTab';
import ContactsTab from './ContactsTab';
import LinksTab from './LinksTab';
import LanguagesTab from './LanguagesTab';
import DeleteLevelModal from './DeleteLevelModal';

const containerStyle = xcss({ padding: 'space.400', maxWidth: '960px' });
const tabPanelStyle = xcss({ paddingTop: 'space.100' });

const AdminView = ({
  t,
  config,
  setConfig,
  message,
  saving,
  isDirty,
  handleSave,
  activeTab,
  setActiveTab,
  auditData,
  auditLoading,
  showUnclassified,
  setShowUnclassified,
  refreshAuditData,
  importApi,
  exportApi,
  jobsApi,
  editor,
}) => (
  <Box xcss={containerStyle}>
    <Stack space="space.300">
      <Tabs id="admin-tabs" onChange={(index) => setActiveTab(index)}>
        <TabList>
          <Tab>{t('admin.tabs.statistics')}</Tab>
          <Tab>{t('admin.tabs.levels')}</Tab>
          <Tab>{t('admin.tabs.contacts')}</Tab>
          <Tab>{t('admin.tabs.links')}</Tab>
          <Tab>{t('admin.tabs.languages')}</Tab>
          <Tab>{t('admin.tabs.labels')}</Tab>
          <Tab>{t('admin.tabs.about')}</Tab>
        </TabList>

        <TabPanel>
          <StatisticsPanel
            data={auditData}
            levels={config?.levels}
            defaultLevelId={config?.defaultLevelId}
            showUnclassified={showUnclassified}
            onToggleUnclassified={() => setShowUnclassified(!showUnclassified)}
            isLoading={auditLoading}
            onRefresh={refreshAuditData}
            spaceFilter=""
            showSpaceColumn
            t={t}
          />
        </TabPanel>

        <TabPanel>
          <LevelsTab
            t={t}
            config={config}
            setConfig={setConfig}
            addLevel={editor.addLevel}
            editLevel={editor.editLevel}
            deleteLevel={editor.deleteLevel}
            moveLevel={editor.moveLevel}
          />
        </TabPanel>

        <TabPanel>
          <ContactsTab
            t={t}
            config={config}
            addContact={editor.addContact}
            editContact={editor.editContact}
            deleteContact={editor.deleteContact}
          />
        </TabPanel>

        <TabPanel>
          <LinksTab
            t={t}
            config={config}
            addLink={editor.addLink}
            editLink={editor.editLink}
            deleteLink={editor.deleteLink}
          />
        </TabPanel>

        <TabPanel>
          <LanguagesTab t={t} config={config} setConfig={setConfig} />
        </TabPanel>

        <TabPanel>
          <Box xcss={tabPanelStyle}>
            <Tabs id="labels-subtabs">
              <TabList>
                <Tab>{t('admin.import.title')}</Tab>
                <Tab>{t('admin.export.title')}</Tab>
              </TabList>

              <TabPanel>
                <LabelImportTab
                  t={t}
                  config={config}
                  pendingLabelJobs={jobsApi.pendingLabelJobs}
                  importStep={importApi.importStep}
                  importSettling={importApi.importSettling}
                  importCounts={importApi.importCounts}
                  importLabels={importApi.importLabels}
                  setImportLabels={importApi.setImportLabels}
                  importLevelLoading={importApi.importLevelLoading}
                  importCountLoading={importApi.importCountLoading}
                  labelsLoading={importApi.labelsLoading}
                  availableLabels={importApi.availableLabels}
                  importScopeAll={importApi.importScopeAll}
                  setImportScopeAll={importApi.setImportScopeAll}
                  availableSpaces={importApi.availableSpaces}
                  importSpaceKeys={importApi.importSpaceKeys}
                  setImportSpaceKeys={importApi.setImportSpaceKeys}
                  importSpaceKeysRef={importApi.importSpaceKeysRef}
                  importRemoveLabels={importApi.importRemoveLabels}
                  setImportRemoveLabels={importApi.setImportRemoveLabels}
                  exportLoading={exportApi.exportLoading}
                  exportSettling={exportApi.exportSettling}
                  importProgress={importApi.importProgress}
                  labelActivityFrame={jobsApi.labelActivityFrame}
                  importStopRef={jobsApi.importStopRef}
                  resumeLabelJob={jobsApi.resumeLabelJob}
                  discardLabelJob={jobsApi.discardLabelJob}
                  refreshImportCounts={importApi.refreshImportCounts}
                  refreshLevelCount={importApi.refreshLevelCount}
                  onScopeChange={importApi.onScopeChange}
                  startImport={jobsApi.startImport}
                />
              </TabPanel>

              <TabPanel>
                <LabelExportTab
                  t={t}
                  config={config}
                  pendingLabelJobs={jobsApi.pendingLabelJobs}
                  exportLoading={exportApi.exportLoading}
                  exportSettling={exportApi.exportSettling}
                  importSettling={importApi.importSettling}
                  exportCounts={exportApi.exportCounts}
                  exportLevelLoading={exportApi.exportLevelLoading}
                  exportCountLoading={exportApi.exportCountLoading}
                  exportMappings={exportApi.exportMappings}
                  setExportMappings={exportApi.setExportMappings}
                  exportScopeAll={exportApi.exportScopeAll}
                  setExportScopeAll={exportApi.setExportScopeAll}
                  availableSpaces={importApi.availableSpaces}
                  exportSpaceKeys={exportApi.exportSpaceKeys}
                  setExportSpaceKeys={exportApi.setExportSpaceKeys}
                  exportSpaceKeysRef={exportApi.exportSpaceKeysRef}
                  exportProgress={exportApi.exportProgress}
                  labelActivityFrame={jobsApi.labelActivityFrame}
                  exportStopRef={jobsApi.exportStopRef}
                  resumeLabelJob={jobsApi.resumeLabelJob}
                  discardLabelJob={jobsApi.discardLabelJob}
                  refreshExportCounts={exportApi.refreshExportCounts}
                  refreshExportLevelCount={exportApi.refreshExportLevelCount}
                  startExport={jobsApi.startExport}
                />
              </TabPanel>
            </Tabs>
          </Box>
        </TabPanel>

        <TabPanel>
          <Box xcss={tabPanelStyle}>
            <AboutPanel />
          </Box>
        </TabPanel>
      </Tabs>

      {activeTab > 0 && activeTab < 5 && (
        <>
          {message && (
            <SectionMessage
              appearance={message.type === 'error' ? 'error' : 'confirmation'}
            >
              <Text>{message.text}</Text>
            </SectionMessage>
          )}

          <Button
            testId="admin-save"
            appearance="primary"
            onClick={handleSave}
            isLoading={saving}
            isDisabled={!isDirty}
          >
            {t('admin.save_button')}
          </Button>
        </>
      )}
    </Stack>

    <ModalTransition>
      {editor.showLevelModal && editor.editingLevel && (
        <LevelModal
          level={editor.editingLevel}
          languages={config?.languages || [{ code: 'en', label: 'English' }]}
          onSave={editor.saveLevel}
          onClose={() => editor.setShowLevelModal(false)}
          t={t}
        />
      )}
    </ModalTransition>

    <ModalTransition>
      {editor.deleteConfirm && (
        <DeleteLevelModal
          t={t}
          config={config}
          deleteConfirm={editor.deleteConfirm}
          setDeleteConfirm={editor.setDeleteConfirm}
          deleteLoading={editor.deleteLoading}
          removeLevelFromConfig={editor.removeLevelFromConfig}
          handleReclassifyAndDelete={editor.handleReclassifyAndDelete}
        />
      )}
    </ModalTransition>

    <ModalTransition>
      {editor.showContactModal && editor.editingContact && (
        <ContactModal
          contact={editor.editingContact}
          levels={config?.levels || []}
          languages={config?.languages || [{ code: 'en', label: 'English' }]}
          onSave={editor.saveContact}
          onClose={() => editor.setShowContactModal(false)}
          t={t}
        />
      )}
    </ModalTransition>

    <ModalTransition>
      {editor.showLinkModal && editor.editingLink && (
        <LinkModal
          link={editor.editingLink}
          levels={config?.levels || []}
          languages={config?.languages || [{ code: 'en', label: 'English' }]}
          onSave={editor.saveLink}
          onClose={() => editor.setShowLinkModal(false)}
          t={t}
        />
      )}
    </ModalTransition>
  </Box>
);

export default AdminView;
