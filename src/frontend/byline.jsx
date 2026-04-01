/**
 * Byline frontend — renders the classification badge in the page byline area.
 *
 * User journey:
 * - Viewer: sees colored badge → clicks → popup with level info, contacts, links
 * - Editor: same popup but with "Change Classification" button → opens modal
 *
 * The badge text/icon is rendered by Confluence natively via contentPropertyKey
 * (zero function invocations for page views). The popup content is loaded on click
 * via the getClassification resolver.
 */

import React, { useState, useEffect, useCallback } from 'react';
import ForgeReconciler, {
  useProductContext,
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
  Radio,
  Spinner,
  SectionMessage,
  Modal,
  ModalTransition,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  Toggle,
  Label,
  Link,
  User,
  xcss,
} from '@forge/react';
import { invoke, view } from '@forge/bridge';
import { colorToLozenge } from '../shared/constants';

/**
 * Helper to resolve a localized string from a { lang: text } object.
 * Falls back to English if the user's language isn't available.
 */
function localize(obj, locale) {
  if (!obj || typeof obj === 'string') return obj || '';
  const lang = (locale || 'en').substring(0, 2);
  return obj[lang] || obj.en || Object.values(obj)[0] || '';
}

/**
 * Helper to interpolate {placeholder} values in a string.
 */
function interpolate(template, values) {
  if (!template) return '';
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? `{${key}}`);
}

// Style for the popup content area
const popupContentStyle = xcss({
  padding: 'space.200',
  maxWidth: '400px',
});

const sectionStyle = xcss({
  paddingTop: 'space.100',
});



/**
 * Main byline app component.
 * Wrapped in I18nProvider for translation support.
 */
