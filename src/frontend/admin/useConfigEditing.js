import { useState } from 'react';
import { invoke } from '@forge/bridge';
import { localize } from '../../shared/i18n';

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Level/Contact/Link editing state + CRUD handlers. Owns the modal
 * visibility flags, the edit targets, and the delete-confirmation state.
 * Config mutations flow through the caller's `setConfig`.
 *
 * `openBulkClassify(levelId)` (optional) is a callback that jumps to the
 * Bulk Classify admin tab with `sourceLevelFilter` pre-selected. Used by
 * the delete-level modal to direct admins to the replacement flow for the
 * former "Delete & Reclassify" button.
 */
export default function useConfigEditing({
  config,
  setConfig,
  openBulkClassify,
}) {
  const [editingLevel, setEditingLevel] = useState(null);
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteLoading] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [showContactModal, setShowContactModal] = useState(false);
  const [editingLink, setEditingLink] = useState(null);
  const [showLinkModal, setShowLinkModal] = useState(false);

  const removeLevelFromConfig = (levelId) => {
    const levels = (config?.levels || []).filter((l) => l.id !== levelId);
    const updated = { ...config, levels };
    if (config.defaultLevelId === levelId) {
      const firstAllowed = levels.find((l) => l.allowed);
      updated.defaultLevelId = firstAllowed?.id ?? levels[0]?.id ?? null;
    }
    setConfig(updated);
    setDeleteConfirm(null);
  };

  const addLevel = () => {
    setEditingLevel({
      id: '',
      name: { en: '' },
      description: { en: '' },
      color: 'grey',
      allowed: true,
      requiresProtection: false,
    });
    setShowLevelModal(true);
  };

  const editLevel = (level) => {
    setEditingLevel({ ...level });
    setShowLevelModal(true);
  };

  const saveLevel = (level) => {
    if (!level.id) level.id = level.name.en;
    const levels = [...(config?.levels || [])];
    const existingIndex = levels.findIndex((l) => l.id === level.id);
    if (existingIndex >= 0) {
      levels[existingIndex] = level;
    } else {
      levels.push(level);
    }
    // Ensure defaultLevelId always points at an allowed level. Covers the
    // bootstrap-skipped case where the admin adds their first level into an
    // empty config with defaultLevelId=null, and the edge where the previous
    // default was just made disallowed.
    let { defaultLevelId } = config || {};
    const defaultLevel = levels.find((l) => l.id === defaultLevelId);
    if (!defaultLevel || !defaultLevel.allowed) {
      const firstAllowed = levels.find((l) => l.allowed);
      defaultLevelId = firstAllowed?.id ?? levels[0]?.id ?? null;
    }
    setConfig({ ...config, levels, defaultLevelId });
    setShowLevelModal(false);
  };

  const deleteLevel = async (levelId) => {
    const level = (config?.levels || []).find((l) => l.id === levelId);
    const levelName = level ? localize(level.name, 'en') : levelId;
    try {
      const result = await invoke('countLevelUsage', { levelId });
      if (result.success && result.count > 0) {
        setDeleteConfirm({
          levelId,
          levelName,
          pageCount: result.count,
          reclassifyTo: null,
        });
        return;
      }
    } catch (error) {
      console.error('Failed to count level usage:', error);
    }
    removeLevelFromConfig(levelId);
  };

  const openBulkClassifyFromDelete = () => {
    if (!deleteConfirm?.levelId) return;
    const levelId = deleteConfirm.levelId;
    setDeleteConfirm(null);
    if (openBulkClassify) openBulkClassify(levelId);
  };

  const moveLevel = (levelId, direction) => {
    setConfig((prev) => {
      const levels = [...(prev?.levels || [])];
      const index = levels.findIndex((l) => l.id === levelId);
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= levels.length) return prev;
      const [moved] = levels.splice(index, 1);
      levels.splice(newIndex, 0, moved);
      return { ...prev, levels };
    });
  };

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

  return {
    editingLevel,
    showLevelModal,
    setShowLevelModal,
    deleteConfirm,
    setDeleteConfirm,
    deleteLoading,
    editingContact,
    showContactModal,
    setShowContactModal,
    editingLink,
    showLinkModal,
    setShowLinkModal,
    addLevel,
    editLevel,
    saveLevel,
    deleteLevel,
    moveLevel,
    removeLevelFromConfig,
    openBulkClassifyFromDelete,
    addContact,
    editContact,
    saveContact,
    deleteContact,
    addLink,
    editLink,
    saveLink,
    deleteLink,
  };
}
