import React from 'react';
import {
  Box,
  Stack,
  Inline,
  Button,
  Text,
  Lozenge,
  SectionMessage,
  xcss,
} from '@forge/react';
import { colorToLozenge } from '../../shared/constants';
import { localize } from '../../shared/i18n';

const sectionStyle = xcss({ paddingTop: 'space.100' });

const ClassificationTab = ({
  t,
  locale,
  currentLevel,
  restrictionWarning,
  canEdit,
  openModal,
}) => (
  <Box xcss={sectionStyle}>
    <Stack space="space.150">
      {currentLevel && (
        <Inline space="space.100" alignBlock="center">
          <Lozenge isBold appearance={colorToLozenge(currentLevel.color)}>
            {localize(currentLevel.name, locale)}
          </Lozenge>
        </Inline>
      )}

      {currentLevel?.description && (
        <Box xcss={sectionStyle}>
          <Text>{localize(currentLevel.description, locale)}</Text>
        </Box>
      )}

      {restrictionWarning === 'requires_protection' && (
        <SectionMessage appearance="warning">
          <Text>{t('classify.requires_protection')}</Text>
          <Text>{t('classify.requires_protection_share')}</Text>
        </SectionMessage>
      )}
      {restrictionWarning === 'has_unnecessary_protection' && (
        <SectionMessage appearance="warning">
          <Text>{t('classify.has_unnecessary_protection')}</Text>
        </SectionMessage>
      )}

      {canEdit && (
        <Box xcss={sectionStyle}>
          <Button
            testId="byline-change"
            appearance="default"
            onClick={openModal}
          >
            {t('byline.change_button')}
          </Button>
        </Box>
      )}
    </Stack>
  </Box>
);

export default ClassificationTab;
