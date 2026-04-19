import React, { useState, useRef } from 'react';
import {
  Button,
  Stack,
  Inline,
  Text,
  Spinner,
  Select,
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  Label,
  Textfield,
  Form,
  FormFooter,
  RequiredAsterisk,
} from '@forge/react';
import { requestConfluence } from '@forge/bridge';
import { localize } from '../../shared/i18n';
import TranslatableField from './TranslatableField';

/**
 * Modal for adding/editing a link.
 * Supports two types: "page" (Confluence page search) and "external" (URL).
 */
const LinkModal = ({ link, levels, languages, onSave, onClose, t }) => {
  const [data, setData] = useState({ ...link });
  const update = (field, value) => setData({ ...data, [field]: value });

  // Page search state
  const [pageOptions, setPageOptions] = useState([]);
  const [pageSearchLoading, setPageSearchLoading] = useState(false);
  const [pageSearchQuery, setPageSearchQuery] = useState('');
  const debounceRef = useRef(null);

  const searchPages = (inputValue) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setPageSearchQuery(inputValue || '');
    if (!inputValue || inputValue.length < 2) {
      setPageOptions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setPageSearchLoading(true);
      try {
        const cql = `type=page AND title~"${inputValue.replace(/"/g, '\\"')}*"`;
        const response = await requestConfluence(
          `/wiki/rest/api/content/search?cql=${encodeURIComponent(cql)}&limit=10&expand=space`,
        );
        if (response.ok) {
          const json = await response.json();
          setPageOptions(
            (json.results || []).map((p) => ({
              label: `${p.title}${p.space?.name ? ` — ${p.space.name}` : ''}`,
              value: `${json._links?.base || ''}${p._links?.webui || ''}`,
              pageTitle: p.title,
            })),
          );
        }
      } catch (err) {
        console.error('Page search failed:', err);
      } finally {
        setPageSearchLoading(false);
      }
    }, 300);
  };

  return (
    <Modal onClose={onClose}>
      <ModalHeader>
        <ModalTitle>{t('admin.links.add_button')}</ModalTitle>
      </ModalHeader>
      <Form onSubmit={() => onSave(data)}>
        <ModalBody>
          <Stack space="space.200">
            <Stack space="space.050">
              <Label labelFor="link-type">{t('admin.links.type')}</Label>
              <Select
                inputId="link-type"
                value={{
                  label: t(`admin.links.type_${data.type || 'external'}`),
                  value: data.type || 'external',
                }}
                options={[
                  { label: t('admin.links.type_page'), value: 'page' },
                  { label: t('admin.links.type_external'), value: 'external' },
                ]}
                onChange={(option) => {
                  update('type', option.value);
                  setData((prev) => ({
                    ...prev,
                    type: option.value,
                    url: '',
                    label: prev.label,
                  }));
                  setPageOptions([]);
                }}
              />
            </Stack>
            <TranslatableField
              languages={languages}
              label={t('admin.links.label')}
              obj={data.label}
              onChange={(code, value) =>
                update('label', { ...data.label, [code]: value })
              }
              t={t}
            />
            <Stack space="space.050">
              <Label labelFor="link-url">
                {t('admin.links.url')}
                <RequiredAsterisk />
              </Label>
              {(data.type || 'external') === 'page' ? (
                <>
                  {data.url ? (
                    <Inline
                      space="space.100"
                      alignBlock="center"
                      spread="space-between"
                    >
                      <Text>{data.pageTitle || data.url}</Text>
                      <Button
                        appearance="subtle"
                        onClick={() => {
                          setData((prev) => ({
                            ...prev,
                            url: '',
                            pageTitle: '',
                          }));
                          setPageOptions([]);
                          setPageSearchQuery('');
                        }}
                      >
                        {t('admin.links.change_page')}
                      </Button>
                    </Inline>
                  ) : (
                    <>
                      <Textfield
                        id="link-url"
                        value={pageSearchQuery}
                        onChange={(e) => searchPages(e.target.value)}
                        placeholder={t('admin.links.search_page')}
                      />
                      {pageSearchLoading && <Spinner size="small" />}
                      {pageOptions.length > 0 && (
                        <Stack space="space.050">
                          {pageOptions.map((p) => (
                            <Button
                              key={p.value}
                              appearance="subtle"
                              shouldFitContainer
                              onClick={() => {
                                setData((prev) => ({
                                  ...prev,
                                  url: p.value,
                                  pageTitle: p.pageTitle,
                                  label: {
                                    ...prev.label,
                                    en: prev.label?.en || p.pageTitle || '',
                                  },
                                }));
                                setPageOptions([]);
                                setPageSearchQuery('');
                              }}
                            >
                              {p.label}
                            </Button>
                          ))}
                        </Stack>
                      )}
                      {pageSearchQuery.length >= 2 &&
                        !pageSearchLoading &&
                        pageOptions.length === 0 && (
                          <Text>{t('admin.links.search_page_empty')}</Text>
                        )}
                    </>
                  )}
                </>
              ) : (
                <Textfield
                  id="link-url"
                  value={data.url || ''}
                  onChange={(e) => update('url', e.target.value)}
                  placeholder="https://..."
                />
              )}
            </Stack>
            <Stack space="space.050">
              <Label labelFor="link-levels">
                {t('admin.links.applies_to')}
              </Label>
              <Select
                inputId="link-levels"
                isMulti
                value={levels
                  .filter((l) => data.levelIds?.includes(l.id))
                  .map((l) => ({ label: localize(l.name, 'en'), value: l.id }))}
                options={levels.map((l) => ({
                  label: localize(l.name, 'en'),
                  value: l.id,
                }))}
                onChange={(options) =>
                  update(
                    'levelIds',
                    (options || []).map((o) => o.value),
                  )
                }
                placeholder={t('admin.links.applies_to_all')}
              />
            </Stack>
          </Stack>
        </ModalBody>
        <ModalFooter>
          <FormFooter>
            <Button appearance="subtle" onClick={onClose}>
              {t('classify.cancel_button')}
            </Button>
            <Button
              appearance="primary"
              type="submit"
              isDisabled={!data.url || !data.label?.en}
            >
              {t('classify.apply_button')}
            </Button>
          </FormFooter>
        </ModalFooter>
      </Form>
    </Modal>
  );
};

export default LinkModal;
