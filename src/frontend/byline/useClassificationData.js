import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@forge/bridge';

/**
 * Loads and holds the server-provided classification + config + history
 * for the page. `reload(false)` lets callers refresh after a classify
 * action without triggering the loading spinner (which would re-mount
 * the modal).
 */
export default function useClassificationData({ pageId, spaceKey }) {
  const [loading, setLoading] = useState(true);
  const [classification, setClassification] = useState(null);
  const [config, setConfig] = useState(null);
  const [restrictionWarning, setRestrictionWarning] = useState(null);
  const [history, setHistory] = useState({ truncated: false, entries: [] });

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

  return {
    loading,
    classification,
    config,
    restrictionWarning,
    history,
    loadClassification,
  };
}
