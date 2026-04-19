import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke, view, showFlag } from '@forge/bridge';
import { interpolate } from '../../shared/i18n';
import { runRecursiveLoop } from './runRecursiveLoop';

const ACTIVITY_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Owns the classification modal's interaction state: open/close, job
 * loop, pause/stop controls, pending-job list, and the handleClassify
 * submit. The byline component provides read-only page context and
 * classification state; this hook drives the side-effectful actions.
 */
export default function useClassifyActions({
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
}) {
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [stopConfirmVisible, setStopConfirmVisible] = useState(false);
  const [activityFrame, setActivityFrame] = useState(0);
  const [pendingJobs, setPendingJobs] = useState([]);
  const [asyncJob, setAsyncJob] = useState(null);
  const [asyncProgress, setAsyncProgress] = useState(null);

  const pauseRequestedRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const startedAtRef = useRef(null);

  useEffect(() => {
    if (!asyncJob) return;
    const id = setInterval(() => {
      setActivityFrame((f) => (f + 1) % ACTIVITY_FRAMES.length);
    }, 120);
    return () => clearInterval(id);
  }, [asyncJob]);

  const runLoop = useCallback(
    (jobId, initialProgress) =>
      runRecursiveLoop({
        jobId,
        initialProgress,
        selectedLevel,
        t,
        startedAtRef,
        stopRequestedRef,
        pauseRequestedRef,
        setShowModal,
        setAsyncJob,
        setAsyncProgress,
        setSaving,
        setDescendantCount,
        setMessage,
        loadClassification,
        resolveLevelName,
      }),
    [
      selectedLevel,
      t,
      setDescendantCount,
      loadClassification,
      resolveLevelName,
    ],
  );

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
  }, [
    currentLevelId,
    pageId,
    setCountLoading,
    setDescendantCount,
    setRecursive,
    setSelectedLevel,
    setTotalDescendants,
  ]);

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
      runLoop(job.jobId, { ...job, done: false });
    },
    [runLoop, setRecursive, setSelectedLevel],
  );

  const stopPendingJob = useCallback(async (job) => {
    if (!job?.jobId) return;
    await invoke('cancelClassifyJob', { jobId: job.jobId });
    setPendingJobs((prev) => prev.filter((j) => j.jobId !== job.jobId));
  }, []);

  const handleClassifySingle = useCallback(async () => {
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
  }, [
    pageId,
    spaceKey,
    selectedLevel,
    locale,
    t,
    resolveLevelName,
    loadClassification,
    setDescendantCount,
  ]);

  const handleClassifyRecursive = useCallback(async () => {
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
    await runLoop(start.jobId, { ...start, levelId: selectedLevel });
  }, [pageId, spaceKey, selectedLevel, locale, t, resolveLevelName, runLoop]);

  const handleClassify = useCallback(async () => {
    if (!selectedLevel) return;
    setSaving(true);
    setMessage(null);
    pauseRequestedRef.current = false;
    stopRequestedRef.current = false;
    try {
      if (!recursive) await handleClassifySingle();
      else await handleClassifyRecursive();
    } catch (error) {
      console.error('Failed to classify:', error);
      setMessage({ type: 'error', text: t('classify.error') });
      setSaving(false);
    }
  }, [
    selectedLevel,
    recursive,
    t,
    handleClassifySingle,
    handleClassifyRecursive,
  ]);

  return {
    showModal,
    saving,
    message,
    stopConfirmVisible,
    activityFrame,
    pendingJobs,
    asyncJob,
    asyncProgress,
    openModal,
    closeModal,
    requestStop,
    confirmStop,
    abandonStop,
    resumePendingJob,
    stopPendingJob,
    handleClassify,
    resolveLevelName,
  };
}
