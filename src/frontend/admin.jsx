/**
 * Admin configuration page — accessible via Confluence Settings → Information Classification.
 *
 * Four tabs:
 * 1. Levels — manage classification levels (add, edit, delete, reorder)
 * 2. Contacts — manage contact persons (user, email, free text)
 * 3. Links — manage reference links
 * 4. Audit — view statistics and recent classification changes
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import ForgeReconciler, {
  useTranslation,
  I18nProvider,
  Box,
  Text,
  Heading,
  Button,
  ButtonGroup,
  Stack,
  Inline,
  Lozenge,
  Spinner,
  SectionMessage,
  Tabs,
  Tab,
  TabList,
  TabPanel,
  DynamicTable,
  Toggle,
  Textfield,
  TextArea,
  Select,
  Modal,
  ModalTransition,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  Label,
  UserPicker,
  User,
  Badge,
  Link,
  DonutChart,
  xcss,
} from '@forge/react';
import { invoke, requestConfluence, showFlag } from '@forge/bridge';
import { COLOR_OPTIONS, colorToLozenge } from '../shared/constants';
import { SUPPORTED_LANGUAGES } from '../shared/defaults';

/**
 * Helper to resolve a localized string from a { lang: text } object.
 */
function localize(obj, locale) {
  if (!obj || typeof obj === 'string') return obj || '';
  const lang = (locale || 'en').substring(0, 2);
  return obj[lang] || obj.en || Object.values(obj)[0] || '';
}

/**
 * Generates a simple unique ID for new items.
 */
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

const containerStyle = xcss({ padding: 'space.400', maxWidth: '960px' });
/* TabPanel renders no top padding — add it manually (same workaround as byline.jsx). */
const tabPanelStyle = xcss({ paddingTop: 'space.100' });

