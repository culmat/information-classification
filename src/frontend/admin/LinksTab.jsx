import React from 'react';
import {
  Box,
  Stack,
  Inline,
  Heading,
  Button,
  ButtonGroup,
  Text,
  Link,
  Tag,
  TagGroup,
  DynamicTable,
  EmptyState,
  xcss,
} from '@forge/react';
import { normalizeColor } from '../../shared/constants';
import { localize } from '../../shared/i18n';

const tabPanelStyle = xcss({ paddingTop: 'space.100' });

const LinksTab = ({ t, config, addLink, editLink, deleteLink }) => {
  const rows = (config?.links || []).map((link) => ({
    key: link.id,
    cells: [
      {
        key: 'type',
        content: (
          <Text>{t(`admin.links.type_${link.type || 'external'}`)}</Text>
        ),
      },
      { key: 'label', content: <Text>{localize(link.label, 'en')}</Text> },
      {
        key: 'url',
        content: (
          <Link href={link.url} openNewTab>
            {link.url}
          </Link>
        ),
      },
      {
        key: 'applies',
        content:
          link.levelIds?.length > 0 ? (
            <TagGroup>
              {link.levelIds.map((id) => {
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
            <Tag text={t('admin.links.applies_to_all')} color="standard" />
          ),
      },
      {
        key: 'actions',
        content: (
          <ButtonGroup>
            <Button
              testId={`admin-link-edit-${link.id}`}
              appearance="subtle"
              onClick={() => editLink(link)}
            >
              {t('admin.levels.edit_button')}
            </Button>
            <Button
              testId={`admin-link-delete-${link.id}`}
              appearance="danger"
              onClick={() => deleteLink(link.id)}
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
          <Heading size="medium">{t('admin.links.title')}</Heading>
          <Button
            testId="admin-link-add"
            appearance="primary"
            onClick={addLink}
          >
            {t('admin.links.add_button')}
          </Button>
        </Inline>

        <DynamicTable
          head={{
            cells: [
              { key: 'type', content: t('admin.links.type') },
              { key: 'label', content: t('admin.links.label') },
              { key: 'url', content: t('admin.links.url') },
              { key: 'applies', content: t('admin.links.applies_to') },
              { key: 'actions', content: '' },
            ],
          }}
          rows={rows}
          emptyView={<EmptyState header={t('byline.no_links')} />}
        />
      </Stack>
    </Box>
  );
};

export default LinksTab;
