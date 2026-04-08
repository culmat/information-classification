---
title: Space Settings
description: Per-space level overrides and space defaults.
section: information-classification
order: 20
slug: space-settings
---

# Space Settings

Space administrators can override the global classification configuration for their space. Open **Space Settings -> Information Classification** to access space-level settings.

Space settings have two tabs: **Configuration** and **Statistics**.

## Configuration

Space admins can:

- **Restrict available levels** - disable levels that are not relevant for the space. Only globally allowed levels can be toggled. Space admins cannot add new levels.
- **Set a space default** - choose which level applies to unclassified pages in the space. Must be one of the space's allowed levels.

Changes only affect pages within the space. The global configuration remains unchanged.

### Reset to global defaults

Click **Reset** to remove all space overrides and revert to the global configuration.

## How overrides work

The space configuration merges with the global configuration at read time:

1. Levels not in the space's allowed list are shown as disabled.
2. The space default takes precedence over the global default.
3. Contacts and links are always inherited from the global configuration - they cannot be overridden per space.

## Statistics

The Statistics tab shows the same coverage, distribution, and recent-changes view as the global statistics, but scoped to the current space only.
