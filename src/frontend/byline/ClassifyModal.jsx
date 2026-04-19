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
import OwnerJobBanner from './OwnerJobBanner';
import PendingJobsList from './PendingJobsList';
import StopConfirmation from './StopConfirmation';
import LevelPicker from './LevelPicker';
import AsyncProgressBar from './AsyncProgressBar';

const ClassifyModal = ({
  t,
  config,
  locale,
  ownerJob,
  otherJobs,
  asyncJob,
  asyncProgress,
  stopConfirmVisible,
  selectedLevel,
  setSelectedLevel,
  selectedLevelAllowed,
  saving,
  recursive,
  setRecursive,
  countLoading,
  totalDescendants,
  descendantCount,
  currentLevelId,
  activityFrame,
  etaText,
  resolveLevelName,
  levelAppearance,
  resumePendingJob,
  stopPendingJob,
  abandonStop,
  confirmStop,
  requestStop,
  closeModal,
  handleClassify,
  message,
}) => {
  const submitDisabled =
    !selectedLevel ||
    saving ||
    !selectedLevelAllowed ||
    (selectedLevel === currentLevelId && !recursive) ||
    (recursive &&
      !countLoading &&
      (descendantCount === 0 || totalDescendants === 0) &&
      selectedLevel === currentLevelId);

  return (
    <Modal onClose={closeModal}>
      <ModalHeader>
        <ModalTitle>{t('classify.title')}</ModalTitle>
        <Button appearance="subtle" onClick={closeModal}>
          ✕
        </Button>
      </ModalHeader>
      <ModalBody>
        <Stack space="space.200">
          {ownerJob && (
            <OwnerJobBanner
              ownerJob={ownerJob}
              t={t}
              resumePendingJob={resumePendingJob}
              stopPendingJob={stopPendingJob}
              resolveLevelName={resolveLevelName}
              levelAppearance={levelAppearance}
            />
          )}

          {otherJobs.length > 0 && (
            <PendingJobsList
              otherJobs={otherJobs}
              t={t}
              resumePendingJob={resumePendingJob}
              stopPendingJob={stopPendingJob}
              resolveLevelName={resolveLevelName}
              levelAppearance={levelAppearance}
            />
          )}

          {stopConfirmVisible && asyncJob && (
            <StopConfirmation
              asyncJob={asyncJob}
              asyncProgress={asyncProgress}
              t={t}
              abandonStop={abandonStop}
              confirmStop={confirmStop}
              resolveLevelName={resolveLevelName}
            />
          )}

          {!asyncJob && !ownerJob && (
            <LevelPicker
              config={config}
              locale={locale}
              t={t}
              selectedLevel={selectedLevel}
              setSelectedLevel={setSelectedLevel}
              asyncJob={asyncJob}
              saving={saving}
              selectedLevelAllowed={selectedLevelAllowed}
              recursive={recursive}
              setRecursive={setRecursive}
              countLoading={countLoading}
              totalDescendants={totalDescendants}
              descendantCount={descendantCount}
              currentLevelId={currentLevelId}
            />
          )}

          {asyncJob && asyncProgress && (
            <AsyncProgressBar
              asyncJob={asyncJob}
              asyncProgress={asyncProgress}
              activityFrame={activityFrame}
              etaText={etaText}
              resolveLevelName={resolveLevelName}
              t={t}
            />
          )}

          {message &&
            message.type !== 'success' &&
            !(message.type === 'info' && asyncJob) && (
              <SectionMessage
                appearance={message.type === 'error' ? 'error' : 'information'}
              >
                <Text>{message.text}</Text>
              </SectionMessage>
            )}
        </Stack>
      </ModalBody>
      <ModalFooter>
        <ButtonGroup>
          {asyncJob ? (
            <>
              <Button
                testId="byline-stop"
                appearance="subtle"
                onClick={requestStop}
              >
                {t('classify.stop_button')}
              </Button>
              <Button
                testId="byline-pause"
                appearance="primary"
                onClick={closeModal}
              >
                {t('classify.pause_button')}
              </Button>
            </>
          ) : (
            <>
              <Button
                testId="byline-cancel"
                appearance="subtle"
                onClick={closeModal}
              >
                {t('classify.cancel_button')}
              </Button>
              <Button
                testId="byline-classify-submit"
                appearance="primary"
                onClick={handleClassify}
                isLoading={saving}
                isDisabled={submitDisabled}
              >
                {t('classify.apply_button')}
              </Button>
            </>
          )}
        </ButtonGroup>
      </ModalFooter>
    </Modal>
  );
};

export default ClassifyModal;