const App = () => {
  const context = useProductContext();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [classification, setClassification] = useState(null);
  const [config, setConfig] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState(null);
  const [recursive, setRecursive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [restrictionWarning, setRestrictionWarning] = useState(null);

  // Extract page and space info from context
  const pageId = context?.extension?.content?.id;
  const spaceKey = context?.extension?.space?.key;
  const locale = context?.locale || 'en';
  const canEdit = context?.extension?.content?.type === 'page'; // editors see the change button

  // Load classification data when the popup opens
  const loadClassification = useCallback(async () => {
    if (!pageId || !spaceKey) return;
    setLoading(true);
    try {
      const result = await invoke('getClassification', { pageId, spaceKey });
      if (result.success) {
        setClassification(result.classification);
        setConfig(result.config);
        setRestrictionWarning(result.restrictionWarning);
      }
    } catch (error) {
      console.error('Failed to load classification:', error);
    } finally {
      setLoading(false);
    }
  }, [pageId, spaceKey]);

  useEffect(() => {
    loadClassification();
  }, [loadClassification]);

  // Find the current level definition from config
  const currentLevel = config?.levels?.find(
    (l) => l.id === (classification?.level || config?.defaultLevelId)
  );
  const currentLevelId = currentLevel?.id || config?.defaultLevelId || 'internal';

  // Filter contacts and links relevant to the current level
  const relevantContacts = (config?.contacts || []).filter(
    (c) => c.levelIds?.length === 0 || c.levelIds?.includes(currentLevelId)
  );
  const relevantLinks = (config?.links || []).filter(
    (l) => l.levelIds?.length === 0 || l.levelIds?.includes(currentLevelId)
  );

  // Handle classification change submission
  const handleClassify = useCallback(async () => {
    if (!selectedLevel) return;
    setSaving(true);
    setMessage(null);
    try {
      const result = await invoke('setClassification', {
        pageId,
        spaceKey,
        levelId: selectedLevel,
        recursive,
        locale,
      });

      if (result.success) {
        // Build success message
        let msg = t('classify.success');
        if (result.recursiveResult) {
          const { classified, failed, timedOut } = result.recursiveResult;
          if (timedOut || failed > 0) {
            msg = interpolate(t('classify.success_recursive_partial'), { classified, failed });
          } else {
            msg = interpolate(t('classify.success_recursive'), { classified });
          }
        }
        setMessage({ type: 'success', text: msg });

        // If there's a restriction warning, show it after the success message
        if (result.restrictionWarning === 'requires_protection') {
          setMessage({
            type: 'warning',
            text: t('classify.requires_protection'),
          });
        }

        // Reload classification data and close modal
        await loadClassification();
        setShowModal(false);

        // Reload the page to update the byline badge (content property changed)
        view.refresh();
      } else {
        setMessage({ type: 'error', text: result.error || t('classify.error') });
      }
    } catch (error) {
      console.error('Failed to classify:', error);
      setMessage({ type: 'error', text: t('classify.error') });
    } finally {
      setSaving(false);
    }
  }, [pageId, spaceKey, selectedLevel, recursive, locale, t, loadClassification]);

  // Open the classification modal
  const openModal = useCallback(() => {
    setSelectedLevel(currentLevelId);
    setRecursive(false);
    setMessage(null);
    setShowModal(true);
  }, [currentLevelId]);

  if (loading) {
    return <Spinner size="small" />;
  }

  return (
    <Box xcss={popupContentStyle}>
      <Stack space="space.150">
        {/* Current classification level with colored tag */}
        {currentLevel && (
          <Inline space="space.100" alignBlock="center">
            <Lozenge isBold appearance={colorToLozenge(currentLevel.color)}>{localize(currentLevel.name, locale)}</Lozenge>
          </Inline>
        )}

        {/* Level description */}
        {currentLevel?.description && (
          <Box xcss={sectionStyle}>
            <Heading size="xsmall">{t('byline.description')}</Heading>
            <Text>{localize(currentLevel.description, locale)}</Text>
          </Box>
        )}

        {/* Restriction mismatch warning */}
        {restrictionWarning === 'requires_protection' && (
          <SectionMessage appearance="warning">
            <Text>{t('classify.requires_protection')}</Text>
          </SectionMessage>
        )}
        {restrictionWarning === 'has_unnecessary_protection' && (
          <SectionMessage appearance="warning">
            <Text>{t('classify.has_unnecessary_protection')}</Text>
          </SectionMessage>
        )}

        {/* Contacts section */}
        {relevantContacts.length > 0 && (
          <Box xcss={sectionStyle}>
            <Heading size="xsmall">{t('byline.contacts')}</Heading>
            <Stack space="space.050">
              {relevantContacts.map((contact) => (
                <ContactItem key={contact.id} contact={contact} locale={locale} />
              ))}
            </Stack>
          </Box>
        )}

        {/* Links section */}
        {relevantLinks.length > 0 && (
          <Box xcss={sectionStyle}>
            <Heading size="xsmall">{t('byline.links')}</Heading>
            <Stack space="space.050">
              {relevantLinks.map((link) => (
                <Link key={link.id} href={link.url} openNewTab>
                  {localize(link.label, locale)}
                </Link>
              ))}
            </Stack>
          </Box>
        )}

        {/* Change classification button (editors only) */}
        {canEdit && (
          <Box xcss={sectionStyle}>
            <Button appearance="default" onClick={openModal}>
              {t('byline.change_button')}
            </Button>
          </Box>
        )}

        {/* Status message */}
        {message && (
          <SectionMessage appearance={message.type === 'error' ? 'error' : message.type === 'warning' ? 'warning' : 'confirmation'}>
            <Text>{message.text}</Text>
          </SectionMessage>
        )}
      </Stack>

      {/* Classification change modal */}
      <ModalTransition>
        {showModal && (
          <Modal onClose={() => setShowModal(false)}>
            <ModalHeader>
              <ModalTitle>{t('classify.title')}</ModalTitle>
            </ModalHeader>
            <ModalBody>
              <Stack space="space.200">
                {/*
                 * Level picker: each row combines a Radio button (handles selection)
                 * with a colored Lozenge (shows the classification color).
                 * Box onClick is not supported in Forge UI Kit, so Radio onChange
                 * is the only reliable click target.
                 */}
                <Stack space="space.075">
                  {(config?.levels || []).map((level) => (
                    <Inline key={level.id} space="space.100" alignBlock="center">
                      <Radio
                        value={level.id}
                        isChecked={selectedLevel === level.id}
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

                {/* Show description for selected level */}
                {selectedLevel && (() => {
                  const level = config?.levels?.find((l) => l.id === selectedLevel);
                  if (!level) return null;

                  if (!level.allowed && level.errorMessage) {
                    return (
                      <SectionMessage appearance="error">
                        <Text>{localize(level.errorMessage, locale)}</Text>
                      </SectionMessage>
                    );
                  }

                  if (level.description) {
                    return <Text>{localize(level.description, locale)}</Text>;
                  }

                  return null;
                })()}

                {/* Recursive toggle */}
                <Inline space="space.100" alignBlock="center">
                  <Toggle
                    id="recursive-toggle"
                    isChecked={recursive}
                    onChange={() => setRecursive(!recursive)}
                  />
                  <Label labelFor="recursive-toggle">
                    {t('classify.apply_recursive')}
                  </Label>
                </Inline>
              </Stack>
            </ModalBody>
            <ModalFooter>
              <ButtonGroup>
                <Button appearance="subtle" onClick={() => setShowModal(false)}>
                  {t('classify.cancel_button')}
                </Button>
                <Button
                  appearance="primary"
                  onClick={handleClassify}
                  isLoading={saving}
                  isDisabled={
                    !selectedLevel ||
                    saving ||
                    !(config?.levels?.find((l) => l.id === selectedLevel)?.allowed) ||
                    (selectedLevel === currentLevelId && !recursive)
                  }
                >
                  {t('classify.apply_button')}
                </Button>
              </ButtonGroup>
            </ModalFooter>
          </Modal>
        )}
      </ModalTransition>
    </Box>
  );
};

/**
 * Renders a single contact item.
 * Supports user (with avatar), email (as link), and free text types.
 */
const ContactItem = ({ contact, locale }) => {
  const role = localize(contact.role, locale);

  if (contact.type === 'user') {
    return (
      <Inline space="space.100" alignBlock="center">
        <User accountId={contact.value} />
        {role && <Text> — {role}</Text>}
      </Inline>
    );
  }

  if (contact.type === 'email') {
    return (
      <Inline space="space.100">
        <Link href={`mailto:${contact.value}`}>{contact.value}</Link>
        {role && <Text> — {role}</Text>}
      </Inline>
    );
  }

  // Free text
  return (
    <Text>
      {contact.value}{role ? ` — ${role}` : ''}
    </Text>
  );
};

// Mount with I18nProvider for translation support
ForgeReconciler.render(
  <I18nProvider>
    <App />
  </I18nProvider>
);
