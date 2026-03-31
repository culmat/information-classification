/**
 * Admin configuration page — accessible via Confluence Settings → Information Classification.
 *
 * Four tabs:
 * 1. Levels — manage classification levels (add, edit, delete, reorder)
 * 2. Contacts — manage contact persons (user, email, free text)
 * 3. Links — manage reference links
 * 4. Audit — view statistics and recent classification changes
 */

import React, { useState, useEffect, useCallback } from 'react';
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
  xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { COLOR_OPTIONS, colorToLozenge } from '../shared/constants';

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

const App = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState(null);
  const [auditData, setAuditData] = useState(null);
  const [message, setMessage] = useState(null);

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
        if (configResult.success) setConfig(configResult.config);
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
        setMessage({ type: 'success', text: t('admin.save_success') });
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
            <Lozenge appearance={colorToLozenge(level.color)}>{localize(level.name, 'en')}</Lozenge>
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

  const auditRows = (auditData?.recentEntries || []).map((entry) => ({
    key: String(entry.id),
    cells: [
      { key: 'page', content: <Text>{entry.pageId}</Text> },
      { key: 'from', content: <Text>{entry.previousLevel || '—'}</Text> },
      { key: 'to', content: <Text>{entry.newLevel}</Text> },
      { key: 'by', content: <User accountId={entry.classifiedBy} /> },
      { key: 'date', content: <Text>{new Date(entry.classifiedAt).toLocaleString()}</Text> },
      { key: 'recursive', content: entry.recursive ? <Badge>Yes</Badge> : <Text>No</Text> },
    ],
  }));

  return (
    <Box xcss={containerStyle}>
      <Stack space="space.300">
        <Heading size="large">{t('app.admin_title')}</Heading>

        <Tabs id="admin-tabs">
          <TabList>
            <Tab>{t('admin.tabs.levels')}</Tab>
            <Tab>{t('admin.tabs.contacts')}</Tab>
            <Tab>{t('admin.tabs.links')}</Tab>
            <Tab>{t('admin.tabs.audit')}</Tab>
          </TabList>

          {/* Levels Tab */}
          <TabPanel>
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
          </TabPanel>

          {/* Contacts Tab */}
          <TabPanel>
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
          </TabPanel>

          {/* Links Tab */}
          <TabPanel>
            <Stack space="space.200">
              <Inline space="space.200" alignBlock="center" spread="space-between">
                <Heading size="medium">{t('admin.links.title')}</Heading>
                <Button appearance="primary" onClick={addLink}>{t('admin.links.add_button')}</Button>
              </Inline>

              <DynamicTable
                head={{
                  cells: [
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
          </TabPanel>

          {/* Audit Tab */}
          <TabPanel>
            <Stack space="space.200">
              <Heading size="medium">{t('admin.audit.title')}</Heading>

              {auditData?.statistics && (
                <Inline space="space.400">
                  <Stack space="space.050">
                    <Text>{t('admin.audit.total_changes')}</Text>
                    <Heading size="medium">{auditData.statistics.totalChanges}</Heading>
                  </Stack>
                  <Stack space="space.050">
                    <Text>{t('admin.audit.changes_this_month')}</Text>
                    <Heading size="medium">{auditData.statistics.changesThisMonth}</Heading>
                  </Stack>
                </Inline>
              )}

              <Heading size="small">{t('admin.audit.recent_changes')}</Heading>
              <DynamicTable
                head={{
                  cells: [
                    { key: 'page', content: t('admin.audit.page') },
                    { key: 'from', content: t('admin.audit.from') },
                    { key: 'to', content: t('admin.audit.to') },
                    { key: 'by', content: t('admin.audit.by') },
                    { key: 'date', content: t('admin.audit.date') },
                    { key: 'recursive', content: t('admin.audit.recursive') },
                  ],
                }}
                rows={auditRows}
                emptyView={<Text>No audit entries yet.</Text>}
              />
            </Stack>
          </TabPanel>
        </Tabs>

        {/* Save button and messages */}
        {message && (
          <SectionMessage appearance={message.type === 'error' ? 'error' : 'confirmation'}>
            <Text>{message.text}</Text>
          </SectionMessage>
        )}

        <Button appearance="primary" onClick={handleSave} isLoading={saving}>
          {t('admin.save_button')}
        </Button>
      </Stack>

      {/* Level edit modal */}
      <ModalTransition>
        {showLevelModal && editingLevel && (
          <LevelModal
            level={editingLevel}
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
 * Modal for adding/editing a classification level.
 */
const LevelModal = ({ level, onSave, onClose, t }) => {
  const [data, setData] = useState({ ...level });
  const update = (field, value) => setData({ ...data, [field]: value });
  const updateName = (lang, value) => update('name', { ...data.name, [lang]: value });
  const updateDesc = (lang, value) => update('description', { ...data.description, [lang]: value });
  const updateError = (lang, value) => update('errorMessage', { ...(data.errorMessage || {}), [lang]: value });

  return (
    <Modal onClose={onClose}>
      <ModalHeader>
        <ModalTitle>{data.id ? t('admin.levels.edit_button') : t('admin.levels.add_button')}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <Stack space="space.200">
          <Stack space="space.050">
            <Label labelFor="level-name-en">{t('admin.levels.name')} (English)</Label>
            <Textfield id="level-name-en" value={data.name?.en || ''} onChange={(e) => updateName('en', e.target.value)} />
          </Stack>
          <Stack space="space.050">
            <Label labelFor="level-name-de">{t('admin.levels.name')} (Deutsch)</Label>
            <Textfield id="level-name-de" value={data.name?.de || ''} onChange={(e) => updateName('de', e.target.value)} />
          </Stack>
          <Stack space="space.050">
            <Label labelFor="level-color">{t('admin.levels.color')}</Label>
            <Select
              inputId="level-color"
              value={COLOR_OPTIONS.find((c) => c.value === data.color) || { label: data.color, value: data.color }}
              options={COLOR_OPTIONS}
              onChange={(option) => update('color', option.value)}
            />
            {/* Live preview of the selected color */}
            {data.name?.en && (
              <Inline space="space.100" alignBlock="center">
                <Text>{t('admin.levels.color_preview')}:</Text>
                <Lozenge appearance={colorToLozenge(data.color)}>{data.name.en}</Lozenge>
              </Inline>
            )}
          </Stack>
          <Stack space="space.050">
            <Label labelFor="level-desc-en">{t('admin.levels.description')} (English)</Label>
            <TextArea id="level-desc-en" value={data.description?.en || ''} onChange={(e) => updateDesc('en', e.target.value)} />
          </Stack>
          <Inline space="space.100" alignBlock="center">
            <Toggle id="level-allowed" isChecked={data.allowed} onChange={() => update('allowed', !data.allowed)} />
            <Label labelFor="level-allowed">{t('admin.levels.allowed')}</Label>
          </Inline>
          <Inline space="space.100" alignBlock="center">
            <Toggle id="level-protection" isChecked={data.requiresProtection} onChange={() => update('requiresProtection', !data.requiresProtection)} />
            <Label labelFor="level-protection">{t('admin.levels.requires_protection')}</Label>
          </Inline>
          {!data.allowed && (
            <Stack space="space.050">
              <Label labelFor="level-error-en">{t('admin.levels.error_message')} (English)</Label>
              <TextArea id="level-error-en" value={data.errorMessage?.en || ''} onChange={(e) => updateError('en', e.target.value)} />
            </Stack>
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
const ContactModal = ({ contact, levels, onSave, onClose, t }) => {
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
          <Stack space="space.050">
            <Label labelFor="contact-role-en">{t('admin.contacts.role')} (English)</Label>
            <Textfield
              id="contact-role-en"
              value={data.role?.en || ''}
              onChange={(e) => update('role', { ...data.role, en: e.target.value })}
            />
          </Stack>
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
 */
const LinkModal = ({ link, levels, onSave, onClose, t }) => {
  const [data, setData] = useState({ ...link });
  const update = (field, value) => setData({ ...data, [field]: value });

  return (
    <Modal onClose={onClose}>
      <ModalHeader>
        <ModalTitle>{t('admin.links.add_button')}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <Stack space="space.200">
          <Stack space="space.050">
            <Label labelFor="link-label-en">{t('admin.links.label')} (English)</Label>
            <Textfield
              id="link-label-en"
              value={data.label?.en || ''}
              onChange={(e) => update('label', { ...data.label, en: e.target.value })}
            />
          </Stack>
          <Stack space="space.050">
            <Label labelFor="link-url">{t('admin.links.url')}</Label>
            <Textfield
              id="link-url"
              value={data.url || ''}
              onChange={(e) => update('url', e.target.value)}
              placeholder="https://..."
            />
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
