import React from 'react';
import { Box, Stack, Heading, Link, EmptyState, xcss } from '@forge/react';
import { localize } from '../../shared/i18n';
import ContactItem from './ContactItem';

const sectionStyle = xcss({ paddingTop: 'space.100' });

const ResourcesTab = ({ t, locale, relevantContacts, relevantLinks }) => (
  <Box xcss={sectionStyle}>
    <Stack space="space.150">
      {relevantContacts.length > 0 && (
        <Box xcss={sectionStyle}>
          <Heading size="xsmall">{t('byline.contacts')}</Heading>
          <Stack space="space.050">
            {relevantContacts.map((contact) => (
              <ContactItem key={contact.id} contact={contact} locale={locale} />
            ))}
          </Stack>
        </Box>
      )}

      {relevantLinks.length > 0 && (
        <Box xcss={sectionStyle}>
          <Heading size="xsmall">{t('byline.links')}</Heading>
          <Stack space="space.050">
            {relevantLinks.map((link) => (
              <Link key={link.id} href={link.url} openNewTab>
                {localize(link.label, locale)}
              </Link>
            ))}
          </Stack>
        </Box>
      )}

      {relevantContacts.length === 0 && relevantLinks.length === 0 && (
        <EmptyState header={t('byline.no_resources')} />
      )}
    </Stack>
  </Box>
);

export default ResourcesTab;
