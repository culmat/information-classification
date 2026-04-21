import React from 'react';
import { Box, Stack, Heading, Text, Link, xcss } from '@forge/react';
import { DOCS_URL } from '../../shared/constants';

const wrapperStyle = xcss({
  padding: 'space.200',
  maxWidth: '400px',
});

/**
 * Shown in the byline popup when no classification levels are configured.
 * Single variant for every viewer: a short explanation and a docs link.
 * (We tried detecting admins to show a one-click settings deep link, but
 * the environmentId isn't reliably available from the byline's runtime
 * context — the admin can reach the settings page via the standard
 * Confluence apps admin menu, so the extra plumbing wasn't worth it.)
 */
const EmptyStatePopup = ({ t }) => (
  <Box xcss={wrapperStyle}>
    <Stack space="space.150">
      <Heading size="small">{t('byline.empty_state.heading')}</Heading>
      <Text>{t('byline.empty_state.body')}</Text>
      <Link href={DOCS_URL} openNewTab>
        {t('byline.empty_state.docs_link')}
      </Link>
    </Stack>
  </Box>
);

export default EmptyStatePopup;
