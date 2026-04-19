import React from 'react';
import {
  Box,
  Stack,
  Inline,
  Heading,
  Button,
  ButtonGroup,
  Text,
  Label,
  Lozenge,
  Badge,
  Select,
  DynamicTable,
  EmptyState,
  xcss,
} from '@forge/react';
import { colorToLozenge } from '../../shared/constants';
import { localize } from '../../shared/i18n';

const tabPanelStyle = xcss({ paddingTop: 'space.100' });

const LevelsTab = ({
  t,
  config,
  setConfig,
  addLevel,
  editLevel,
  deleteLevel,
  moveLevel,
}) => {
  const rows = (config?.levels || []).map((level, index) => ({
    key: `level-${index}`,
    cells: [
      {
        key: 'color',
        content: (
          <Lozenge isBold appearance={colorToLozenge(level.color)}>
            {localize(level.name, 'en')}
          </Lozenge>
        ),
      },
      {
        key: 'allowed',
        content: level.allowed ? (
          <Badge appearance="added">Yes</Badge>
        ) : (
          <Badge appearance="removed">No</Badge>
        ),
      },
      {
        key: 'protection',
        content: level.requiresProtection ? (
          <Badge>Yes</Badge>
        ) : (
          <Text>No</Text>
        ),
      },
      {
        key: 'actions',
        content: (
          <ButtonGroup>
            <Button
              appearance="subtle"
              onClick={() => moveLevel(level.id, -1)}
              isDisabled={index === 0}
            >
              {t('admin.levels.move_up')}
            </Button>
            <Button
              appearance="subtle"
              onClick={() => moveLevel(level.id, 1)}
              isDisabled={index === config.levels.length - 1}
            >
              {t('admin.levels.move_down')}
            </Button>
            <Button
              testId={`admin-level-edit-${level.id}`}
              appearance="subtle"
              onClick={() => editLevel(level)}
            >
              {t('admin.levels.edit_button')}
            </Button>
            <Button
              testId={`admin-level-delete-${level.id}`}
              appearance="danger"
              onClick={() => deleteLevel(level.id)}
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
          <Heading size="medium">{t('admin.levels.title')}</Heading>
          <Button
            testId="admin-level-add"
            appearance="primary"
            onClick={addLevel}
          >
            {t('admin.levels.add_button')}
          </Button>
        </Inline>

        <DynamicTable
          head={{
            cells: [
              { key: 'color', content: t('admin.levels.name') },
              { key: 'allowed', content: t('admin.levels.allowed') },
              {
                key: 'protection',
                content: t('admin.levels.requires_protection'),
              },
              { key: 'actions', content: '' },
            ],
          }}
          rows={rows}
          emptyView={<EmptyState header={t('admin.levels.empty')} />}
        />

        <Inline space="space.100" alignBlock="center">
          <Label labelFor="default-level">
            {t('admin.levels.default_level')}
          </Label>
          <Select
            inputId="default-level"
            value={config?.levels
              ?.filter((l) => l.id === config.defaultLevelId)
              .map((l) => ({
                label: localize(l.name, 'en'),
                value: l.id,
              }))}
            options={(config?.levels || [])
              .filter((l) => l.allowed)
              .map((l) => ({
                label: localize(l.name, 'en'),
                value: l.id,
              }))}
            onChange={(option) =>
              setConfig({ ...config, defaultLevelId: option.value })
            }
          />
        </Inline>
      </Stack>
    </Box>
  );
};

export default LevelsTab;
