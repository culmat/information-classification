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
import LanguageTabs from './LanguageTabs';

/**
 * Modal for adding/editing a classification level.
 */
const LevelModal = ({ level, languages, onSave, onClose, t }) => {
  const [data, setData] = useState({ ...level });
  const update = (field, value) =>
    setData((prev) => ({ ...prev, [field]: value }));

  const fields = [
    {
      idPrefix: 'level-name',
      label: t('admin.levels.name'),
      obj: data.name,
      onChange: (code, value) =>
        setData((prev) => ({
          ...prev,
          name: { ...prev.name, [code]: value },
        })),
      required: true,
    },
    {
      idPrefix: 'level-description',
      label: t('admin.levels.description'),
      obj: data.description,
      onChange: (code, value) =>
        setData((prev) => ({
          ...prev,
          description: { ...prev.description, [code]: value },
        })),
      multiline: true,
    },
  ];
  if (!data.allowed) {
    fields.push({
      idPrefix: 'level-error-message',
      label: t('admin.levels.error_message'),
      obj: data.errorMessage,
      onChange: (code, value) =>
        setData((prev) => ({
          ...prev,
          errorMessage: { ...(prev.errorMessage || {}), [code]: value },
        })),
      multiline: true,
    });
  }

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
            <Inline space="space.100" alignBlock="center">
              <Toggle
                id="level-allowed"
                isChecked={data.allowed}
                onChange={() =>
                  setData((prev) => ({ ...prev, allowed: !prev.allowed }))
                }
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
                  setData((prev) => ({
                    ...prev,
                    requiresProtection: !prev.requiresProtection,
                  }))
                }
              />
              <Label labelFor="level-protection">
                {t('admin.levels.requires_protection')}
              </Label>
            </Inline>
            <LanguageTabs
              id="level-lang-tabs"
              languages={languages}
              fields={fields}
              t={t}
            />
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
