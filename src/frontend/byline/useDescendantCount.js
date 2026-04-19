import { useEffect, useState } from 'react';
import { invoke } from '@forge/bridge';

/**
 * Fetches the recursive descendant count for the selected level. Only
 * runs while the recursive toggle is active and the level is allowed;
 * clears itself when the gate flips off.
 */
export default function useDescendantCount({
  pageId,
  selectedLevel,
  selectedLevelAllowed,
  recursive,
}) {
  const [descendantCount, setDescendantCount] = useState(null);
  const [totalDescendants, setTotalDescendants] = useState(null);
  const [countLoading, setCountLoading] = useState(false);

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

  return {
    descendantCount,
    setDescendantCount,
    totalDescendants,
    setTotalDescendants,
    countLoading,
    setCountLoading,
  };
}
