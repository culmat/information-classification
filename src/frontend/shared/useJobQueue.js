import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@forge/bridge';

/**
 * Fetches the current user's unified job queue (bulk-classify +
 * label-import + label-export). Polls the queue only while there is
 * evidence of work — once the server reports no active and no queued
 * jobs, polling stops. This keeps idle admins and byline modals off the
 * KVS hot path.
 *
 * Callers that know a job was just started/stopped locally should call
 * `refresh()` to re-check immediately (that's how polling restarts after
 * an idle period).
 *
 * Notes:
 * - `poll: true` is the flag that arms the hook; it still won't poll
 *   when the queue is empty.
 * - `loading` flips only on the first fetch and on explicit `refresh()`
 *   calls, not on silent background polls — so "queue empty" renders a
 *   stable state without spinner flicker.
 */
export default function useJobQueue({
  currentPageId = null,
  poll = false,
} = {}) {
  const [activeJob, setActiveJob] = useState(null);
  const [queuedJobs, setQueuedJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef(null);
  const pollRef = useRef(poll);
  pollRef.current = poll;

  const stopPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const startPollingIfIdle = useCallback((tick) => {
    if (!pollRef.current || intervalRef.current) return;
    intervalRef.current = setInterval(() => tick(false), 3000);
  }, []);

  const fetchOnce = useCallback(
    async (showLoading) => {
      if (showLoading) setLoading(true);
      try {
        const result = await invoke('getUserJobs', { currentPageId });
        if (result?.success) {
          const active = result.activeJob || null;
          const queued = Array.isArray(result.queuedJobs)
            ? result.queuedJobs
            : [];
          setActiveJob(active);
          setQueuedJobs(queued);
          if (active || queued.length > 0) {
            startPollingIfIdle(fetchOnce);
          } else {
            stopPolling();
          }
        }
      } catch (err) {
        console.error('getUserJobs failed:', err);
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [currentPageId, startPollingIfIdle],
  );

  const refresh = useCallback(() => fetchOnce(true), [fetchOnce]);

  useEffect(() => {
    if (!poll) {
      stopPolling();
      return undefined;
    }
    fetchOnce(true);
    return stopPolling;
  }, [poll, fetchOnce]);

  return { activeJob, queuedJobs, refresh, loading };
}
