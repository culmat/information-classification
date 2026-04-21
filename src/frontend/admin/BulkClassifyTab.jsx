import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Stack,
  Inline,
  Heading,
  Button,
  Text,
  Label,
  Select,
  SectionMessage,
  Lozenge,
  ProgressBar,
  Spinner,
  xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { colorToLozenge } from '../../shared/constants';
import { interpolate, localize } from '../../shared/i18n';
import { formatMappingLabels } from './labelSyncHelpers';

const tabPanelStyle = xcss({ paddingTop: 'space.100' });
const cardStyle = xcss({
  padding: 'space.200',
  borderRadius: 'border.radius.100',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderColor: 'color.border',
});

/**
 * Admin Bulk Classify tab — v1: site-wide "from source level → target level"
 * reclassification. Replaces the former async-queue "Delete & Reclassify"
 * button on the level delete modal.
 *
 * Shows a live view of the user's unified job queue (bulk-classify + label
 * import/export) so admins can see what else is waiting behind the start
 * button without switching tabs.
 */
const BulkClassifyTab = ({
  t,
  config,
  locale,
  jobQueue,
  initialSourceLevelId,
  clearInitialSource,
  onStartedOrQueued,
}) => {
  const [sourceLevelId, setSourceLevelId] = useState(
    initialSourceLevelId || null,
  );
  const [targetLevelId, setTargetLevelId] = useState(null);
  const [previewCount, setPreviewCount] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (initialSourceLevelId) {
      setSourceLevelId(initialSourceLevelId);
      clearInitialSource?.();
    }
  }, [initialSourceLevelId, clearInitialSource]);

  const levels = config?.levels || [];
  const levelById = Object.fromEntries(levels.map((l) => [l.id, l]));
  const allowedLevels = levels.filter((l) => l.allowed);

  const sourceOptions = levels.map((l) => ({
    label: localize(l.name, locale || 'en'),
    value: l.id,
  }));
  const targetOptions = allowedLevels
    .filter((l) => l.id !== sourceLevelId)
    .map((l) => ({
      label: localize(l.name, locale || 'en'),
      value: l.id,
    }));

  const canStart =
    !!sourceLevelId &&
    !!targetLevelId &&
    sourceLevelId !== targetLevelId &&
    !starting;

  useEffect(() => {
    if (!sourceLevelId) {
      setPreviewCount(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    invoke('countBulkClassifyScope', {
      scope: { kind: 'fromLevel' },
      sourceLevelFilter: sourceLevelId,
    })
      .then((res) => {
        if (cancelled) return;
        if (res?.success) setPreviewCount(res.count || 0);
        else setPreviewCount(null);
      })
      .catch(() => {
        if (!cancelled) setPreviewCount(null);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceLevelId]);

  const handleStart = useCallback(async () => {
    if (!canStart) return;
    setStarting(true);
    setError(null);
    try {
      const result = await invoke('startBulkClassify', {
        scope: { kind: 'fromLevel' },
        sourceLevelFilter: sourceLevelId,
        targetLevelId,
        locale,
      });
      if (!result?.success) {
        if (result?.error === 'scope_conflict') {
          setError(t('admin.bulkClassify.error_scope_conflict'));
        } else {
          setError(result?.message || t('classify.error'));
        }
        return;
      }
      setSourceLevelId(null);
      setTargetLevelId(null);
      setPreviewCount(null);
      onStartedOrQueued?.();
    } catch (err) {
      console.error('startBulkClassify failed:', err);
      setError(t('classify.error'));
    } finally {
      setStarting(false);
    }
  }, [canStart, sourceLevelId, targetLevelId, locale, t, onStartedOrQueued]);

  const handleStopActive = useCallback(async () => {
    const job = jobQueue.activeJob;
    if (!job) return;
    try {
      if (job.jobKind === 'bulk-classify') {
        await invoke('cancelClassifyJob', { jobId: job.jobId });
      } else {
        await invoke('cancelLabelJob', { jobId: job.jobId });
      }
      jobQueue.refresh();
    } catch (err) {
      console.error('cancel failed:', err);
    }
  }, [jobQueue]);

  const handleStopQueued = useCallback(
    async (job) => {
      try {
        if (job.jobKind === 'bulk-classify') {
          await invoke('cancelClassifyJob', { jobId: job.jobId });
        } else {
          await invoke('cancelLabelJob', { jobId: job.jobId });
        }
        jobQueue.refresh();
      } catch (err) {
        console.error('cancel failed:', err);
      }
    },
    [jobQueue],
  );

  const renderJobSummary = (job) => {
    if (job.jobKind === 'bulk-classify') {
      const source = job.sourceLevelFilter
        ? localize(levelById[job.sourceLevelFilter]?.name, locale || 'en') ||
          job.sourceLevelFilter
        : job.rootTitle || t('admin.bulkClassify.source_descendants');
      const target =
        localize(levelById[job.targetLevelId]?.name, locale || 'en') ||
        job.targetLevelId;
      return (
        <Inline space="space.050" alignBlock="center">
          <Text>
            {interpolate(t('admin.bulkClassify.summary_bulk'), { source })}
          </Text>
          <Text>→</Text>
          <Lozenge
            isBold
            appearance={colorToLozenge(levelById[job.targetLevelId]?.color)}
          >
            {target}
          </Lozenge>
        </Inline>
      );
    }
    const labels = formatMappingLabels(job.mappings, job.jobKind);
    const label =
      job.jobKind === 'label-import'
        ? t('admin.bulkClassify.summary_label_import')
        : t('admin.bulkClassify.summary_label_export');
    return (
      <Text>
        {label}
        {labels ? `: ${labels}` : ''}
      </Text>
    );
  };

  const activeJob = jobQueue.activeJob;

  return (
    <Box xcss={tabPanelStyle}>
      <Stack space="space.300">
        <Heading size="medium">{t('admin.bulkClassify.title')}</Heading>
        <Text>{t('admin.bulkClassify.description')}</Text>

        <Box xcss={cardStyle}>
          <Stack space="space.200">
            <Heading size="small">
              {t('admin.bulkClassify.start_heading')}
            </Heading>

            <Inline space="space.200" alignBlock="end" shouldWrap>
              <Stack space="space.050">
                <Label labelFor="bulk-source">
                  {t('admin.bulkClassify.source_label')}
                </Label>
                <Select
                  inputId="bulk-source"
                  options={sourceOptions}
                  value={
                    sourceLevelId
                      ? sourceOptions.find((o) => o.value === sourceLevelId) ||
                        null
                      : null
                  }
                  onChange={(option) => setSourceLevelId(option?.value || null)}
                  isDisabled={starting}
                />
              </Stack>

              <Stack space="space.050">
                <Label labelFor="bulk-target">
                  {t('admin.bulkClassify.target_label')}
                </Label>
                <Select
                  inputId="bulk-target"
                  options={targetOptions}
                  value={
                    targetLevelId
                      ? targetOptions.find((o) => o.value === targetLevelId) ||
                        null
                      : null
                  }
                  onChange={(option) => setTargetLevelId(option?.value || null)}
                  isDisabled={!sourceLevelId || starting}
                />
              </Stack>
            </Inline>

            {sourceLevelId && (
              <Text>
                {previewLoading
                  ? t('admin.bulkClassify.preview_loading')
                  : previewCount === null
                    ? t('admin.bulkClassify.preview_unknown')
                    : interpolate(t('admin.bulkClassify.preview_count'), {
                        count: previewCount,
                        source:
                          localize(
                            levelById[sourceLevelId]?.name,
                            locale || 'en',
                          ) || sourceLevelId,
                      })}
              </Text>
            )}

            {error && (
              <SectionMessage appearance="error">
                <Text>{error}</Text>
              </SectionMessage>
            )}

            <Inline space="space.100">
              <Button
                testId="bulk-classify-start"
                appearance="primary"
                onClick={handleStart}
                isDisabled={!canStart}
                isLoading={starting}
              >
                {t('admin.bulkClassify.start_button')}
              </Button>
            </Inline>
          </Stack>
        </Box>

        <Stack space="space.150">
          <Heading size="small">
            {t('admin.bulkClassify.queue_heading')}
          </Heading>
          {jobQueue.loading &&
          !activeJob &&
          jobQueue.queuedJobs.length === 0 ? (
            <Spinner />
          ) : !activeJob && jobQueue.queuedJobs.length === 0 ? (
            <Text>{t('admin.bulkClassify.queue_empty')}</Text>
          ) : (
            <Stack space="space.100">
              {activeJob && (
                <SectionMessage
                  appearance="information"
                  actions={[
                    <Button
                      key="stop"
                      appearance="subtle"
                      onClick={handleStopActive}
                    >
                      {t('classify.stop_button')}
                    </Button>,
                  ]}
                >
                  <Stack space="space.075">
                    <Inline space="space.100" alignBlock="center">
                      <Lozenge appearance="inprogress">
                        {t('admin.bulkClassify.status_active')}
                      </Lozenge>
                      {renderJobSummary(activeJob)}
                    </Inline>
                    <ProgressBar
                      value={
                        activeJob.totalEstimate > 0
                          ? activeJob.classified / activeJob.totalEstimate
                          : 0
                      }
                    />
                    <Text>
                      {interpolate(t('classify.paused_progress'), {
                        classified: activeJob.classified,
                        total: activeJob.totalEstimate,
                      })}
                    </Text>
                  </Stack>
                </SectionMessage>
              )}
              {jobQueue.queuedJobs.map((job) => (
                <SectionMessage
                  key={job.jobId}
                  appearance="information"
                  actions={[
                    <Button
                      key="stop"
                      appearance="subtle"
                      onClick={() => handleStopQueued(job)}
                    >
                      {t('classify.stop_button')}
                    </Button>,
                  ]}
                >
                  <Inline space="space.100" alignBlock="center">
                    <Lozenge>{t('admin.bulkClassify.status_queued')}</Lozenge>
                    {renderJobSummary(job)}
                  </Inline>
                </SectionMessage>
              ))}
            </Stack>
          )}
        </Stack>
      </Stack>
    </Box>
  );
};

export default BulkClassifyTab;
