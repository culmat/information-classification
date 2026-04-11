# Review Security

You are a security engineer reviewing this information classification Forge app. The app lets Confluence admins define classification levels and lets users classify pages — protecting sensitive content from being shared without appropriate restrictions is its core value proposition. Produce a structured findings report.

## Setup

Before reviewing, load Forge platform guidance:

1. Call `mcp__forge__forge-backend-developer-guide` to understand Forge runtime, resolver context, and trust boundaries
2. Read `AGENTS.md` for project conventions
3. Read `docs/persistence.md` for the storage architecture (content properties, KVS, Forge SQL)

Then read ALL security-relevant source files:

- `src/resolvers/*.js` (all resolvers — the trust boundary between client and server)
- `src/services/classificationService.js` (core classification logic and level validation)
- `src/services/contentPropertyService.js` (writes classification data to Confluence content properties)
- `src/services/restrictionService.js` (page restriction mismatch detection)
- `src/services/labelService.js` (label search and modification)
- `src/storage/configStore.js` (KVS global config and effective config merging)
- `src/storage/spaceConfigStore.js` (KVS space-level overrides)
- `src/utils/adminAuth.js` (admin group check utility)
- `src/utils/responseHelper.js` (response formatting)
- `src/shared/constants.js` (property keys, KVS prefixes, color mappings)
- `src/shared/defaults.js` (default config on first use)
- `src/recursiveConsumer.js` (async queue consumer for bulk operations)
- `src/dynamicProperties.js` (byline title and restriction warning)
- `manifest.yml` (modules, scopes, permissions)

Also read the frontend files to understand what the client sends:

- `static/admin/src/*.jsx` (admin UI — config management, audit dashboard, label import)
- `static/byline/src/*.jsx` (byline UI — classification picker)
- `static/space-settings/src/*.jsx` (space settings UI)

## Check categories

Run each check below. For each finding, record: `{file, line, severity, category, message}`.

### 1. Classification integrity (severity: error)

- Level validation: verify that `setClassification` validates the requested `levelId` against the effective config for the target space — a user should never be able to set a level that is disabled globally or restricted in that space
- Content property consistency: verify that content properties written by `contentPropertyService.js` always include both the level data and the history entry — a partial write would leave the page in an inconsistent state
- Effective config merging: verify that `getEffectiveConfig()` in `configStore.js` correctly restricts space-level config — a space override must only narrow the global allowed levels, never add levels that are globally disabled
- Default level fallback: verify that the default level is always a valid, allowed level — if the global default is removed or restricted at the space level, trace what happens

### 2. Authorization and access control (severity: error)

- Module gating reliance: the app relies on Confluence module-level gating (globalSettings → admins, spaceSettings → space admins) to protect admin resolvers. Verify that ALL admin-only resolvers (`setConfig`, `getAuditData`, `countLevelUsage`, `reclassifyLevel`, `startLabelImport`, `startLabelExport`) are exclusively callable from admin-gated modules — could any of these resolvers be invoked from a non-admin context (e.g., the byline module)?
- Resolver function key mapping: examine `src/resolvers/index.js` to verify that resolver function keys cannot be called cross-module — if all resolvers share a single `resolver.getDefinitions()` handler, any module can call any resolver by key
- Identity source: verify `accountId` always comes from `req.context.accountId` (Forge-provided), never from client payload
- Permission model for classification: verify that `setClassification` respects the calling user's page edit permissions — a user who can view but not edit a page should not be able to classify it
- `asUser()` vs `asApp()`: verify that product API calls use `asUser()` when the result should respect the calling user's permissions, and `asApp()` only when background processing requires elevated access
- Admin auth utility: `src/utils/adminAuth.js` exists but may be unused — verify whether explicit admin checks are needed or if module gating is sufficient

### 3. Data minimization — client exposure (severity: warning)

- Enumerate exactly what data each resolver returns to the client — list each field
- Flag any resolver that sends more data than the frontend strictly needs
- Verify that the full admin config (level definitions, allowed levels, contacts, links) is only returned to admin contexts — leaking the full config to the byline module would reveal organizational classification policy
- Check that audit data (who classified what, when) is only accessible from admin modules
- Check that error messages don't leak internal state: no stack traces, no KVS keys, no config values in error responses
- Verify that content properties stored on pages don't contain sensitive metadata (e.g., the classifying user's accountId is acceptable, but admin config details would not be)

### 4. Configuration integrity (severity: error)

