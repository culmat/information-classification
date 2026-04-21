import { useEffect, useRef } from 'react';
import { invoke } from '@forge/bridge';

/**
 * Drives `processClassifyBatch` for whichever bulk-classify job currently
 * holds the user's active slot. Only runs for `jobKind === 'bulk-classify'`;
 * label jobs have their own loop in useLabelSyncJobs.
 *
 * Safe against duplicate drivers (two tabs open, etc.) — chunk consumption
 * is atomic in KVS, so at worst both tabs make a redundant invoke; never
 * double-classify a page.
 *
 * On every batch response and on completion, calls `onTick` so the caller
 * can refresh its queue view (progress bar updates, banner text, etc.).
 */
export default function useBulkClassifyDriver({ activeJob, onTick }) {
  const drivingRef = useRef(null);

  useEffect(() => {
    if (!activeJob || activeJob.jobKind !== 'bulk-classify') return;
    if (drivingRef.current === activeJob.jobId) return;
    drivingRef.current = activeJob.jobId;
    const jobId = activeJob.jobId;
    let cancelled = false;

    (async () => {
      while (!cancelled) {
        let batch;
        try {
          batch = await invoke('processClassifyBatch', { jobId });
        } catch (err) {
          console.error('processClassifyBatch failed:', err);
          break;
        }
        if (cancelled) break;
        if (!batch || !batch.success) break;
        onTick?.();
        if (batch.done) break;
        // `queued: true` means another client won the promote race. Back
        // off for one poll cycle and re-check via the onTick refresh.
        if (batch.queued) break;
      }
      if (drivingRef.current === jobId) drivingRef.current = null;
    })();

    return () => {
      cancelled = true;
    };
  }, [activeJob?.jobId, activeJob?.jobKind, onTick]);
}
