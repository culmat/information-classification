import React from 'react';
import {
  Stack,
  Inline,
  Button,
  Text,
  SectionMessage,
  ProgressBar,
} from '@forge/react';
import { interpolate, formatSessionEta } from '../../shared/i18n';

const ACTIVITY_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Running progress + done + settling banners shared by the import and
 * export label-sync tabs. The tab passes the kind-specific i18n keys.
 */
const SyncProgress = ({
  t,
  testIdPrefix,
  labelActivityFrame,
  isRunning,
  progress,
  onStop,
  stopRef,
  isDone,
  doneMessage,
  settling,
  settlingKey,
}) => (
  <>
    {isRunning && progress && (
      <Stack space="space.050" testId={`${testIdPrefix}-progress`}>
        <Inline space="space.100" alignBlock="center">
          <Text>
            {ACTIVITY_FRAMES[labelActivityFrame]} {progress.classified || 0} /{' '}
            {progress.total || '?'}
          </Text>
          <Button
            testId={`${testIdPrefix}-stop`}
            appearance="subtle"
            spacing="compact"
            onClick={() => {
              if (onStop) onStop();
              else if (stopRef) stopRef.current = true;
            }}
          >
            {t('classify.stop_button')}
          </Button>
        </Inline>
        <ProgressBar
          value={
            progress.total > 0 ? (progress.classified || 0) / progress.total : 0
          }
        />
        {(progress.classified || 0) > 0 &&
          progress.sessionStartedAt &&
          (() => {
            const remaining = Math.max(
              0,
              (progress.total || 0) - (progress.classified || 0),
            );
            const eta = formatSessionEta(
              progress.sessionStartedAt,
              (progress.classified || 0) -
                (progress.sessionClassifiedStart || 0),
              remaining,
              t,
            );
            return eta ? <Text>{eta}</Text> : null;
          })()}
      </Stack>
    )}
    {isDone && (
      <SectionMessage appearance="confirmation">
        <Text>{doneMessage}</Text>
      </SectionMessage>
    )}
    {settling && (
      <SectionMessage appearance="information">
        <Text>{t(settlingKey)}</Text>
      </SectionMessage>
    )}
  </>
);

/**
 * Renders the localized paused-job banners for the given jobKind.
 * Shared by both tabs.
 */
export const PausedBanners = ({
  t,
  jobKind,
  testIdPrefix,
  translationPrefix,
  pendingLabelJobs,
  locked,
  resumeLabelJob,
  discardLabelJob,
  formatMappingLabels,
}) =>
  pendingLabelJobs
    .filter((j) => j.jobKind === jobKind)
    .map((job) => (
      <SectionMessage
        key={job.jobId}
        appearance="information"
        actions={[
          <Button
            key="resume"
            testId={`${testIdPrefix}-resume-${job.jobId}`}
            appearance="primary"
            onClick={() => resumeLabelJob(job)}
            isDisabled={locked}
          >
            {t(`${translationPrefix}.resume_button`)}
          </Button>,
          <Button
            key="discard"
            testId={`${testIdPrefix}-discard-${job.jobId}`}
            appearance="subtle"
            onClick={() => discardLabelJob(job)}
            isDisabled={locked}
          >
            {t(`${translationPrefix}.discard_button`)}
          </Button>,
        ]}
      >
        <Text>
          {interpolate(t(`${translationPrefix}.paused_banner`), {
            classified: job.classified || 0,
            total: job.totalEstimate || 0,
            labels: formatMappingLabels(job.mappings, jobKind),
          })}
        </Text>
      </SectionMessage>
    ));

export default SyncProgress;
