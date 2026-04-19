import React from 'react';
import { Stack, Inline, Text, Spinner, ProgressBar } from '@forge/react';
import { interpolate } from '../../shared/i18n';

const ACTIVITY_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Progress bar for an active recursive classify job.
 * Shows a spinner placeholder until the first live Realtime event arrives
 * to avoid flashing "0 of X" while KVS state is still loading.
 */
const AsyncProgressBar = ({
  asyncJob,
  asyncProgress,
  activityFrame,
  etaText,
  resolveLevelName,
  t,
}) => (
  <Stack space="space.100">
    {asyncProgress.fromRealtime ? (
      <>
        <Text>
          {ACTIVITY_FRAMES[activityFrame]}
          {'  '}
          {interpolate(t('classify.async_progress'), {
            classified: asyncProgress.classified || 0,
            total: asyncJob.total,
            level: resolveLevelName(asyncJob.levelId),
          })}
        </Text>
        <ProgressBar
          value={
            asyncJob.total > 0
              ? (asyncProgress.classified || 0) / asyncJob.total
              : 0
          }
        />
        {etaText ? <Text>{etaText}</Text> : null}
      </>
    ) : (
      <Inline space="space.100" alignBlock="center">
        <Spinner size="small" />
        <Text>{t('classify.async_loading_progress')}</Text>
      </Inline>
    )}
    <Text>{t('classify.async_close_hint')}</Text>
  </Stack>
);

export default AsyncProgressBar;
