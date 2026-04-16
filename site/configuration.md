---
title: Configuration
description: Configure global classification levels and behavior.
section: information-classification
order: 10
---

# Configuration

The global configuration is accessible to Confluence site administrators under **Confluence Settings -> Information Classification**.

The settings are organized into six tabs: **Levels**, **Contacts**, **Links**, **Languages**, **Labels**, and **Statistics**.

## Levels

Each classification level has:

| Property                | Description                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Name**                | Display name (required in English, optional in additional languages)                                                                |
| **Color**               | Badge color - 21 colors available (green, blue, red, yellow, orange, purple, teal, magenta, grey, lime, and their light variants)   |
| **Description**         | Explanatory text shown in the classification popup (multilingual)                                                                   |
| **Allowed**             | Whether users can assign this level. Disallowed levels cannot be selected but remain visible on pages already classified with them. |
| **Requires protection** | When enabled, pages classified with this level show a warning if they lack view restrictions                                        |
| **Error message**       | Custom message shown when a user attempts to select a disallowed level (multilingual)                                               |

Levels can be reordered by drag-and-drop. The order determines how they appear in the classification dialog and in statistics.

### Adding a level

Click **Add level**, fill in at least the English name and a color, then save.

### Editing a level

Click the edit icon on any level row to open the level editor. Changes take effect immediately after saving.

### Disabling a level

Toggle the **Allowed** switch off. Pages already classified with this level keep their classification, but users cannot select it for new classifications. Optionally provide an error message explaining why.

## Default level

The default level is shown for pages that have not been explicitly classified. It must be an allowed level. Change it via the dropdown below the levels table.

## Contacts

Contacts are shown in the classification popup under the **Resources** tab. They help users know who to reach out to about classification questions.

Each contact has a type:

- **Confluence User** - links to a user profile
- **Email address** - mailto link
- **Free text** - plain label (e.g. "Your department's data officer")

## Links

Links appear alongside contacts in the **Resources** tab. Use them to point users to policies, guidelines, or external resources. Each link has a name and a URL.

## Languages

The app supports multilingual level names and descriptions. English is always available. Add additional languages from the supported list (20+ languages including German, French, Japanese, Chinese, and more).

When a user views the classification popup, the app resolves text based on their Confluence locale, falling back to English if no translation is available.

## Labels

The Labels tab provides **Synchronize from Labels** and **Synchronize to Labels** wizards for bulk classification operations.

See [Labels and Search](Labels-and-Search) for details.

## Statistics

The Statistics tab shows classification coverage and distribution across the entire instance.

- **Coverage** - percentage of pages that have been explicitly classified
- **Distribution chart** - donut chart showing how many pages are at each level
- **Recent changes** - table of the last 20 classified pages with links

Toggle **Show unclassified as separate slice** to see unclassified pages as their own segment or rolled into the default level.
