# Verify the admin/byline refactor didn't introduce bugs

## Context

The last 5 commits on `main` reshaped [admin.jsx](src/frontend/admin.jsx) (3175 → 161 lines) and [byline.jsx](src/frontend/byline.jsx) (1240 → 197 lines) into many sub-components and hooks under [src/frontend/admin/](src/frontend/admin/) and [src/frontend/byline/](src/frontend/byline/). Commits: `3b71ada`, `1a7c4e0`, `9b7c82c`, `391e856`, `6b0ff7a`.

The repo has 198 tests across 16 files but they **all cover backend** ([test/resolvers/](test/resolvers/), [test/services/](test/services/), [test/shared/](test/shared/), [test/storage/](test/storage/), [test/utils/](test/utils/)). [vitest.config.js](vitest.config.js) explicitly excludes `src/frontend/**` from coverage and there is no React Testing Library / jsdom / `@testing-library/*` installed. So **zero** of the refactored code is covered.

The verification I ran during the refactor (`npm run lint`, `npm run format:check`, `npx vitest run`) cannot catch behavioural regressions in the extracted components. The user's proposed strategy is the sound one: write component-level integration tests that drive the public UI of `<App />`, run them against both HEAD~5 (pre-refactor) and HEAD (post-refactor), and require them to pass in both worlds.

## Approach

Install RTL + jsdom, mock `@forge/react` and `@forge/bridge`, write tests that render each top-level `<App />` and drive its UI (click, type, assert `invoke` arguments). Verify by toggling `src/frontend/` between HEAD~5 and HEAD and re-running the tests.

### 1. Infrastructure

Dev dependencies to add:

- `@testing-library/react` — provides `render`, `renderHook`, `screen`, `fireEvent`, `waitFor`
- `@testing-library/user-event` — higher-level event driver (clicks that also focus, typing that also fires keypress)
- `jsdom` — DOM environment for Node
- `@vitest/browser` is **not** needed; `environment: 'jsdom'` is sufficient

Config changes:

- [vitest.config.js](vitest.config.js): add `environmentMatchGlobs: [['test/frontend/**', 'jsdom']]` and extend `include` to cover `test/**/*.test.{js,jsx}`.
- New [test/frontend/setup.js](test/frontend/setup.js): set up `@testing-library/react` cleanup hook.

### 2. Mocks

Two global mocks, imported from a shared test helper:

**`test/frontend/mocks/forgeReact.js`** — passthrough React implementation of `@forge/react`. Key pieces:

- Layout primitives (`Box`, `Stack`, `Inline`, `Heading`, `Text`, `Lozenge`, `Badge`, `Tag`, `TagGroup`, `Label`, `User`, `Link`, `EmptyState`, `Spinner`, `ProgressBar`, `SectionMessage`) → render as `<div>`/`<span>` with children.
- Interactive primitives (`Button`, `Textfield`, `TextArea`, `Radio`, `Toggle`, `Select`, `UserPicker`) → render minimal HTML that routes events into the provided callbacks. Crucially, `Select.onChange` must be invoked with `{ label, value }` (or an array for `isMulti`) to match production.
- Container primitives (`Modal`, `ModalTransition`, `ModalHeader`, `ModalTitle`, `ModalBody`, `ModalFooter`, `Tabs`, `Tab`, `TabList`, `TabPanel`, `Form`, `FormFooter`, `ButtonGroup`, `RequiredAsterisk`, `Tooltip`) → render children. `Tabs` needs a small state machine so `onChange(index)` fires when a `Tab` is clicked. `Modal.onClose` wires to an Escape-key handler.
- `DynamicTable` → render `rows.map(r => r.cells.map(c => c.content))` in a `<table>`.
- Hooks: `useProductContext` returns a configurable fixture (Confluence page context), `useTranslation` returns `{ t: (k) => k }`, `I18nProvider` renders children.
- Helpers: `xcss` is already an identity (`(s) => s`), mock it the same. `ForgeReconciler.render` is replaced with a no-op — tests render `<App />` directly.

**`test/frontend/mocks/forgeBridge.js`** — `vi.fn()` exports for `invoke`, `view.refresh`, `showFlag`, `requestConfluence`. Each test file configures `invoke.mockImplementation(({resolver}, payload) => ...)` to script the resolver return values.

Set both up via `vi.mock('@forge/react', ...)` and `vi.mock('@forge/bridge', ...)` in the test setup file.

### 3. Tests

Write behaviour-level tests, not implementation-detail tests. Each test renders `<App />` through the public entry module and drives it.

**[test/frontend/byline.test.jsx](test/frontend/byline.test.jsx)** — scenarios:

- Renders the current-level lozenge + description for a viewer.
- Editor clicks "Change classification" → modal opens → pending-jobs resolver called → picker renders allowed levels.
- Single-page classify: pick a new level, click Apply, assert `invoke('setClassification', ...)` was called with the right `levelId`, modal closes, success flag fires.
- Recursive classify: flip the toggle, descendant-count resolver called; click Apply, `startRecursiveClassify` called, then `processClassifyBatch` polled until `done: true`, completion flag fires.
- Pause: during an in-flight recursive job, click Pause → modal closes, KVS state preserved (no `cancelClassifyJob` invoked).
- Stop: click Stop → confirm → `cancelClassifyJob` invoked, flag fires.
- Resume pending job banner: mock `getUserPendingJobs` with an owner-page job, assert banner renders; click Resume → `processClassifyBatch` loop kicks in.
- History tab renders reversed entries; empty state otherwise.
- Resources tab renders only contacts/links whose `levelIds` include the current level (or are empty).

