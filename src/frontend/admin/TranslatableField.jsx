import React from 'react';
import {
  Stack,
  Label,
  Textfield,
  TextArea,
  RequiredAsterisk,
} from '@forge/react';

/**
 * Renders a translatable field (Textfield or TextArea) for each configured language.
 */
const TranslatableField = ({
  languages,
  label,
  obj,
  onChange,
  multiline,
  t,
}) => (
  <>
    {languages.map(({ code }) => (
      <Stack space="space.050" key={code}>
        <Label labelFor={`${label}-${code}`}>
          {label} ({t(`language_names.${code}`)})
          {code === 'en' && <RequiredAsterisk />}
        </Label>
        {multiline ? (
          <TextArea
            id={`${label}-${code}`}
            value={obj?.[code] || ''}
            onChange={(e) => onChange(code, e.target.value)}
          />
        ) : (
          <Textfield
            id={`${label}-${code}`}
            value={obj?.[code] || ''}
            onChange={(e) => onChange(code, e.target.value)}
          />
        )}
      </Stack>
    ))}
  </>
);

export default TranslatableField;
