# Development

## Prerequisites

- Node.js 22.x, npm
- Forge CLI: `npm install -g @forge/cli`
- Authenticated: `forge login`

## Setup

```sh
npm install
forge deploy --non-interactive -e development
forge install --non-interactive --site <site>.atlassian.net --product confluence --environment development
```

## Project structure

```
src/
  frontend/          UI Kit components (byline, admin, spaceSettings)
  resolvers/         Backend resolvers (classify, config, audit, spaceConfig)
  services/          Business logic (classification, content properties, restrictions)
  storage/           Data access (configStore, spaceConfigStore, auditStore)
  storage/migrations/ SQL schema and migrations
  shared/            Constants, defaults
  i18n/              Translations (en, de, fr, ja)
test/                Unit tests mirroring src/ structure
docs/                Architecture and topic documentation
```

## Dev loop: forge tunnel + worktree

`forge tunnel` hot-reloads code changes instantly (no deploy needed). To avoid partial file states during multi-file edits, tunnel runs in a separate git worktree. Changes are synced atomically.

**One-time setup:**
```sh
git worktree add ../ic-tunnel HEAD --detach
cd ../ic-tunnel && npm install
```

**Start tunnel (in a separate terminal):**
```sh
cd ../ic-tunnel && forge tunnel
```

**Sync after editing (from main worktree):**
```sh
./tunnel-sync.sh           # sync once
./tunnel-sync.sh --watch   # auto-sync on file changes (requires fswatch)
```

**When to deploy instead of tunnel:**
- Manifest changes (new modules, scopes, functions) — tunnel requires `forge deploy` + restart
- New npm dependencies — need `npm install` in the worktree too
- Final verification before commit

## Environments

| Forge Environment | Site | Purpose |
|-------------------|------|---------|
| development | dev-cul.atlassian.net | Active dev, tunnel, testing |
| staging | sta-cul.atlassian.net | Pre-production validation |
| production | cul.atlassian.net | Production (pending Marketplace listing) |

Legacy: devds.atlassian.net is still installed on the development environment.

**Restrictions by environment:**
- **Staging:** No `forge tunnel` — must use `forge deploy` for every change.
- **Production:** No `forge tunnel` or `forge logs` — debug via development or staging.

## Deploy

```sh
forge lint                                    # validate manifest
forge deploy --non-interactive -e development # deploy to dev
forge install --non-interactive --upgrade --site dev-cul.atlassian.net --product confluence --environment development
```

To deploy to staging or production:
```sh
forge deploy --non-interactive -e staging
forge install --non-interactive --upgrade --site sta-cul.atlassian.net --product confluence --environment staging
```

## CI/CD

GitHub Actions auto-deploys to development on push to `main`. Manual dispatch deploys to staging or production. See [.github/workflows/forge-deploy.yml](.github/workflows/forge-deploy.yml).

Secrets (`FORGE_EMAIL`, `FORGE_API_TOKEN`) are set in the GitHub repo.

## Test

```sh
npx vitest run    # unit tests
forge logs -e development  # check runtime logs
```

For e2e testing, see [docs/testing.md](docs/testing.md).

## Key topics

- [docs/persistence.md](docs/persistence.md) — three-tier storage architecture, Forge SQL gotchas
- [docs/ui-kit.md](docs/ui-kit.md) — component patterns, known issues
- [docs/testing.md](docs/testing.md) — unit tests, acli, shared browser MCP

## See also

- [CONTRIBUTING.md](CONTRIBUTING.md) — code quality rules
- [AGENTS.md](AGENTS.md) — AI agent guardrails
