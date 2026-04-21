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
 * Banner for a bulk-classify job owning the current page or an ancestor.
 * Replaces the level picker — the only path forward is resume/stop (paused)
 * or view/stop (running).
 */
const OwnerJobBanner = ({
  ownerJob,
  isRunning,
  t,
  resumePendingJob,
  stopPendingJob,
  resolveLevelName,
  levelAppearance,
}) => {
  const prefixKey = isRunning
    ? ownerJob.isSelf
      ? 'classify.running_here_prefix'
      : 'classify.running_ancestor_prefix'
    : ownerJob.isSelf
      ? 'classify.paused_here_prefix'
      : 'classify.paused_ancestor_prefix';
  return (
    <SectionMessage
      appearance="information"
      actions={
        isRunning
          ? [
              <Button
                key="stop"
                testId="byline-owner-stop"
                appearance="subtle"
                onClick={() => stopPendingJob(ownerJob)}
              >
                {t('classify.stop_button')}
              </Button>,
            ]
          : [
              <Button
                key="resume"
                testId="byline-owner-resume"
                appearance="primary"
                onClick={() => resumePendingJob(ownerJob)}
              >
                {t('classify.resume_button')}
              </Button>,
              <Button
                key="stop"
                testId="byline-owner-stop"
                appearance="subtle"
                onClick={() => stopPendingJob(ownerJob)}
              >
                {t('classify.stop_button')}
              </Button>,
            ]
      }
    >
      <Stack space="space.050">
        <Inline space="space.050" alignBlock="center">
          <Text>
            {ownerJob.isSelf
              ? t(prefixKey)
              : interpolate(t(prefixKey), {
                  title: ownerJob.rootTitle || '',
                })}
          </Text>
          <Text>→</Text>
          <Lozenge isBold appearance={levelAppearance(ownerJob.levelId)}>
            {resolveLevelName(ownerJob.levelId)}
          </Lozenge>
        </Inline>
        <Text>
          {interpolate(t('classify.paused_progress'), {
            classified: ownerJob.classified,
            total: ownerJob.totalEstimate,
          })}
        </Text>
      </Stack>
    </SectionMessage>
  );
};

export default OwnerJobBanner;
