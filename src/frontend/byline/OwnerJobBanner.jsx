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
 * Banner for a paused job owning the current page or an ancestor.
 * Replaces the level picker — the only path forward is resume or stop.
 */
const OwnerJobBanner = ({
  ownerJob,
  t,
  resumePendingJob,
  stopPendingJob,
  resolveLevelName,
  levelAppearance,
}) => (
  <SectionMessage
    appearance="information"
    actions={[
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
    ]}
  >
    <Stack space="space.050">
      <Inline space="space.050" alignBlock="center">
        <Text>
          {ownerJob.isSelf
            ? t('classify.paused_here_prefix')
            : interpolate(t('classify.paused_ancestor_prefix'), {
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

export default OwnerJobBanner;
