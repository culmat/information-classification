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

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
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
  Spinner,
  SectionMessage,
  Modal,
  ModalTransition,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  Link,
  User,
  Tabs,
  Tab,
  TabList,
  TabPanel,
  EmptyState,
  xcss,
} from '@forge/react';
import { invoke, view, showFlag } from '@forge/bridge';
import { colorToLozenge } from '../shared/constants';
import { localize, interpolate, formatSessionEta } from '../shared/i18n';
import ContactItem from './byline/ContactItem';
import OwnerJobBanner from './byline/OwnerJobBanner';
import PendingJobsList from './byline/PendingJobsList';
import StopConfirmation from './byline/StopConfirmation';
import LevelPicker from './byline/LevelPicker';
import AsyncProgressBar from './byline/AsyncProgressBar';

// Fixed-width Unicode Braille dots used as a plain-text activity spinner.
// All characters live in the same Unicode block (U+2800–U+28FF), so every
// font renders them at identical width — cycling them in place changes
// pixels but not layout.
const ACTIVITY_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

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

  // Stop-confirmation for the active recursive classify loop.
  const [stopConfirmVisible, setStopConfirmVisible] = useState(false);

  // Activity indicator: a single Braille spinner character cycled on a timer.
  // Appended to the progress text so the element structure never changes —
  // no reflow / scrollbar flicker (unlike a Spinner component).
  const [activityFrame, setActivityFrame] = useState(0);
  // Refs read by the loop; refs (not state) so updates take effect without
  // waiting for a React render cycle.
  const pauseRequestedRef = useRef(false);
  const stopRequestedRef = useRef(false);
  // Captures the job's startedAt timestamp so the loop's `finish()` can log
  // elapsed duration without depending on `asyncJob` (which would otherwise
  // force the loop's useCallback to re-create mid-run).
  const startedAtRef = useRef(null);
  // Paused jobs on OTHER pages — populated when the modal opens.
  const [pendingJobs, setPendingJobs] = useState([]);

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
          // Paused recursive-classify jobs are surfaced via getUserPendingJobs
          // when the modal opens — not on byline mount, to keep page views
          // free of extra KVS reads.
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

  // Resolve the localized display name of a level by id, with a safe fallback
  // so completion messages read cleanly even if the level was deleted mid-flight.
  const resolveLevelName = useCallback(
    (levelId) => {
      if (!levelId) return '';
      const level = config?.levels?.find((l) => l.id === levelId);
      return level ? localize(level.name, locale) || levelId : levelId;
    },
    [config, locale],
  );

  // Recursive classification is driven client-side (runRecursiveLoop) — no
  // Realtime subscription needed. Kept a slim stub only if we ever need to
  // listen to server-side admin flows.

  // ETA text memoised against `classified`. Without this, the ~8 fps
  // activity-indicator re-renders were causing `elapsed` to tick every
  // frame while `classified` stood still between batch completions, which
  // made `rate = classified/elapsed` drift downward and the rendered
  // "~X sec remaining" text grow. Keyed on classified so it only
  // recomputes when a batch returns — stable between batches, accurate
  // on each completion.
  const etaText = useMemo(() => {
    if (!asyncJob?.sessionStartedAt) return '';
    const classified = asyncProgress?.classified || 0;
    const sessionProgressed =
      classified - (asyncJob.sessionClassifiedStart || 0);
    const remainingCount = Math.max(0, asyncJob.total - classified);
    return formatSessionEta(
      asyncJob.sessionStartedAt,
      sessionProgressed,
      remainingCount,
      t,
    );
  }, [
    asyncProgress?.classified,
    asyncJob?.sessionStartedAt,
    asyncJob?.sessionClassifiedStart,
    asyncJob?.total,
    t,
  ]);

  // Cycle the activity-indicator frame at ~8 fps while a job is active.
  // Only the text content of the progress line changes — no DOM structure
  // change, so no reflow or scrollbar flicker (which is why Spinner /
  // Button isLoading didn't work here).
  useEffect(() => {
    if (!asyncJob) return;
    const id = setInterval(() => {
      setActivityFrame((f) => (f + 1) % ACTIVITY_FRAMES.length);
    }, 120);
    return () => clearInterval(id);
  }, [asyncJob]);

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

  // Drive a client-side batched classify loop. Runs asUser, respects page
  // restrictions. Pause (close dialog) preserves KVS state; Stop deletes it.
  const runRecursiveLoop = useCallback(
    async (jobId, initialProgress) => {
      const levelName = resolveLevelName(
        (initialProgress && initialProgress.levelId) || selectedLevel,
      );
      let progress = initialProgress || {};

      // Helper: close dialog and show the appropriate end-of-job flag.
      const finish = (kind, { classified, failed }) => {
        // Browser-console marker so we can compare run durations when tuning
        // concurrency / chunk size. Mirror of the server-side log.
        if (startedAtRef.current) {
          const durationMs = Date.now() - startedAtRef.current;
          console.log(
            `[classify-job] ${kind} classified=${classified} failed=${failed} durationMs=${durationMs}`,
          );
        }
        startedAtRef.current = null;
        setShowModal(false);
        setAsyncJob(null);
        setAsyncProgress(null);
        setSaving(false);
        loadClassification(false);
        setDescendantCount(0);
        view.refresh();

        let msg;
        if (kind === 'completed') {
          msg =
            failed > 0
              ? interpolate(t('classify.async_complete_partial'), {
                  classified,
                  failed,
                  level: levelName,
                })
              : interpolate(t('classify.async_complete'), {
                  classified,
                  level: levelName,
                });
        } else if (kind === 'stopped') {
          msg = interpolate(t('classify.stopped'), {
            classified,
            level: levelName,
          });
        } else if (kind === 'aborted_level_deleted') {
          msg = interpolate(t('classify.aborted_level_deleted'), {
            classified,
          });
        } else if (kind === 'aborted_level_disallowed') {
          msg = interpolate(t('classify.aborted_level_disallowed'), {
            classified,
          });
        }
        showFlag({
          id: 'classify-end',
          title: msg || '',
          type:
            kind === 'completed' && !failed
              ? 'success'
              : kind === 'stopped'
                ? 'info'
                : 'warning',
          isAutoDismiss: kind === 'completed' && !failed,
        });
      };

      // Already-done case (tiny tree classified by the start call itself).
      if (progress.done) {
        finish('completed', {
          classified: progress.classified || 0,
          failed: progress.failed || 0,
        });
        return;
      }

      while (true) {
        if (stopRequestedRef.current) {
          const result = await invoke('cancelClassifyJob', { jobId });
          finish('stopped', {
            classified: result?.classified || progress.classified || 0,
            failed: result?.failed || progress.failed || 0,
          });
          return;
        }
        if (pauseRequestedRef.current) {
          // Dialog already closed (or is closing). Don't show a flag — the
          // paused banner on the next modal open is the user's hint.
          setAsyncJob(null);
          setAsyncProgress(null);
          setSaving(false);
          return;
        }

        let batch;
        try {
          batch = await invoke('processClassifyBatch', { jobId });
        } catch (err) {
          console.error('processClassifyBatch failed:', err);
          setMessage({ type: 'error', text: t('classify.error') });
          setSaving(false);
          return;
        }
        if (!batch || !batch.success) {
          setMessage({ type: 'error', text: t('classify.error') });
          setSaving(false);
          return;
        }

        progress = batch;
        setAsyncProgress({
          classified: batch.classified,
          failed: batch.failed,
          skipped: batch.skipped,
          total: batch.totalEstimate,
          discoveryDone: batch.discoveryDone,
          done: batch.done,
          fromRealtime: true,
        });

        if (batch.done) {
          if (batch.cancelled) {
            finish('stopped', batch);
          } else if (batch.aborted === 'level_deleted') {
            finish('aborted_level_deleted', batch);
          } else if (batch.aborted === 'level_disallowed') {
            finish('aborted_level_disallowed', batch);
          } else {
            finish('completed', batch);
          }
          return;
        }
      }
    },
    [selectedLevel, t, loadClassification, resolveLevelName],
  );

  // Handle classification change submission
  const handleClassify = useCallback(async () => {
    if (!selectedLevel) return;
    setSaving(true);
    setMessage(null);
    pauseRequestedRef.current = false;
    stopRequestedRef.current = false;

    try {
      if (!recursive) {
        // Single-page classify — server-side, one call.
        const result = await invoke('setClassification', {
          pageId,
          spaceKey,
          levelId: selectedLevel,
          locale,
        });
        if (!result.success) {
          setMessage({
            type: 'error',
            text: result.error || t('classify.error'),
          });
          setSaving(false);
          return;
        }
        const levelName = resolveLevelName(selectedLevel);
        const msg = interpolate(t('classify.success'), { level: levelName });
        setShowModal(false);
        setSaving(false);
        showFlag({
          id: 'classify-success',
          title: msg,
          type: 'success',
          isAutoDismiss: true,
        });
        await loadClassification(false);
        setDescendantCount(0);
        view.refresh();
        return;
      }

      // Recursive — client-driven loop.
      const start = await invoke('startRecursiveClassify', {
        pageId,
        spaceKey,
        levelId: selectedLevel,
        locale,
      });
      if (!start.success) {
        setMessage({
          type: 'error',
          text: start.message || start.error || t('classify.error'),
        });
        return;
      }
      startedAtRef.current = Date.now();
      setAsyncJob({
        jobId: start.jobId,
        total: start.totalEstimate,
        startedAt: Date.now(),
        levelId: selectedLevel,
        sessionStartedAt: Date.now(),
        sessionClassifiedStart: start.classified || 0,
      });
      setAsyncProgress({
        classified: start.classified || 0,
        failed: start.failed || 0,
        skipped: start.skipped || 0,
        total: start.totalEstimate,
        discoveryDone: start.discoveryDone,
        done: start.done,
        fromRealtime: true,
      });
      setMessage({
        type: 'info',
        text: interpolate(t('classify.async_started'), {
          total: start.totalEstimate,
          level: resolveLevelName(selectedLevel),
        }),
      });

      await runRecursiveLoop(start.jobId, {
        ...start,
        levelId: selectedLevel,
      });
    } catch (error) {
      console.error('Failed to classify:', error);
      setMessage({ type: 'error', text: t('classify.error') });
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
    resolveLevelName,
    runRecursiveLoop,
  ]);

  // Open the classification modal
  const openModal = useCallback(async () => {
    setSelectedLevel(currentLevelId);
    setRecursive(false);
    setMessage(null);
    setDescendantCount(null);
    setTotalDescendants(null);
    setCountLoading(false);
    setStopConfirmVisible(false);
    setSaving(false);
    pauseRequestedRef.current = false;
    stopRequestedRef.current = false;
    setShowModal(true);

    // Look up the user's pending client-driven jobs — one KVS read, only on
    // modal open (never on byline mount) so page views stay cheap.
    // `currentPageId` lets the server annotate each job with `isSelf` /
    // `isAncestor` so the UI can hide the picker when starting a new
    // classify here would conflict with an in-progress job rooted above.
    try {
      const result = await invoke('getUserPendingJobs', {
        currentPageId: pageId,
      });
      setPendingJobs(result?.jobs || []);
    } catch (_) {
      setPendingJobs([]);
    }
    setAsyncJob(null);
    setAsyncProgress(null);
  }, [currentLevelId, pageId]);

  // Close modal. If a job is running, signal pause (client loop stops, KVS
  // state is preserved so the user can resume from any page's byline).
  const closeModal = useCallback(() => {
    if (asyncJob && !stopRequestedRef.current) {
      pauseRequestedRef.current = true;
      showFlag({
        id: 'classify-paused',
        title: t('classify.paused'),
        type: 'info',
        isAutoDismiss: true,
      });
    }
    setShowModal(false);
    setStopConfirmVisible(false);
    view.refresh();
  }, [asyncJob, t]);

  // Stop button → confirmation → actually cancel the job.
  const requestStop = useCallback(() => {
    setStopConfirmVisible(true);
  }, []);
  const confirmStop = useCallback(() => {
    stopRequestedRef.current = true;
    setStopConfirmVisible(false);
  }, []);
  const abandonStop = useCallback(() => {
    setStopConfirmVisible(false);
  }, []);

  // Resume a job directly in the current dialog. The loop is server-calls
  // only, so there's no reason to navigate to the root page — the user
  // immediately sees progress resuming in the byline they opened.
  const resumePendingJob = useCallback(
    (job) => {
      if (!job?.jobId) return;
      setSelectedLevel(job.levelId);
      setRecursive(true);
      setPendingJobs((prev) => prev.filter((j) => j.jobId !== job.jobId));
      startedAtRef.current = job.startedAt;
      setAsyncJob({
        jobId: job.jobId,
        total: job.totalEstimate,
        startedAt: job.startedAt,
        levelId: job.levelId,
        sessionStartedAt: Date.now(),
        sessionClassifiedStart: job.classified,
      });
      setAsyncProgress({
        classified: job.classified,
        failed: job.failed,
        skipped: job.skipped,
        total: job.totalEstimate,
        discoveryDone: job.discoveryDone,
        done: false,
        fromRealtime: true,
      });
      setSaving(true);
      setMessage(null);
      pauseRequestedRef.current = false;
      stopRequestedRef.current = false;
      runRecursiveLoop(job.jobId, { ...job, done: false });
    },
    [runRecursiveLoop],
  );
  const stopPendingJob = useCallback(async (job) => {
    if (!job?.jobId) return;
    await invoke('cancelClassifyJob', { jobId: job.jobId });
    setPendingJobs((prev) => prev.filter((j) => j.jobId !== job.jobId));
  }, []);

  // License check: only enforce in production where Marketplace injects license info.
  // Dev/staging always return license: null, so skip enforcement there.
  const licensed =
    context?.environmentType !== 'PRODUCTION' ||
    context?.license?.active === true;

  if (loading) {
    return <Spinner size="small" />;
  }

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

  // Helper: look up a level's lozenge appearance from config
  const levelAppearance = (levelId) => {
    const level = config?.levels?.find((l) => l.id === levelId);
    return level ? colorToLozenge(level.color) : 'default';
  };

  // Partition pending jobs: a job on this page or an ancestor page "owns"
  // this tree — the picker should be hidden and the banner made prominent,
  // because starting a new classify here would conflict. Other jobs
  // (unrelated pages) get a compact list above the normal picker.
  const ownerJob = !asyncJob
    ? pendingJobs.find((j) => j.isSelf || j.isAncestor)
    : null;
  const otherJobs = !asyncJob
    ? pendingJobs.filter((j) => !(j.isSelf || j.isAncestor))
    : [];

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
                  <Button
                    testId="byline-change"
                    appearance="default"
                    onClick={openModal}
                  >
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
                 * Paused job that owns this tree (current page is its root
                 * or a descendant of its root). Picker is hidden below; the
                 * user can only resume or stop — starting a new classify
                 * here would conflict.
                 */}
                {ownerJob && (
                  <OwnerJobBanner
                    ownerJob={ownerJob}
                    t={t}
                    resumePendingJob={resumePendingJob}
                    stopPendingJob={stopPendingJob}
                    resolveLevelName={resolveLevelName}
                    levelAppearance={levelAppearance}
                  />
                )}

                {/* Paused jobs on unrelated pages — compact list above the
                    normal picker. Never auto-resumes; user decides. */}
                {otherJobs.length > 0 && (
                  <PendingJobsList
                    otherJobs={otherJobs}
                    t={t}
                    resumePendingJob={resumePendingJob}
                    stopPendingJob={stopPendingJob}
                    resolveLevelName={resolveLevelName}
                    levelAppearance={levelAppearance}
                  />
                )}

                {/* Stop-confirmation — inline SectionMessage over the picker.
                    Avoids nested Modal complexity; covers the dialog contextually. */}
                {stopConfirmVisible && asyncJob && (
                  <StopConfirmation
                    asyncJob={asyncJob}
                    asyncProgress={asyncProgress}
                    t={t}
                    abandonStop={abandonStop}
                    confirmStop={confirmStop}
                    resolveLevelName={resolveLevelName}
                  />
                )}

                {/*
                 * Level picker: each row combines a Radio button (handles selection)
                 * with a colored Lozenge (shows the classification color).
                 * Box onClick is not supported in Forge UI Kit, so Radio onChange
                 * is the only reliable click target.
                 *
                 * Hidden while a recursive job is active on this page or an
                 * ancestor — starting another classify would conflict; the
                 * owner-job banner above is the only path forward.
                 */}
                {!asyncJob && !ownerJob && (
                  <LevelPicker
                    config={config}
                    locale={locale}
                    t={t}
                    selectedLevel={selectedLevel}
                    setSelectedLevel={setSelectedLevel}
                    asyncJob={asyncJob}
                    saving={saving}
                    selectedLevelAllowed={selectedLevelAllowed}
                    recursive={recursive}
                    setRecursive={setRecursive}
                    countLoading={countLoading}
                    totalDescendants={totalDescendants}
                    descendantCount={descendantCount}
                    currentLevelId={currentLevelId}
                  />
                )}

                {/* Async progress bar — spinner placeholder until first live
                    Realtime event arrives, to avoid flashing "0 of X" when
                    KVS state hasn't been updated yet. */}
                {asyncJob && asyncProgress && (
                  <AsyncProgressBar
                    asyncJob={asyncJob}
                    asyncProgress={asyncProgress}
                    activityFrame={activityFrame}
                    etaText={etaText}
                    resolveLevelName={resolveLevelName}
                    t={t}
                  />
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
                {asyncJob ? (
                  <>
                    {/* Stop is destructive but NOT the default; keep it
                        subtle on the left so Pause (the safe close) is the
                        visually prominent primary action on the right. */}
                    <Button
                      testId="byline-stop"
                      appearance="subtle"
                      onClick={requestStop}
                    >
                      {t('classify.stop_button')}
                    </Button>
                    <Button
                      testId="byline-pause"
                      appearance="primary"
                      onClick={closeModal}
                    >
                      {t('classify.pause_button')}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      testId="byline-cancel"
                      appearance="subtle"
                      onClick={closeModal}
                    >
                      {t('classify.cancel_button')}
                    </Button>
                    <Button
                      testId="byline-classify-submit"
                      appearance="primary"
                      onClick={handleClassify}
                      isLoading={saving}
                      isDisabled={
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
                  </>
                )}
              </ButtonGroup>
            </ModalFooter>
          </Modal>
        )}
      </ModalTransition>
    </Box>
  );
};

// Mount with I18nProvider for translation support
ForgeReconciler.render(
  <I18nProvider>
    <App />
  </I18nProvider>,
);
