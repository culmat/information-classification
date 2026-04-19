import React, { useState } from 'react';
import {
  Button,
  Stack,
  Select,
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  Label,
  UserPicker,
  Textfield,
  Form,
  FormFooter,
  RequiredAsterisk,
} from '@forge/react';
import { localize } from '../../shared/i18n';
import TranslatableField from './TranslatableField';

/**
 * Modal for adding/editing a contact.
 */
const ContactModal = ({ contact, levels, languages, onSave, onClose, t }) => {
  const [data, setData] = useState({ ...contact });
  const update = (field, value) => setData({ ...data, [field]: value });

  return (
    <Modal onClose={onClose}>
      <ModalHeader>
        <ModalTitle>{t('admin.contacts.add_button')}</ModalTitle>
      </ModalHeader>
      <Form onSubmit={() => onSave(data)}>
        <ModalBody>
          <Stack space="space.200">
            <Stack space="space.050">
              <Label labelFor="contact-type">{t('admin.contacts.type')}</Label>
              <Select
                inputId="contact-type"
                value={{
                  label: t(`admin.contacts.type_${data.type}`),
                  value: data.type,
                }}
                options={[
                  { label: t('admin.contacts.type_user'), value: 'user' },
                  { label: t('admin.contacts.type_email'), value: 'email' },
                  { label: t('admin.contacts.type_text'), value: 'text' },
                ]}
                onChange={(option) => update('type', option.value)}
              />
            </Stack>
            <Stack space="space.050">
              <Label labelFor="contact-value">
                {t('admin.contacts.value')}
                <RequiredAsterisk />
              </Label>
              {data.type === 'user' ? (
                <UserPicker
                  id="contact-value"
                  onChange={(user) => update('value', user?.id || '')}
                />
              ) : (
                <Textfield
                  id="contact-value"
                  value={data.value || ''}
                  onChange={(e) => update('value', e.target.value)}
                  placeholder={
                    data.type === 'email'
                      ? 'email@example.com'
                      : 'Security Team'
                  }
                />
              )}
            </Stack>
            <TranslatableField
              languages={languages}
              label={t('admin.contacts.role')}
              obj={data.role}
              onChange={(code, value) =>
                update('role', { ...data.role, [code]: value })
              }
              t={t}
            />
            <Stack space="space.050">
              <Label labelFor="contact-levels">
                {t('admin.contacts.applies_to')}
              </Label>
              <Select
                inputId="contact-levels"
                isMulti
                value={levels
                  .filter((l) => data.levelIds?.includes(l.id))
                  .map((l) => ({
                    label: localize(l.name, 'en'),
                    value: l.id,
                  }))}
                options={levels.map((l) => ({
                  label: localize(l.name, 'en'),
                  value: l.id,
                }))}
                onChange={(options) =>
                  update(
                    'levelIds',
                    (options || []).map((o) => o.value),
                  )
                }
                placeholder={t('admin.contacts.applies_to_all')}
              />
            </Stack>
          </Stack>
        </ModalBody>
        <ModalFooter>
          <FormFooter>
            <Button appearance="subtle" onClick={onClose}>
              {t('classify.cancel_button')}
            </Button>
            <Button appearance="primary" type="submit" isDisabled={!data.value}>
              {t('classify.apply_button')}
            </Button>
          </FormFooter>
        </ModalFooter>
      </Form>
    </Modal>
  );
};

export default ContactModal;
