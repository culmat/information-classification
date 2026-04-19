import React from 'react';
import {
  Box,
  Stack,
  Inline,
  Heading,
  Button,
  ButtonGroup,
  Text,
  Lozenge,
  Select,
  DynamicTable,
  xcss,
} from '@forge/react';
import { SUPPORTED_LANGUAGES } from '../../shared/defaults';

const tabPanelStyle = xcss({ paddingTop: 'space.100' });

const moveLanguage = (setConfig, index, delta) => {
  setConfig((prev) => {
    const langs = [...(prev?.languages || [])];
    const realIndex = index + 1;
    const target = realIndex + delta;
    if (realIndex <= 1 && delta < 0) return prev;
    if (target >= langs.length) return prev;
    const [moved] = langs.splice(realIndex, 1);
    langs.splice(target, 0, moved);
    return { ...prev, languages: langs };
  });
};

const LanguagesTab = ({ t, config, setConfig }) => {
  const extraLangs = (config?.languages || []).filter((l) => l.code !== 'en');
  const addOptions = Object.entries(SUPPORTED_LANGUAGES)
    .filter(([code]) => !(config?.languages || []).some((l) => l.code === code))
    .map(([code]) => ({
      label: `${t(`language_names.${code}`)} (${code})`,
      value: code,
    }));

  return (
    <Box xcss={tabPanelStyle}>
      <Stack space="space.200">
        <Heading size="medium">{t('admin.languages.title')}</Heading>
        <Text>{t('admin.languages.description')}</Text>

        <Inline space="space.100" alignBlock="center">
          <Lozenge appearance="success" isBold>
            {t('language_names.en')} (en)
          </Lozenge>
          <Text>{t('admin.languages.english_required')}</Text>
        </Inline>

        {extraLangs.length > 0 && (
          <DynamicTable
            head={{
              cells: [
                { key: 'code', content: t('admin.languages.language') },
                { key: 'actions', content: '' },
              ],
            }}
            rows={extraLangs.map((lang, index) => ({
              key: lang.code,
              cells: [
                {
                  key: 'code',
                  content: (
                    <Text>
                      {t(`language_names.${lang.code}`)} ({lang.code})
                    </Text>
                  ),
                },
                {
                  key: 'actions',
                  content: (
                    <ButtonGroup>
                      <Button
                        appearance="subtle"
                        onClick={() => moveLanguage(setConfig, index, -1)}
                        isDisabled={index === 0}
                      >
                        {t('admin.levels.move_up')}
                      </Button>
                      <Button
                        appearance="subtle"
                        onClick={() => moveLanguage(setConfig, index, 1)}
                        isDisabled={index === extraLangs.length - 1}
                      >
                        {t('admin.levels.move_down')}
                      </Button>
                      <Button
                        appearance="danger"
                        onClick={() => {
                          const langs = (config?.languages || []).filter(
                            (l) => l.code !== lang.code,
                          );
                          setConfig({ ...config, languages: langs });
                        }}
                      >
                        {t('admin.languages.remove_button')}
                      </Button>
                    </ButtonGroup>
                  ),
                },
              ],
            }))}
          />
        )}

        <Inline space="space.100" alignBlock="center">
          <Select
            inputId="add-language"
            placeholder={t('admin.languages.add_button')}
            options={addOptions}
            onChange={(option) => {
              if (!option) return;
              const existing = (config?.languages || []).some(
                (l) => l.code === option.value,
              );
              if (existing) return;
              setConfig({
                ...config,
                languages: [
                  ...(config?.languages || []),
                  {
                    code: option.value,
                    label: SUPPORTED_LANGUAGES[option.value] || option.value,
                  },
                ],
              });
            }}
            value={null}
          />
        </Inline>
      </Stack>
    </Box>
  );
};

export default LanguagesTab;
