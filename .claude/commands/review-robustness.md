# Review Robustness, Scalability, and Error Handling

You are a production reliability engineer reviewing this Forge app for robustness. The app classifies Confluence pages and must scale to instances with millions of pages. Produce a structured findings report.

## Setup

Before reviewing, load Forge platform guidance:

1. Call `mcp__forge__forge-backend-developer-guide` to understand Forge runtime limits (timeouts, memory, rate limits)
2. Read `AGENTS.md` for project conventions
3. Read `docs/persistence.md` for the storage architecture and known Forge SQL gotchas

Then read ALL source files:

- `src/resolvers/*.js`
- `src/services/*.js`
- `src/storage/*.js`
- `src/shared/*.js`
- `src/utils/*.js`
- `src/recursiveConsumer.js`
- `src/dynamicProperties.js`

## Check categories

Run each check below. For each finding, record: `{file, line, severity, category, message}`.

### 1. Error handling coverage (severity: error)

- Every `requestConfluence()` call must check `response.ok` — find any that do not
- Every resolver must wrap its body in try/catch and return a structured error via `errorResponse()` — find any that throw uncaught exceptions to the Forge runtime
- `classifySinglePage()` is called in tight loops — verify that a single page failure does NOT abort the entire batch
- Check that `Queue.push()` calls are wrapped in try/catch — a queue failure should not crash the resolver
- `kvs.get()` / `kvs.set()` calls — verify error handling; KVS can throw on network issues

### 2. Error context and logging (severity: warning)

- Every `console.error()` should include enough context to debug in production: at minimum the operation name and the entity ID (pageId, spaceKey, levelId)
- Find `console.error` calls that only log `error` without context (e.g., missing pageId)
- Find operations that silently swallow errors (return false/null without logging)
- Check that `console.warn` is used for non-fatal issues (timeouts, partial failures) vs `console.error` for actual failures
- Verify there is no sensitive data in logs (accountIds are fine, but full config objects or tokens would not be)

### 3. Scalability — CQL and pagination (severity: error)

- Find any pattern that fetches ALL pages in one call (e.g., `limit=totalSize`) — Confluence REST API has a hard limit of 200-250 results per call; this will silently truncate on large instances
- Check all `findPagesByLabel` / `findPagesByLevel` call sites for proper pagination
- `listSpacesResolver` fetches only 250 spaces with no pagination — flag for large instances
- Check all CQL queries for missing `type=page` filters or unbounded result sets
- Any safety caps (e.g., max 5000 labels) — flag whether these are sufficient and communicated to the user

### 4. Scalability — recursive operations (severity: warning)

- Check timeout math — verify sync resolver timeouts are correct relative to Forge's 25-second sync function limit
- Sequential page processing in the consumer — flag whether batched writes could improve throughput
- In-memory collections (Sets, Maps, arrays) that grow with page count — estimate memory impact at 100K+ pages
- `handleImport` iterates all mappings x all labels x all pages — flag the O(n) complexity
- Ancestor chain traversal in `restrictionService.js` makes one API call per ancestor — for deeply nested pages (20+ levels) this is sequential and slow

### 5. Resilience and retry logic (severity: warning)

- Forge async consumers may be retried on failure — verify that `handler()` in `recursiveConsumer.js` is idempotent (re-running a partially completed job should not double-classify)
- Check if any operation depends on the Confluence CQL index being up-to-date — CQL index lag (seconds to minutes) can cause missed or duplicate pages
- Content property version conflicts: if `upsertProperty` reads version then writes version+1, two concurrent requests will race and one gets a 409. Flag whether this is handled
- Check for missing timeout handling on `requestConfluence()` calls
- Label removal calls in loops — if the label API is slow, this compounds. Flag absence of retry/backoff

### 6. Data integrity (severity: error)

- If `setClassification` writes two content properties in `Promise.all`, one can succeed while the other fails — the page would have inconsistent state. Flag this partial-write risk
- `appendHistory` doing read-then-write without locking — concurrent classifications of the same page could lose history entries. Flag the race condition
- If the import process sorts by level but skips pages already processed, a first-attempt failure means the page is never retried. Flag this edge case
- KVS job state cleanup — is it deleted on completion AND on failure? Stale job keys could block the UI

### 7. Edge cases (severity: warning)

- What happens when `getSpaceConfig` returns null and `getEffectiveConfig` is called? Trace the code path
- What happens when a page is deleted/trashed between the CQL query and the classification write?
- What happens when a user lacks permission to read a page's content properties?
- What happens when `effectiveConfig.levels` is empty (admin deleted all levels)? Trace through the classify and byline handlers
- What happens when the async queue does not exist or is misconfigured?
- `buildSpaceFilter` uses string interpolation in CQL — verify it cannot produce malformed CQL with special characters in space keys

### 8. Resource limits (severity: info)

- Content property size limit is ~32KB — verify the history entry cap math (entries x avg bytes < 32KB)
- KVS value size limit is 200KB — verify that import/export log entries cannot exceed this
- Forge function invocation has a 25-second timeout (sync) and 15-minute timeout (async) — verify that long-running consumer modes cannot exceed the async limit
- Forge rate limits: 100 product API calls per 10 seconds — estimate peak API call rate during bulk operations and flag if it could exceed this

## Output format

Produce a Markdown report with this structure:

```
## Robustness Review — {date}

### Summary
- Errors: {count}
- Warnings: {count}
- Info: {count}
- Overall risk assessment: {low/medium/high} with rationale

### Errors (must fix)
#### [{category}] {title}
**File:** {file}:{line}
**Impact:** {what goes wrong in production}
**Recommendation:** {specific fix}

### Warnings (should fix)
#### [{category}] {title}
**File:** {file}:{line}
**Impact:** {what goes wrong at scale}
**Recommendation:** {specific fix}

### Info (consider)
#### [{category}] {title}
**File:** {file}:{line}
**Note:** {observation and suggestion}

### Risk Matrix
| Area | Current State | Risk at 10K pages | Risk at 1M pages |
|------|--------------|-------------------|-------------------|
| CQL pagination | ... | ... | ... |
| Recursive ops | ... | ... | ... |
| Error recovery | ... | ... | ... |
| Data integrity | ... | ... | ... |
| Rate limits | ... | ... | ... |

### Recommendations
{Prioritized list with estimated effort and impact, ordered by risk severity}
```

Be context-aware: Forge has specific runtime constraints that differ from traditional Node.js servers. Do not flag patterns that are standard Forge idioms (e.g., using `@forge/api` route tagged templates for safe URL construction). Focus on issues that would manifest in production at scale.

## Apply changes

After completing the review, implement all fixes from the "Errors" and "Warnings" sections. Apply changes directly — do not ask for confirmation on individual fixes. Run `npx vitest run` after all changes to verify nothing is broken.
