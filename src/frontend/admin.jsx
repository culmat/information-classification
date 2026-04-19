/**
 * Admin configuration page — accessible via Confluence Settings → Information Classification.
 *
 * Four tabs:
 * 1. Levels — manage classification levels (add, edit, delete, reorder)
 * 2. Contacts — manage contact persons (user, email, free text)
 * 3. Links — manage reference links
 * 4. Audit — view statistics and recent classification changes
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Tabs,
  Tab,
  TabList,
  TabPanel,
  DynamicTable,
  Select,
  ModalTransition,
  Label,
  User,
  Badge,
  Link,
  EmptyState,
  Tag,
  TagGroup,
  xcss,
} from '@forge/react';
import { invoke, showFlag } from '@forge/bridge';
import {
  colorToLozenge,
  isValidLabel,
  normalizeColor,
} from '../shared/constants';
import { SUPPORTED_LANGUAGES } from '../shared/defaults';
import { localize, interpolate } from '../shared/i18n';

// Braille dots rendered as text so the activity indicator doesn't cause
// layout shift (unlike a Spinner component). Same pattern as the byline.
const ACTIVITY_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

import StatisticsPanel from './StatisticsPanel';
import AboutPanel from './AboutPanel';
import LevelModal from './admin/LevelModal';
import ContactModal from './admin/ContactModal';
import LinkModal from './admin/LinkModal';
import LabelImportTab from './admin/LabelImportTab';
import LabelExportTab from './admin/LabelExportTab';

/**
 * Generates a simple unique ID for new items.
 */
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

const containerStyle = xcss({ padding: 'space.400', maxWidth: '960px' });
/* TabPanel renders no top padding — add it manually (same workaround as byline.jsx). */
const tabPanelStyle = xcss({ paddingTop: 'space.100' });

// Default / empty record used when no labels are selected or the space
// filter is empty. Keeping the record shape consistent simplifies the
// render code — it doesn't have to branch on `undefined`.
const EMPTY_IMPORT_COUNT = {
  labelled: 0,
  alreadyClassified: 0,
  toClassify: 0,
  cql: { labelled: '', alreadyClassified: '', toClassify: '' },
};

const EMPTY_EXPORT_COUNT = {
  classified: 0,
  alreadyLabelled: 0,
  toLabel: 0,
  cql: { classified: '', alreadyLabelled: '', toLabel: '' },
};

