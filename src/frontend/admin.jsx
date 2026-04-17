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
  ProgressBar,
  EmptyState,
  Tag,
  TagGroup,
  Form,
  FormFooter,
  RequiredAsterisk,
  xcss,
} from '@forge/react';
import { invoke, requestConfluence, showFlag, realtime } from '@forge/bridge';
import {
  COLOR_OPTIONS,
  buildSpaceFilter,
  colorToLozenge,
  normalizeColor,
} from '../shared/constants';
import { SUPPORTED_LANGUAGES } from '../shared/defaults';
import { localize, interpolate, formatEta } from '../shared/i18n';
import StatisticsPanel from './StatisticsPanel';

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
  const context = useProductContext();
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
  const isDirty =
    config &&
    savedConfig &&
    JSON.stringify(config) !== JSON.stringify(savedConfig);

  // Editing state for level modal
  const [editingLevel, setEditingLevel] = useState(null);
  const [showLevelModal, setShowLevelModal] = useState(false);

  // Label import wizard state
  const [importStep, setImportStep] = useState('idle'); // idle | running | done
  const [importLabels, setImportLabels] = useState({}); // { levelId: [{ label, value }] }
  const [importCounts, setImportCounts] = useState({}); // { levelId: number }
  const [importCountLoading, setImportCountLoading] = useState(false);
  const [importLevelLoading, setImportLevelLoading] = useState({}); // { levelId: boolean }
  const [importRemoveLabels, setImportRemoveLabels] = useState(true);
  const [importScopeAll, setImportScopeAll] = useState(true);
  const [importSpaceKeys, setImportSpaceKeys] = useState([]); // [{ label, value }]
  const [availableSpaces, setAvailableSpaces] = useState([]); // [{ label, value }]
  const [availableLabels, setAvailableLabels] = useState([]); // [{ label, value }]
  const [labelsLoading, setLabelsLoading] = useState(false);
  const [importProgress, setImportProgress] = useState(null); // { classified, failed, total, done }

  // Label export state
  const [exportMappings, setExportMappings] = useState({}); // { levelId: labelName }
  const [exportLoading, setExportLoading] = useState(false);
  const [exportProgress, setExportProgress] = useState(null); // { classified, failed, total, done }
  const [exportScopeAll, setExportScopeAll] = useState(true);
  const [exportSpaceKeys, setExportSpaceKeys] = useState([]); // [{ label, value }]
  const [exportCounts, setExportCounts] = useState({}); // { levelId: number }
  const [exportCountLoading, setExportCountLoading] = useState(false);
  const [exportLevelLoading, setExportLevelLoading] = useState({}); // { levelId: boolean }

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { levelId, levelName, pageCount, reclassifyTo }
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Editing state for contact modal
  const [editingContact, setEditingContact] = useState(null);
  const [showContactModal, setShowContactModal] = useState(false);

  // Editing state for link modal
  const [editingLink, setEditingLink] = useState(null);
  const [showLinkModal, setShowLinkModal] = useState(false);

  const refreshAuditData = async () => {
    setAuditLoading(true);
    try {
      const auditResult = await invoke('getAuditData');
      if (auditResult.success) setAuditData(auditResult);
    } catch (error) {
      console.error('Failed to load audit data:', error);
    } finally {
      setAuditLoading(false);
    }
  };

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

      await refreshAuditData();

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
        setMessage({
          type: 'error',
          text: result.error || t('admin.save_error'),
        });
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

  const deleteLevel = async (levelId) => {
    const level = (config?.levels || []).find((l) => l.id === levelId);
    const levelName = level ? localize(level.name, 'en') : levelId;

    // Check if any pages use this level
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
    } catch (_) {
      /* CQL failed — allow delete without warning */
    }

    // No pages use this level — delete immediately
    removeLevelFromConfig(levelId);
  };

  // Label import wizard actions
  // Generate default label selections from level ID + all translations,
  // filtered to only include labels that actually exist in the instance.
  const getDefaultImportLabels = (labelOptions) => {
    const existingNames = new Set(
      (labelOptions || availableLabels).map((o) => o.value),
    );
    const result = {};
    for (const level of (config?.levels || []).filter((l) => l.allowed)) {
      const candidates = new Set();
      candidates.add(level.id);
      if (level.name) {
        for (const val of Object.values(level.name)) {
          if (val) candidates.add(val.toLowerCase());
        }
      }
      result[level.id] = [...candidates]
        .filter((n) => existingNames.has(n))
        .map((n) => ({ label: n, value: n }));
    }
    return result;
  };

  // Initialize import labels and auto-load counts on first render
  const [importInitialized, setImportInitialized] = useState(false);

  // Load available spaces and labels on mount
  useEffect(() => {
    invoke('listSpaces')
      .then((result) => {
        if (result.success && result.spaces) {
          setAvailableSpaces(
            result.spaces.map((s) => ({
              label: `${s.name} (${s.key})`,
              value: s.key,
            })),
          );
        }
      })
      .catch(() => {});
    setLabelsLoading(true);
    invoke('listLabels')
      .then((result) => {
        if (result.success && result.labels) {
          setAvailableLabels(
            result.labels.map((l) => ({ label: l.name, value: l.name })),
          );
        }
      })
      .catch(() => {})
      .finally(() => setLabelsLoading(false));
  }, []);

  // Use refs for scope so debounced callbacks always read latest values
  const importScopeAllRef = useRef(importScopeAll);
  const importSpaceKeysRef = useRef(importSpaceKeys);
  importScopeAllRef.current = importScopeAll;
  importSpaceKeysRef.current = importSpaceKeys;

  // Returns null for "all", comma-separated keys for "space", or '' if space mode but no keys selected
  const getImportSpaceKey = () => {
    if (importScopeAllRef.current) return null;
    const keys = (importSpaceKeysRef.current || [])
      .map((o) => o.value)
      .filter(Boolean);
    return keys.length > 0 ? keys.join(',') : '';
  };

  const refreshImportCounts = async (labelsOverride) => {
    setImportCountLoading(true);
    const allowedLevels = (config?.levels || []).filter((l) => l.allowed);
    const allLevelIds = allowedLevels.map((l) => l.id);
    setImportLevelLoading(
      Object.fromEntries(allLevelIds.map((id) => [id, true])),
    );
    const spaceKey = getImportSpaceKey();

    // Space mode but no valid keys entered — show 0 for all levels
    if (spaceKey === '') {
      setImportCounts(Object.fromEntries(allLevelIds.map((id) => [id, 0])));
      setImportCountLoading(false);
      setImportLevelLoading({});
      return;
    }
    const counts = {};
    const source = labelsOverride || importLabels;
    // One call per level with all its labels — CQL OR deduplicates pages
    const results = await Promise.all(
      allowedLevels.map(async (level) => {
        const labels = (source[level.id] || [])
          .map((o) => o.value)
          .filter(Boolean);
        if (labels.length === 0) return { level: level.id, count: 0 };
        try {
          const result = await invoke('countLabelPages', { labels, spaceKey });
          return { level: level.id, count: result.success ? result.count : 0 };
        } catch (_) {
          return { level: level.id, count: 0 };
        }
      }),
    );
    for (const { level, count } of results) {
      counts[level] = count;
    }
    setImportCounts(counts);
    setImportCountLoading(false);
    setImportLevelLoading({});
  };

  // Auto-refresh on scope change (no debounce needed — Select gives us clean values)
  const onScopeChange = () => {
    // Use setTimeout(0) to let state update propagate to refs
    setTimeout(() => refreshImportCounts(), 50);
  };

  // Per-level auto-refresh with debounce
  const importDebounceRef = useRef({});
  const refreshLevelCount = (levelId, selectedOptions) => {
    clearTimeout(importDebounceRef.current[levelId]);
    importDebounceRef.current[levelId] = setTimeout(async () => {
      setImportLevelLoading((prev) => ({ ...prev, [levelId]: true }));
      const spaceKey = getImportSpaceKey();
      if (spaceKey === '') {
        setImportCounts((prev) => ({ ...prev, [levelId]: 0 }));
        setImportLevelLoading((prev) => ({ ...prev, [levelId]: false }));
        return;
      }
      const labels = (selectedOptions || [])
        .map((o) => o.value)
        .filter(Boolean);
      if (labels.length === 0) {
        setImportCounts((prev) => ({ ...prev, [levelId]: 0 }));
        setImportLevelLoading((prev) => ({ ...prev, [levelId]: false }));
        return;
      }
      let total = 0;
      try {
        const result = await invoke('countLabelPages', { labels, spaceKey });
        total = result.success ? result.count : 0;
      } catch (_) {}
      setImportCounts((prev) => ({ ...prev, [levelId]: total }));
      setImportLevelLoading((prev) => ({ ...prev, [levelId]: false }));
    }, 600);
  };

  useEffect(() => {
    if (
      config &&
      !labelsLoading &&
      availableLabels.length >= 0 &&
      !importInitialized
    ) {
      const defaults = getDefaultImportLabels(availableLabels);
      setImportLabels(defaults);
      setImportInitialized(true);
      if (Object.keys(defaults).length > 0) {
        refreshImportCounts(defaults);
      }
    }
  }, [config, importInitialized, labelsLoading, availableLabels]);

  // Subscribe to Realtime progress for import — subscribe once, persist via ref
  const importSubRef = useRef(null);
  useEffect(() => {
    if (importStep !== 'running') return;
    // Clean up any previous subscription
    if (importSubRef.current) {
      importSubRef.current.unsubscribe();
      importSubRef.current = null;
    }
    realtime
      .subscribeGlobal('classification-progress:label-import', (data) => {
        setImportProgress((prev) => ({ ...prev, ...data }));
        if (data.done) {
          setImportStep('done');
          refreshImportCounts();
          if (importSubRef.current) {
            importSubRef.current.unsubscribe();
            importSubRef.current = null;
          }
        }
      })
      .then((sub) => {
        importSubRef.current = sub;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importStep === 'running']);

  // Subscribe to Realtime progress for export — subscribe once, persist via ref
  const exportSubRef = useRef(null);
  const [exportListening, setExportListening] = useState(false);
  useEffect(() => {
    if (!exportListening) return;
    if (exportSubRef.current) {
      exportSubRef.current.unsubscribe();
      exportSubRef.current = null;
    }
    realtime
      .subscribeGlobal('classification-progress:label-export', (data) => {
        setExportProgress((prev) => ({ ...prev, ...data }));
        if (data.done) {
          setExportLoading(false);
          setExportListening(false);
          if (exportSubRef.current) {
            exportSubRef.current.unsubscribe();
            exportSubRef.current = null;
          }
        }
      })
      .then((sub) => {
        exportSubRef.current = sub;
      });
  }, [exportListening]);

  // Export page count helpers (mirrors import count pattern)
  const exportScopeAllRef = useRef(exportScopeAll);
  const exportSpaceKeysRef = useRef(exportSpaceKeys);
  exportScopeAllRef.current = exportScopeAll;
  exportSpaceKeysRef.current = exportSpaceKeys;

  const getExportSpaceKey = () => {
    if (exportScopeAllRef.current) return null;
    const keys = (exportSpaceKeysRef.current || [])
      .map((o) => o.value)
      .filter(Boolean);
    return keys.length > 0 ? keys.join(',') : '';
  };

  const refreshExportCounts = async () => {
    setExportCountLoading(true);
    const allLevels = config?.levels || [];
    const allLevelIds = allLevels.map((l) => l.id);
    setExportLevelLoading(
      Object.fromEntries(allLevelIds.map((id) => [id, true])),
    );
    const spaceKey = getExportSpaceKey();

    // Space mode but no valid keys entered — show 0 for all levels
    if (spaceKey === '') {
      setExportCounts(Object.fromEntries(allLevelIds.map((id) => [id, 0])));
      setExportCountLoading(false);
      setExportLevelLoading({});
      return;
    }

    const results = await Promise.all(
      allLevels.map(async (level) => {
        try {
          const result = await invoke('countLevelUsage', {
            levelId: level.id,
            spaceKey,
          });
          return { level: level.id, count: result.success ? result.count : 0 };
        } catch (_) {
          return { level: level.id, count: 0 };
        }
      }),
    );
    const counts = {};
    for (const { level, count } of results) {
      counts[level] = count;
    }
    setExportCounts(counts);
    setExportCountLoading(false);
    setExportLevelLoading({});
  };

  // Auto-refresh export counts when config loads
  const [exportCountsInitialized, setExportCountsInitialized] = useState(false);
  useEffect(() => {
    if (config && !exportCountsInitialized) {
      setExportCountsInitialized(true);
      refreshExportCounts();
    }
  }, [config, exportCountsInitialized]);

  const startImport = async () => {
    // Build mappings from the label inputs
    const mappings = (config?.levels || [])
      .filter((l) => l.allowed)
      .map((level) => ({
        levelId: level.id,
        labels: (importLabels[level.id] || [])
          .map((o) => o.value)
          .filter(Boolean),
      }))
      .filter((m) => m.labels.length > 0);

    if (mappings.length === 0) return;

    setImportStep('running');
    setImportProgress({
      classified: 0,
      failed: 0,
      total: 0,
      done: false,
      startedAt: Date.now(),
    });
    try {
      const spaceKey = getImportSpaceKey() || null;
      const result = await invoke('startLabelImport', {
        mappings,
        removeLabels: importRemoveLabels,
        spaceKey,
      });
      setImportProgress((prev) => ({ ...prev, total: result.count || 0 }));
    } catch (error) {
      console.error('Import failed:', error);
      setImportStep('idle');
      setImportProgress(null);
    }
  };

  const startExport = async () => {
    const mappings = (config?.levels || [])
      .map((level) => ({
        levelId: level.id,
        labelName: (exportMappings[level.id] !== undefined
          ? exportMappings[level.id]
          : level.id
        ).trim(),
      }))
      .filter((m) => m.labelName.length > 0);
    setExportLoading(true);
    setExportProgress({ classified: 0, failed: 0, total: 0, done: false });
    try {
      const exportKeys = exportScopeAll
        ? null
        : (exportSpaceKeys || []).map((o) => o.value).join(',') || null;
      const result = await invoke('startLabelExport', {
        mappings,
        spaceKey: exportKeys,
      });
      if (result.success) {
        setExportProgress({
          classified: 0,
          failed: 0,
          total: result.count || 0,
          done: false,
          startedAt: Date.now(),
        });
        setExportListening(true);
      } else {
        setExportProgress(null);
        setExportLoading(false);
      }
    } catch (error) {
      console.error('Export failed:', error);
      setExportProgress(null);
      setExportLoading(false);
    }
  };

  const removeLevelFromConfig = (levelId) => {
    const levels = (config?.levels || []).filter((l) => l.id !== levelId);
    const updated = { ...config, levels };
    if (config.defaultLevelId === levelId) {
      const firstAllowed = levels.find((l) => l.allowed);
      updated.defaultLevelId = firstAllowed?.id || levels[0]?.id;
    }
    setConfig(updated);
    setDeleteConfirm(null);
  };

  const handleReclassifyAndDelete = async () => {
    if (!deleteConfirm?.reclassifyTo) return;
    setDeleteLoading(true);
    try {
      await invoke('reclassifyLevel', {
        fromLevelId: deleteConfirm.levelId,
        toLevelId: deleteConfirm.reclassifyTo,
      });
      removeLevelFromConfig(deleteConfirm.levelId);
      showFlag({
        id: 'reclassify-started',
        title: t('admin.levels.delete_reclassifying'),
        type: 'info',
        isAutoDismiss: true,
      });
    } catch (error) {
      console.error('Failed to reclassify:', error);
    } finally {
      setDeleteLoading(false);
    }
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

  // License check: only enforce in production where Marketplace injects license info.
  const licensed =
    context?.environmentType !== 'PRODUCTION' ||
    context?.license?.active === true;

  if (loading) {
    return (
      <Box xcss={containerStyle}>
        <Spinner size="large" />
      </Box>
    );
  }

  if (!licensed) {
    return (
      <Box xcss={containerStyle}>
        <SectionMessage
          appearance="warning"
          title={t('license.inactive_title')}
        >
          <Text>{t('license.inactive_message')}</Text>
        </SectionMessage>
      </Box>
    );
  }

  // --- Table data ---
  // Use numeric keys to prevent DynamicTable from re-sorting rows alphabetically
  const levelRows = (config?.levels || []).map((level, index) => ({
    key: `level-${index}`,
    cells: [
      {
        key: 'color',
        content: (
          <Lozenge isBold appearance={colorToLozenge(level.color)}>
            {localize(level.name, 'en')}
          </Lozenge>
        ),
      },
      {
        key: 'allowed',
        content: level.allowed ? (
          <Badge appearance="added">Yes</Badge>
        ) : (
          <Badge appearance="removed">No</Badge>
        ),
      },
      {
        key: 'protection',
        content: level.requiresProtection ? (
          <Badge>Yes</Badge>
        ) : (
          <Text>No</Text>
        ),
      },
      {
        key: 'actions',
        content: (
          <ButtonGroup>
            <Button
              appearance="subtle"
              onClick={() => moveLevel(level.id, -1)}
              isDisabled={index === 0}
            >
              {t('admin.levels.move_up')}
            </Button>
            <Button
              appearance="subtle"
              onClick={() => moveLevel(level.id, 1)}
              isDisabled={index === config.levels.length - 1}
            >
              {t('admin.levels.move_down')}
            </Button>
            <Button appearance="subtle" onClick={() => editLevel(level)}>
              {t('admin.levels.edit_button')}
            </Button>
            <Button appearance="danger" onClick={() => deleteLevel(level.id)}>
              {t('admin.levels.delete_button')}
            </Button>
          </ButtonGroup>
        ),
      },
    ],
  }));

  const contactRows = (config?.contacts || []).map((contact) => ({
    key: contact.id,
    cells: [
      {
        key: 'type',
        content: <Text>{t(`admin.contacts.type_${contact.type}`)}</Text>,
      },
      {
        key: 'value',
        content:
          contact.type === 'user' ? (
            <User accountId={contact.value} />
          ) : (
            <Text>{contact.value}</Text>
          ),
      },
      { key: 'role', content: <Text>{localize(contact.role, 'en')}</Text> },
      {
        key: 'applies',
        content:
          contact.levelIds?.length > 0 ? (
            <TagGroup>
              {contact.levelIds.map((id) => {
                const level = (config?.levels || []).find((l) => l.id === id);
                return (
                  <Tag
                    key={id}
                    text={level ? localize(level.name, 'en') : id}
                    color={level ? normalizeColor(level.color) : 'standard'}
                  />
                );
              })}
            </TagGroup>
          ) : (
            <Tag text={t('admin.contacts.applies_to_all')} color="standard" />
          ),
      },
      {
        key: 'actions',
        content: (
          <ButtonGroup>
            <Button appearance="subtle" onClick={() => editContact(contact)}>
              {t('admin.levels.edit_button')}
            </Button>
            <Button
              appearance="danger"
              onClick={() => deleteContact(contact.id)}
            >
              {t('admin.levels.delete_button')}
            </Button>
          </ButtonGroup>
        ),
      },
    ],
  }));

  const linkRows = (config?.links || []).map((link) => ({
    key: link.id,
    cells: [
      {
        key: 'type',
        content: (
          <Text>{t(`admin.links.type_${link.type || 'external'}`)}</Text>
        ),
      },
      { key: 'label', content: <Text>{localize(link.label, 'en')}</Text> },
      {
        key: 'url',
        content: (
          <Link href={link.url} openNewTab>
            {link.url}
          </Link>
        ),
      },
      {
        key: 'applies',
        content:
          link.levelIds?.length > 0 ? (
            <TagGroup>
              {link.levelIds.map((id) => {
                const level = (config?.levels || []).find((l) => l.id === id);
                return (
                  <Tag
                    key={id}
                    text={level ? localize(level.name, 'en') : id}
                    color={level ? normalizeColor(level.color) : 'standard'}
                  />
                );
              })}
            </TagGroup>
          ) : (
            <Tag text={t('admin.links.applies_to_all')} color="standard" />
          ),
      },
      {
        key: 'actions',
        content: (
          <ButtonGroup>
            <Button appearance="subtle" onClick={() => editLink(link)}>
              {t('admin.levels.edit_button')}
            </Button>
            <Button appearance="danger" onClick={() => deleteLink(link.id)}>
              {t('admin.levels.delete_button')}
            </Button>
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
            <Tab>{t('admin.tabs.statistics')}</Tab>
            <Tab>{t('admin.tabs.levels')}</Tab>
            <Tab>{t('admin.tabs.contacts')}</Tab>
            <Tab>{t('admin.tabs.links')}</Tab>
            <Tab>{t('admin.tabs.languages')}</Tab>
            <Tab>{t('admin.tabs.labels')}</Tab>
          </TabList>

          {/* Statistics Tab — visuals come from shared StatisticsPanel;
              keep props in sync with spaceSettings.jsx and statsMacro.jsx */}
          <TabPanel>
            <StatisticsPanel
              data={auditData}
              levels={config?.levels}
              defaultLevelId={config?.defaultLevelId}
              showUnclassified={showUnclassified}
              onToggleUnclassified={() =>
                setShowUnclassified(!showUnclassified)
              }
              isLoading={auditLoading}
              onRefresh={refreshAuditData}
              spaceFilter=""
              showSpaceColumn
              t={t}
            />
          </TabPanel>

          {/* Levels Tab */}
          <TabPanel>
            <Box xcss={tabPanelStyle}>
              <Stack space="space.200">
                <Inline
                  space="space.200"
                  alignBlock="center"
                  spread="space-between"
                >
                  <Heading size="medium">{t('admin.levels.title')}</Heading>
                  <Button appearance="primary" onClick={addLevel}>
                    {t('admin.levels.add_button')}
                  </Button>
                </Inline>

                <DynamicTable
                  head={{
                    cells: [
                      { key: 'color', content: t('admin.levels.name') },
                      { key: 'allowed', content: t('admin.levels.allowed') },
                      {
                        key: 'protection',
                        content: t('admin.levels.requires_protection'),
                      },
                      { key: 'actions', content: '' },
                    ],
                  }}
                  rows={levelRows}
                  emptyView={<EmptyState header={t('admin.levels.empty')} />}
                />

                {/* Default level selector */}
                <Inline space="space.100" alignBlock="center">
                  <Label labelFor="default-level">
                    {t('admin.levels.default_level')}
                  </Label>
                  <Select
                    inputId="default-level"
                    value={config?.levels
                      ?.filter((l) => l.id === config.defaultLevelId)
                      .map((l) => ({
                        label: localize(l.name, 'en'),
                        value: l.id,
                      }))}
                    options={(config?.levels || [])
                      .filter((l) => l.allowed)
                      .map((l) => ({
                        label: localize(l.name, 'en'),
                        value: l.id,
                      }))}
                    onChange={(option) =>
                      setConfig({ ...config, defaultLevelId: option.value })
                    }
                  />
                </Inline>
              </Stack>
            </Box>
          </TabPanel>

          {/* Contacts Tab */}
          <TabPanel>
            <Box xcss={tabPanelStyle}>
              <Stack space="space.200">
                <Inline
                  space="space.200"
                  alignBlock="center"
                  spread="space-between"
                >
                  <Heading size="medium">{t('admin.contacts.title')}</Heading>
                  <Button appearance="primary" onClick={addContact}>
                    {t('admin.contacts.add_button')}
                  </Button>
                </Inline>

                <DynamicTable
                  head={{
                    cells: [
                      { key: 'type', content: t('admin.contacts.type') },
                      { key: 'value', content: t('admin.contacts.value') },
                      { key: 'role', content: t('admin.contacts.role') },
                      {
                        key: 'applies',
                        content: t('admin.contacts.applies_to'),
                      },
                      { key: 'actions', content: '' },
                    ],
                  }}
                  rows={contactRows}
                  emptyView={<EmptyState header={t('byline.no_contacts')} />}
                />
              </Stack>
            </Box>
          </TabPanel>

          {/* Links Tab */}
          <TabPanel>
            <Box xcss={tabPanelStyle}>
              <Stack space="space.200">
                <Inline
                  space="space.200"
                  alignBlock="center"
                  spread="space-between"
                >
                  <Heading size="medium">{t('admin.links.title')}</Heading>
                  <Button appearance="primary" onClick={addLink}>
                    {t('admin.links.add_button')}
                  </Button>
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
                  emptyView={<EmptyState header={t('byline.no_links')} />}
                />
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
                  <Lozenge appearance="success" isBold>
                    {t('language_names.en')} (en)
                  </Lozenge>
                  <Text>{t('admin.languages.english_required')}</Text>
                </Inline>

                {/* Additional languages */}
                {(() => {
                  const extraLangs = (config?.languages || []).filter(
                    (l) => l.code !== 'en',
                  );
                  return extraLangs.length > 0 ? (
                    <DynamicTable
                      head={{
                        cells: [
                          {
                            key: 'code',
                            content: t('admin.languages.language'),
                          },
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
                                  onClick={() => {
                                    setConfig((prev) => {
                                      const langs = [
                                        ...(prev?.languages || []),
                                      ];
                                      const realIndex = index + 1;
                                      if (realIndex <= 1) return prev;
                                      const [moved] = langs.splice(
                                        realIndex,
                                        1,
                                      );
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
                                      const langs = [
                                        ...(prev?.languages || []),
                                      ];
                                      const realIndex = index + 1;
                                      if (realIndex >= langs.length - 1)
                                        return prev;
                                      const [moved] = langs.splice(
                                        realIndex,
                                        1,
                                      );
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
                                    const langs = (
                                      config?.languages || []
                                    ).filter((l) => l.code !== lang.code);
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
                      .filter(
                        ([code]) =>
                          !(config?.languages || []).some(
                            (l) => l.code === code,
                          ),
                      )
                      .map(([code]) => ({
                        label: `${t(`language_names.${code}`)} (${code})`,
                        value: code,
                      }))}
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
                            label:
                              SUPPORTED_LANGUAGES[option.value] || option.value,
                          },
                        ],
                      });
                    }}
                    value={null}
                  />
                </Inline>
              </Stack>
            </Box>
          </TabPanel>

          {/* Labels Tab — Import & Export as sub-tabs */}
          <TabPanel>
            <Box xcss={tabPanelStyle}>
              <Tabs id="labels-subtabs">
                <TabList>
                  <Tab>{t('admin.import.title')}</Tab>
                  <Tab>{t('admin.export.title')}</Tab>
                </TabList>

                {/* Import sub-tab */}
                <TabPanel>
                  <Box xcss={tabPanelStyle}>
                    <Stack space="space.200">
                      <DynamicTable
                        head={{
                          cells: [
                            {
                              key: 'level',
                              content: t('admin.import.level_column'),
                            },
                            {
                              key: 'labels',
                              content: t('admin.import.labels_column'),
                            },
                            {
                              key: 'pages',
                              content: (
                                <Inline space="space.050" alignBlock="center">
                                  <Text>{t('admin.import.pages_column')}</Text>
                                  <Button
                                    appearance="subtle"
                                    spacing="compact"
                                    iconBefore="refresh"
                                    isLoading={importCountLoading}
                                    onClick={() => refreshImportCounts()}
                                  >
                                    {' '}
                                  </Button>
                                </Inline>
                              ),
                            },
                          ],
                        }}
                        rows={(config?.levels || [])
                          .filter((l) => l.allowed)
                          .map((level) => {
                            const count = importCounts[level.id];
                            const selected = importLabels[level.id] || [];
                            const labels = selected
                              .map((o) => o.value)
                              .filter(Boolean);
                            const selectedKeys = importScopeAll
                              ? []
                              : (importSpaceKeys || []).map((o) => o.value);
                            const spaceFilter = buildSpaceFilter(
                              selectedKeys.join(','),
                            );
                            const cql =
                              labels.length > 0
                                ? `type=page AND (${labels.map((l) => `label = "${l}"`).join(' OR ')})${spaceFilter}`
                                : null;
                            return {
                              key: level.id,
                              cells: [
                                {
                                  key: 'level',
                                  content: (
                                    <Lozenge
                                      isBold
                                      appearance={colorToLozenge(level.color)}
                                    >
                                      {level.id}
                                    </Lozenge>
                                  ),
                                },
                                {
                                  key: 'labels',
                                  content: (
                                    <Select
                                      isMulti
                                      isSearchable
                                      isClearable
                                      spacing="compact"
                                      isLoading={labelsLoading}
                                      options={availableLabels}
                                      value={selected}
                                      onChange={(val) => {
                                        const newVal = val || [];
                                        setImportLabels((prev) => ({
                                          ...prev,
                                          [level.id]: newVal,
                                        }));
                                        refreshLevelCount(level.id, newVal);
                                      }}
                                      placeholder={t(
                                        'admin.import.labels_placeholder',
                                      )}
                                    />
                                  ),
                                },
                                {
                                  key: 'pages',
                                  content: importLevelLoading[level.id] ? (
                                    <Spinner size="small" />
                                  ) : count !== undefined && cql ? (
                                    <Text>
                                      <Link
                                        href={`/wiki/search?cql=${encodeURIComponent(cql)}`}
                                        openNewTab
                                      >
                                        {count}
                                      </Link>
                                    </Text>
                                  ) : (
                                    <Text>
                                      {count !== undefined
                                        ? String(count)
                                        : '—'}
                                    </Text>
                                  ),
                                },
                              ],
                            };
                          })}
                      />

                      {/* Info message when no pages match selected labels */}
                      {!importCountLoading &&
                        Object.values(importCounts).reduce(
                          (s, c) => s + c,
                          0,
                        ) === 0 &&
                        Object.values(importLabels).some(
                          (arr) => (arr || []).length > 0,
                        ) && (
                          <SectionMessage appearance="information">
                            <Text>{t('admin.import.no_pages_found')}</Text>
                          </SectionMessage>
                        )}

                      {/* Scope selector */}
                      <Stack space="space.100">
                        <Inline space="space.200" alignBlock="center">
                          <Inline space="space.100" alignBlock="center">
                            <Radio
                              value="all"
                              isChecked={importScopeAll}
                              onChange={() => {
                                setImportScopeAll(true);
                                onScopeChange();
                              }}
                              label=""
                            />
                            <Text>{t('admin.import.scope_all')}</Text>
                          </Inline>
                          <Inline space="space.100" alignBlock="center">
                            <Radio
                              value="space"
                              isChecked={!importScopeAll}
                              onChange={() => {
                                setImportScopeAll(false);
                                onScopeChange();
                              }}
                              label=""
                            />
                            <Text>{t('admin.import.scope_space')}</Text>
                          </Inline>
                        </Inline>
                        {!importScopeAll && (
                          <Select
                            isMulti
                            options={availableSpaces}
                            value={importSpaceKeys}
                            onChange={(selected) => {
                              setImportSpaceKeys(selected || []);
                              setTimeout(() => {
                                importSpaceKeysRef.current = selected || [];
                                refreshImportCounts();
                              }, 50);
                            }}
                            placeholder={t('admin.import.scope_empty')}
                          />
                        )}
                      </Stack>

                      {/* Remove labels option */}
                      <Inline space="space.100" alignBlock="center">
                        <Toggle
                          id="import-remove-labels"
                          isChecked={importRemoveLabels}
                          onChange={() =>
                            setImportRemoveLabels(!importRemoveLabels)
                          }
                        />
                        <Label labelFor="import-remove-labels">
                          {t('admin.import.remove_labels')}
                        </Label>
                      </Inline>
                      <SectionMessage appearance="information">
                        <Text>{t('admin.import.remove_labels_help')}</Text>
                      </SectionMessage>

                      {/* Actions */}
                      <Button
                        appearance="primary"
                        onClick={startImport}
                        isDisabled={
                          importStep === 'running' ||
                          exportLoading ||
                          Object.values(importCounts).reduce(
                            (s, c) => s + c,
                            0,
                          ) === 0
                        }
                        isLoading={importStep === 'running'}
                      >
                        {t('admin.import.start_button')}
                      </Button>

                      {importStep === 'running' && importProgress && (
                        <Stack space="space.050">
                          <Text>
                            {importProgress.classified || 0} /{' '}
                            {importProgress.total || '?'}
                          </Text>
                          <ProgressBar
                            value={
                              importProgress.total > 0
                                ? (importProgress.classified || 0) /
                                  importProgress.total
                                : 0
                            }
                          />
                          {(importProgress.classified || 0) > 0 &&
                            importProgress.startedAt &&
                            (() => {
                              const eta = formatEta(
                                importProgress.startedAt,
                                importProgress.classified || 0,
                                importProgress.total,
                                t,
                              );
                              return eta ? <Text>{eta}</Text> : null;
                            })()}
                        </Stack>
                      )}
                      {importStep === 'done' && importProgress && (
                        <SectionMessage appearance="confirmation">
                          <Text>
                            {interpolate(t('admin.import.complete'), {
                              classified: importProgress.classified || 0,
                            })}
                          </Text>
                        </SectionMessage>
                      )}

                      <SectionMessage appearance="information">
                        <Text>{t('admin.import.never_weaken')}</Text>
                      </SectionMessage>
                      <SectionMessage appearance="information">
                        <Text>{t('admin.import.index_lag_hint')}</Text>
                      </SectionMessage>
                    </Stack>
                  </Box>
                </TabPanel>

                {/* Export sub-tab */}
                <TabPanel>
                  <Box xcss={tabPanelStyle}>
                    <Stack space="space.100">
                      <Text>{t('admin.export.description')}</Text>
                      <DynamicTable
                        head={{
                          cells: [
                            {
                              key: 'level',
                              content: t('admin.export.level_column'),
                            },
                            {
                              key: 'label',
                              content: t('admin.export.label_name'),
                            },
                            {
                              key: 'pages',
                              content: (
                                <Inline space="space.050" alignBlock="center">
                                  <Text>{t('admin.export.pages_column')}</Text>
                                  <Button
                                    appearance="subtle"
                                    spacing="compact"
                                    iconBefore="refresh"
                                    isLoading={exportCountLoading}
                                    onClick={() => refreshExportCounts()}
                                  >
                                    {' '}
                                  </Button>
                                </Inline>
                              ),
                            },
                          ],
                        }}
                        rows={(config?.levels || []).map((level) => {
                          const expCount = exportCounts[level.id];
                          const selectedKeys = exportScopeAll
                            ? []
                            : (exportSpaceKeys || []).map((o) => o.value);
                          const spaceFilter = buildSpaceFilter(
                            selectedKeys.join(','),
                          );
                          const cql = `type=page AND culmat_classification_level = "${level.id}"${spaceFilter}`;
                          return {
                            key: level.id,
                            cells: [
                              {
                                key: 'level',
                                content: (
                                  <Lozenge
                                    isBold
                                    appearance={colorToLozenge(level.color)}
                                  >
                                    {level.id}
                                  </Lozenge>
                                ),
                              },
                              {
                                key: 'label',
                                content: (
                                  <Textfield
                                    value={exportMappings[level.id] ?? level.id}
                                    onChange={(e) =>
                                      setExportMappings((prev) => ({
                                        ...prev,
                                        [level.id]: e.target.value,
                                      }))
                                    }
                                  />
                                ),
                              },
                              {
                                key: 'pages',
                                content: exportLevelLoading[level.id] ? (
                                  <Spinner size="small" />
                                ) : expCount !== undefined && expCount > 0 ? (
                                  <Text>
                                    <Link
                                      href={`/wiki/search?cql=${encodeURIComponent(cql)}`}
                                      openNewTab
                                    >
                                      {expCount}
                                    </Link>
                                  </Text>
                                ) : (
                                  <Text>
                                    {expCount !== undefined
                                      ? String(expCount)
                                      : '—'}
                                  </Text>
                                ),
                              },
                            ],
                          };
                        })}
                      />

                      {/* Warning when no pages are classified */}
                      {Object.keys(exportCounts).length > 0 &&
                        Object.values(exportCounts).reduce(
                          (s, c) => s + c,
                          0,
                        ) === 0 && (
                          <SectionMessage appearance="warning">
                            <Text>{t('admin.export.no_classifications')}</Text>
                          </SectionMessage>
                        )}

                      {/* Scope selector */}
                      <Stack space="space.100">
                        <Inline space="space.200" alignBlock="center">
                          <Inline space="space.100" alignBlock="center">
                            <Radio
                              value="all"
                              isChecked={exportScopeAll}
                              onChange={() => {
                                setExportScopeAll(true);
                                setTimeout(() => refreshExportCounts(), 50);
                              }}
                              label=""
                            />
                            <Text>{t('admin.import.scope_all')}</Text>
                          </Inline>
                          <Inline space="space.100" alignBlock="center">
                            <Radio
                              value="space"
                              isChecked={!exportScopeAll}
                              onChange={() => {
                                setExportScopeAll(false);
                                setTimeout(() => refreshExportCounts(), 50);
                              }}
                              label=""
                            />
                            <Text>{t('admin.import.scope_space')}</Text>
                          </Inline>
                        </Inline>
                        {!exportScopeAll && (
                          <Select
                            isMulti
                            options={availableSpaces}
                            value={exportSpaceKeys}
                            onChange={(selected) => {
                              setExportSpaceKeys(selected || []);
                              setTimeout(() => {
                                exportSpaceKeysRef.current = selected || [];
                                refreshExportCounts();
                              }, 50);
                            }}
                            placeholder={t('admin.import.scope_empty')}
                          />
                        )}
                      </Stack>

                      <Button
                        appearance="primary"
                        onClick={startExport}
                        isLoading={exportLoading}
                        isDisabled={
                          exportLoading ||
                          (exportProgress && !exportProgress.done) ||
                          (Object.keys(exportCounts).length > 0 &&
                            Object.values(exportCounts).reduce(
                              (s, c) => s + c,
                              0,
                            ) === 0)
                        }
                      >
                        {t('admin.export.start_button')}
                      </Button>
                      {exportProgress && !exportProgress.done && (
                        <Stack space="space.050">
                          <Text>
                            {exportProgress.classified || 0} /{' '}
                            {exportProgress.total || '?'}
                          </Text>
                          <ProgressBar
                            value={
                              exportProgress.total > 0
                                ? (exportProgress.classified || 0) /
                                  exportProgress.total
                                : 0
                            }
                          />
                          {(exportProgress.classified || 0) > 0 &&
                            exportProgress.startedAt &&
                            (() => {
                              const eta = formatEta(
                                exportProgress.startedAt,
                                exportProgress.classified || 0,
                                exportProgress.total,
                                t,
                              );
                              return eta ? <Text>{eta}</Text> : null;
                            })()}
                        </Stack>
                      )}
                      {exportProgress && exportProgress.done && (
                        <SectionMessage appearance="confirmation">
                          <Text>
                            {interpolate(t('admin.export.complete'), {
                              exported: exportProgress.classified || 0,
                            })}
                          </Text>
                        </SectionMessage>
                      )}
                    </Stack>
                  </Box>
                </TabPanel>
              </Tabs>
            </Box>
          </TabPanel>
        </Tabs>

        {/* Save button and messages — hidden on read-only tabs (Statistics=0, Labels=5) */}
        {activeTab > 0 && activeTab < 5 && (
          <>
            {message && (
              <SectionMessage
                appearance={message.type === 'error' ? 'error' : 'confirmation'}
              >
                <Text>{message.text}</Text>
              </SectionMessage>
            )}

            <Button
              appearance="primary"
              onClick={handleSave}
              isLoading={saving}
              isDisabled={!isDirty}
            >
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

      {/* Delete level confirmation modal */}
      <ModalTransition>
        {deleteConfirm && (
          <Modal onClose={() => setDeleteConfirm(null)}>
            <ModalHeader>
              <ModalTitle>{t('admin.levels.delete_confirm_title')}</ModalTitle>
              <Button
                appearance="subtle"
                onClick={() => setDeleteConfirm(null)}
              >
                ✕
              </Button>
            </ModalHeader>
            <ModalBody>
              <Stack space="space.200">
                <SectionMessage appearance="warning">
                  <Text>
                    {interpolate(t('admin.levels.delete_confirm_message'), {
                      count: deleteConfirm.pageCount,
                      level: deleteConfirm.levelName,
                    })}
                  </Text>
                </SectionMessage>
                <Stack space="space.050">
                  <Label labelFor="reclassify-select">
                    {t('admin.levels.delete_reclassify_label')}
                  </Label>
                  <Select
                    inputId="reclassify-select"
                    options={(config?.levels || [])
                      .filter((l) => l.id !== deleteConfirm.levelId)
                      .map((l) => ({
                        label: localize(l.name, 'en'),
                        value: l.id,
                      }))}
                    onChange={(option) =>
                      setDeleteConfirm((prev) => ({
                        ...prev,
                        reclassifyTo: option?.value || null,
                      }))
                    }
                  />
                </Stack>
              </Stack>
            </ModalBody>
            <ModalFooter>
              <ButtonGroup>
                <Button
                  appearance="subtle"
                  onClick={() => setDeleteConfirm(null)}
                >
                  {t('classify.cancel_button')}
                </Button>
                <Button
                  appearance="warning"
                  onClick={() => removeLevelFromConfig(deleteConfirm.levelId)}
                  isDisabled={deleteLoading}
                >
                  {t('admin.levels.delete_anyway_button')}
                </Button>
                <Button
                  appearance="primary"
                  onClick={handleReclassifyAndDelete}
                  isDisabled={!deleteConfirm.reclassifyTo || deleteLoading}
                  isLoading={deleteLoading}
                >
                  {t('admin.levels.delete_reclassify_button')}
                </Button>
              </ButtonGroup>
            </ModalFooter>
          </Modal>
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

/**
 * Modal for adding/editing a classification level.
 */
const LevelModal = ({ level, languages, onSave, onClose, t }) => {
  const [data, setData] = useState({ ...level });
  const update = (field, value) => setData({ ...data, [field]: value });

  return (
    <Modal onClose={onClose}>
      <ModalHeader>
        <ModalTitle>
          {data.id
            ? t('admin.levels.edit_button')
            : t('admin.levels.add_button')}
        </ModalTitle>
      </ModalHeader>
      <Form onSubmit={() => onSave(data)}>
        <ModalBody>
          <Stack space="space.200">
            <TranslatableField
              languages={languages}
              label={t('admin.levels.name')}
              obj={data.name}
              onChange={(code, value) =>
                update('name', { ...data.name, [code]: value })
              }
              t={t}
            />
            <Stack space="space.050">
              <Label labelFor="level-color">{t('admin.levels.color')}</Label>
              <Select
                inputId="level-color"
                value={
                  COLOR_OPTIONS.find((c) => c.value === data.color) || {
                    label: data.color,
                    value: data.color,
                  }
                }
                options={COLOR_OPTIONS}
                onChange={(option) => update('color', option.value)}
              />
              {data.name?.en && (
                <Inline space="space.100" alignBlock="center">
                  <Text>{t('admin.levels.color_preview')}:</Text>
                  <Lozenge isBold appearance={colorToLozenge(data.color)}>
                    {data.name.en}
                  </Lozenge>
                </Inline>
              )}
            </Stack>
            <TranslatableField
              languages={languages}
              label={t('admin.levels.description')}
              obj={data.description}
              onChange={(code, value) =>
                update('description', { ...data.description, [code]: value })
              }
              multiline
              t={t}
            />
            <Inline space="space.100" alignBlock="center">
              <Toggle
                id="level-allowed"
                isChecked={data.allowed}
                onChange={() => update('allowed', !data.allowed)}
              />
              <Label labelFor="level-allowed">
                {t('admin.levels.allowed')}
              </Label>
            </Inline>
            <Inline space="space.100" alignBlock="center">
              <Toggle
                id="level-protection"
                isChecked={data.requiresProtection}
                onChange={() =>
                  update('requiresProtection', !data.requiresProtection)
                }
              />
              <Label labelFor="level-protection">
                {t('admin.levels.requires_protection')}
              </Label>
            </Inline>
            {!data.allowed && (
              <TranslatableField
                languages={languages}
                label={t('admin.levels.error_message')}
                obj={data.errorMessage}
                onChange={(code, value) =>
                  update('errorMessage', {
                    ...(data.errorMessage || {}),
                    [code]: value,
                  })
                }
                multiline
                t={t}
              />
            )}
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
              isDisabled={!data.name?.en}
            >
              {t('classify.apply_button')}
            </Button>
          </FormFooter>
        </ModalFooter>
      </Form>
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
      <Form onSubmit={() => onSave(data)}>
        <ModalBody>
          <Stack space="space.200">
            <Stack space="space.050">
              <Label labelFor="contact-type">{t('admin.contacts.type')}</Label>
              <Select
                inputId="contact-type"
                value={{
                  label: t(`admin.contacts.type_${data.type}`),
                  value: data.type,
                }}
                options={[
                  { label: t('admin.contacts.type_user'), value: 'user' },
                  { label: t('admin.contacts.type_email'), value: 'email' },
                  { label: t('admin.contacts.type_text'), value: 'text' },
                ]}
                onChange={(option) => update('type', option.value)}
              />
            </Stack>
            <Stack space="space.050">
              <Label labelFor="contact-value">
                {t('admin.contacts.value')}
                <RequiredAsterisk />
              </Label>
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
                  placeholder={
                    data.type === 'email'
                      ? 'email@example.com'
                      : 'Security Team'
                  }
                />
              )}
            </Stack>
            <TranslatableField
              languages={languages}
              label={t('admin.contacts.role')}
              obj={data.role}
              onChange={(code, value) =>
                update('role', { ...data.role, [code]: value })
              }
              t={t}
            />
            <Stack space="space.050">
              <Label labelFor="contact-levels">
                {t('admin.contacts.applies_to')}
              </Label>
              <Select
                inputId="contact-levels"
                isMulti
                value={levels
                  .filter((l) => data.levelIds?.includes(l.id))
                  .map((l) => ({
                    label: localize(l.name, 'en'),
                    value: l.id,
                  }))}
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
                placeholder={t('admin.contacts.applies_to_all')}
              />
            </Stack>
          </Stack>
        </ModalBody>
        <ModalFooter>
          <FormFooter>
            <Button appearance="subtle" onClick={onClose}>
              {t('classify.cancel_button')}
            </Button>
            <Button appearance="primary" type="submit" isDisabled={!data.value}>
              {t('classify.apply_button')}
            </Button>
          </FormFooter>
        </ModalFooter>
      </Form>
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

ForgeReconciler.render(
  <I18nProvider>
    <App />
  </I18nProvider>,
);
