# Scope audit

Least-privilege audit of `manifest.yml` permissions. Every declared scope must map to an API endpoint the app actually calls.

## API calls the app makes

### Reads

| Endpoint                                                       | Caller                                                                                                                                                                   | Likely required scope                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `GET /wiki/rest/api/user/memberof`                             | [src/utils/adminAuth.js:14](../src/utils/adminAuth.js#L14)                                                                                                               | `read:confluence-user` (classic) or `read:user:confluence` (granular) |
| `GET /wiki/rest/api/space/{key}/permission`                    | [src/utils/adminAuth.js:51](../src/utils/adminAuth.js#L51)                                                                                                               | `read:space:confluence`                                               |
| `GET /wiki/rest/api/content/{id}/restriction/byOperation/read` | [src/services/restrictionService.js:19](../src/services/restrictionService.js#L19)                                                                                       | `read:content.restriction:confluence`                                 |
| `GET /wiki/api/v2/pages/{id}/ancestors`                        | [src/services/restrictionService.js:43](../src/services/restrictionService.js#L43)                                                                                       | `read:page:confluence`                                                |
| `GET /wiki/api/v2/pages/{id}/properties`                       | [src/services/contentPropertyService.js:107](../src/services/contentPropertyService.js#L107)                                                                             | `read:content.property:confluence`                                    |
| `GET /wiki/rest/api/search?cql=...`                            | [src/services/classificationService.js:226](../src/services/classificationService.js#L226), [src/resolvers/configResolver.js:74](../src/resolvers/configResolver.js#L74) | `search:confluence` + content read scope                              |
| `GET /wiki/api/v2/labels`                                      | [src/services/labelService.js:90](../src/services/labelService.js#L90)                                                                                                   | `read:label:confluence`                                               |
| `GET /wiki/api/v2/spaces`                                      | [src/resolvers/importResolver.js:26](../src/resolvers/importResolver.js#L26)                                                                                             | `read:space:confluence`                                               |

### Writes

| Endpoint                                          | Caller                                                                                       | Likely required scope                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `POST /wiki/api/v2/pages/{id}/properties`         | [src/services/contentPropertyService.js:161](../src/services/contentPropertyService.js#L161) | `write:content.property:confluence`                                         |
| `PUT /wiki/api/v2/pages/{id}/properties/{propId}` | [src/services/contentPropertyService.js:189](../src/services/contentPropertyService.js#L189) | `write:content.property:confluence`                                         |
| `POST /wiki/rest/api/content/{id}/label`          | [src/services/labelService.js:59](../src/services/labelService.js#L59)                       | `write:label:confluence` (granular) OR `write:confluence-content` (classic) |
| `DELETE /wiki/rest/api/content/{id}/label`        | [src/services/labelService.js:46](../src/services/labelService.js#L46)                       | `write:label:confluence` (granular) OR `write:confluence-content` (classic) |

No other write endpoints are called. No direct page-body writes. No space, user, or attachment writes.

## Current scope declarations

```yaml
permissions:
  scopes:
    - storage:app
    - read:page:confluence
    - write:page:confluence # suspect
    - read:space:confluence
    - read:content.property:confluence
    - write:content.property:confluence
    - read:content.metadata:confluence # suspect
    - read:content.restriction:confluence
    - read:user:confluence
    - read:confluence-content.all # classic, overlaps with granular
    - write:confluence-content # classic, overlaps with write:label:confluence
    - read:confluence-user # classic, required for /user/memberof
    - read:label:confluence
    - write:label:confluence
    - search:confluence
```

`read:content.permission:confluence` was removed — it gated the content-permission API which this app does not call.

## Suspect scopes

### `write:page:confluence` — likely removable

No endpoint in the table above requires it. Page-body writes are not performed. Content-property writes are covered by the dedicated granular scope `write:content.property:confluence`.

**Risk:** low. Remove, redeploy, verify byline classification + recursive classification + reclassify-level flows.

### `write:confluence-content` — likely removable

Classic scope covering any content write. The only writes that would fall under it are label add/delete, already covered by the granular `write:label:confluence`. Atlassian discourages mixing classic and granular scopes.

**Risk:** low–medium. The label endpoints are v1 and were historically documented with the classic scope. Remove after `write:page:confluence` has been verified safe, and test label import/export specifically.

### `read:content.metadata:confluence` — possibly removable

Not directly required by any endpoint in the table above. v2 page-property and ancestor endpoints are covered by `read:page:confluence` and `read:content.property:confluence`. Kept because CQL search results sometimes include metadata that Confluence gates behind this scope.

**Risk:** medium. Leave in place unless a deliberate test confirms CQL results are unaffected.

### `read:confluence-content.all` — possibly removable

Classic scope for reading content broadly. CQL search on content properties _may_ require this alongside `search:confluence` and `read:page:confluence`. The granular search scope alone has been reported as insufficient for some CQL aliases.

**Risk:** medium. Leave in place unless CQL-based flows (audit dashboard, recursive classification, reclassify) are re-tested after removal.

### `read:confluence-user` — keep

`/wiki/rest/api/user/memberof` is a v1 endpoint historically requiring this classic scope. `read:user:confluence` alone has been unreliable for this specific endpoint in practice.

**Risk:** keeping is safe.

## Recommended removal order

1. **Now:** `read:content.permission:confluence` — done.
2. **Next:** `write:page:confluence` — deploy, verify classification flows (byline, recursive, reclassify).
3. **Then:** `write:confluence-content` — deploy, verify label import/export.
4. **Optional, with care:** `read:content.metadata:confluence` and `read:confluence-content.all` — only remove if a dedicated test pass confirms CQL-based audit and classification still work.

Always run through the full flow in the dev environment (`dev-cul.atlassian.net`) before rolling to staging/production.

## Scopes that must stay

- `storage:app` — Forge KVS (`@forge/kvs`) for global + per-space config.
- `read:page:confluence` — v2 page ancestors, implicit for property reads.
- `read:space:confluence` — space list + space permission endpoint.
- `read:content.property:confluence` / `write:content.property:confluence` — classification data on pages.
- `read:content.restriction:confluence` — inherited-viewer warning.
- `read:user:confluence` — user lookup in resolvers.
- `read:label:confluence` / `write:label:confluence` — label import wizard + export.
- `search:confluence` — every CQL-based flow (audit dashboard, recursive classification, label import counts, reclassify).
- `read:confluence-user` — `/user/memberof` admin check.
