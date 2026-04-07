# Contributing

Code quality principles shared by humans and agents. This is the single source of truth for how code should be written.

## Clean Code Principles

- **Single Responsibility:** Every function, class, and module must do only one thing.
- **DRY:** Avoid duplicating logic; reuse existing functions or abstractions where appropriate.
- **KISS:** Always choose the simplest solution that works.
- **YAGNI:** Do not implement features not explicitly required. Remove unused code whenever possible.
- **Short and Focused:** Keep files and functions as short as possible without losing clarity.
- **Meaningful Names:** All identifiers must clearly express intent and purpose.

## Code Style

- **Vanilla JavaScript** -- no TypeScript, no JSX file extensions (use `.js` for backend, `.jsx` for frontend).
- **Verbose comments** -- explain design decisions so an intermediate JS developer with limited Forge experience can follow.
- **No file-level boilerplate** -- keep top-of-file comments to a brief purpose statement, then imports.
- **No dead code** -- remove unused or redundant code.
- **i18n** -- all user-facing strings go through `useTranslation()` / `t()`. Update all four locale files (en, de, fr, ja) for every new key.

## YAGNI in Practice

- No speculative abstractions or config for single values.
- No features not explicitly required by the current task.
- Scope limited to what's needed now, not what might be needed later.

## Test Guidelines

- Write unit tests for resolvers, services, and storage functions.
- Mock Forge APIs (`@forge/kvs`, `@forge/sql`, `@forge/api`) before importing modules.
- Tests live in `test/` mirroring `src/` structure.
- Use `vitest` with `vi.mock()` and dynamic `await import()`.

## Refactoring Guidelines

- **Boy scout rule:** Leave code cleaner than you found it, but only in files you're touching.
- **Separate commits:** Refactoring commits must be separate from behavior changes.
- **Tests before and after:** Ensure tests pass before refactoring and after.
