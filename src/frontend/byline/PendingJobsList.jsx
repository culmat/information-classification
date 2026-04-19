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
 * Paused jobs on unrelated pages. Compact list above the level picker —
 * never auto-resumes; user decides.
 */
const PendingJobsList = ({
  otherJobs,
  t,
  resumePendingJob,
  stopPendingJob,
  resolveLevelName,
  levelAppearance,
}) => (
  <Stack space="space.100">
    {otherJobs.slice(0, 3).map((job) => (
      <SectionMessage
        key={job.jobId}
        appearance="information"
        actions={[
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
        ]}
      >
        <Stack space="space.050">
          <Inline space="space.050" alignBlock="center">
            <Text>
              {job.rootTitle
                ? interpolate(t('classify.paused_other_prefix'), {
                    title: job.rootTitle,
                  })
                : t('classify.paused_other_prefix_notitle')}
            </Text>
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
    ))}
  </Stack>
);

export default PendingJobsList;
