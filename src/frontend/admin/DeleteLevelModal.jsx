import React from 'react';
import {
  Stack,
  Button,
  ButtonGroup,
  Text,
  Label,
  Select,
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  SectionMessage,
} from '@forge/react';
import { localize, interpolate } from '../../shared/i18n';

const DeleteLevelModal = ({
  t,
  config,
  deleteConfirm,
  setDeleteConfirm,
  deleteLoading,
  removeLevelFromConfig,
  handleReclassifyAndDelete,
}) => (
  <Modal onClose={() => setDeleteConfirm(null)}>
    <ModalHeader>
      <ModalTitle>{t('admin.levels.delete_confirm_title')}</ModalTitle>
      <Button appearance="subtle" onClick={() => setDeleteConfirm(null)}>
        ✕
      </Button>
    </ModalHeader>
    <ModalBody>
      <Stack space="space.200">
        <SectionMessage appearance="warning">
          <Text>
            {interpolate(t('admin.levels.delete_confirm_message'), {
              count: deleteConfirm.pageCount,
              level: deleteConfirm.levelName,
            })}
          </Text>
        </SectionMessage>
        <Stack space="space.050">
          <Label labelFor="reclassify-select">
            {t('admin.levels.delete_reclassify_label')}
          </Label>
          <Select
            inputId="reclassify-select"
            options={(config?.levels || [])
              .filter((l) => l.id !== deleteConfirm.levelId)
              .map((l) => ({
                label: localize(l.name, 'en'),
                value: l.id,
              }))}
            onChange={(option) =>
              setDeleteConfirm((prev) => ({
                ...prev,
                reclassifyTo: option?.value || null,
              }))
            }
          />
        </Stack>
      </Stack>
    </ModalBody>
    <ModalFooter>
      <ButtonGroup>
        <Button appearance="subtle" onClick={() => setDeleteConfirm(null)}>
          {t('classify.cancel_button')}
        </Button>
        <Button
          appearance="warning"
          onClick={() => removeLevelFromConfig(deleteConfirm.levelId)}
          isDisabled={deleteLoading}
        >
          {t('admin.levels.delete_anyway_button')}
        </Button>
        <Button
          appearance="primary"
          onClick={handleReclassifyAndDelete}
          isDisabled={!deleteConfirm.reclassifyTo || deleteLoading}
          isLoading={deleteLoading}
        >
          {t('admin.levels.delete_reclassify_button')}
        </Button>
      </ButtonGroup>
    </ModalFooter>
  </Modal>
);

export default DeleteLevelModal;
