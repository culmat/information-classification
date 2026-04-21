import React, { useState } from 'react';
import {
  Box,
  Stack,
  Inline,
  Heading,
  Text,
  Button,
  Lozenge,
  SectionMessage,
  xcss,
} from '@forge/react';
import { TEMPLATES, buildConfigFromTemplate } from '../../shared/defaults';
import { colorToLozenge } from '../../shared/constants';
import { localize } from '../../shared/i18n';

const containerStyle = xcss({
  padding: 'space.400',
  maxWidth: '720px',
});

const cardStyle = xcss({
  padding: 'space.300',
  borderRadius: 'border.radius.200',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderColor: 'color.border',
  backgroundColor: 'elevation.surface.raised',
});

const BootstrapPanel = ({ t, onApplyTemplate, onSkip, error }) => {
  const [applying, setApplying] = useState(null);

  const handleApply = async (templateId) => {
    setApplying(templateId);
    try {
      await onApplyTemplate(buildConfigFromTemplate(templateId));
    } finally {
      setApplying(null);
    }
  };

  return (
    <Box xcss={containerStyle}>
      <Stack space="space.300">
        <Stack space="space.100">
          <Heading size="large">{t('admin.bootstrap.title')}</Heading>
          <Text>{t('admin.bootstrap.subtitle')}</Text>
        </Stack>

        {error && (
          <SectionMessage appearance="error">
            <Text>{error}</Text>
          </SectionMessage>
        )}

        <Stack space="space.200">
          {Object.entries(TEMPLATES).map(([id, template]) => (
            <Box key={id} xcss={cardStyle}>
              <Stack space="space.150">
                <Inline alignBlock="center" spread="space-between">
                  <Heading size="small">{t(template.labelKey)}</Heading>
                  <Button
                    testId={`admin-bootstrap-apply-${id}`}
                    appearance="primary"
                    isLoading={applying === id}
                    isDisabled={applying !== null && applying !== id}
                    onClick={() => handleApply(id)}
                  >
                    {t('admin.bootstrap.apply_button')}
                  </Button>
                </Inline>
                <Inline space="space.075" shouldWrap>
                  {template.levels.map((level) => (
                    <Lozenge
                      key={level.id}
                      isBold
                      appearance={colorToLozenge(level.color)}
                    >
                      {localize(level.name, 'en')}
                    </Lozenge>
                  ))}
                </Inline>
              </Stack>
            </Box>
          ))}
        </Stack>

        <Inline space="space.100" alignBlock="center">
          <Text>{t('admin.bootstrap.scratch_prompt')}</Text>
          <Button
            testId="admin-bootstrap-scratch"
            appearance="subtle"
            onClick={onSkip}
            isDisabled={applying !== null}
          >
            {t('admin.bootstrap.scratch_button')}
          </Button>
        </Inline>
      </Stack>
    </Box>
  );
};

export default BootstrapPanel;
