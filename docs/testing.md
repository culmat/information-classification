# Testing

## Unit tests

Run with `npx vitest run`. Tests live in `test/` mirroring `src/` structure.

**Mocking pattern:** Mock Forge APIs before importing modules under test:

```js
const mockStorage = { get: vi.fn(), set: vi.fn() };
vi.mock('@forge/kvs', () => ({ kvs: mockStorage }));

const { getGlobalConfig } = await import('../../src/storage/configStore');
```

Always `vi.clearAllMocks()` in `beforeEach`. Use `await import()` (not static import) so mocks are in place before module evaluation.

## E2E with shared browser MCP

The shared browser MCP provides Playwright-based browser automation for verifying deployed Forge apps.

### Forge iframe handling

Forge UI Kit with `render: native` puts content in the main DOM (not an iframe). Use `page.waitForSelector('text=...')` to wait for Forge content to load. For byline popups, click the badge first, then wait:

```js
await page.getByTestId('byline-forge-app-button').click();
await page.waitForSelector('text=Classification', { timeout: 15000 });
```

### Key URLs

| Page                  | URL pattern                                                                 |
| --------------------- | --------------------------------------------------------------------------- |
| Admin global settings | `https://<site>/wiki/admin/forge/apps/<appId>/<envId>/classification-admin` |
| Confluence page       | `https://<site>/wiki/spaces/<spaceKey>/pages/<pageId>`                      |

**Sites and environment IDs:**

| Environment | Site                  | Env ID                               |
| ----------- | --------------------- | ------------------------------------ |
| development | dev-cul.atlassian.net | 1cce4528-e46b-42cd-8c6f-8743d1389cde |
| staging     | sta-cul.atlassian.net | 5681e13c-eafa-40cd-aa57-902a374e7c1c |
| production  | cul.atlassian.net     | 3d50e48b-4570-47f4-9558-6232d11661ef |

App ID: `c5452f23-8798-4ee2-b33c-ee3d3a792547`.

### Tips

- Confluence pages take 3-5 seconds to fully load Forge modules. Use `waitForTimeout(5000)` before interacting.
- Screenshots may time out on Confluence — pass `{ timeout: 10000 }` or skip screenshots and read text content.
- Use `page.getByRole('tab', { name: 'Audit' }).click()` for tab navigation.
- **Always save screenshots and snapshots to `.playwright-mcp/`** (e.g. `filename: '.playwright-mcp/my-test.png'`). This directory is gitignored. Never save files to the project root.

## E2E with acli

The [Atlassian CLI](https://developer.atlassian.com/cloud/acli/) provides authenticated access to Confluence APIs.

```sh
acli confluence space list --json          # list spaces
acli confluence page view --id <id> --json # inspect page
```

`acli` has limited write commands — use the shared browser MCP for classification actions and UI verification.

## See also

- [DEVELOPMENT.md](../DEVELOPMENT.md) — setup and deploy workflows
- [persistence.md](persistence.md) — storage tiers and SQL gotchas
