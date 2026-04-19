import React from 'react';
import {
  Box,
  Stack,
  Inline,
  Heading,
  Button,
  ButtonGroup,
  Text,
  User,
  Tag,
  TagGroup,
  DynamicTable,
  EmptyState,
  xcss,
} from '@forge/react';
import { normalizeColor } from '../../shared/constants';
import { localize } from '../../shared/i18n';

const tabPanelStyle = xcss({ paddingTop: 'space.100' });

const ContactsTab = ({ t, config, addContact, editContact, deleteContact }) => {
  const rows = (config?.contacts || []).map((contact) => ({
    key: contact.id,
    cells: [
      {
        key: 'type',
        content: <Text>{t(`admin.contacts.type_${contact.type}`)}</Text>,
      },
      {
        key: 'value',
        content:
          contact.type === 'user' ? (
            <User accountId={contact.value} />
          ) : (
            <Text>{contact.value}</Text>
          ),
      },
      { key: 'role', content: <Text>{localize(contact.role, 'en')}</Text> },
      {
        key: 'applies',
        content:
          contact.levelIds?.length > 0 ? (
            <TagGroup>
              {contact.levelIds.map((id) => {
                const level = (config?.levels || []).find((l) => l.id === id);
                return (
                  <Tag
                    key={id}
                    text={level ? localize(level.name, 'en') : id}
                    color={level ? normalizeColor(level.color) : 'standard'}
                  />
                );
              })}
            </TagGroup>
          ) : (
            <Tag text={t('admin.contacts.applies_to_all')} color="standard" />
          ),
      },
      {
        key: 'actions',
        content: (
          <ButtonGroup>
            <Button
              testId={`admin-contact-edit-${contact.id}`}
              appearance="subtle"
              onClick={() => editContact(contact)}
            >
              {t('admin.levels.edit_button')}
            </Button>
            <Button
              testId={`admin-contact-delete-${contact.id}`}
              appearance="danger"
              onClick={() => deleteContact(contact.id)}
            >
              {t('admin.levels.delete_button')}
            </Button>
          </ButtonGroup>
        ),
      },
    ],
  }));

  return (
    <Box xcss={tabPanelStyle}>
      <Stack space="space.200">
        <Inline space="space.200" alignBlock="center" spread="space-between">
          <Heading size="medium">{t('admin.contacts.title')}</Heading>
          <Button
            testId="admin-contact-add"
            appearance="primary"
            onClick={addContact}
          >
            {t('admin.contacts.add_button')}
          </Button>
        </Inline>

        <DynamicTable
          head={{
            cells: [
              { key: 'type', content: t('admin.contacts.type') },
              { key: 'value', content: t('admin.contacts.value') },
              { key: 'role', content: t('admin.contacts.role') },
              { key: 'applies', content: t('admin.contacts.applies_to') },
              { key: 'actions', content: '' },
            ],
          }}
          rows={rows}
          emptyView={<EmptyState header={t('byline.no_contacts')} />}
        />
      </Stack>
    </Box>
  );
};

export default ContactsTab;