**[test/frontend/admin.test.jsx](test/frontend/admin.test.jsx)** — scenarios:

- Levels tab: add level (modal) → save → `setConfig` is dirty → click save → `invoke('setConfig', ...)` with the new levels array. Edit/delete levels. Delete level with pages triggers reclassify modal.
- Contacts tab: add/edit/delete contact — same pattern.
- Links tab: add/edit/delete link — external and page types.
- Languages tab: add/remove/reorder languages.
- Label Import: mock `listSpaces` + `listLabels`, open Labels tab → Import sub-tab, default labels auto-selected, counts refreshed via `countLabelPages`. Change scope to space, counts re-fetch. Click Start → `startLabelImport`, then `processLabelBatch` polled.
- Label Export: similar pattern through `countLevelGap`, `startLabelExport`, `processLabelBatch`. Invalid label names are disabled.
- Resume/discard pending label job from the banner.

**Pure-helper unit tests** (no rendering needed):

- [test/frontend/bylineHelpers.test.js](test/frontend/bylineHelpers.test.js) — `formatDate`, `makeLevelAppearance`, `partitionPendingJobs`, `filterForLevel`.
- [test/frontend/labelSyncHelpers.test.js](test/frontend/labelSyncHelpers.test.js) — `formatMappingLabels`.
- [test/frontend/labelJobLoop.test.js](test/frontend/labelJobLoop.test.js) — `runLabelJobLoop` with mocked `invoke`: happy path (done), stop path, error path, aborted path.
- [test/frontend/runRecursiveLoop.test.js](test/frontend/runRecursiveLoop.test.js) — same matrix for the byline loop. Verifies completion flag, stop flag, paused flag, abort-level-deleted/disallowed.

(The pure-helper and loop tests can only run against HEAD; pre-refactor, these functions were inline closures inside the giant App. They're additive safety nets, not part of the equivalence check.)

### 4. Equivalence verification

Goal: the component-level tests must pass both before and after the refactor.

```
# 1. Baseline run on the current (refactored) code
npx vitest run test/frontend/byline.test.jsx test/frontend/admin.test.jsx

# 2. Temporarily restore the pre-refactor source
git checkout HEAD~5 -- src/frontend/
# (this removes src/frontend/admin/ and src/frontend/byline/ subfolders
#  and restores the monolithic admin.jsx / byline.jsx)

# 3. Run the same tests — must still pass, proving the tests don't
#    depend on implementation details exposed by the refactor
npx vitest run test/frontend/byline.test.jsx test/frontend/admin.test.jsx

# 4. Restore the refactor
git checkout main -- src/frontend/

# 5. Re-run to confirm the tree is clean
npx vitest run
```

If step 3 fails on some tests, those tests are over-specified (coupled to the new structure) — rewrite them against the public UI before trusting the comparison.

If step 3 passes and step 5 passes, **behavioural equivalence is verified for everything the tests cover**. Tests that exercise a UI path that we know the user uses act as a regression fence going forward.

### 5. Gaps this plan explicitly doesn't cover

- **Forge UI Kit fidelity**: our mocks are passthrough; real UI Kit may render differently (layout, focus, a11y). Still need one tunnel smoke-test pass after the tests are green.
- **Realtime subscriptions**: `view.refresh` is mocked as a spy; we're not testing the real Atlassian event stream.
- **Deep visual regression**: no screenshot testing.

## Files to add / modify

- Add: [test/frontend/setup.js](test/frontend/setup.js), [test/frontend/mocks/forgeReact.js](test/frontend/mocks/forgeReact.js), [test/frontend/mocks/forgeBridge.js](test/frontend/mocks/forgeBridge.js)
- Add: [test/frontend/byline.test.jsx](test/frontend/byline.test.jsx), [test/frontend/admin.test.jsx](test/frontend/admin.test.jsx)
- Add: [test/frontend/bylineHelpers.test.js](test/frontend/bylineHelpers.test.js), [test/frontend/labelSyncHelpers.test.js](test/frontend/labelSyncHelpers.test.js), [test/frontend/labelJobLoop.test.js](test/frontend/labelJobLoop.test.js), [test/frontend/runRecursiveLoop.test.js](test/frontend/runRecursiveLoop.test.js)
- Modify: [package.json](package.json) — add `@testing-library/react`, `@testing-library/user-event`, `jsdom` to `devDependencies`
- Modify: [vitest.config.js](vitest.config.js) — add `environmentMatchGlobs` for `test/frontend/**`, widen `include` to pick up `.test.jsx`, reference the setup file

Existing utilities to reuse:

- [src/frontend/byline/bylineHelpers.js](src/frontend/byline/bylineHelpers.js), [src/frontend/admin/labelSyncHelpers.js](src/frontend/admin/labelSyncHelpers.js), [src/frontend/admin/labelJobLoop.js](src/frontend/admin/labelJobLoop.js), [src/frontend/byline/runRecursiveLoop.js](src/frontend/byline/runRecursiveLoop.js) — already pure / dependency-injected, directly testable.

## Verification checklist

1. `npx vitest run` — 198 backend + new frontend tests all green.
2. `npx vitest run test/frontend/` — clean on refactored code.
3. `git checkout HEAD~5 -- src/frontend/ && npx vitest run test/frontend/` — must all pass against the pre-refactor code. Then `git checkout main -- src/frontend/` to restore.
4. `npm run lint` — no new warnings.
5. `npm run format:check` — clean.
6. One manual smoke pass in the tunnel site covering: classify single, classify recursive with pause/resume, label import, label export, level/contact/link CRUD.
