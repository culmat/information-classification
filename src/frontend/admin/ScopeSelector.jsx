import React from 'react';
import { Stack, Inline, Text, Radio, Select } from '@forge/react';

/**
 * Shared scope selector (radio "all" vs "space" + optional multi-space select)
 * used by both the import and export label-sync tabs.
 */
const ScopeSelector = ({
  t,
  testIdPrefix,
  locked,
  scopeAll,
  setScopeAll,
  availableSpaces,
  spaceKeys,
  setSpaceKeys,
  spaceKeysRef,
  onScopeChange,
  onSpaceKeysChange,
}) => (
  <Stack space="space.100">
    <Inline space="space.200" alignBlock="center">
      <Inline space="space.100" alignBlock="center">
        <Radio
          testId={`${testIdPrefix}-scope-all`}
          value="all"
          isChecked={scopeAll}
          isDisabled={locked}
          onChange={() => {
            setScopeAll(true);
            onScopeChange();
          }}
          label=""
        />
        <Text>{t('admin.import.scope_all')}</Text>
      </Inline>
      <Inline space="space.100" alignBlock="center">
        <Radio
          testId={`${testIdPrefix}-scope-space`}
          value="space"
          isChecked={!scopeAll}
          isDisabled={locked}
          onChange={() => {
            setScopeAll(false);
            onScopeChange();
          }}
          label=""
        />
        <Text>{t('admin.import.scope_space')}</Text>
      </Inline>
    </Inline>
    {!scopeAll && (
      <Select
        testId={`${testIdPrefix}-spaces`}
        isMulti
        isDisabled={locked}
        options={availableSpaces}
        value={spaceKeys}
        onChange={(selected) => {
          setSpaceKeys(selected || []);
          setTimeout(() => {
            spaceKeysRef.current = selected || [];
            onSpaceKeysChange();
          }, 50);
        }}
        placeholder={t('admin.import.scope_empty')}
      />
    )}
  </Stack>
);

export default ScopeSelector;