const App = () => {
  const context = useProductContext();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState(null);
  const [savedConfig, setSavedConfig] = useState(null);
  const [auditData, setAuditData] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [showUnclassified, setShowUnclassified] = useState(true); // coverage toggle
  const [activeTab, setActiveTab] = useState(0);
  const [message, setMessage] = useState(null);
  const isDirty =
    config &&
    savedConfig &&
    JSON.stringify(config) !== JSON.stringify(savedConfig);

  // Editing state for level modal
  const [editingLevel, setEditingLevel] = useState(null);
  const [showLevelModal, setShowLevelModal] = useState(false);

  // Label import wizard state
  const [importStep, setImportStep] = useState('idle'); // idle | running | done
  const [importLabels, setImportLabels] = useState({}); // { levelId: [{ label, value }] }
  const [importCounts, setImportCounts] = useState({}); // { levelId: number }
  const [importCountLoading, setImportCountLoading] = useState(false);
  const [importLevelLoading, setImportLevelLoading] = useState({}); // { levelId: boolean }
  const [importRemoveLabels, setImportRemoveLabels] = useState(true);
  const [importScopeAll, setImportScopeAll] = useState(true);
  const [importSpaceKeys, setImportSpaceKeys] = useState([]); // [{ label, value }]
  const [availableSpaces, setAvailableSpaces] = useState([]); // [{ label, value }]
  const [availableLabels, setAvailableLabels] = useState([]); // [{ label, value }]
  const [labelsLoading, setLabelsLoading] = useState(false);
  const [importProgress, setImportProgress] = useState(null); // { classified, failed, total, done }

  // Label export state
  const [exportMappings, setExportMappings] = useState({}); // { levelId: labelName }
  const [exportLoading, setExportLoading] = useState(false);
  const [exportProgress, setExportProgress] = useState(null); // { classified, failed, total, done }
  const [exportScopeAll, setExportScopeAll] = useState(true);
  const [exportSpaceKeys, setExportSpaceKeys] = useState([]); // [{ label, value }]
  const [exportCounts, setExportCounts] = useState({}); // { levelId: number }
  const [exportCountLoading, setExportCountLoading] = useState(false);
  const [exportLevelLoading, setExportLevelLoading] = useState({}); // { levelId: boolean }

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { levelId, levelName, pageCount, reclassifyTo }
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Editing state for contact modal
  const [editingContact, setEditingContact] = useState(null);
  const [showContactModal, setShowContactModal] = useState(false);

  // Editing state for link modal
  const [editingLink, setEditingLink] = useState(null);
  const [showLinkModal, setShowLinkModal] = useState(false);

  // Memoised: StatisticsPanel subscribes to changes of this callback's
  // identity (useEffect dep). When admin re-renders frequently (e.g. under
  // the 120 ms activity-indicator tick during a label-sync job), an
  // unmemoised function identity would tear down and rebuild the realtime
  // subscription 8×/sec — a measurable gateway-call flood.
  const refreshAuditData = useCallback(async () => {
    setAuditLoading(true);
    try {
      const auditResult = await invoke('getAuditData');
      if (auditResult.success) setAuditData(auditResult);
    } catch (error) {
      console.error('Failed to load audit data:', error);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  // Load config and audit data on mount — separate calls so config
  // still loads even if audit (SQL-dependent) fails
  useEffect(() => {
    (async () => {
      try {
        const configResult = await invoke('getConfig');
        if (configResult.success) {
          setConfig(configResult.config);
          setSavedConfig(configResult.config);
        }
      } catch (error) {
        console.error('Failed to load config:', error);
        setMessage({ type: 'error', text: t('admin.save_error') });
      }

      await refreshAuditData();

      setLoading(false);
    })();
  }, [t, refreshAuditData]);

  // Save configuration
  const handleSave = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await invoke('setConfig', { config });
      if (result.success) {
        setSavedConfig(config);
        setMessage(null);
        showFlag({
          id: 'config-saved',
          title: t('admin.save_success'),
          type: 'success',
          isAutoDismiss: true,
        });
      } else {
        setMessage({
          type: 'error',
          text: result.error || t('admin.save_error'),
        });
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      setMessage({ type: 'error', text: t('admin.save_error') });
    } finally {
      setSaving(false);
    }
  }, [config, t]);

  // --- Level operations ---
  const addLevel = () => {
    setEditingLevel({
      id: '',
      name: { en: '' },
      color: 'grey',
      description: { en: '' },
      // New levels are appended at the end; array position is the order
      allowed: true,
      requiresProtection: false,
      errorMessage: { en: '' },
    });
    setShowLevelModal(true);
  };

  const editLevel = (level) => {
    setEditingLevel({ ...level });
    setShowLevelModal(true);
  };

  const saveLevel = (level) => {
    const levels = [...(config?.levels || [])];
    const existingIndex = levels.findIndex((l) => l.id === level.id);
    if (existingIndex >= 0) {
      levels[existingIndex] = level;
    } else {
      // New level — generate ID from name if not set
      if (!level.id) {
        level.id = level.name.en.toLowerCase().replace(/[^a-z0-9]/g, '-');
      }
      levels.push(level);
    }
    setConfig({ ...config, levels });
    setShowLevelModal(false);
  };

  const deleteLevel = async (levelId) => {
    const level = (config?.levels || []).find((l) => l.id === levelId);
    const levelName = level ? localize(level.name, 'en') : levelId;

    // Check if any pages use this level
    try {
      const result = await invoke('countLevelUsage', { levelId });
      if (result.success && result.count > 0) {
        setDeleteConfirm({
          levelId,
          levelName,
          pageCount: result.count,
          reclassifyTo: null,
        });
        return;
      }
    } catch (_) {
      /* CQL failed — allow delete without warning */
    }

    // No pages use this level — delete immediately
    removeLevelFromConfig(levelId);
  };

  // Label import wizard actions
  // Generate default label selections from level ID + all translations,
  // filtered to only include labels that actually exist in the instance.
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

  // Initialize import labels and auto-load counts on first render
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

  // Use refs for scope so debounced callbacks always read latest values
  const importScopeAllRef = useRef(importScopeAll);
  const importSpaceKeysRef = useRef(importSpaceKeys);
  importScopeAllRef.current = importScopeAll;
  importSpaceKeysRef.current = importSpaceKeys;

  // Returns null for "all", comma-separated keys for "space", or '' if space mode but no keys selected
  const getImportSpaceKey = useCallback(() => {
    if (importScopeAllRef.current) return null;
    const keys = (importSpaceKeysRef.current || [])
      .map((o) => o.value)
      .filter(Boolean);
    return keys.length > 0 ? keys.join(',') : '';
  }, []);

  const refreshImportCounts = useCallback(
    async (labelsOverride) => {
      setImportCountLoading(true);
      const allowedLevels = (config?.levels || []).filter((l) => l.allowed);
      const allLevelIds = allowedLevels.map((l) => l.id);
      setImportLevelLoading(
        Object.fromEntries(allLevelIds.map((id) => [id, true])),
      );
      const spaceKey = getImportSpaceKey();

      // Space mode but no valid keys entered — show zero record for all levels
      if (spaceKey === '') {
        const zero = Object.fromEntries(
          allLevelIds.map((id) => [id, EMPTY_IMPORT_COUNT]),
        );
        setImportCounts(zero);
        setImportCountLoading(false);
        setImportLevelLoading({});
        return zero;
      }
      // Bump per-level sequence numbers before the bulk invoke so any
      // in-flight per-level call (from a Select change while the bulk is
      // still running) won't land on top of the bulk result. Mirrors the
      // export-side guard around `exportSeqRef`.
      const seqs = {};
      for (const id of allLevelIds) {
        seqs[id] = (importSeqRef.current[id] || 0) + 1;
        importSeqRef.current[id] = seqs[id];
      }
      const counts = { ...importCounts };
      const source = labelsOverride || importLabels;
      // One resolver call per level: server returns {labelled, alreadyClassified,
      // toClassify, cql{...}} so the frontend can render three linked counts.
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

  // Post-sync refresh loop for import. Classification property updates also
  // lag behind CQL searches, so the same settle pattern applies.
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

  // Auto-refresh on scope change (no debounce needed — Select gives us clean values)
  const onScopeChange = () => {
    // Use setTimeout(0) to let state update propagate to refs
    setTimeout(() => refreshImportCounts(), 50);
  };

  // Per-level auto-refresh with debounce + sequence guard. Mirrors the
  // export Textfield pattern — if the admin rapid-fires Select changes,
  // older responses can otherwise land after newer ones and overwrite the
  // row's counts. Every invoke bumps `importSeqRef.current[levelId]` and
  // checks it on return; stale responses drop on the floor.
  const importDebounceRef = useRef({});
  const importSeqRef = useRef({});
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
      if (importSeqRef.current[levelId] !== mySeq) return; // stale — newer invoke pending
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

  // Client-driven label sync: refs for the loop to read stop requests and
  // for the activity-indicator tick. Refs (not state) so the loop sees
  // updates without waiting for a React render.
  const importStopRef = useRef(false);
  const exportStopRef = useRef(false);
  const [labelActivityFrame, setLabelActivityFrame] = useState(0);

  // After a sync completes, Confluence's CQL label index lags the actual
  // label writes by a minute or two. Without this, the admin would see
  // "Already Labelled" stuck at a low number and the Start button would
  // re-enable on a stale "To Label > 0" signal. While settling, we poll
  // counts every few seconds until they stop changing; the Start button
  // stays disabled for that whole window.
  const [importSettling, setImportSettling] = useState(false);
  const [exportSettling, setExportSettling] = useState(false);

  // Paused label-sync jobs owned by this user — populated on mount from
  // `getUserPendingLabelJobs`. When the browser tab refreshes or navigates
  // away mid-job, the client loop stops but the KVS state survives; the
  // admin can resume (loop continues from the next unconsumed chunk) or
  // discard (cancelLabelJob deletes state). One entry per flow max in
  // practice (import + export are separate buttons) but we keep an array
  // so the data model matches the recursive-classify pattern.
  const [pendingLabelJobs, setPendingLabelJobs] = useState([]);
  const loadPendingLabelJobs = useCallback(async () => {
    try {
      const result = await invoke('getUserPendingLabelJobs');
      if (result?.success) setPendingLabelJobs(result.jobs || []);
    } catch (err) {
      console.error('getUserPendingLabelJobs failed:', err);
    }
  }, []);
  useEffect(() => {
    loadPendingLabelJobs();
  }, [loadPendingLabelJobs]);

  // Cycle the activity indicator while either flow is running.
  useEffect(() => {
    if (importStep !== 'running' && !exportLoading) return;
    const id = setInterval(() => {
      setLabelActivityFrame((f) => (f + 1) % ACTIVITY_FRAMES.length);
    }, 120);
    return () => clearInterval(id);
  }, [importStep, exportLoading]);

  // Drives one label-sync job — shared by startImport and startExport.
  // Stop (user clicks the button) → cancelLabelJob, close with a "stopped"
  // flag. Pause (tab close / navigate away) is implicit: the KVS state
  // survives and the paused-jobs banner on next open can resume it.
  const runLabelJobLoop = async ({
    jobId,
    kind, // 'import' | 'export'
    stopRef,
    setProgress,
    setRunning,
    startedAt,
    sessionClassifiedStart,
    onDone,
  }) => {
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
        if (batch.cancelled) {
          finish({
            classified: batch.classified,
            failed: batch.failed,
            skipped: batch.skipped,
            status: 'stopped',
          });
        } else if (batch.aborted) {
          finish({
            classified: batch.classified,
            failed: batch.failed,
            skipped: batch.skipped,
            status: 'aborted',
          });
        } else {
          finish({
            classified: batch.classified,
            failed: batch.failed,
            skipped: batch.skipped,
            status: 'completed',
          });
        }
        return;
      }
    }
  };

  // Export page count helpers (mirrors import count pattern)
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

    // Bump the per-level sequence before each invoke so any in-flight
    // per-level call issued from the Textfield won't land on top of the
    // bulk-refresh result (or vice versa).
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

  // Post-sync refresh loop: CQL's label index lags actual writes by up to a
  // minute, so we poll until counts stop moving (or we hit the time budget).
  // Compares only the fields that can change from label writes (toLabel /
  // alreadyLabelled); `classified` shouldn't change so it's not a stability
  // signal. While this runs, `exportSettling` keeps the Start button
  // disabled so the admin can't kick off a redundant no-op job.
  const SETTLE_MAX_POLLS = 12; // ~36s ceiling
  const SETTLE_STABLE_POLLS = 2; // two matching polls ⇒ settled
  const SETTLE_INTERVAL_MS = 3000;
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

  // Debounced per-level refresh when the user edits the target label name.
  // Sequence guard: if the user types faster than the server answers, older
  // invokes can resolve after newer ones. We tag every invoke with a per-level
  // sequence number and drop the response if a newer invoke has been issued
  // since — otherwise a stale "blank label → toLabel=0" reply would overwrite
  // the correct counts for the label currently in the field.
  const exportDebounceRef = useRef({});
  const exportSeqRef = useRef({});
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
      if (exportSeqRef.current[levelId] !== mySeq) return; // stale — newer invoke pending
      setExportCounts((prev) => ({ ...prev, [levelId]: record }));
      setExportLevelLoading((prev) => ({ ...prev, [levelId]: false }));
    }, 600);
  };

  // Auto-refresh export counts when config loads
  const [exportCountsInitialized, setExportCountsInitialized] = useState(false);
  useEffect(() => {
    if (config && !exportCountsInitialized) {
      setExportCountsInitialized(true);
      refreshExportCounts();
    }
  }, [config, exportCountsInitialized, refreshExportCounts]);

  // Resume a paused label-sync job: re-attach the client loop to the same
  // jobId. No call to startLabel(Import|Export) — the job header already
  // has mappings, chunk chain, and counters; the loop simply continues
  // from `nextChunkIdx`. Session-based ETA restarts from the resume moment
  // so the time estimate reflects NEW throughput, not stale original.
  const resumeLabelJob = (job) => {
    setPendingLabelJobs((prev) => prev.filter((j) => j.jobId !== job.jobId));
    const now = Date.now();
    const total = job.totalEstimate || 0;
    const startedClassified = job.classified || 0;
    if (job.jobKind === 'label-import') {
      importStopRef.current = false;
      setImportStep('running');
      setImportProgress({
        classified: startedClassified,
        failed: job.failed || 0,
        skipped: job.skipped || 0,
        total,
        done: false,
        startedAt: job.startedAt || now,
        sessionStartedAt: now,
        sessionClassifiedStart: startedClassified,
        mappings: job.mappings || [],
      });
      runLabelJobLoop({
        jobId: job.jobId,
        kind: 'import',
        stopRef: importStopRef,
        setProgress: setImportProgress,
        setRunning: () => {},
        startedAt: now,
        sessionClassifiedStart: startedClassified,
        onDone: (status) => {
          setImportStep('done');
          refreshImportCounts();
          if (status === 'completed') settleImportCounts();
        },
      });
    } else {
      exportStopRef.current = false;
      setExportLoading(true);
      setExportProgress({
        classified: startedClassified,
        failed: job.failed || 0,
        skipped: job.skipped || 0,
        total,
        done: false,
        startedAt: job.startedAt || now,
        sessionStartedAt: now,
        sessionClassifiedStart: startedClassified,
        mappings: job.mappings || [],
      });
      runLabelJobLoop({
        jobId: job.jobId,
        kind: 'export',
        stopRef: exportStopRef,
        setProgress: setExportProgress,
        setRunning: setExportLoading,
        startedAt: now,
        sessionClassifiedStart: startedClassified,
        onDone: (status) => {
          refreshExportCounts();
          if (status === 'completed') settleExportCounts();
        },
      });
    }
  };

  const discardLabelJob = async (job) => {
    setPendingLabelJobs((prev) => prev.filter((j) => j.jobId !== job.jobId));
    try {
      await invoke('cancelLabelJob', { jobId: job.jobId });
    } catch (err) {
      console.error('cancelLabelJob failed:', err);
    }
    // Refresh counts so the stale "X to label" drops back to the true gap.
    if (job.jobKind === 'label-import') refreshImportCounts();
    else refreshExportCounts();
  };

  const startImport = async () => {
    const mappings = (config?.levels || [])
      .filter((l) => l.allowed)
      .map((level) => ({
        levelId: level.id,
        labels: (importLabels[level.id] || [])
          .map((o) => o.value)
          .filter(Boolean),
      }))
      .filter((m) => m.labels.length > 0);

    if (mappings.length === 0) return;

    importStopRef.current = false;
    const startedAt = Date.now();
    setImportStep('running');
    setImportProgress({
      classified: 0,
      failed: 0,
      total: 0,
      done: false,
      startedAt,
      sessionStartedAt: startedAt,
      sessionClassifiedStart: 0,
      mappings,
    });
    try {
      const spaceKey = getImportSpaceKey() || null;
      const result = await invoke('startLabelImport', {
        mappings,
        removeLabels: importRemoveLabels,
        spaceKey,
      });
      if (!result || !result.success) {
        console.error('startLabelImport failed:', result);
        setImportStep('idle');
        setImportProgress(null);
        return;
      }
      if (result.count === 0) {
        // No work to do — server short-circuited.
        setImportStep('done');
        setImportProgress({
          classified: 0,
          failed: 0,
          total: 0,
          done: true,
          startedAt,
        });
        return;
      }
      setImportProgress((prev) => ({
        ...prev,
        total: result.totalEstimate || 0,
      }));
      runLabelJobLoop({
        jobId: result.jobId,
        kind: 'import',
        stopRef: importStopRef,
        setProgress: setImportProgress,
        setRunning: () => {},
        startedAt,
        sessionClassifiedStart: 0,
        onDone: (status) => {
          setImportStep('done');
          // Fresh snapshot immediately, then poll until CQL index catches
          // up (see settleImportCounts). Only run the loop on a clean
          // completion — stop/error paths don't need it.
          refreshImportCounts();
          if (status === 'completed') settleImportCounts();
        },
      });
    } catch (error) {
      console.error('Import failed:', error);
      setImportStep('idle');
      setImportProgress(null);
    }
  };

  const startExport = async () => {
    const mappings = (config?.levels || [])
      .map((level) => ({
        levelId: level.id,
        labelName: (exportMappings[level.id] !== undefined
          ? exportMappings[level.id]
          : level.id
        ).trim(),
      }))
      .filter((m) => m.labelName.length > 0 && isValidLabel(m.labelName));
    if (mappings.length === 0) return;

    exportStopRef.current = false;
    const startedAt = Date.now();
    setExportLoading(true);
    setExportProgress({
      classified: 0,
      failed: 0,
      total: 0,
      done: false,
      startedAt,
      sessionStartedAt: startedAt,
      sessionClassifiedStart: 0,
      mappings,
    });
    try {
      const exportKeys = exportScopeAll
        ? null
        : (exportSpaceKeys || []).map((o) => o.value).join(',') || null;
      const result = await invoke('startLabelExport', {
        mappings,
        spaceKey: exportKeys,
      });
      if (!result || !result.success) {
        console.error('startLabelExport failed:', result);
        setExportProgress(null);
        setExportLoading(false);
        return;
      }
      if (result.count === 0) {
        setExportProgress({
          classified: 0,
          failed: 0,
          total: 0,
          done: true,
          startedAt,
        });
        setExportLoading(false);
        return;
      }
      setExportProgress((prev) => ({
        ...prev,
        total: result.totalEstimate || 0,
      }));
      runLabelJobLoop({
        jobId: result.jobId,
        kind: 'export',
        stopRef: exportStopRef,
        setProgress: setExportProgress,
        setRunning: setExportLoading,
        startedAt,
        sessionClassifiedStart: 0,
        onDone: (status) => {
          // Fresh snapshot immediately, then poll until the label index
          // catches up (see settleExportCounts) — otherwise the button
          // would re-enable on a stale "To Label > 0" count for pages we
          // just labelled but Confluence hasn't indexed yet.
          refreshExportCounts();
          if (status === 'completed') settleExportCounts();
        },
      });
    } catch (error) {
      console.error('Export failed:', error);
      setExportProgress(null);
      setExportLoading(false);
    }
  };

  const removeLevelFromConfig = (levelId) => {
    const levels = (config?.levels || []).filter((l) => l.id !== levelId);
    const updated = { ...config, levels };
    if (config.defaultLevelId === levelId) {
      const firstAllowed = levels.find((l) => l.allowed);
      updated.defaultLevelId = firstAllowed?.id || levels[0]?.id;
    }
    setConfig(updated);
    setDeleteConfirm(null);
  };

  const handleReclassifyAndDelete = async () => {
    if (!deleteConfirm?.reclassifyTo) return;
    setDeleteLoading(true);
    try {
      await invoke('reclassifyLevel', {
        fromLevelId: deleteConfirm.levelId,
        toLevelId: deleteConfirm.reclassifyTo,
      });
      removeLevelFromConfig(deleteConfirm.levelId);
      showFlag({
        id: 'reclassify-started',
        title: t('admin.levels.delete_reclassifying'),
        type: 'info',
        isAutoDismiss: true,
      });
    } catch (error) {
      console.error('Failed to reclassify:', error);
    } finally {
      setDeleteLoading(false);
    }
  };

  const moveLevel = (levelId, direction) => {
    // Use functional update to avoid stale closure issues on rapid clicks.
    // Array position IS the order — no sortOrder field needed.
    setConfig((prev) => {
      const levels = [...(prev?.levels || [])];
      const index = levels.findIndex((l) => l.id === levelId);
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= levels.length) return prev;
      // Splice out and insert at new position
      const [moved] = levels.splice(index, 1);
      levels.splice(newIndex, 0, moved);
      return { ...prev, levels };
    });
  };

  // --- Contact operations ---
  const addContact = () => {
    setEditingContact({
      id: generateId(),
      type: 'email',
      value: '',
      role: { en: '' },
      levelIds: [],
    });
    setShowContactModal(true);
  };

  const editContact = (contact) => {
    setEditingContact({ ...contact });
    setShowContactModal(true);
  };

  const saveContact = (contact) => {
    const contacts = [...(config?.contacts || [])];
    const existingIndex = contacts.findIndex((c) => c.id === contact.id);
    if (existingIndex >= 0) {
      contacts[existingIndex] = contact;
    } else {
      contacts.push(contact);
    }
    setConfig({ ...config, contacts });
    setShowContactModal(false);
  };

  const deleteContact = (contactId) => {
    const contacts = (config?.contacts || []).filter((c) => c.id !== contactId);
    setConfig({ ...config, contacts });
  };

  // --- Link operations ---
  const addLink = () => {
    setEditingLink({
      id: generateId(),
      type: 'external',
      url: '',
      label: { en: '' },
      levelIds: [],
    });
    setShowLinkModal(true);
  };

  const editLink = (link) => {
    setEditingLink({ ...link });
    setShowLinkModal(true);
  };

  const saveLink = (link) => {
    const links = [...(config?.links || [])];
    const existingIndex = links.findIndex((l) => l.id === link.id);
    if (existingIndex >= 0) {
      links[existingIndex] = link;
    } else {
      links.push(link);
    }
    setConfig({ ...config, links });
    setShowLinkModal(false);
  };

  const deleteLink = (linkId) => {
    const links = (config?.links || []).filter((l) => l.id !== linkId);
    setConfig({ ...config, links });
  };

  // License check: only enforce in production where Marketplace injects license info.
  const licensed =
    context?.environmentType !== 'PRODUCTION' ||
    context?.license?.active === true;

  if (loading) {
    return (
      <Box xcss={containerStyle}>
        <Spinner size="large" />
      </Box>
    );
  }

  if (!licensed) {
    return (
      <Box xcss={containerStyle}>
        <SectionMessage
          appearance="warning"
          title={t('license.inactive_title')}
        >
          <Text>{t('license.inactive_message')}</Text>
        </SectionMessage>
      </Box>
    );
  }

  // --- Table data ---
  // Use numeric keys to prevent DynamicTable from re-sorting rows alphabetically
  const levelRows = (config?.levels || []).map((level, index) => ({
    key: `level-${index}`,
    cells: [
      {
        key: 'color',
        content: (
          <Lozenge isBold appearance={colorToLozenge(level.color)}>
            {localize(level.name, 'en')}
          </Lozenge>
        ),
      },
      {
        key: 'allowed',
        content: level.allowed ? (
          <Badge appearance="added">Yes</Badge>
        ) : (
          <Badge appearance="removed">No</Badge>
        ),
      },
      {
        key: 'protection',
        content: level.requiresProtection ? (
          <Badge>Yes</Badge>
        ) : (
          <Text>No</Text>
        ),
      },
      {
        key: 'actions',
        content: (
          <ButtonGroup>
            <Button
              appearance="subtle"
              onClick={() => moveLevel(level.id, -1)}
              isDisabled={index === 0}
            >
              {t('admin.levels.move_up')}
            </Button>
            <Button
              appearance="subtle"
              onClick={() => moveLevel(level.id, 1)}
              isDisabled={index === config.levels.length - 1}
            >
              {t('admin.levels.move_down')}
            </Button>
            <Button
              testId={`admin-level-edit-${level.id}`}
              appearance="subtle"
              onClick={() => editLevel(level)}
            >
              {t('admin.levels.edit_button')}
            </Button>
            <Button
              testId={`admin-level-delete-${level.id}`}
              appearance="danger"
              onClick={() => deleteLevel(level.id)}
            >
              {t('admin.levels.delete_button')}
            </Button>
          </ButtonGroup>
        ),
      },
    ],
  }));

  const contactRows = (config?.contacts || []).map((contact) => ({
    key: contact.id,
    cells: [
      {
        key: 'type',
        content: <Text>{t(`admin.contacts.type_${contact.type}`)}</Text>,
      },
      {
        key: 'value',
        content:
          contact.type === 'user' ? (
            <User accountId={contact.value} />
          ) : (
            <Text>{contact.value}</Text>
          ),
      },
      { key: 'role', content: <Text>{localize(contact.role, 'en')}</Text> },
      {
        key: 'applies',
        content:
          contact.levelIds?.length > 0 ? (
            <TagGroup>
              {contact.levelIds.map((id) => {
                const level = (config?.levels || []).find((l) => l.id === id);
                return (
                  <Tag
                    key={id}
                    text={level ? localize(level.name, 'en') : id}
                    color={level ? normalizeColor(level.color) : 'standard'}
                  />
                );
              })}
            </TagGroup>
          ) : (
            <Tag text={t('admin.contacts.applies_to_all')} color="standard" />
          ),
      },
      {
        key: 'actions',
        content: (
          <ButtonGroup>
            <Button
              testId={`admin-contact-edit-${contact.id}`}
              appearance="subtle"
              onClick={() => editContact(contact)}
            >
              {t('admin.levels.edit_button')}
            </Button>
            <Button
              testId={`admin-contact-delete-${contact.id}`}
              appearance="danger"
              onClick={() => deleteContact(contact.id)}
            >
              {t('admin.levels.delete_button')}
            </Button>
          </ButtonGroup>
        ),
      },
    ],
  }));

  const linkRows = (config?.links || []).map((link) => ({
    key: link.id,
    cells: [
      {
        key: 'type',
        content: (
          <Text>{t(`admin.links.type_${link.type || 'external'}`)}</Text>
        ),
      },
      { key: 'label', content: <Text>{localize(link.label, 'en')}</Text> },
      {
        key: 'url',
        content: (
          <Link href={link.url} openNewTab>
            {link.url}
          </Link>
        ),
      },
      {
        key: 'applies',
        content:
          link.levelIds?.length > 0 ? (
            <TagGroup>
              {link.levelIds.map((id) => {
                const level = (config?.levels || []).find((l) => l.id === id);
                return (
                  <Tag
                    key={id}
                    text={level ? localize(level.name, 'en') : id}
                    color={level ? normalizeColor(level.color) : 'standard'}
                  />
                );
              })}
            </TagGroup>
          ) : (
            <Tag text={t('admin.links.applies_to_all')} color="standard" />
          ),
      },
      {
        key: 'actions',
        content: (
          <ButtonGroup>
            <Button
              testId={`admin-link-edit-${link.id}`}
              appearance="subtle"
              onClick={() => editLink(link)}
            >
              {t('admin.levels.edit_button')}
            </Button>
            <Button
              testId={`admin-link-delete-${link.id}`}
              appearance="danger"
              onClick={() => deleteLink(link.id)}
            >
              {t('admin.levels.delete_button')}
            </Button>
          </ButtonGroup>
        ),
      },
    ],
  }));

  return (
    <Box xcss={containerStyle}>
      <Stack space="space.300">
        <Tabs id="admin-tabs" onChange={(index) => setActiveTab(index)}>
          <TabList>
            <Tab>{t('admin.tabs.statistics')}</Tab>
            <Tab>{t('admin.tabs.levels')}</Tab>
            <Tab>{t('admin.tabs.contacts')}</Tab>
            <Tab>{t('admin.tabs.links')}</Tab>
            <Tab>{t('admin.tabs.languages')}</Tab>
            <Tab>{t('admin.tabs.labels')}</Tab>
            <Tab>{t('admin.tabs.about')}</Tab>
          </TabList>

          {/* Statistics Tab — visuals come from shared StatisticsPanel;
              keep props in sync with spaceSettings.jsx and statsMacro.jsx */}
          <TabPanel>
            <StatisticsPanel
              data={auditData}
              levels={config?.levels}
              defaultLevelId={config?.defaultLevelId}
              showUnclassified={showUnclassified}
              onToggleUnclassified={() =>
                setShowUnclassified(!showUnclassified)
              }
              isLoading={auditLoading}
              onRefresh={refreshAuditData}
              spaceFilter=""
              showSpaceColumn
              t={t}
            />
          </TabPanel>

          {/* Levels Tab */}
          <TabPanel>
            <Box xcss={tabPanelStyle}>
              <Stack space="space.200">
                <Inline
                  space="space.200"
                  alignBlock="center"
                  spread="space-between"
                >
                  <Heading size="medium">{t('admin.levels.title')}</Heading>
                  <Button
                    testId="admin-level-add"
                    appearance="primary"
                    onClick={addLevel}
                  >
                    {t('admin.levels.add_button')}
                  </Button>
                </Inline>

                <DynamicTable
                  head={{
                    cells: [
                      { key: 'color', content: t('admin.levels.name') },
                      { key: 'allowed', content: t('admin.levels.allowed') },
                      {
                        key: 'protection',
                        content: t('admin.levels.requires_protection'),
                      },
                      { key: 'actions', content: '' },
                    ],
                  }}
                  rows={levelRows}
                  emptyView={<EmptyState header={t('admin.levels.empty')} />}
                />

                {/* Default level selector */}
                <Inline space="space.100" alignBlock="center">
                  <Label labelFor="default-level">
                    {t('admin.levels.default_level')}
                  </Label>
                  <Select
                    inputId="default-level"
                    value={config?.levels
                      ?.filter((l) => l.id === config.defaultLevelId)
                      .map((l) => ({
                        label: localize(l.name, 'en'),
                        value: l.id,
                      }))}
                    options={(config?.levels || [])
                      .filter((l) => l.allowed)
                      .map((l) => ({
                        label: localize(l.name, 'en'),
                        value: l.id,
                      }))}
                    onChange={(option) =>
                      setConfig({ ...config, defaultLevelId: option.value })
                    }
                  />
                </Inline>
              </Stack>
            </Box>
          </TabPanel>

          {/* Contacts Tab */}
          <TabPanel>
            <Box xcss={tabPanelStyle}>
              <Stack space="space.200">
                <Inline
                  space="space.200"
                  alignBlock="center"
                  spread="space-between"
                >
                  <Heading size="medium">{t('admin.contacts.title')}</Heading>
                  <Button
                    testId="admin-contact-add"
                    appearance="primary"
                    onClick={addContact}
                  >
                    {t('admin.contacts.add_button')}
                  </Button>
                </Inline>

                <DynamicTable
                  head={{
                    cells: [
                      { key: 'type', content: t('admin.contacts.type') },
                      { key: 'value', content: t('admin.contacts.value') },
                      { key: 'role', content: t('admin.contacts.role') },
                      {
                        key: 'applies',
                        content: t('admin.contacts.applies_to'),
                      },
                      { key: 'actions', content: '' },
                    ],
                  }}
                  rows={contactRows}
                  emptyView={<EmptyState header={t('byline.no_contacts')} />}
                />
              </Stack>
            </Box>
          </TabPanel>

          {/* Links Tab */}
          <TabPanel>
            <Box xcss={tabPanelStyle}>
              <Stack space="space.200">
                <Inline
                  space="space.200"
                  alignBlock="center"
                  spread="space-between"
                >
                  <Heading size="medium">{t('admin.links.title')}</Heading>
                  <Button
                    testId="admin-link-add"
                    appearance="primary"
                    onClick={addLink}
                  >
                    {t('admin.links.add_button')}
                  </Button>
                </Inline>

                <DynamicTable
                  head={{
                    cells: [
                      { key: 'type', content: t('admin.links.type') },
                      { key: 'label', content: t('admin.links.label') },
                      { key: 'url', content: t('admin.links.url') },
                      { key: 'applies', content: t('admin.links.applies_to') },
                      { key: 'actions', content: '' },
                    ],
                  }}
                  rows={linkRows}
                  emptyView={<EmptyState header={t('byline.no_links')} />}
                />
              </Stack>
            </Box>
          </TabPanel>

          {/* Languages Tab */}
          <TabPanel>
            <Box xcss={tabPanelStyle}>
              <Stack space="space.200">
                <Heading size="medium">{t('admin.languages.title')}</Heading>
                <Text>{t('admin.languages.description')}</Text>

                {/* English is always first and cannot be removed */}
                <Inline space="space.100" alignBlock="center">
                  <Lozenge appearance="success" isBold>
                    {t('language_names.en')} (en)
                  </Lozenge>
                  <Text>{t('admin.languages.english_required')}</Text>
                </Inline>

                {/* Additional languages */}
                {(() => {
                  const extraLangs = (config?.languages || []).filter(
                    (l) => l.code !== 'en',
                  );
                  return extraLangs.length > 0 ? (
                    <DynamicTable
                      head={{
                        cells: [
                          {
                            key: 'code',
                            content: t('admin.languages.language'),
                          },
                          { key: 'actions', content: '' },
                        ],
                      }}
                      rows={extraLangs.map((lang, index) => ({
                        key: lang.code,
                        cells: [
                          {
                            key: 'code',
                            content: (
                              <Text>
                                {t(`language_names.${lang.code}`)} ({lang.code})
                              </Text>
                            ),
                          },
                          {
                            key: 'actions',
                            content: (
                              <ButtonGroup>
                                <Button
                                  appearance="subtle"
                                  onClick={() => {
                                    setConfig((prev) => {
                                      const langs = [
                                        ...(prev?.languages || []),
                                      ];
                                      const realIndex = index + 1;
                                      if (realIndex <= 1) return prev;
                                      const [moved] = langs.splice(
                                        realIndex,
                                        1,
                                      );
                                      langs.splice(realIndex - 1, 0, moved);
                                      return { ...prev, languages: langs };
                                    });
                                  }}
                                  isDisabled={index === 0}
                                >
                                  {t('admin.levels.move_up')}
                                </Button>
                                <Button
                                  appearance="subtle"
                                  onClick={() => {
                                    setConfig((prev) => {
                                      const langs = [
                                        ...(prev?.languages || []),
                                      ];
                                      const realIndex = index + 1;
                                      if (realIndex >= langs.length - 1)
                                        return prev;
                                      const [moved] = langs.splice(
                                        realIndex,
                                        1,
                                      );
                                      langs.splice(realIndex + 1, 0, moved);
                                      return { ...prev, languages: langs };
                                    });
                                  }}
                                  isDisabled={index === extraLangs.length - 1}
                                >
                                  {t('admin.levels.move_down')}
                                </Button>
                                <Button
                                  appearance="danger"
                                  onClick={() => {
                                    const langs = (
                                      config?.languages || []
                                    ).filter((l) => l.code !== lang.code);
                                    setConfig({ ...config, languages: langs });
                                  }}
                                >
                                  {t('admin.languages.remove_button')}
                                </Button>
                              </ButtonGroup>
                            ),
                          },
                        ],
                      }))}
                    />
                  ) : null;
                })()}

                {/* Add language dropdown */}
                <Inline space="space.100" alignBlock="center">
                  <Select
                    inputId="add-language"
                    placeholder={t('admin.languages.add_button')}
                    options={Object.entries(SUPPORTED_LANGUAGES)
                      .filter(
                        ([code]) =>
                          !(config?.languages || []).some(
                            (l) => l.code === code,
                          ),
                      )
                      .map(([code]) => ({
                        label: `${t(`language_names.${code}`)} (${code})`,
                        value: code,
                      }))}
                    onChange={(option) => {
                      if (!option) return;
                      const existing = (config?.languages || []).some(
                        (l) => l.code === option.value,
                      );
                      if (existing) return;
                      setConfig({
                        ...config,
                        languages: [
                          ...(config?.languages || []),
                          {
                            code: option.value,
                            label:
                              SUPPORTED_LANGUAGES[option.value] || option.value,
                          },
                        ],
                      });
                    }}
                    value={null}
                  />
                </Inline>
              </Stack>
            </Box>
          </TabPanel>

          {/* Labels Tab — Import & Export as sub-tabs */}
          <TabPanel>
            <Box xcss={tabPanelStyle}>
              <Tabs id="labels-subtabs">
                <TabList>
                  <Tab>{t('admin.import.title')}</Tab>
                  <Tab>{t('admin.export.title')}</Tab>
                </TabList>

                <TabPanel>
                  <LabelImportTab
                    t={t}
                    config={config}
                    pendingLabelJobs={pendingLabelJobs}
                    importStep={importStep}
                    importSettling={importSettling}
                    importCounts={importCounts}
                    importLabels={importLabels}
                    setImportLabels={setImportLabels}
                    importLevelLoading={importLevelLoading}
                    importCountLoading={importCountLoading}
                    labelsLoading={labelsLoading}
                    availableLabels={availableLabels}
                    importScopeAll={importScopeAll}
                    setImportScopeAll={setImportScopeAll}
                    availableSpaces={availableSpaces}
                    importSpaceKeys={importSpaceKeys}
                    setImportSpaceKeys={setImportSpaceKeys}
                    importSpaceKeysRef={importSpaceKeysRef}
                    importRemoveLabels={importRemoveLabels}
                    setImportRemoveLabels={setImportRemoveLabels}
                    exportLoading={exportLoading}
                    exportSettling={exportSettling}
                    importProgress={importProgress}
                    labelActivityFrame={labelActivityFrame}
                    importStopRef={importStopRef}
                    resumeLabelJob={resumeLabelJob}
                    discardLabelJob={discardLabelJob}
                    refreshImportCounts={refreshImportCounts}
                    refreshLevelCount={refreshLevelCount}
                    onScopeChange={onScopeChange}
                    startImport={startImport}
                  />
                </TabPanel>

                <TabPanel>
                  <LabelExportTab
                    t={t}
                    config={config}
                    pendingLabelJobs={pendingLabelJobs}
                    exportLoading={exportLoading}
                    exportSettling={exportSettling}
                    importSettling={importSettling}
                    exportCounts={exportCounts}
                    exportLevelLoading={exportLevelLoading}
                    exportCountLoading={exportCountLoading}
                    exportMappings={exportMappings}
                    setExportMappings={setExportMappings}
                    exportScopeAll={exportScopeAll}
                    setExportScopeAll={setExportScopeAll}
                    availableSpaces={availableSpaces}
                    exportSpaceKeys={exportSpaceKeys}
                    setExportSpaceKeys={setExportSpaceKeys}
                    exportSpaceKeysRef={exportSpaceKeysRef}
                    exportProgress={exportProgress}
                    labelActivityFrame={labelActivityFrame}
                    exportStopRef={exportStopRef}
                    resumeLabelJob={resumeLabelJob}
                    discardLabelJob={discardLabelJob}
                    refreshExportCounts={refreshExportCounts}
                    refreshExportLevelCount={refreshExportLevelCount}
                    startExport={startExport}
                  />
                </TabPanel>
              </Tabs>
            </Box>
          </TabPanel>

          {/* About Tab — version info, environment, support links, privacy. */}
          <TabPanel>
            <Box xcss={tabPanelStyle}>
              <AboutPanel />
            </Box>
          </TabPanel>
        </Tabs>

        {/* Save button and messages — hidden on read-only tabs (Statistics=0, Labels=5, About=6) */}
        {activeTab > 0 && activeTab < 5 && (
          <>
            {message && (
              <SectionMessage
                appearance={message.type === 'error' ? 'error' : 'confirmation'}
              >
                <Text>{message.text}</Text>
              </SectionMessage>
            )}

            <Button
              testId="admin-save"
              appearance="primary"
              onClick={handleSave}
              isLoading={saving}
              isDisabled={!isDirty}
            >
              {t('admin.save_button')}
            </Button>
          </>
        )}
      </Stack>

      {/* Level edit modal */}
      <ModalTransition>
        {showLevelModal && editingLevel && (
          <LevelModal
            level={editingLevel}
            languages={config?.languages || [{ code: 'en', label: 'English' }]}
            onSave={saveLevel}
            onClose={() => setShowLevelModal(false)}
            t={t}
          />
        )}
      </ModalTransition>

      {/* Delete level confirmation modal */}
      <ModalTransition>
        {deleteConfirm && (
          <Modal onClose={() => setDeleteConfirm(null)}>
            <ModalHeader>
              <ModalTitle>{t('admin.levels.delete_confirm_title')}</ModalTitle>
              <Button
                appearance="subtle"
                onClick={() => setDeleteConfirm(null)}
              >
                ✕
              </Button>
            </ModalHeader>
            <ModalBody>
              <Stack space="space.200">
                <SectionMessage appearance="warning">
                  <Text>
                    {interpolate(t('admin.levels.delete_confirm_message'), {
                      count: deleteConfirm.pageCount,
                      level: deleteConfirm.levelName,
                    })}
                  </Text>
                </SectionMessage>
                <Stack space="space.050">
                  <Label labelFor="reclassify-select">
                    {t('admin.levels.delete_reclassify_label')}
                  </Label>
                  <Select
                    inputId="reclassify-select"
                    options={(config?.levels || [])
                      .filter((l) => l.id !== deleteConfirm.levelId)
                      .map((l) => ({
                        label: localize(l.name, 'en'),
                        value: l.id,
                      }))}
                    onChange={(option) =>
                      setDeleteConfirm((prev) => ({
                        ...prev,
                        reclassifyTo: option?.value || null,
                      }))
                    }
                  />
                </Stack>
              </Stack>
            </ModalBody>
            <ModalFooter>
              <ButtonGroup>
                <Button
                  appearance="subtle"
                  onClick={() => setDeleteConfirm(null)}
                >
                  {t('classify.cancel_button')}
                </Button>
                <Button
                  appearance="warning"
                  onClick={() => removeLevelFromConfig(deleteConfirm.levelId)}
                  isDisabled={deleteLoading}
                >
                  {t('admin.levels.delete_anyway_button')}
                </Button>
                <Button
                  appearance="primary"
                  onClick={handleReclassifyAndDelete}
                  isDisabled={!deleteConfirm.reclassifyTo || deleteLoading}
                  isLoading={deleteLoading}
                >
                  {t('admin.levels.delete_reclassify_button')}
                </Button>
              </ButtonGroup>
            </ModalFooter>
          </Modal>
        )}
      </ModalTransition>

      {/* Contact edit modal */}
      <ModalTransition>
        {showContactModal && editingContact && (
          <ContactModal
            contact={editingContact}
            levels={config?.levels || []}
            languages={config?.languages || [{ code: 'en', label: 'English' }]}
            onSave={saveContact}
            onClose={() => setShowContactModal(false)}
            t={t}
          />
        )}
      </ModalTransition>

      {/* Link edit modal */}
      <ModalTransition>
        {showLinkModal && editingLink && (
          <LinkModal
            link={editingLink}
            levels={config?.levels || []}
            languages={config?.languages || [{ code: 'en', label: 'English' }]}
            onSave={saveLink}
            onClose={() => setShowLinkModal(false)}
            t={t}
          />
        )}
      </ModalTransition>
    </Box>
  );
};

ForgeReconciler.render(
  <I18nProvider>
    <App />
  </I18nProvider>,
);
