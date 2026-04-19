import { invoke } from '@forge/bridge';

/**
 * Drives one label-sync job by pulling batches through `processLabelBatch`
 * until the server reports done. Stop is signalled via the caller's
 * `stopRef`. Shared by import and export flows; the `finish` callback
 * receives the final tallies + status so each flow can fan out to its
 * own progress/step setters and settle-count loops.
 */
export async function runLabelJobLoop({
  jobId,
  kind,
  stopRef,
  setProgress,
  setRunning,
  startedAt,
  sessionClassifiedStart,
  onDone,
}) {
  const finish = ({ classified, failed, status, skipped = 0 }) => {
    const durationMs = Date.now() - startedAt;
    console.log(
      `[label-job] ${kind} ${status} classified=${classified} failed=${failed} skipped=${skipped} durationMs=${durationMs}`,
    );
    setRunning(false);
    setProgress((prev) => ({
      ...(prev || {}),
      classified,
      failed,
      skipped,
      done: true,
      status,
    }));
    if (onDone) onDone(status, { classified, failed, skipped });
  };

  while (true) {
    if (stopRef.current) {
      let result;
      try {
        result = await invoke('cancelLabelJob', { jobId });
      } catch (err) {
        console.error('cancelLabelJob failed:', err);
      }
      finish({
        classified: result?.classified || 0,
        failed: result?.failed || 0,
        skipped: result?.skipped || 0,
        status: 'stopped',
      });
      return;
    }
    let batch;
    try {
      batch = await invoke('processLabelBatch', { jobId });
    } catch (err) {
      console.error('processLabelBatch failed:', err);
      finish({ classified: 0, failed: 0, status: 'error' });
      return;
    }
    if (!batch || !batch.success) {
      finish({ classified: 0, failed: 0, status: 'error' });
      return;
    }
    setProgress((prev) => ({
      ...(prev || {}),
      classified: batch.classified,
      failed: batch.failed,
      skipped: batch.skipped,
      total: batch.totalEstimate,
      discoveryDone: batch.discoveryDone,
      sessionStartedAt: startedAt,
      sessionClassifiedStart,
    }));
    if (batch.done) {
      let status;
      if (batch.cancelled) status = 'stopped';
      else if (batch.aborted) status = 'aborted';
      else status = 'completed';
      finish({
        classified: batch.classified,
        failed: batch.failed,
        skipped: batch.skipped,
        status,
      });
      return;
    }
  }
}
