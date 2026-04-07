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

import React, { useState, useEffect, useCallback } from 'react';
import ForgeReconciler, {
  useProductContext,
  useTranslation,
  I18nProvider,
  Box,
  Text,
  Heading,
  Button,
  ButtonGroup,
  Stack,
  Inline,
  Lozenge,
  Radio,
  Spinner,
  SectionMessage,
  Modal,
  ModalTransition,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  Toggle,
  Label,
  Link,
  User,
  Tabs,
  Tab,
  TabList,
  TabPanel,
  ProgressBar,
  EmptyState,
  xcss,
} from '@forge/react';
import { invoke, view, realtime, showFlag } from '@forge/bridge';
import { colorToLozenge } from '../shared/constants';
import { localize, interpolate, formatEta } from '../shared/i18n';

// Style for the popup content area
const popupContentStyle = xcss({
  padding: 'space.200',
  maxWidth: '400px',
});

const sectionStyle = xcss({
  paddingTop: 'space.100',
});

const historyEntryStyle = xcss({
  paddingBottom: 'space.075',
  borderBottomColor: 'color.border',
  borderBottomWidth: 'border.width',
  borderBottomStyle: 'solid',
});

/**
 * Main byline app component.
 * Wrapped in I18nProvider for translation support.
 */
const App = () => {
  const context = useProductContext();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [classification, setClassification] = useState(null);
  const [config, setConfig] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState(null);
  const [recursive, setRecursive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [restrictionWarning, setRestrictionWarning] = useState(null);
  const [history, setHistory] = useState({ truncated: false, entries: [] });

  // Recursive descendant count (fetched when toggle is activated)
  const [descendantCount, setDescendantCount] = useState(null); // pages needing changes
  const [totalDescendants, setTotalDescendants] = useState(null); // all sub-pages
  const [countLoading, setCountLoading] = useState(false);

  // Async classification progress
  const [asyncJob, setAsyncJob] = useState(null); // { jobId, total }
  const [asyncProgress, setAsyncProgress] = useState(null); // { classified, failed, total, done, ... }

  // Extract page and space info from context
  const pageId = context?.extension?.content?.id;
  const spaceKey = context?.extension?.space?.key;
  const locale = context?.locale || 'en';
  const canEdit = context?.extension?.content?.type === 'page'; // editors see the change button

  // Load classification data when the popup opens
  // Load (or reload) classification data from the server.
  // When showLoading is false (e.g. after a classify action inside the modal)
  // we skip the loading spinner to avoid a re-mount that flickers the modal.
  const loadClassification = useCallback(
    async (showLoading = true) => {
      if (!pageId || !spaceKey) return;
      if (showLoading) setLoading(true);
      try {
        const result = await invoke('getClassification', { pageId, spaceKey });
        if (result.success) {
          setClassification(result.classification);
          setConfig(result.config);
          setRestrictionWarning(result.restrictionWarning);
          setHistory(result.history || { truncated: false, entries: [] });

          // Resume active async job if one exists (e.g. after page reload)
          if (result.activeJob) {
            setAsyncJob({
              jobId: result.activeJob.jobId,
              total: result.activeJob.total,
              startedAt: result.activeJob.startedAt,
            });
            setAsyncProgress({
              classified: result.activeJob.classified || 0,
              failed: result.activeJob.failed || 0,
              total: result.activeJob.total,
              done: false,
            });
            setSaving(true);
            setShowModal(true);
          }
        }
      } catch (error) {
        console.error('Failed to load classification:', error);
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [pageId, spaceKey],
  );

  useEffect(() => {
    loadClassification();
  }, [loadClassification]);

  // Fetch descendant count when recursive toggle is on and level changes
  const selectedLevelAllowed = config?.levels?.find(
    (l) => l.id === selectedLevel,
  )?.allowed;
  useEffect(() => {
    if (!recursive || !selectedLevel || !pageId || !selectedLevelAllowed) {
      setDescendantCount(null);
      setTotalDescendants(null);
      return;
    }
    let cancelled = false;
    setCountLoading(true);
    invoke('countDescendants', { pageId, levelId: selectedLevel })
      .then((result) => {
        if (!cancelled && result.success) {
          setDescendantCount(result.toClassify);
          setTotalDescendants(result.totalDescendants);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDescendantCount(null);
          setTotalDescendants(null);
        }
      })
      .finally(() => {
        if (!cancelled) setCountLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [recursive, selectedLevel, selectedLevelAllowed, pageId]);

  // Subscribe to Realtime progress when an async job is active
  useEffect(() => {
    if (!asyncJob || !pageId) return;
    let subscription = null;
    realtime
      .subscribeGlobal(`classification-progress:${pageId}`, (data) => {
        setAsyncProgress(data);
        if (data.done) {
          setAsyncJob(null);
          setSaving(false);
          loadClassification(false);
          setDescendantCount(0);
          setShowModal(false);
          showFlag({
            id: 'classify-success',
            title: interpolate(t('classify.async_complete'), {
              classified: data.classified,
            }),
            type: 'success',
            isAutoDismiss: true,
          });
        }
      })
      .then((sub) => {
        subscription = sub;
      });
    return () => {
      if (subscription) subscription.unsubscribe();
    };
  }, [asyncJob, pageId, loadClassification]);

  // Find the current level definition from config
  const currentLevel = config?.levels?.find(
    (l) => l.id === (classification?.level || config?.defaultLevelId),
  );
  const currentLevelId =
    currentLevel?.id || config?.defaultLevelId || 'internal';

  // Filter contacts and links relevant to the current level
  const relevantContacts = (config?.contacts || []).filter(
    (c) => c.levelIds?.length === 0 || c.levelIds?.includes(currentLevelId),
  );
  const relevantLinks = (config?.links || []).filter(
    (l) => l.levelIds?.length === 0 || l.levelIds?.includes(currentLevelId),
  );

  // Handle classification change submission
  const handleClassify = useCallback(async () => {
    if (!selectedLevel) return;
    setSaving(true);
    setMessage(null);
    try {
      const result = await invoke('setClassification', {
        pageId,
        spaceKey,
        levelId: selectedLevel,
        recursive,
        locale,
      });

      if (result.success) {
        // Async path — large tree pushed to background queue
        if (result.asyncJobId) {
          setAsyncJob({
            jobId: result.asyncJobId,
            total: result.totalToClassify,
            startedAt: Date.now(),
          });
          setAsyncProgress({
            classified: 0,
            failed: 0,
            total: result.totalToClassify,
            done: false,
          });
          setMessage({
            type: 'info',
            text: interpolate(t('classify.async_started'), {
              total: result.totalToClassify,
            }),
          });
          // Don't close modal or stop saving — Realtime subscription handles completion
          return;
        }

        // Sync path — build success message
        let msg = t('classify.success');
        if (result.recursiveResult) {
          const { classified, failed, timedOut } = result.recursiveResult;
          if (timedOut || failed > 0) {
            msg = interpolate(t('classify.success_recursive_partial'), {
              classified,
              failed,
            });
          } else {
            msg = interpolate(t('classify.success_recursive'), { classified });
          }
        }

        // Close modal and show an ephemeral toast flag instead of a persistent
        // in-modal message. The flag auto-dismisses after 8 seconds.
        setShowModal(false);
        showFlag({
          id: 'classify-success',
          title: msg,
          type: 'success',
          isAutoDismiss: true,
        });
        // Reload classification data so the byline badge updates.
        await loadClassification(false);
        // Reset descendant count locally — CQL indexing is async so a server
        // re-fetch would return stale data.
        setDescendantCount(0);
        view.refresh();
      } else {
        setMessage({
          type: 'error',
          text: result.error || t('classify.error'),
        });
      }
    } catch (error) {
      console.error('Failed to classify:', error);
      setMessage({ type: 'error', text: t('classify.error') });
    } finally {
      setSaving(false);
    }
  }, [
    pageId,
    spaceKey,
    selectedLevel,
    recursive,
    locale,
    t,
    loadClassification,
  ]);

  // Open the classification modal
  const openModal = useCallback(async () => {
    setSelectedLevel(currentLevelId);
    setRecursive(false);
    setMessage(null);
    setDescendantCount(null);
    setTotalDescendants(null);
    setCountLoading(false);
    setShowModal(true);

    // Check for an active background job before resetting async state
    try {
      const result = await invoke('getClassification', { pageId, spaceKey });
      if (result.success && result.activeJob) {
        setAsyncJob({
          jobId: result.activeJob.jobId,
          total: result.activeJob.total,
          startedAt: result.activeJob.startedAt,
        });
        setAsyncProgress({
          classified: result.activeJob.classified || 0,
          failed: result.activeJob.failed || 0,
          total: result.activeJob.total,
          done: false,
        });
        setSaving(true);
        return;
      }
    } catch (_) {
      /* ignore */
    }
    // No active job — clear async state
    setAsyncJob(null);
    setAsyncProgress(null);
  }, [currentLevelId, pageId, spaceKey]);

  // Close modal and refresh the byline badge so it reflects any classification change.
  const closeModal = useCallback(() => {
    if (asyncJob) {
      showFlag({
        id: 'classify-background',
        title: t('classify.async_background'),
        type: 'info',
        isAutoDismiss: true,
      });
    }
    setShowModal(false);
    setAsyncJob(null);
    view.refresh();
  }, [asyncJob, t]);

  if (loading) {
    return <Spinner size="small" />;
  }

  // Helper: look up a level's lozenge appearance from config
  const levelAppearance = (levelId) => {
    const level = config?.levels?.find((l) => l.id === levelId);
    return level ? colorToLozenge(level.color) : 'default';
  };

  // Helper: compact date+time format for history entries
  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    const opts = {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleString(undefined, opts);
  };

  // History entries from content property (newest last → reverse for display)
  const historyEntries = [...(history.entries || [])].reverse();

  return (
    <Box xcss={popupContentStyle}>
      <Tabs id="byline-tabs">
        <TabList>
          <Tab>{t('byline.tab_classification')}</Tab>
          <Tab>{t('byline.tab_resources')}</Tab>
          <Tab>{t('byline.tab_history')}</Tab>
        </TabList>

        {/* Classification Tab */}
        <TabPanel>
          <Box xcss={sectionStyle}>
            <Stack space="space.150">
              {/* Current classification level with colored tag */}
              {currentLevel && (
                <Inline space="space.100" alignBlock="center">
                  <Lozenge
                    isBold
                    appearance={colorToLozenge(currentLevel.color)}
                  >
                    {localize(currentLevel.name, locale)}
                  </Lozenge>
                </Inline>
              )}

              {/* Level description */}
              {currentLevel?.description && (
                <Box xcss={sectionStyle}>
                  <Text>{localize(currentLevel.description, locale)}</Text>
                </Box>
              )}

              {/* Restriction mismatch warning */}
              {restrictionWarning === 'requires_protection' && (
                <SectionMessage appearance="warning">
                  <Text>{t('classify.requires_protection')}</Text>
                  <Text>{t('classify.requires_protection_share')}</Text>
                </SectionMessage>
              )}
              {restrictionWarning === 'has_unnecessary_protection' && (
                <SectionMessage appearance="warning">
                  <Text>{t('classify.has_unnecessary_protection')}</Text>
                </SectionMessage>
              )}

              {/* Change classification button (editors only) */}
              {canEdit && (
                <Box xcss={sectionStyle}>
                  <Button appearance="default" onClick={openModal}>
                    {t('byline.change_button')}
                  </Button>
                </Box>
              )}
            </Stack>
          </Box>
        </TabPanel>

        {/* Resources Tab */}
        <TabPanel>
          <Box xcss={sectionStyle}>
            <Stack space="space.150">
              {/* Contacts section */}
              {relevantContacts.length > 0 && (
                <Box xcss={sectionStyle}>
                  <Heading size="xsmall">{t('byline.contacts')}</Heading>
                  <Stack space="space.050">
                    {relevantContacts.map((contact) => (
                      <ContactItem
                        key={contact.id}
                        contact={contact}
                        locale={locale}
                      />
                    ))}
                  </Stack>
                </Box>
              )}

              {/* Links section */}
              {relevantLinks.length > 0 && (
                <Box xcss={sectionStyle}>
                  <Heading size="xsmall">{t('byline.links')}</Heading>
                  <Stack space="space.050">
                    {relevantLinks.map((link) => (
                      <Link key={link.id} href={link.url} openNewTab>
                        {localize(link.label, locale)}
                      </Link>
                    ))}
                  </Stack>
                </Box>
              )}

              {relevantContacts.length === 0 && relevantLinks.length === 0 && (
                <EmptyState header={t('byline.no_resources')} />
              )}
            </Stack>
          </Box>
        </TabPanel>

        {/* History Tab */}
        <TabPanel>
          <Box xcss={sectionStyle}>
            <Stack space="space.100">
              {history.truncated && (
                <Text>{t('byline.history_truncated')}</Text>
              )}
              {historyEntries.length === 0 && (
                <EmptyState header={t('byline.no_history')} />
              )}
              {/* History entries use short property names: { from, to, by, at }.
               Keep in sync with appendHistory() calls in classificationService.js. */}
              {historyEntries.map((entry, index) => (
                <Box
                  key={entry.id || index}
                  xcss={
                    index < historyEntries.length - 1
                      ? historyEntryStyle
                      : undefined
                  }
                >
                  <Inline space="space.050" alignBlock="center">
                    {entry.from && (
                      <>
                        <Lozenge
                          isBold
                          appearance={levelAppearance(entry.from)}
                        >
                          {entry.from}
                        </Lozenge>
                        <Text> → </Text>
                      </>
                    )}
                    <Lozenge isBold appearance={levelAppearance(entry.to)}>
                      {entry.to}
                    </Lozenge>
                  </Inline>
                  <Text>
                    <User accountId={entry.by} /> · {formatDate(entry.at)}
                  </Text>
                </Box>
              ))}
            </Stack>
          </Box>
        </TabPanel>
      </Tabs>

      {/* Classification change modal */}
      <ModalTransition>
        {showModal && (
          <Modal onClose={closeModal}>
            <ModalHeader>
              <ModalTitle>{t('classify.title')}</ModalTitle>
              <Button appearance="subtle" onClick={closeModal}>
                ✕
              </Button>
            </ModalHeader>
            <ModalBody>
              <Stack space="space.200">
                {/*
                 * Level picker: each row combines a Radio button (handles selection)
                 * with a colored Lozenge (shows the classification color).
                 * Box onClick is not supported in Forge UI Kit, so Radio onChange
                 * is the only reliable click target.
                 */}
                <Stack space="space.075">
                  {(config?.levels || []).map((level) => (
                    <Inline
                      key={level.id}
                      space="space.100"
                      alignBlock="center"
                    >
                      <Radio
                        value={level.id}
                        isChecked={selectedLevel === level.id}
                        isDisabled={!!asyncJob || saving}
                        onChange={() => setSelectedLevel(level.id)}
                        label=""
                      />
                      <Lozenge isBold appearance={colorToLozenge(level.color)}>
                        {localize(level.name, locale)}
                      </Lozenge>
                      {!level.allowed && (
                        <Text>({t('classify.not_allowed')})</Text>
                      )}
                    </Inline>
                  ))}
                </Stack>

                {/* Show description for selected level */}
                {selectedLevel &&
                  (() => {
                    const level = config?.levels?.find(
                      (l) => l.id === selectedLevel,
                    );
                    if (!level) return null;

                    if (!level.allowed && level.errorMessage) {
                      return (
                        <SectionMessage appearance="error">
                          <Text>{localize(level.errorMessage, locale)}</Text>
                        </SectionMessage>
                      );
                    }

                    if (level.description) {
                      return <Text>{localize(level.description, locale)}</Text>;
                    }

                    return null;
                  })()}

                {/* Recursive toggle with descendant count */}
                <Stack space="space.050">
                  <Inline space="space.100" alignBlock="center">
                    <Toggle
                      id="recursive-toggle"
                      isChecked={recursive}
                      onChange={() => setRecursive(!recursive)}
                      isDisabled={!!asyncJob || saving || !selectedLevelAllowed}
                    />
                    <Label labelFor="recursive-toggle">
                      {t('classify.apply_recursive')}
                    </Label>
                    {countLoading && <Spinner size="small" />}
                  </Inline>
                  {recursive && !countLoading && totalDescendants === 0 && (
                    <Text>{t('classify.no_subpages')}</Text>
                  )}
                  {recursive &&
                    !countLoading &&
                    totalDescendants > 0 &&
                    descendantCount === 0 && (
                      <Text>{t('classify.all_subpages_classified')}</Text>
                    )}
                  {recursive &&
                    !countLoading &&
                    descendantCount > 0 &&
                    !asyncJob &&
                    (saving ? (
                      <Inline space="space.100" alignBlock="center">
                        <Spinner size="small" />
                        <Text>{t('classify.sync_progress')}</Text>
                      </Inline>
                    ) : (
                      <Text>
                        {interpolate(t('classify.apply_recursive_count'), {
                          count: descendantCount,
                        })}
                      </Text>
                    ))}
                </Stack>

                {/* Async progress bar */}
                {asyncJob && asyncProgress && (
                  <Stack space="space.100">
                    <Text>
                      {interpolate(t('classify.async_progress'), {
                        classified: asyncProgress.classified || 0,
                        total: asyncJob.total,
                      })}
                    </Text>
                    <ProgressBar
                      value={
                        asyncJob.total > 0
                          ? (asyncProgress.classified || 0) / asyncJob.total
                          : 0
                      }
                    />
                    {(asyncProgress.classified || 0) > 0 &&
                      asyncJob.startedAt &&
                      (() => {
                        const eta = formatEta(
                          asyncJob.startedAt,
                          asyncProgress.classified || 0,
                          asyncJob.total,
                          t,
                        );
                        return eta ? <Text>{eta}</Text> : null;
                      })()}
                    <Text>{t('classify.async_close_hint')}</Text>
                  </Stack>
                )}

                {/* Error and info messages stay inside the modal.
                   Success uses showFlag toast. Info is hidden when async progress bar is visible. */}
                {message &&
                  message.type !== 'success' &&
                  !(message.type === 'info' && asyncJob) && (
                    <SectionMessage
                      appearance={
                        message.type === 'error' ? 'error' : 'information'
                      }
                    >
                      <Text>{message.text}</Text>
                    </SectionMessage>
                  )}
              </Stack>
            </ModalBody>
            <ModalFooter>
              <ButtonGroup>
                <Button appearance="subtle" onClick={closeModal}>
                  {asyncJob
                    ? t('classify.close_button')
                    : t('classify.cancel_button')}
                </Button>
                <Button
                  appearance="primary"
                  onClick={handleClassify}
                  isLoading={saving}
                  isDisabled={
                    !!asyncJob ||
                    !selectedLevel ||
                    saving ||
                    !selectedLevelAllowed ||
                    (selectedLevel === currentLevelId && !recursive) ||
                    (recursive &&
                      !countLoading &&
                      (descendantCount === 0 || totalDescendants === 0) &&
                      selectedLevel === currentLevelId)
                  }
                >
                  {t('classify.apply_button')}
                </Button>
              </ButtonGroup>
            </ModalFooter>
          </Modal>
        )}
      </ModalTransition>
    </Box>
  );
};

/**
 * Renders a single contact item.
 * Supports user (with avatar), email (as link), and free text types.
 */
const ContactItem = ({ contact, locale }) => {
  const role = localize(contact.role, locale);

  if (contact.type === 'user') {
    return (
      <Inline space="space.100" alignBlock="center">
        <User accountId={contact.value} />
        {role && <Text> — {role}</Text>}
      </Inline>
    );
  }

  if (contact.type === 'email') {
    return (
      <Inline space="space.100">
        <Link href={`mailto:${contact.value}`}>{contact.value}</Link>
        {role && <Text> — {role}</Text>}
      </Inline>
    );
  }

  // Free text
  return (
    <Text>
      {contact.value}
      {role ? ` — ${role}` : ''}
    </Text>
  );
};

// Mount with I18nProvider for translation support
ForgeReconciler.render(
  <I18nProvider>
    <App />
  </I18nProvider>,
);
