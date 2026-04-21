import React from 'react';
import {
  Stack,
  Inline,
  Button,
  Text,
  SectionMessage,
  Lozenge,
} from '@forge/react';
import { interpolate } from '../../shared/i18n';

/**
 * Paused or running bulk-classify jobs on unrelated pages. Compact list
 * above the level picker. When the driver is alive the entry shows
 * "Running …" and only a Stop button; paused entries keep Resume + Stop.
 */
const PendingJobsList = ({
  otherJobs,
  activeJobId,
  t,
  resumePendingJob,
  stopPendingJob,
  resolveLevelName,
  levelAppearance,
}) => (
  <Stack space="space.100">
    {otherJobs.slice(0, 3).map((job) => {
      const running = job.jobId === activeJobId;
      const prefix = job.rootTitle
        ? interpolate(
            t(
              running
                ? 'classify.running_other_prefix'
                : 'classify.paused_other_prefix',
            ),
            { title: job.rootTitle },
          )
        : t(
            running
              ? 'classify.running_other_prefix_notitle'
              : 'classify.paused_other_prefix_notitle',
          );
      const actions = running
        ? [
            <Button
              key="stop"
              testId={`byline-pending-stop-${job.jobId}`}
              appearance="subtle"
              onClick={() => stopPendingJob(job)}
            >
              {t('classify.stop_button')}
            </Button>,
          ]
        : [
            <Button
              key="resume"
              testId={`byline-pending-resume-${job.jobId}`}
              appearance="primary"
              onClick={() => resumePendingJob(job)}
            >
              {t('classify.resume_button')}
            </Button>,
            <Button
              key="stop"
              testId={`byline-pending-stop-${job.jobId}`}
              appearance="subtle"
              onClick={() => stopPendingJob(job)}
            >
              {t('classify.stop_button')}
            </Button>,
          ];
      return (
        <SectionMessage
          key={job.jobId}
          appearance="information"
          actions={actions}
        >
          <Stack space="space.050">
            <Inline space="space.050" alignBlock="center">
              <Text>{prefix}</Text>
              <Text>→</Text>
              <Lozenge isBold appearance={levelAppearance(job.levelId)}>
                {resolveLevelName(job.levelId)}
              </Lozenge>
            </Inline>
            <Text>
              {interpolate(t('classify.paused_progress'), {
                classified: job.classified,
                total: job.totalEstimate,
              })}
            </Text>
          </Stack>
        </SectionMessage>
      );
    })}
  </Stack>
);

export default PendingJobsList;
