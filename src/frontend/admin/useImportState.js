import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@forge/bridge';

const EMPTY_IMPORT_COUNT = {
  labelled: 0,
  alreadyClassified: 0,
  toClassify: 0,
  cql: { labelled: '', alreadyClassified: '', toClassify: '' },
};

/**
 * Import-side state, counts, and count-refresh callbacks for the Labels
 * tab. Owns the spaces/labels registry, per-level loading flags, and the
 * debounced/sequenced per-level refresh. Consumers drive it through the
 * returned refs and callbacks.
 */
export default function useImportState({ config }) {
  const [importStep, setImportStep] = useState('idle');
  const [importLabels, setImportLabels] = useState({});
  const [importCounts, setImportCounts] = useState({});
  const [importCountLoading, setImportCountLoading] = useState(false);
  const [importLevelLoading, setImportLevelLoading] = useState({});
  const [importRemoveLabels, setImportRemoveLabels] = useState(true);
  const [importScopeAll, setImportScopeAll] = useState(true);
  const [importSpaceKeys, setImportSpaceKeys] = useState([]);
  const [availableSpaces, setAvailableSpaces] = useState([]);
  const [availableLabels, setAvailableLabels] = useState([]);
  const [labelsLoading, setLabelsLoading] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
  const [importSettling, setImportSettling] = useState(false);
  const [importInitialized, setImportInitialized] = useState(false);

  // Load available spaces and labels on mount
  useEffect(() => {
    invoke('listSpaces')
      .then((result) => {
        if (result.success && result.spaces) {
          setAvailableSpaces(
            result.spaces.map((s) => ({
              label: `${s.name} (${s.key})`,
              value: s.key,
            })),
          );
        }
      })
      .catch(() => {});
    setLabelsLoading(true);
    invoke('listLabels')
      .then((result) => {
        if (result.success && result.labels) {
          setAvailableLabels(
            result.labels.map((l) => ({ label: l.name, value: l.name })),
          );
        }
      })
      .catch(() => {})
      .finally(() => setLabelsLoading(false));
  }, []);

  const importScopeAllRef = useRef(importScopeAll);
  const importSpaceKeysRef = useRef(importSpaceKeys);
  importScopeAllRef.current = importScopeAll;
  importSpaceKeysRef.current = importSpaceKeys;

  const getImportSpaceKey = useCallback(() => {
    if (importScopeAllRef.current) return null;
    const keys = (importSpaceKeysRef.current || [])
      .map((o) => o.value)
      .filter(Boolean);
    return keys.length > 0 ? keys.join(',') : '';
  }, []);

  const getDefaultImportLabels = useCallback(
    (labelOptions) => {
      const existingNames = new Set(
        (labelOptions || availableLabels).map((o) => o.value),
      );
      const result = {};
      for (const level of (config?.levels || []).filter((l) => l.allowed)) {
        const candidates = new Set();
        candidates.add(level.id);
        if (level.name) {
          for (const val of Object.values(level.name)) {
            if (val) candidates.add(val.toLowerCase());
          }
        }
        result[level.id] = [...candidates]
          .filter((n) => existingNames.has(n))
          .map((n) => ({ label: n, value: n }));
      }
      return result;
    },
    [availableLabels, config],
  );

  const importDebounceRef = useRef({});
  const importSeqRef = useRef({});

  const refreshImportCounts = useCallback(
    async (labelsOverride) => {
      setImportCountLoading(true);
      const allowedLevels = (config?.levels || []).filter((l) => l.allowed);
      const allLevelIds = allowedLevels.map((l) => l.id);
      setImportLevelLoading(
        Object.fromEntries(allLevelIds.map((id) => [id, true])),
      );
      const spaceKey = getImportSpaceKey();

      if (spaceKey === '') {
        const zero = Object.fromEntries(
          allLevelIds.map((id) => [id, EMPTY_IMPORT_COUNT]),
        );
        setImportCounts(zero);
        setImportCountLoading(false);
        setImportLevelLoading({});
        return zero;
      }
      const seqs = {};
      for (const id of allLevelIds) {
        seqs[id] = (importSeqRef.current[id] || 0) + 1;
        importSeqRef.current[id] = seqs[id];
      }
      const counts = { ...importCounts };
      const source = labelsOverride || importLabels;
      const results = await Promise.all(
        allowedLevels.map(async (level) => {
          const labels = (source[level.id] || [])
            .map((o) => o.value)
            .filter(Boolean);
          if (labels.length === 0)
            return { level: level.id, record: EMPTY_IMPORT_COUNT };
          try {
            const result = await invoke('countLabelPages', {
              labels,
              levelId: level.id,
              spaceKey,
            });
            return {
              level: level.id,
              record: result.success ? result : EMPTY_IMPORT_COUNT,
            };
          } catch (_) {
            return { level: level.id, record: EMPTY_IMPORT_COUNT };
          }
        }),
      );
      for (const { level, record } of results) {
        if (importSeqRef.current[level] === seqs[level]) counts[level] = record;
      }
      setImportCounts(counts);
      setImportCountLoading(false);
      setImportLevelLoading({});
      return counts;
    },
    [config, importCounts, importLabels, getImportSpaceKey],
  );

  const importCountsFingerprint = (counts) =>
    Object.entries(counts || {})
      .map(
        ([id, r]) => `${id}:${r?.toClassify ?? 0}/${r?.alreadyClassified ?? 0}`,
      )
      .sort()
      .join('|');

  const settleImportCounts = async () => {
    setImportSettling(true);
    try {
      let lastPrint = null;
      let stable = 0;
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const snapshot = await refreshImportCounts();
        const print = importCountsFingerprint(snapshot);
        if (print === lastPrint) {
          stable++;
          if (stable >= 2) break;
        } else {
          stable = 0;
          lastPrint = print;
        }
      }
    } finally {
      setImportSettling(false);
    }
  };

  const onScopeChange = () => {
    setTimeout(() => refreshImportCounts(), 50);
  };

  const refreshLevelCount = (levelId, selectedOptions) => {
    clearTimeout(importDebounceRef.current[levelId]);
    importDebounceRef.current[levelId] = setTimeout(async () => {
      const spaceKey = getImportSpaceKey();
      if (spaceKey === '') {
        setImportCounts((prev) => ({ ...prev, [levelId]: EMPTY_IMPORT_COUNT }));
        setImportLevelLoading((prev) => ({ ...prev, [levelId]: false }));
        return;
      }
      const labels = (selectedOptions || [])
        .map((o) => o.value)
        .filter(Boolean);
      if (labels.length === 0) {
        setImportCounts((prev) => ({ ...prev, [levelId]: EMPTY_IMPORT_COUNT }));
        setImportLevelLoading((prev) => ({ ...prev, [levelId]: false }));
        return;
      }
      const mySeq = (importSeqRef.current[levelId] || 0) + 1;
      importSeqRef.current[levelId] = mySeq;
      setImportLevelLoading((prev) => ({ ...prev, [levelId]: true }));
      let record = EMPTY_IMPORT_COUNT;
      try {
        const result = await invoke('countLabelPages', {
          labels,
          levelId,
          spaceKey,
        });
        if (result.success) record = result;
      } catch (_) {}
      if (importSeqRef.current[levelId] !== mySeq) return;
      setImportCounts((prev) => ({ ...prev, [levelId]: record }));
      setImportLevelLoading((prev) => ({ ...prev, [levelId]: false }));
    }, 600);
  };

  useEffect(() => {
    if (
      config &&
      !labelsLoading &&
      availableLabels.length >= 0 &&
      !importInitialized
    ) {
      const defaults = getDefaultImportLabels(availableLabels);
      setImportLabels(defaults);
      setImportInitialized(true);
      if (Object.keys(defaults).length > 0) {
        refreshImportCounts(defaults);
      }
    }
  }, [
    config,
    importInitialized,
    labelsLoading,
    availableLabels,
    getDefaultImportLabels,
    refreshImportCounts,
  ]);

  return {
    importStep,
    setImportStep,
    importLabels,
    setImportLabels,
    importCounts,
    setImportCounts,
    importCountLoading,
    importLevelLoading,
    importRemoveLabels,
    setImportRemoveLabels,
    importScopeAll,
    setImportScopeAll,
    importSpaceKeys,
    setImportSpaceKeys,
    availableSpaces,
    availableLabels,
    labelsLoading,
    importProgress,
    setImportProgress,
    importSettling,
    setImportSettling,
    importScopeAllRef,
    importSpaceKeysRef,
    getImportSpaceKey,
    getDefaultImportLabels,
    refreshImportCounts,
    settleImportCounts,
    onScopeChange,
    refreshLevelCount,
  };
}
