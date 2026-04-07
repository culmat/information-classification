# Persistence

Three storage tiers, each serving a distinct purpose.

## 1. Confluence Content Properties (page-level)

Stores the current classification per page via REST API v2. Two property keys:

| Key                                 | Purpose                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| `culmat_page_classification`        | Authoritative data (level, classifiedBy, classifiedAt). Indexed for CQL search. |
| `culmat_page_classification_byline` | Display data (title, tooltip) for the byline badge.                             |

**Key files:** `src/services/contentPropertyService.js`, `manifest.yml` (content property schema at lines 31-48).

**Lifecycle:** Confluence automatically deletes content properties when a page is permanently purged. No cleanup needed.

## 2. Forge Key-Value Store (configuration)

Stores global and space-level configuration via `@forge/kvs`.

| Key pattern               | Content                                             |
| ------------------------- | --------------------------------------------------- |
| `config:global`           | Levels, default level, contacts, links, languages   |
| `config:space:{spaceKey}` | Allowed level subset + space-level default override |

**Key files:** `src/storage/configStore.js`, `src/storage/spaceConfigStore.js`, `src/shared/constants.js` (key definitions).

Space config merges with global config at read time via `getEffectiveConfig()`.

## 3. Forge SQL (audit trail)

MySQL database via `@forge/sql`. Tracks every classification change.

**Table:** `classification_audit` — columns: `id`, `pageId`, `spaceKey`, `previousLevel`, `newLevel`, `classifiedBy`, `classifiedAt`, `isRecursive`.

**Indices:** `idx_audit_pageId`, `idx_audit_spaceKey`, `idx_audit_classifiedAt`, `idx_audit_classifiedBy`.

**Key files:** `src/storage/auditStore.js` (queries), `src/storage/migrations/schema.js` (DDL + migrations).

**Lifecycle:** A page lifecycle trigger (`avi:confluence:deleted:page`) deletes audit rows when a page is permanently purged. Trashed pages keep their audit history (survives restore). See `src/pageLifecycleHandler.js`.

**Migrations** run automatically on first resolver invocation via `runSchemaMigrations()` in `src/resolvers/index.js`.

## Forge SQL Gotchas

- **LIMIT/OFFSET as bind params fails.** Forge SQL rejects `LIMIT ?` with `ER_WRONG_ARGUMENTS`. Inline instead: `` `LIMIT ${Number(limit)}` ``.
- **INTERVAL as bind param fails.** Same issue. Use `` `INTERVAL ${Number(months)} MONTH` ``.
- **Type coercion matters.** Pass `Number(pageId)` for BIGINT columns, not strings from `req.payload`.
- **No CASCADE DELETE.** Delete child rows before parent rows manually.

## See also

- [DEVELOPMENT.md](../DEVELOPMENT.md) — setup and deploy workflows
- [testing.md](testing.md) — verifying persistence with acli and shared browser
