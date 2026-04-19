import React from 'react';
import { Button, Text, SectionMessage } from '@forge/react';
import { interpolate } from '../../shared/i18n';

/**
 * Inline stop-confirmation shown above the level picker while a
 * recursive classify job is active.
 */
const StopConfirmation = ({
  asyncJob,
  asyncProgress,
  t,
  abandonStop,
  confirmStop,
  resolveLevelName,
}) => (
  <SectionMessage
    appearance="warning"
    actions={[
      <Button
        key="abandon"
        testId="byline-stop-keep-going"
        appearance="primary"
        onClick={abandonStop}
      >
        {t('classify.stop_keep_going_button')}
      </Button>,
      <Button
        key="confirm"
        testId="byline-stop-confirm"
        appearance="subtle"
        onClick={confirmStop}
      >
        {t('classify.stop_confirm_button')}
      </Button>,
    ]}
  >
    <Text>
      {interpolate(t('classify.stop_confirm_message'), {
        classified: asyncProgress?.classified || 0,
        level: resolveLevelName(asyncJob.levelId),
      })}
    </Text>
  </SectionMessage>
);

export default StopConfirmation;
