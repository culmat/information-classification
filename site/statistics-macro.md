---
title: Statistics Macro
description: Embed classification statistics on any page.
section: information-classification
order: 55
slug: statistics-macro
---

# Statistics Macro

The Classification Statistics macro lets you embed a classification distribution chart and a list of recently classified pages on any Confluence page. Unlike the admin-only Statistics tab, any user can view the macro — data is filtered by their permissions.

## Inserting the macro

1. Edit a page.
2. Type `/Classification Statistics` and select the macro from the quick insert menu.
3. The macro immediately renders with default settings (current page tree, all sections).
4. To customize, select the macro and click the pencil icon to open the configuration panel.

## Configuration options

| Option                                  | Values                                                  | Default                 | Description                                                                                                                                                 |
| --------------------------------------- | ------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scope**                               | This page and sub-pages, Current space, Entire instance | This page and sub-pages | Controls which pages are included in the statistics.                                                                                                        |
| **Max recent pages**                    | Number (1-50)                                           | 10                      | How many recently classified pages to show in the table.                                                                                                    |
| **Count unclassified as default level** | Checkbox                                                | Checked                 | When checked, unclassified pages are counted under the instance default level in the chart. When unchecked, they appear as a separate "Unclassified" slice. |

## Features

- **Two tabs**: Distribution and Recently Classified — switch between views without reloading
- **Donut chart** showing the classification distribution with color-coded level Lozenges
- **Clickable legend** — click any level to search for all pages classified at that level
- **Recently classified pages** table with level indicator, relative timestamp, and links
- **Smart columns** — the Space column only appears when scope is "Entire instance"
- **Refresh button** to reload data without reloading the page

## Notes

- Classification counts may take up to a minute to reflect recent changes due to search index lag.
- The macro respects Confluence page permissions — users only see statistics for pages they have access to.
- On a leaf page with no sub-pages, the "This page and sub-pages" scope shows only that page's classification.

## Use cases

- **Team homepage:** Drop the macro on a space homepage to show the space's classification health at a glance.
- **Compliance dashboard:** Create a dedicated page with the macro set to "Entire instance" scope to monitor organization-wide classification coverage.
- **Project overview:** Use "This page and sub-pages" on a project root page to track classification within a project tree.
