import React from 'react';
import {
  Stack,
  Button,
  ButtonGroup,
  Text,
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  SectionMessage,
} from '@forge/react';
import { interpolate } from '../../shared/i18n';

const DeleteLevelModal = ({
  t,
  deleteConfirm,
  setDeleteConfirm,
  deleteLoading,
  removeLevelFromConfig,
  openBulkClassifyFromDelete,
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
        <Text>{t('admin.levels.delete_bulk_classify_hint')}</Text>
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
          onClick={openBulkClassifyFromDelete}
          isDisabled={deleteLoading}
        >
          {t('admin.levels.delete_open_bulk_classify')}
        </Button>
      </ButtonGroup>
    </ModalFooter>
  </Modal>
);

export default DeleteLevelModal;