- Config validation: verify that `setConfig` in `configResolver.js` validates ALL fields of the config object — missing validation on any field could allow injection of unexpected properties into KVS
- Level ID tampering: verify that level IDs are validated (format, uniqueness) — malformed IDs could break CQL queries or content property lookups
- Space config escalation: verify that `setSpaceConfig` cannot enable levels that are disabled globally — this is the critical invariant of the space override model
- Config deletion impact: verify what happens if an admin deletes a level that is currently in use on pages — does the app handle orphaned classifications gracefully?
- Color validation: verify that level colors are validated against a whitelist — arbitrary color strings could enable XSS if rendered unsafely in the UI

### 5. Async job safety (severity: warning)

- Job authorization: when `recursiveConsumer.js` processes a recursive classification, verify that the job was initiated by an authorized user — can a non-admin trigger a bulk reclassify or label import by crafting a queue message?
- `asApp` scope: the async consumer uses `asApp` for API calls — verify it does not write to pages the initiating user would not have permission to edit
- Job parameter validation: verify that job payloads (levelId, spaceKey, mappings) are validated before processing — the consumer should not trust queue message contents blindly
- Race conditions: if two recursive classifications target the same page tree simultaneously, verify they don't conflict or produce inconsistent results
- Progress channel security: verify that `@forge/realtime` channels (e.g., `classification-progress:${pageId}`) cannot be subscribed to by unauthorized users to monitor classification activity

### 6. Label import/export security (severity: warning)

- Import mapping validation: verify that `startLabelImport` validates all label-to-level mappings — can a malicious mapping reference a nonexistent or disabled level?
- Label injection: verify that label strings are validated before being used in CQL queries — special characters in label names could produce malformed CQL
- Import scope: verify that the import process respects space boundaries — an import scoped to space A should not affect pages in space B
- Export data exposure: verify that `startLabelExport` does not expose classification data beyond what the requesting admin should see
- Label removal safety: if `removeLabels: true` is set, verify that only the mapped labels are removed — no unrelated labels should be affected

### 7. Forge platform trust boundaries (severity: error)

- Verify that `req.context` properties (accountId, extension.config, siteUrl) are treated as trusted (server-provided by Forge runtime) and not overridable by the client
- Verify that `req.payload` properties are treated as untrusted and validated before use
- Check that no resolver passes client payload data directly to Confluence REST API calls without validation — especially in URL path construction and CQL query building
- Scope audit: review `manifest.yml` scopes — flag any scope that is declared but not used by the current code, or any scope that grants broader access than needed (e.g., `write:confluence-content` vs a more specific write scope)
- Check that `requestConfluence` URL construction uses safe patterns (tagged templates or proper encoding) — string concatenation with user input is a path traversal / injection vector

## Output format

Produce a Markdown report with this structure:

```
## Security Review — {date}

### Summary
- Critical: {count}
- Errors: {count}
- Warnings: {count}
- Info: {count}
- Overall security posture: {strong/adequate/weak} with rationale

### Trust Boundary Map
{Brief description of what the client can and cannot control, including which modules gate which resolvers}

### Critical / Errors (must fix)
#### [{category}] {title}
**File:** {file}:{line}
**Attack vector:** {how an attacker could exploit this}
**Impact:** {what goes wrong}
**Recommendation:** {specific fix}

### Warnings (should fix)
#### [{category}] {title}
**File:** {file}:{line}
**Risk:** {what could go wrong}
**Recommendation:** {specific fix}

### Info (observations)
#### [{category}] {title}
**File:** {file}:{line}
**Note:** {observation}

### Data Exposure Inventory
| Resolver | Module context | Data returned to client | Sensitive? | Notes |
|----------|---------------|----------------------|------------|-------|
| getClassification | byline | ... | ... | ... |
| setClassification | byline | ... | ... | ... |
| getConfig | globalSettings | ... | ... | ... |
| setConfig | globalSettings | ... | ... | ... |
| ... | ... | ... | ... | ... |

### Scope Audit
| Scope | Used by | Necessary? | Notes |
|-------|---------|------------|-------|
| read:page:confluence | ... | ... | ... |
| write:page:confluence | ... | ... | ... |
| ... | ... | ... | ... |

### Recommendations
{Prioritized list with estimated t-shirt sized effort and impact}
```

Be context-aware: Forge provides built-in protections (tenant isolation, signed context, CSRF protection). Do not flag standard Forge patterns as vulnerabilities. Focus on application-level security issues specific to this information classification use case — particularly around authorization model correctness, classification integrity, and data exposure.

Do NOT make any code changes — this is a read-only review.
