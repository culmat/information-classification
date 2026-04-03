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

## Deploy

```sh
forge lint                                    # validate manifest
forge deploy --non-interactive -e development # deploy to dev
forge install --non-interactive --upgrade ... # upgrade if manifest changed
```

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
