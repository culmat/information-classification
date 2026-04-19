import React from 'react';
import {
  Stack,
  Inline,
  Text,
  SectionMessage,
  Radio,
  Toggle,
  Spinner,
  Lozenge,
  Label,
} from '@forge/react';
import { colorToLozenge } from '../../shared/constants';
import { localize, interpolate } from '../../shared/i18n';

/**
 * Level radio list + recursive toggle + descendant count.
 * Hidden while a recursive job is active on this page or an ancestor.
 */
const LevelPicker = ({
  config,
  locale,
  t,
  selectedLevel,
  setSelectedLevel,
  asyncJob,
  saving,
  selectedLevelAllowed,
  recursive,
  setRecursive,
  countLoading,
  totalDescendants,
  descendantCount,
  currentLevelId,
}) => (
  <>
    <Stack space="space.075">
      {(config?.levels || []).map((level) => (
        <Inline key={level.id} space="space.100" alignBlock="center">
          <Radio
            testId={`byline-level-${level.id}`}
            value={level.id}
            isChecked={selectedLevel === level.id}
            isDisabled={!!asyncJob || saving}
            onChange={() => setSelectedLevel(level.id)}
            label=""
          />
          <Lozenge isBold appearance={colorToLozenge(level.color)}>
            {localize(level.name, locale)}
          </Lozenge>
          {!level.allowed && <Text>({t('classify.not_allowed')})</Text>}
        </Inline>
      ))}
    </Stack>

    {selectedLevel &&
      (() => {
        const level = config?.levels?.find((l) => l.id === selectedLevel);
        if (!level) return null;

        if (!level.allowed) {
          const customMessage = level.errorMessage
            ? localize(level.errorMessage, locale)
            : '';
          return (
            <SectionMessage appearance="error">
              <Text>{customMessage || t('classify.not_allowed')}</Text>
            </SectionMessage>
          );
        }

        if (level.description) {
          return <Text>{localize(level.description, locale)}</Text>;
        }

        return null;
      })()}

    <Stack space="space.050">
      <Inline space="space.100" alignBlock="center">
        <Toggle
          testId="byline-recursive-toggle"
          id="recursive-toggle"
          isChecked={recursive}
          onChange={() => setRecursive(!recursive)}
          isDisabled={!!asyncJob || saving || !selectedLevelAllowed}
        />
        <Label labelFor="recursive-toggle">
          {t('classify.apply_recursive')}
        </Label>
        {countLoading && <Spinner size="small" />}
      </Inline>
      {recursive && !countLoading && totalDescendants === 0 && (
        <Text>{t('classify.no_subpages')}</Text>
      )}
      {(() => {
        if (!recursive || countLoading || asyncJob || !selectedLevelAllowed)
          return null;
        const currentNeedsUpdate = selectedLevel !== currentLevelId;
        const totalToUpdate =
          (descendantCount || 0) + (currentNeedsUpdate ? 1 : 0);
        if (totalDescendants === 0) return null;
        if (totalToUpdate === 0) {
          return <Text>{t('classify.all_subpages_classified')}</Text>;
        }
        return (
          <Text>
            {interpolate(t('classify.apply_recursive_count'), {
              count: totalToUpdate,
            })}
          </Text>
        );
      })()}
    </Stack>
  </>
);

export default LevelPicker;