const App = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState(null);
  const [savedConfig, setSavedConfig] = useState(null);
  const [auditData, setAuditData] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [showUnclassified, setShowUnclassified] = useState(true); // coverage toggle
  const [activeTab, setActiveTab] = useState(0);
  const [message, setMessage] = useState(null);
  const isDirty = config && savedConfig && JSON.stringify(config) !== JSON.stringify(savedConfig);

  // Editing state for level modal
  const [editingLevel, setEditingLevel] = useState(null);
  const [showLevelModal, setShowLevelModal] = useState(false);

  // Editing state for contact modal
  const [editingContact, setEditingContact] = useState(null);
  const [showContactModal, setShowContactModal] = useState(false);

  // Editing state for link modal
  const [editingLink, setEditingLink] = useState(null);
  const [showLinkModal, setShowLinkModal] = useState(false);

  // Load config and audit data on mount — separate calls so config
  // still loads even if audit (SQL-dependent) fails
  useEffect(() => {
    (async () => {
      try {
        const configResult = await invoke('getConfig');
        if (configResult.success) {
          setConfig(configResult.config);
          setSavedConfig(configResult.config);
        }
      } catch (error) {
        console.error('Failed to load config:', error);
        setMessage({ type: 'error', text: t('admin.save_error') });
      }

      try {
        const auditResult = await invoke('getAuditData');
        if (auditResult.success) setAuditData(auditResult);
      } catch (error) {
        console.error('Failed to load audit data (SQL may not be provisioned yet):', error);
      }

      setLoading(false);
    })();
  }, [t]);


  // Save configuration
  const handleSave = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await invoke('setConfig', { config });
      if (result.success) {
        setSavedConfig(config);
        setMessage(null);
        showFlag({
          id: 'config-saved',
          title: t('admin.save_success'),
          type: 'success',
          isAutoDismiss: true,
        });
      } else {
        setMessage({ type: 'error', text: result.error || t('admin.save_error') });
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      setMessage({ type: 'error', text: t('admin.save_error') });
    } finally {
      setSaving(false);
    }
  }, [config, t]);

  // --- Level operations ---
  const addLevel = () => {
    setEditingLevel({
      id: '',
      name: { en: '' },
      color: 'grey',
      description: { en: '' },
      // New levels are appended at the end; array position is the order
      allowed: true,
      requiresProtection: false,
      errorMessage: { en: '' },
    });
    setShowLevelModal(true);
  };

  const editLevel = (level) => {
    setEditingLevel({ ...level });
    setShowLevelModal(true);
  };

  const saveLevel = (level) => {
    const levels = [...(config?.levels || [])];
    const existingIndex = levels.findIndex((l) => l.id === level.id);
    if (existingIndex >= 0) {
      levels[existingIndex] = level;
    } else {
      // New level — generate ID from name if not set
      if (!level.id) {
        level.id = level.name.en.toLowerCase().replace(/[^a-z0-9]/g, '-');
      }
      levels.push(level);
    }
    setConfig({ ...config, levels });
    setShowLevelModal(false);
  };

  const deleteLevel = (levelId) => {
    const levels = (config?.levels || []).filter((l) => l.id !== levelId);
    const updated = { ...config, levels };
    // If default was deleted, pick first allowed
    if (config.defaultLevelId === levelId) {
      const firstAllowed = levels.find((l) => l.allowed);
      updated.defaultLevelId = firstAllowed?.id || levels[0]?.id;
    }
    setConfig(updated);
  };

  const moveLevel = (levelId, direction) => {
    // Use functional update to avoid stale closure issues on rapid clicks.
    // Array position IS the order — no sortOrder field needed.
    setConfig((prev) => {
      const levels = [...(prev?.levels || [])];
      const index = levels.findIndex((l) => l.id === levelId);
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= levels.length) return prev;
      // Splice out and insert at new position
      const [moved] = levels.splice(index, 1);
      levels.splice(newIndex, 0, moved);
      return { ...prev, levels };
    });
  };

  // --- Contact operations ---
  const addContact = () => {
    setEditingContact({
      id: generateId(),
      type: 'email',
      value: '',
      role: { en: '' },
      levelIds: [],
    });
    setShowContactModal(true);
  };

  const editContact = (contact) => {
    setEditingContact({ ...contact });
    setShowContactModal(true);
  };

  const saveContact = (contact) => {
    const contacts = [...(config?.contacts || [])];
    const existingIndex = contacts.findIndex((c) => c.id === contact.id);
    if (existingIndex >= 0) {
      contacts[existingIndex] = contact;
    } else {
      contacts.push(contact);
    }
    setConfig({ ...config, contacts });
    setShowContactModal(false);
  };

  const deleteContact = (contactId) => {
    const contacts = (config?.contacts || []).filter((c) => c.id !== contactId);
    setConfig({ ...config, contacts });
  };

  // --- Link operations ---
  const addLink = () => {
    setEditingLink({
      id: generateId(),
      type: 'external',
      url: '',
      label: { en: '' },
      levelIds: [],
    });
    setShowLinkModal(true);
  };

  const editLink = (link) => {
    setEditingLink({ ...link });
    setShowLinkModal(true);
  };

  const saveLink = (link) => {
    const links = [...(config?.links || [])];
    const existingIndex = links.findIndex((l) => l.id === link.id);
    if (existingIndex >= 0) {
      links[existingIndex] = link;
    } else {
      links.push(link);
    }
    setConfig({ ...config, links });
    setShowLinkModal(false);
  };

  const deleteLink = (linkId) => {
    const links = (config?.links || []).filter((l) => l.id !== linkId);
    setConfig({ ...config, links });
  };

  if (loading) {
    return <Box xcss={containerStyle}><Spinner size="large" /></Box>;
  }

  // --- Table data ---
  // Use numeric keys to prevent DynamicTable from re-sorting rows alphabetically
  const levelRows = (config?.levels || []).map((level, index) => ({
      key: `level-${index}`,
      cells: [
        {
          key: 'color',
          content: (
            <Lozenge isBold appearance={colorToLozenge(level.color)}>{localize(level.name, 'en')}</Lozenge>
          ),
        },
        { key: 'allowed', content: level.allowed ? <Badge appearance="added">Yes</Badge> : <Badge appearance="removed">No</Badge> },
        { key: 'protection', content: level.requiresProtection ? <Badge>Yes</Badge> : <Text>No</Text> },
        {
          key: 'actions',
          content: (
            <ButtonGroup>
              <Button appearance="subtle" onClick={() => moveLevel(level.id, -1)} isDisabled={index === 0}>{t('admin.levels.move_up')}</Button>
              <Button appearance="subtle" onClick={() => moveLevel(level.id, 1)} isDisabled={index === config.levels.length - 1}>{t('admin.levels.move_down')}</Button>
              <Button appearance="subtle" onClick={() => editLevel(level)}>{t('admin.levels.edit_button')}</Button>
              <Button appearance="danger" onClick={() => deleteLevel(level.id)}>{t('admin.levels.delete_button')}</Button>
            </ButtonGroup>
          ),
        },
      ],
    }));

  const contactRows = (config?.contacts || []).map((contact) => ({
    key: contact.id,
    cells: [
      { key: 'type', content: <Text>{t(`admin.contacts.type_${contact.type}`)}</Text> },
      {
        key: 'value',
        content: contact.type === 'user'
          ? <User accountId={contact.value} />
          : <Text>{contact.value}</Text>,
      },
      { key: 'role', content: <Text>{localize(contact.role, 'en')}</Text> },
      {
        key: 'applies',
        content: <Text>{contact.levelIds?.length > 0 ? contact.levelIds.join(', ') : t('admin.contacts.applies_to_all')}</Text>,
      },
      {
        key: 'actions',
        content: (
          <ButtonGroup>
            <Button appearance="subtle" onClick={() => editContact(contact)}>{t('admin.levels.edit_button')}</Button>
            <Button appearance="danger" onClick={() => deleteContact(contact.id)}>{t('admin.levels.delete_button')}</Button>
          </ButtonGroup>
        ),
      },
    ],
  }));

  const linkRows = (config?.links || []).map((link) => ({
    key: link.id,
    cells: [
      { key: 'type', content: <Text>{t(`admin.links.type_${link.type || 'external'}`)}</Text> },
      { key: 'label', content: <Text>{localize(link.label, 'en')}</Text> },
      { key: 'url', content: <Link href={link.url} openNewTab>{link.url}</Link> },
      {
        key: 'applies',
        content: <Text>{link.levelIds?.length > 0 ? link.levelIds.join(', ') : t('admin.links.applies_to_all')}</Text>,
      },
      {
        key: 'actions',
        content: (
          <ButtonGroup>
            <Button appearance="subtle" onClick={() => editLink(link)}>{t('admin.levels.edit_button')}</Button>
            <Button appearance="danger" onClick={() => deleteLink(link.id)}>{t('admin.levels.delete_button')}</Button>
          </ButtonGroup>
        ),
      },
    ],
  }));


  return (
    <Box xcss={containerStyle}>
      <Stack space="space.300">
        <Heading size="large">{t('app.admin_title')}</Heading>

        <Tabs id="admin-tabs" onChange={(index) => setActiveTab(index)}>
          <TabList>
            <Tab>{t('admin.tabs.levels')}</Tab>
            <Tab>{t('admin.tabs.contacts')}</Tab>
            <Tab>{t('admin.tabs.links')}</Tab>
            <Tab>{t('admin.tabs.statistics')}</Tab>
            <Tab>{t('admin.tabs.languages')}</Tab>
          </TabList>

          {/* Levels Tab */}
          <TabPanel>
            <Box xcss={tabPanelStyle}>
            <Stack space="space.200">
              <Inline space="space.200" alignBlock="center" spread="space-between">
                <Heading size="medium">{t('admin.levels.title')}</Heading>
                <Button appearance="primary" onClick={addLevel}>{t('admin.levels.add_button')}</Button>
              </Inline>

              <DynamicTable
                head={{
                  cells: [
                    { key: 'color', content: t('admin.levels.name') },
                    { key: 'allowed', content: t('admin.levels.allowed') },
                    { key: 'protection', content: t('admin.levels.requires_protection') },
                    { key: 'actions', content: '' },
                  ],
                }}
                rows={levelRows}
                emptyView={<Text>No levels configured.</Text>}
              />

              {/* Default level selector */}
              <Inline space="space.100" alignBlock="center">
                <Label labelFor="default-level">{t('admin.levels.default_level')}</Label>
                <Select
                  inputId="default-level"
                  value={config?.levels?.filter((l) => l.id === config.defaultLevelId).map((l) => ({ label: localize(l.name, 'en'), value: l.id }))}
                  options={(config?.levels || [])
                    .filter((l) => l.allowed)
                    .map((l) => ({ label: localize(l.name, 'en'), value: l.id }))}
                  onChange={(option) => setConfig({ ...config, defaultLevelId: option.value })}
                />
              </Inline>
            </Stack>
            </Box>
          </TabPanel>

          {/* Contacts Tab */}
          <TabPanel>
            <Box xcss={tabPanelStyle}>
            <Stack space="space.200">
              <Inline space="space.200" alignBlock="center" spread="space-between">
                <Heading size="medium">{t('admin.contacts.title')}</Heading>
                <Button appearance="primary" onClick={addContact}>{t('admin.contacts.add_button')}</Button>
              </Inline>

              <DynamicTable
                head={{
                  cells: [
                    { key: 'type', content: t('admin.contacts.type') },
                    { key: 'value', content: t('admin.contacts.value') },
                    { key: 'role', content: t('admin.contacts.role') },
                    { key: 'applies', content: t('admin.contacts.applies_to') },
                    { key: 'actions', content: '' },
                  ],
                }}
                rows={contactRows}
                emptyView={<Text>{t('byline.no_contacts')}</Text>}
              />
            </Stack>
            </Box>
          </TabPanel>

          {/* Links Tab */}
          <TabPanel>
            <Box xcss={tabPanelStyle}>
            <Stack space="space.200">
              <Inline space="space.200" alignBlock="center" spread="space-between">
                <Heading size="medium">{t('admin.links.title')}</Heading>
                <Button appearance="primary" onClick={addLink}>{t('admin.links.add_button')}</Button>
              </Inline>

              <DynamicTable
                head={{
                  cells: [
                    { key: 'type', content: t('admin.links.type') },
                    { key: 'label', content: t('admin.links.label') },
                    { key: 'url', content: t('admin.links.url') },
                    { key: 'applies', content: t('admin.links.applies_to') },
                    { key: 'actions', content: '' },
                  ],
                }}
                rows={linkRows}
                emptyView={<Text>{t('byline.no_links')}</Text>}
              />
            </Stack>
            </Box>
          </TabPanel>

          {/* Audit Tab */}
          <TabPanel>
            <Box xcss={tabPanelStyle}>
            <Stack space="space.200">
              <Heading size="medium">{t('admin.audit.title')}</Heading>

              {/* Coverage stats */}
              {auditData && (
                <Inline space="space.400">
                  <Stack space="space.050">
                    <Text>{t('admin.audit.classified_pages')}</Text>
                    <Heading size="medium">{auditData.classifiedPages} / {auditData.totalPages}</Heading>
                  </Stack>
                </Inline>
              )}

              {/* Coverage toggle — keep in sync with the identical toggle
                 in spaceSettings.jsx (Statistics tab). */}
              <Inline space="space.100" alignBlock="center">
                <Toggle
                  id="coverage-toggle"
                  isChecked={showUnclassified}
                  onChange={() => setShowUnclassified(!showUnclassified)}
                />
                <Label labelFor="coverage-toggle">{t('admin.audit.show_unclassified')}</Label>
              </Inline>

              {/* Distribution chart — when "show unclassified" is OFF, unclassified
                 pages are rolled into the default level so the chart always reflects
                 the effective classification of every page.
                 Keep chart logic in sync with spaceSettings.jsx (Statistics tab). */}
              {auditData && auditData.totalPages > 0 && (() => {
                const unclassified = auditData.totalPages - auditData.classifiedPages;
                const chartData = (auditData.distribution || []).map((l) => ({ ...l }));
                if (showUnclassified) {
                  // Show unclassified as a separate slice
                  if (unclassified > 0) {
                    chartData.push({ level: t('admin.audit.unclassified'), count: unclassified });
                  }
                } else if (unclassified > 0 && config?.defaultLevelId) {
                  // Roll unclassified pages into the default level
                  const defaultEntry = chartData.find((d) => d.level === config.defaultLevelId);
                  if (defaultEntry) {
                    defaultEntry.count += unclassified;
                  }
                }
                const filtered = chartData.filter((l) => l.count > 0);
                return filtered.length > 0 ? (
                  <Stack space="space.100">
                    <Heading size="small">{t('admin.audit.distribution')}</Heading>
                    <DonutChart
                      data={filtered}
                      colorAccessor="level"
                      valueAccessor="count"
                      labelAccessor="level"
                    />
                  </Stack>
                ) : null;
              })()}

              {/* Recently classified pages — keep in sync with spaceSettings.jsx.
                 Only show heading + table when there are entries to display. */}
              {(auditData?.recentPages || []).length > 0 && (
                <>
                  <Heading size="small">{t('admin.audit.recent_changes')}</Heading>
                  <DynamicTable
                    head={{
                      cells: [
                        { key: 'title', content: t('admin.audit.page') },
                        { key: 'space', content: t('admin.audit.space') },
                      ],
                    }}
                    rows={auditData.recentPages.map((page, index) => ({
                      key: page.id || String(index),
                      cells: [
                        { key: 'title', content: page.url
                          ? <Link href={`/wiki${page.url}`}>{page.title}</Link>
                          : <Text>{page.title}</Text> },
                        { key: 'space', content: <Text>{page.spaceKey}</Text> },
                      ],
                    }))}
                    rowsPerPage={20}
                  />
                </>
              )}
            </Stack>
            </Box>
          </TabPanel>

          {/* Languages Tab */}
          <TabPanel>
            <Box xcss={tabPanelStyle}>
            <Stack space="space.200">
              <Heading size="medium">{t('admin.languages.title')}</Heading>
              <Text>{t('admin.languages.description')}</Text>

              {/* English is always first and cannot be removed */}
              <Inline space="space.100" alignBlock="center">
                <Lozenge appearance="success" isBold>{t('language_names.en')} (en)</Lozenge>
                <Text>{t('admin.languages.english_required')}</Text>
              </Inline>

              {/* Additional languages */}
              {(() => {
                const extraLangs = (config?.languages || []).filter((l) => l.code !== 'en');
                return extraLangs.length > 0 ? (
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
                        { key: 'code', content: <Text>{t(`language_names.${lang.code}`)} ({lang.code})</Text> },
                        {
                          key: 'actions',
                          content: (
                            <ButtonGroup>
                              <Button
                                appearance="subtle"
                                onClick={() => {
                                  setConfig((prev) => {
                                    const langs = [...(prev?.languages || [])];
                                    const realIndex = index + 1;
                                    if (realIndex <= 1) return prev;
                                    const [moved] = langs.splice(realIndex, 1);
                                    langs.splice(realIndex - 1, 0, moved);
                                    return { ...prev, languages: langs };
                                  });
                                }}
                                isDisabled={index === 0}
                              >
                                {t('admin.levels.move_up')}
                              </Button>
                              <Button
                                appearance="subtle"
                                onClick={() => {
                                  setConfig((prev) => {
                                    const langs = [...(prev?.languages || [])];
                                    const realIndex = index + 1;
                                    if (realIndex >= langs.length - 1) return prev;
                                    const [moved] = langs.splice(realIndex, 1);
                                    langs.splice(realIndex + 1, 0, moved);
                                    return { ...prev, languages: langs };
                                  });
                                }}
                                isDisabled={index === extraLangs.length - 1}
                              >
                                {t('admin.levels.move_down')}
                              </Button>
                              <Button
                                appearance="danger"
                                onClick={() => {
                                  const langs = (config?.languages || []).filter((l) => l.code !== lang.code);
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
                ) : null;
              })()}

              {/* Add language dropdown */}
              <Inline space="space.100" alignBlock="center">
                <Select
                  inputId="add-language"
                  placeholder={t('admin.languages.add_button')}
                  options={Object.entries(SUPPORTED_LANGUAGES)
                    .filter(([code]) => !(config?.languages || []).some((l) => l.code === code))
                    .map(([code]) => ({ label: `${t(`language_names.${code}`)} (${code})`, value: code }))}
                  onChange={(option) => {
                    if (!option) return;
                    const existing = (config?.languages || []).some((l) => l.code === option.value);
                    if (existing) return;
                    setConfig({
                      ...config,
                      languages: [...(config?.languages || []), { code: option.value, label: SUPPORTED_LANGUAGES[option.value] || option.value }],
                    });
                  }}
                  value={null}
                />
              </Inline>
            </Stack>
            </Box>
          </TabPanel>
        </Tabs>

        {/* Save button and messages — hidden on the read-only Statistics tab (index 3) */}
        {activeTab !== 3 && (
          <>
            {message && (
              <SectionMessage appearance={message.type === 'error' ? 'error' : 'confirmation'}>
                <Text>{message.text}</Text>
              </SectionMessage>
            )}

            {isDirty && (
              <SectionMessage appearance="warning">
                <Text>{t('admin.unsaved_changes')}</Text>
              </SectionMessage>
            )}

            <Button appearance="primary" onClick={handleSave} isLoading={saving} isDisabled={!isDirty}>
              {t('admin.save_button')}
            </Button>
          </>
        )}
      </Stack>

      {/* Level edit modal */}
      <ModalTransition>
        {showLevelModal && editingLevel && (
          <LevelModal
            level={editingLevel}
            languages={config?.languages || [{ code: 'en', label: 'English' }]}
            onSave={saveLevel}
            onClose={() => setShowLevelModal(false)}
            t={t}
          />
        )}
      </ModalTransition>

      {/* Contact edit modal */}
      <ModalTransition>
        {showContactModal && editingContact && (
          <ContactModal
            contact={editingContact}
            levels={config?.levels || []}
            languages={config?.languages || [{ code: 'en', label: 'English' }]}
            onSave={saveContact}
            onClose={() => setShowContactModal(false)}
            t={t}
          />
        )}
      </ModalTransition>

      {/* Link edit modal */}
      <ModalTransition>
        {showLinkModal && editingLink && (
          <LinkModal
            link={editingLink}
            levels={config?.levels || []}
            languages={config?.languages || [{ code: 'en', label: 'English' }]}
            onSave={saveLink}
            onClose={() => setShowLinkModal(false)}
            t={t}
          />
        )}
      </ModalTransition>
    </Box>
  );
};

/**
 * Renders a translatable field (Textfield or TextArea) for each configured language.
 */
const TranslatableField = ({ languages, label, obj, onChange, multiline, t }) => (
  <>
    {languages.map(({ code }) => (
      <Stack space="space.050" key={code}>
        <Label labelFor={`${label}-${code}`}>{label} ({t(`language_names.${code}`)}){code === 'en' ? ' *' : ''}</Label>
        {multiline ? (
          <TextArea id={`${label}-${code}`} value={obj?.[code] || ''} onChange={(e) => onChange(code, e.target.value)} />
        ) : (
          <Textfield id={`${label}-${code}`} value={obj?.[code] || ''} onChange={(e) => onChange(code, e.target.value)} />
        )}
      </Stack>
    ))}
  </>
);

/**
 * Modal for adding/editing a classification level.
 */
const LevelModal = ({ level, languages, onSave, onClose, t }) => {
  const [data, setData] = useState({ ...level });
  const update = (field, value) => setData({ ...data, [field]: value });

  return (
    <Modal onClose={onClose}>
      <ModalHeader>
        <ModalTitle>{data.id ? t('admin.levels.edit_button') : t('admin.levels.add_button')}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <Stack space="space.200">
          <TranslatableField
            languages={languages}
            label={t('admin.levels.name')}
            obj={data.name}
            onChange={(code, value) => update('name', { ...data.name, [code]: value })}
            t={t}
          />
          <Stack space="space.050">
            <Label labelFor="level-color">{t('admin.levels.color')}</Label>
            <Select
              inputId="level-color"
              value={COLOR_OPTIONS.find((c) => c.value === data.color) || { label: data.color, value: data.color }}
              options={COLOR_OPTIONS}
              onChange={(option) => update('color', option.value)}
            />
            {data.name?.en && (
              <Inline space="space.100" alignBlock="center">
                <Text>{t('admin.levels.color_preview')}:</Text>
                <Lozenge isBold appearance={colorToLozenge(data.color)}>{data.name.en}</Lozenge>
              </Inline>
            )}
          </Stack>
          <TranslatableField
            languages={languages}
            label={t('admin.levels.description')}
            obj={data.description}
            onChange={(code, value) => update('description', { ...data.description, [code]: value })}
            multiline
            t={t}
          />
          <Inline space="space.100" alignBlock="center">
            <Toggle id="level-allowed" isChecked={data.allowed} onChange={() => update('allowed', !data.allowed)} />
            <Label labelFor="level-allowed">{t('admin.levels.allowed')}</Label>
          </Inline>
          <Inline space="space.100" alignBlock="center">
            <Toggle id="level-protection" isChecked={data.requiresProtection} onChange={() => update('requiresProtection', !data.requiresProtection)} />
            <Label labelFor="level-protection">{t('admin.levels.requires_protection')}</Label>
          </Inline>
          {!data.allowed && (
            <TranslatableField
              languages={languages}
              label={t('admin.levels.error_message')}
              obj={data.errorMessage}
              onChange={(code, value) => update('errorMessage', { ...(data.errorMessage || {}), [code]: value })}
              multiline
              t={t}
            />
          )}
        </Stack>
      </ModalBody>
      <ModalFooter>
        <ButtonGroup>
          <Button appearance="subtle" onClick={onClose}>{t('classify.cancel_button')}</Button>
          <Button appearance="primary" onClick={() => onSave(data)} isDisabled={!data.name?.en}>
            {t('classify.apply_button')}
          </Button>
        </ButtonGroup>
      </ModalFooter>
    </Modal>
  );
};

/**
 * Modal for adding/editing a contact.
 */
const ContactModal = ({ contact, levels, languages, onSave, onClose, t }) => {
  const [data, setData] = useState({ ...contact });
  const update = (field, value) => setData({ ...data, [field]: value });

  return (
    <Modal onClose={onClose}>
      <ModalHeader>
        <ModalTitle>{t('admin.contacts.add_button')}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <Stack space="space.200">
          <Stack space="space.050">
            <Label labelFor="contact-type">{t('admin.contacts.type')}</Label>
            <Select
              inputId="contact-type"
              value={{ label: t(`admin.contacts.type_${data.type}`), value: data.type }}
              options={[
                { label: t('admin.contacts.type_user'), value: 'user' },
                { label: t('admin.contacts.type_email'), value: 'email' },
                { label: t('admin.contacts.type_text'), value: 'text' },
              ]}
              onChange={(option) => update('type', option.value)}
            />
          </Stack>
          <Stack space="space.050">
            <Label labelFor="contact-value">{t('admin.contacts.value')}</Label>
            {data.type === 'user' ? (
              <UserPicker
                id="contact-value"
                onChange={(user) => update('value', user?.id || '')}
              />
            ) : (
              <Textfield
                id="contact-value"
                value={data.value || ''}
                onChange={(e) => update('value', e.target.value)}
                placeholder={data.type === 'email' ? 'email@example.com' : 'Security Team'}
              />
            )}
          </Stack>
          <TranslatableField
            languages={languages}
            label={t('admin.contacts.role')}
            obj={data.role}
            onChange={(code, value) => update('role', { ...data.role, [code]: value })}
            t={t}
          />
          <Stack space="space.050">
            <Label labelFor="contact-levels">{t('admin.contacts.applies_to')}</Label>
            <Select
              inputId="contact-levels"
              isMulti
              value={levels.filter((l) => data.levelIds?.includes(l.id)).map((l) => ({ label: localize(l.name, 'en'), value: l.id }))}
              options={levels.map((l) => ({ label: localize(l.name, 'en'), value: l.id }))}
              onChange={(options) => update('levelIds', (options || []).map((o) => o.value))}
              placeholder={t('admin.contacts.applies_to_all')}
            />
          </Stack>
        </Stack>
      </ModalBody>
      <ModalFooter>
        <ButtonGroup>
          <Button appearance="subtle" onClick={onClose}>{t('classify.cancel_button')}</Button>
          <Button appearance="primary" onClick={() => onSave(data)} isDisabled={!data.value}>
            {t('classify.apply_button')}
          </Button>
        </ButtonGroup>
      </ModalFooter>
    </Modal>
  );
};

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
          `/wiki/rest/api/content/search?cql=${encodeURIComponent(cql)}&limit=10&expand=space`
        );
        if (response.ok) {
          const json = await response.json();
          setPageOptions(
            (json.results || []).map((p) => ({
              label: `${p.title}${p.space?.name ? ` — ${p.space.name}` : ''}`,
              value: `${json._links?.base || ''}${p._links?.webui || ''}`,
              pageTitle: p.title,
            }))
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
      <ModalBody>
        <Stack space="space.200">
          <Stack space="space.050">
            <Label labelFor="link-type">{t('admin.links.type')}</Label>
            <Select
              inputId="link-type"
              value={{ label: t(`admin.links.type_${data.type || 'external'}`), value: data.type || 'external' }}
              options={[
                { label: t('admin.links.type_page'), value: 'page' },
                { label: t('admin.links.type_external'), value: 'external' },
              ]}
              onChange={(option) => {
                update('type', option.value);
                setData((prev) => ({ ...prev, type: option.value, url: '', label: prev.label }));
                setPageOptions([]);
              }}
            />
          </Stack>
          <TranslatableField
            languages={languages}
            label={t('admin.links.label')}
            obj={data.label}
            onChange={(code, value) => update('label', { ...data.label, [code]: value })}
            t={t}
          />
          <Stack space="space.050">
            <Label labelFor="link-url">{t('admin.links.url')}</Label>
            {(data.type || 'external') === 'page' ? (
              <>
                {data.url ? (
                  <Inline space="space.100" alignBlock="center" spread="space-between">
                    <Text>{data.pageTitle || data.url}</Text>
                    <Button
                      appearance="subtle"
                      onClick={() => {
                        setData((prev) => ({ ...prev, url: '', pageTitle: '' }));
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
                    {pageSearchQuery.length >= 2 && !pageSearchLoading && pageOptions.length === 0 && (
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
            <Label labelFor="link-levels">{t('admin.links.applies_to')}</Label>
            <Select
              inputId="link-levels"
              isMulti
              value={levels.filter((l) => data.levelIds?.includes(l.id)).map((l) => ({ label: localize(l.name, 'en'), value: l.id }))}
              options={levels.map((l) => ({ label: localize(l.name, 'en'), value: l.id }))}
              onChange={(options) => update('levelIds', (options || []).map((o) => o.value))}
              placeholder={t('admin.links.applies_to_all')}
            />
          </Stack>
        </Stack>
      </ModalBody>
      <ModalFooter>
        <ButtonGroup>
          <Button appearance="subtle" onClick={onClose}>{t('classify.cancel_button')}</Button>
          <Button appearance="primary" onClick={() => onSave(data)} isDisabled={!data.url || !data.label?.en}>
            {t('classify.apply_button')}
          </Button>
        </ButtonGroup>
      </ModalFooter>
    </Modal>
  );
};

ForgeReconciler.render(
  <I18nProvider>
    <App />
  </I18nProvider>
);
