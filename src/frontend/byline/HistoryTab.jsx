import React from 'react';
import {
  Box,
  Stack,
  Inline,
  Text,
  Lozenge,
  User,
  EmptyState,
  xcss,
} from '@forge/react';

const sectionStyle = xcss({ paddingTop: 'space.100' });

const historyEntryStyle = xcss({
  paddingBottom: 'space.075',
  borderBottomColor: 'color.border',
  borderBottomWidth: 'border.width',
  borderBottomStyle: 'solid',
});

const HistoryTab = ({
  t,
  history,
  historyEntries,
  levelAppearance,
  formatDate,
}) => (
  <Box xcss={sectionStyle}>
    <Stack space="space.100">
      {history.truncated && <Text>{t('byline.history_truncated')}</Text>}
      {historyEntries.length === 0 && (
        <EmptyState header={t('byline.no_history')} />
      )}
      {historyEntries.map((entry, index) => (
        <Box
          key={entry.id || index}
          xcss={
            index < historyEntries.length - 1 ? historyEntryStyle : undefined
          }
        >
          <Inline space="space.050" alignBlock="center">
            {entry.from && (
              <>
                <Lozenge isBold appearance={levelAppearance(entry.from)}>
                  {entry.from}
                </Lozenge>
                <Text> → </Text>
              </>
            )}
            <Lozenge isBold appearance={levelAppearance(entry.to)}>
              {entry.to}
            </Lozenge>
          </Inline>
          <Text>
            <User accountId={entry.by} /> · {formatDate(entry.at)}
          </Text>
        </Box>
      ))}
    </Stack>
  </Box>
);

export default HistoryTab;
