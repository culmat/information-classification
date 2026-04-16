---
title: Labels and Search
description: CQL search, synchronize classifications from and to labels.
section: information-classification
order: 50
slug: labels-and-search
---

# Labels and Search

## CQL search

Classification data is indexed as Confluence content properties with CQL search aliases. You can search for classified pages using standard CQL in Confluence search or the REST API.

Please keep in mind that the search index can take seconds or, in the worst case, minutes to update, so classification changes are not reflected instantly in search results.

| Alias                         | Type | Example                                        |
| ----------------------------- | ---- | ---------------------------------------------- |
| `culmat_classification_level` | Text | `culmat_classification_level = "confidential"` |
| `culmat_classification_date`  | Date | `culmat_classification_date > "2025-01-01"`    |
| `culmat_classified_by`        | Text | `culmat_classified_by = "5d1234abc..."`        |

Combine with standard CQL operators:

```text
type = page AND space = "ENGINEERING" AND culmat_classification_level = "confidential"
```

You can use these aliases in the Confluence search bar at `/wiki/search?cql=...`.

## Synchronize from Labels

The "Synchronize from Labels" wizard (in global [Configuration](Configuration) -> Labels tab) lets you bulk-classify pages based on their existing Confluence labels.

1. Select labels: pick one or more existing Confluence labels per classification level from the dropdown.
2. Choose the scope: all spaces or specific spaces.
3. Preview the number of matching pages.
4. Start the synchronization.

Options:

- **Remove labels after import** - deletes the matched labels from pages after classification

The synchronization runs asynchronously with progress tracking.

If a page matches multiple label-to-level mappings, the most restrictive level wins (based on level sort order).

## Synchronize to Labels

The "Synchronize to Labels" wizard lets you add Confluence labels to pages based on their current classification.

1. Create mappings: assign a label name to each classification level.
2. Choose the scope: all spaces or specific spaces.
3. Preview the number of classified pages per level.
4. Start the synchronization.

Labels are added to pages - existing labels are not affected. The synchronization runs asynchronously with progress tracking.

## Use cases

- **Migration:** Synchronize classifications from a label-based scheme you were using before.
- **Integration:** Synchronize classifications to labels for use with other apps or automation that reads Confluence labels.
- **Reporting:** Use CQL aliases in Confluence search or dashboards to find pages by classification level.
