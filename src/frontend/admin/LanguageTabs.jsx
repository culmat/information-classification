import React from 'react';
import {
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Stack,
  Box,
  Label,
  Textfield,
  TextArea,
  RequiredAsterisk,
  xcss,
} from '@forge/react';

const tabPanelStyle = xcss({
  paddingTop: 'space.200',
  width: '100%',
});

/**
 * Renders a single Tabs strip with one tab per configured language.
 * Each tab panel contains all translatable fields for that language.
 * English is forced first; RequiredAsterisk is only shown on English.
 */
const LanguageTabs = ({ id, languages, fields, t }) => {
  const ordered = [...languages].sort((a, b) =>
    a.code === 'en' ? -1 : b.code === 'en' ? 1 : 0,
  );

  return (
    <Tabs id={id}>
      <TabList>
        {ordered.map(({ code }) => (
          <Tab key={code}>{t(`language_names.${code}`)}</Tab>
        ))}
      </TabList>
      {ordered.map(({ code }) => (
        <TabPanel key={code}>
          <Box xcss={tabPanelStyle}>
            <Stack space="space.200">
              {fields.map((f) => {
                const inputId = `${f.idPrefix}-${code}`;
                return (
                  <Stack space="space.050" key={inputId}>
                    <Label labelFor={inputId}>
                      {f.label}
                      {f.required && code === 'en' && <RequiredAsterisk />}
                    </Label>
                    {f.multiline ? (
                      <TextArea
                        minimumRows={3}
                        id={inputId}
                        value={f.obj?.[code] || ''}
                        onChange={(e) => f.onChange(code, e.target.value)}
                      />
                    ) : (
                      <Textfield
                        id={inputId}
                        value={f.obj?.[code] || ''}
                        onChange={(e) => f.onChange(code, e.target.value)}
                      />
                    )}
                  </Stack>
                );
              })}
            </Stack>
          </Box>
        </TabPanel>
      ))}
    </Tabs>
  );
};

export default LanguageTabs;
