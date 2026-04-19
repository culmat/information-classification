import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@forge/bridge';

const EMPTY_EXPORT_COUNT = {
  classified: 0,
  alreadyLabelled: 0,
  toLabel: 0,
  cql: { classified: '', alreadyLabelled: '', toLabel: '' },
};

const SETTLE_MAX_POLLS = 12; // ~36s ceiling
const SETTLE_STABLE_POLLS = 2; // two matching polls ⇒ settled
const SETTLE_INTERVAL_MS = 3000;

/**
 * Export-side mirror of useImportState: owns mappings, per-level counts,
 * scope selection, and the debounced per-level refresh driven by the
 * label-name Textfield.
 */
export default function useExportState({ config }) {
  const [exportMappings, setExportMappings] = useState({});
  const [exportLoading, setExportLoading] = useState(false);
  const [exportProgress, setExportProgress] = useState(null);
  const [exportScopeAll, setExportScopeAll] = useState(true);
  const [exportSpaceKeys, setExportSpaceKeys] = useState([]);
  const [exportCounts, setExportCounts] = useState({});
  const [exportCountLoading, setExportCountLoading] = useState(false);
  const [exportLevelLoading, setExportLevelLoading] = useState({});
  const [exportSettling, setExportSettling] = useState(false);
  const [exportCountsInitialized, setExportCountsInitialized] = useState(false);

  const exportScopeAllRef = useRef(exportScopeAll);
  const exportSpaceKeysRef = useRef(exportSpaceKeys);
  exportScopeAllRef.current = exportScopeAll;
  exportSpaceKeysRef.current = exportSpaceKeys;

  const getExportSpaceKey = useCallback(() => {
    if (exportScopeAllRef.current) return null;
    const keys = (exportSpaceKeysRef.current || [])
      .map((o) => o.value)
      .filter(Boolean);
    return keys.length > 0 ? keys.join(',') : '';
  }, []);

  const exportDebounceRef = useRef({});
  const exportSeqRef = useRef({});

  const refreshExportCounts = useCallback(async () => {
    setExportCountLoading(true);
    const allLevels = config?.levels || [];
    const allLevelIds = allLevels.map((l) => l.id);
    setExportLevelLoading(
      Object.fromEntries(allLevelIds.map((id) => [id, true])),
    );
    const spaceKey = getExportSpaceKey();

    if (spaceKey === '') {
      const zero = Object.fromEntries(
        allLevelIds.map((id) => [id, EMPTY_EXPORT_COUNT]),
      );
      setExportCounts(zero);
      setExportCountLoading(false);
      setExportLevelLoading({});
      return zero;
    }

    const seqs = {};
    for (const id of allLevelIds) {
      seqs[id] = (exportSeqRef.current[id] || 0) + 1;
      exportSeqRef.current[id] = seqs[id];
    }
    const results = await Promise.all(
      allLevels.map(async (level) => {
        const labelName = exportMappings[level.id] ?? level.id;
        try {
          const result = await invoke('countLevelGap', {
            levelId: level.id,
            labelName,
            spaceKey,
          });
          return {
            level: level.id,
            record: result.success ? result : EMPTY_EXPORT_COUNT,
          };
        } catch (_) {
          return { level: level.id, record: EMPTY_EXPORT_COUNT };
        }
      }),
    );
    const counts = { ...exportCounts };
    for (const { level, record } of results) {
      if (exportSeqRef.current[level] === seqs[level]) counts[level] = record;
    }
    setExportCounts(counts);
    setExportCountLoading(false);
    setExportLevelLoading({});
    return counts;
  }, [config, exportCounts, exportMappings, getExportSpaceKey]);

  const countsFingerprint = (counts) =>
    Object.entries(counts || {})
      .map(([id, r]) => `${id}:${r?.toLabel ?? 0}/${r?.alreadyLabelled ?? 0}`)
      .sort()
      .join('|');

  const settleExportCounts = async () => {
    setExportSettling(true);
    try {
      let lastPrint = null;
      let stable = 0;
      for (let i = 0; i < SETTLE_MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, SETTLE_INTERVAL_MS));
        const snapshot = await refreshExportCounts();
        const print = countsFingerprint(snapshot);
        if (print === lastPrint) {
          stable++;
          if (stable >= SETTLE_STABLE_POLLS) break;
        } else {
          stable = 0;
          lastPrint = print;
        }
      }
    } finally {
      setExportSettling(false);
    }
  };

  const refreshExportLevelCount = (levelId, labelName) => {
    clearTimeout(exportDebounceRef.current[levelId]);
    exportDebounceRef.current[levelId] = setTimeout(async () => {
      const spaceKey = getExportSpaceKey();
      if (spaceKey === '') {
        setExportCounts((prev) => ({ ...prev, [levelId]: EMPTY_EXPORT_COUNT }));
        return;
      }
      const mySeq = (exportSeqRef.current[levelId] || 0) + 1;
      exportSeqRef.current[levelId] = mySeq;
      setExportLevelLoading((prev) => ({ ...prev, [levelId]: true }));
      let record = EMPTY_EXPORT_COUNT;
      try {
        const result = await invoke('countLevelGap', {
          levelId,
          labelName,
          spaceKey,
        });
        if (result.success) record = result;
      } catch (_) {}
      if (exportSeqRef.current[levelId] !== mySeq) return;
      setExportCounts((prev) => ({ ...prev, [levelId]: record }));
      setExportLevelLoading((prev) => ({ ...prev, [levelId]: false }));
    }, 600);
  };

  useEffect(() => {
    if (config && !exportCountsInitialized) {
      setExportCountsInitialized(true);
      refreshExportCounts();
    }
  }, [config, exportCountsInitialized, refreshExportCounts]);

  return {
    exportMappings,
    setExportMappings,
    exportLoading,
    setExportLoading,
    exportProgress,
    setExportProgress,
    exportScopeAll,
    setExportScopeAll,
    exportSpaceKeys,
    setExportSpaceKeys,
    exportCounts,
    setExportCounts,
    exportCountLoading,
    exportLevelLoading,
    exportSettling,
    setExportSettling,
    exportScopeAllRef,
    exportSpaceKeysRef,
    getExportSpaceKey,
    refreshExportCounts,
    settleExportCounts,
    refreshExportLevelCount,
  };
}
