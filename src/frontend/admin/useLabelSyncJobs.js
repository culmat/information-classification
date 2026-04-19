import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@forge/bridge';
import { isValidLabel } from '../../shared/constants';
import { runLabelJobLoop } from './labelJobLoop';

const ACTIVITY_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function buildImportMappings(config, importLabels) {
  return (config?.levels || [])
    .filter((l) => l.allowed)
    .map((level) => ({
      levelId: level.id,
      labels: (importLabels[level.id] || [])
        .map((o) => o.value)
        .filter(Boolean),
    }))
    .filter((m) => m.labels.length > 0);
}

function buildExportMappings(config, exportMappings) {
  return (config?.levels || [])
    .map((level) => ({
      levelId: level.id,
      labelName: (exportMappings[level.id] !== undefined
        ? exportMappings[level.id]
        : level.id
      ).trim(),
    }))
    .filter((m) => m.labelName.length > 0 && isValidLabel(m.labelName));
}

/**
 * Label-sync job infrastructure shared by the import and export tabs.
 * Owns pending-job discovery, the batched processing loop, and the
 * start/resume/discard actions. Reads state from the import/export hooks
 * via the `importApi` / `exportApi` param objects.
 */
export default function useLabelSyncJobs({ config, importApi, exportApi }) {
  const importStopRef = useRef(false);
  const exportStopRef = useRef(false);
  const [labelActivityFrame, setLabelActivityFrame] = useState(0);
  const [pendingLabelJobs, setPendingLabelJobs] = useState([]);

  const {
    importStep,
    setImportStep,
    setImportProgress,
    importLabels,
    importRemoveLabels,
    getImportSpaceKey,
    refreshImportCounts,
    settleImportCounts,
  } = importApi;

  const {
    exportLoading,
    setExportProgress,
    setExportLoading,
    exportMappings,
    exportScopeAll,
    exportSpaceKeys,
    refreshExportCounts,
    settleExportCounts,
  } = exportApi;

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

  useEffect(() => {
    if (importStep !== 'running' && !exportLoading) return;
    const id = setInterval(() => {
      setLabelActivityFrame((f) => (f + 1) % ACTIVITY_FRAMES.length);
    }, 120);
    return () => clearInterval(id);
  }, [importStep, exportLoading]);

  const resumeImportJob = (job, now) => {
    const total = job.totalEstimate || 0;
    const startedClassified = job.classified || 0;
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
  };

  const resumeExportJob = (job, now) => {
    const total = job.totalEstimate || 0;
    const startedClassified = job.classified || 0;
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
  };

  const resumeLabelJob = (job) => {
    setPendingLabelJobs((prev) => prev.filter((j) => j.jobId !== job.jobId));
    const now = Date.now();
    if (job.jobKind === 'label-import') resumeImportJob(job, now);
    else resumeExportJob(job, now);
  };

  const discardLabelJob = async (job) => {
    setPendingLabelJobs((prev) => prev.filter((j) => j.jobId !== job.jobId));
    try {
      await invoke('cancelLabelJob', { jobId: job.jobId });
    } catch (err) {
      console.error('cancelLabelJob failed:', err);
    }
    if (job.jobKind === 'label-import') refreshImportCounts();
    else refreshExportCounts();
  };

  const startImport = async () => {
    const mappings = buildImportMappings(config, importLabels);
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
      if (!result?.success) {
        console.error('startLabelImport failed:', result);
        setImportStep('idle');
        setImportProgress(null);
        return;
      }
      if (result.count === 0) {
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
    const mappings = buildExportMappings(config, exportMappings);
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
      if (!result?.success) {
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

  return {
    importStopRef,
    exportStopRef,
    labelActivityFrame,
    pendingLabelJobs,
    resumeLabelJob,
    discardLabelJob,
    startImport,
    startExport,
  };
}
