import React, { useState } from 'react';
import {
  Button,
  Stack,
  Inline,
  Lozenge,
  Text,
  Toggle,
  Select,
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  Label,
  Form,
  FormFooter,
} from '@forge/react';
import { COLOR_OPTIONS, colorToLozenge } from '../../shared/constants';
import TranslatableField from './TranslatableField';

/**
 * Modal for adding/editing a classification level.
 */
const LevelModal = ({ level, languages, onSave, onClose, t }) => {
  const [data, setData] = useState({ ...level });
  const update = (field, value) => setData({ ...data, [field]: value });

  return (
    <Modal onClose={onClose}>
      <ModalHeader>
        <ModalTitle>
          {data.id
            ? t('admin.levels.edit_button')
            : t('admin.levels.add_button')}
        </ModalTitle>
      </ModalHeader>
      <Form onSubmit={() => onSave(data)}>
        <ModalBody>
          <Stack space="space.200">
            <TranslatableField
              languages={languages}
              label={t('admin.levels.name')}
              obj={data.name}
              onChange={(code, value) =>
                update('name', { ...data.name, [code]: value })
              }
              t={t}
            />
            <Stack space="space.050">
              <Label labelFor="level-color">{t('admin.levels.color')}</Label>
              <Select
                inputId="level-color"
                value={
                  COLOR_OPTIONS.find((c) => c.value === data.color) || {
                    label: data.color,
                    value: data.color,
                  }
                }
                options={COLOR_OPTIONS}
                onChange={(option) => update('color', option.value)}
              />
              {data.name?.en && (
                <Inline space="space.100" alignBlock="center">
                  <Text>{t('admin.levels.color_preview')}:</Text>
                  <Lozenge isBold appearance={colorToLozenge(data.color)}>
                    {data.name.en}
                  </Lozenge>
                </Inline>
              )}
            </Stack>
            <TranslatableField
              languages={languages}
              label={t('admin.levels.description')}
              obj={data.description}
              onChange={(code, value) =>
                update('description', { ...data.description, [code]: value })
              }
              multiline
              t={t}
            />
            <Inline space="space.100" alignBlock="center">
              <Toggle
                id="level-allowed"
                isChecked={data.allowed}
                onChange={() => update('allowed', !data.allowed)}
              />
              <Label labelFor="level-allowed">
                {t('admin.levels.allowed')}
              </Label>
            </Inline>
            <Inline space="space.100" alignBlock="center">
              <Toggle
                id="level-protection"
                isChecked={data.requiresProtection}
                onChange={() =>
                  update('requiresProtection', !data.requiresProtection)
                }
              />
              <Label labelFor="level-protection">
                {t('admin.levels.requires_protection')}
              </Label>
            </Inline>
            {!data.allowed && (
              <TranslatableField
                languages={languages}
                label={t('admin.levels.error_message')}
                obj={data.errorMessage}
                onChange={(code, value) =>
                  update('errorMessage', {
                    ...(data.errorMessage || {}),
                    [code]: value,
                  })
                }
                multiline
                t={t}
              />
            )}
          </Stack>
        </ModalBody>
        <ModalFooter>
          <FormFooter>
            <Button appearance="subtle" onClick={onClose}>
              {t('classify.cancel_button')}
            </Button>
            <Button
              appearance="primary"
              type="submit"
              isDisabled={!data.name?.en}
            >
              {t('classify.apply_button')}
            </Button>
          </FormFooter>
        </ModalFooter>
      </Form>
    </Modal>
  );
};

export default LevelModal;
