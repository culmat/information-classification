# Review Refactoring Opportunities

You are a senior JavaScript architect reviewing this Forge app codebase for refactoring opportunities. Produce a structured findings report.

## Setup

Before reviewing, load Forge backend guidance for context:

1. Call `mcp__forge__forge-backend-developer-guide` to understand Forge backend patterns
2. Read `AGENTS.md` for project conventions and guardrails
3. Read `docs/persistence.md` for the storage architecture

Then read ALL backend and shared source files:

- `src/resolvers/*.js`
- `src/services/*.js`
- `src/storage/*.js`
- `src/shared/*.js`
- `src/utils/*.js`
- `src/recursiveConsumer.js`
- `src/dynamicProperties.js`
- `src/index.js`

Also read all frontend files in `src/frontend/*.jsx`.

## Check categories

Run each check below. For each finding, record: `{file, line, severity, category, message}`.

### 1. Duplicate functions (severity: warning)

- Find ALL instances of `localize()` or equivalent i18n helper functions across files — flag duplicates that should import from a shared module
- Requester selection pattern (`useApp ? api.asApp() : api.asUser()`) — find every file that implements this and flag if a shared helper would reduce duplication
- CQL search logic — compare `cqlPageSearch()` in `classificationService.js`, any `cqlSearch()` in resolvers, and inline CQL calls in `labelService.js` and `importResolver.js` for consolidation opportunities
- Any other functions with identical or near-identical bodies across files

### 2. Repeated structural patterns (severity: warning)

- Job kickoff boilerplate: compare resolvers that count pages, push to Queue, persist KVS job state, and return a response — flag if a shared `enqueueJob()` helper would reduce duplication
- Progress reporting + KVS state update blocks in `recursiveConsumer.js` — the `publishGlobal + kvs.set` pattern repeats across handler modes. Flag if a shared `reportProgress()` helper would help
- Error response patterns: compare how resolvers handle try/catch — are they consistent? Flag inconsistencies

### 3. Overly complex functions (severity: warning)

- Functions longer than ~60 lines that mix multiple concerns — flag with specific decomposition suggestions
- Identify the largest functions in `recursiveConsumer.js` and suggest which concerns could be extracted
- `handleExport()` and `handleImport()` likely share significant structure — flag commonality
- Deeply nested control flow (3+ levels of nesting) — flag and suggest flattening

### 4. Dead code and unused exports (severity: info)

- Exported functions that are never imported anywhere else in the codebase
- Unreachable code branches (conditions that can never be true based on call sites)
- Variables assigned but never read
- Parameters prefixed with `_` indicate intentionally unused — skip these
- Constants defined in `src/shared/constants.js` that are never referenced

### 5. Module boundary improvements (severity: info)

- Files in `src/resolvers/` that contain business logic instead of delegating to `src/services/`
- Check if any resolver contains CQL search logic that belongs in a service
- Check if `src/shared/` modules are truly shared (used by 2+ consumers) or if some are single-use
- Flag any circular or surprising dependency patterns between layers

### 6. Data structure consolidation (severity: info)

- Classification data objects (`{ level, classifiedBy, classifiedAt }`) — are they always built the same way? Could a factory function help?
- Job state objects stored in KVS — compare shapes across resolvers that enqueue async work
- Level lookup pattern (`config.levels.find(l => l.id === levelId)`) — count how many times this appears and flag if a utility would help

### 7. Simplification opportunities (severity: info)

- Places where two sequential API calls could be replaced by one
- `upsertProperty` in `contentPropertyService.js` does read-then-write — flag if the Confluence API supports a single upsert endpoint
- Independent async operations that run sequentially but could use `Promise.all`
- Conversely, flag places where sequential execution is required but `Promise.all` is used (correctness check)

## Output format

Produce a Markdown report with this structure:

```
## Refactoring Review — {date}

### Summary
- Warnings: {count}
- Info: {count}
- Estimated total refactoring effort: {low/medium/high}

### Warnings
#### {category}: {title}
**Files:** {file1}, {file2}, ...
**Lines:** {file1}:{n}, {file2}:{n}
{Description of the duplication/complexity and concrete refactoring suggestion}

### Info / Opportunities
#### {category}: {title}
**Files:** {file1}, {file2}, ...
{Description and suggestion}

### Recommendations
{Prioritized list of refactoring actions, grouped by effort (quick wins vs. larger changes), with estimated impact on maintainability}
```

Be context-aware: if two functions look similar but serve intentionally different purposes (e.g., different API versions, different auth contexts), explain WHY they are similar rather than blindly flagging them. Only flag genuinely consolidatable code.

Do NOT make any code changes — this is a read-only review.
