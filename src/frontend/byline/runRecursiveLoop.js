import { invoke, view, showFlag } from '@forge/bridge';
import { interpolate } from '../../shared/i18n';

/**
 * Drives the client-side recursive-classify loop. Runs asUser, respects
 * page restrictions. Pause (close dialog) preserves KVS state; Stop
 * deletes it. Invoked by the byline component and by the pending-job
 * resume flow; the caller passes its state setters + the stop/pause refs
 * so the loop can drain cleanly when those flip.
 */
export async function runRecursiveLoop({
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
}) {
  const levelName = resolveLevelName(
    (initialProgress && initialProgress.levelId) || selectedLevel,
  );
  let progress = initialProgress || {};

  const finish = (kind, { classified, failed }) => {
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
      msg = interpolate(t('classify.aborted_level_deleted'), { classified });
    } else if (kind === 'aborted_level_disallowed') {
      msg = interpolate(t('classify.aborted_level_disallowed'), { classified });
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
}
