import React from 'react';
import { Inline, User, Link, Text } from '@forge/react';
import { localize } from '../../shared/i18n';

/**
 * Renders a single contact item.
 * Supports user (with avatar), email (as link), and free text types.
 */
const ContactItem = ({ contact, locale }) => {
  const role = localize(contact.role, locale);

  if (contact.type === 'user') {
    return (
      <Inline space="space.100" alignBlock="center">
        <User accountId={contact.value} />
        {role && <Text> — {role}</Text>}
      </Inline>
    );
  }

  if (contact.type === 'email') {
    return (
      <Inline space="space.100">
        <Link href={`mailto:${contact.value}`}>{contact.value}</Link>
        {role && <Text> — {role}</Text>}
      </Inline>
    );
  }

  return (
    <Text>
      {contact.value}
      {role ? ` — ${role}` : ''}
    </Text>
  );
};

export default ContactItem;
