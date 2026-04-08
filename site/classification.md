---
title: Classification
description: How to classify a page, the byline badge, and restriction warnings.
section: information-classification
order: 30
---

# Classification

## The byline badge

Every Confluence page shows a classification badge in the page byline.

- **Unclassified pages** show the default level (e.g. "Internal").
- **Classified pages** show the explicitly assigned level.
- A **warning icon** appears when there is a mismatch between the classification and the page's view restrictions.

## Viewing classification details

Click the byline badge to open the classification popup. It has three tabs:

| Tab           | Content                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------- |
| **Level**     | Current classification level, its description, and who classified the page (with timestamp) |
| **Resources** | Contacts and links configured by the administrator                                          |
| **History**   | Audit trail of all classification changes (who, when, from -> to)                           |

## Changing the classification

1. Click the byline badge to open the popup.
2. Click **Change Classification**.
3. Select the target level from the list. Only allowed levels are shown.
4. Optionally enable **Apply to all sub-pages** to classify the entire page tree (see [Recursive Classification](Recursive-Classification)).
5. Click **Apply**.

The classification is applied immediately. The byline badge updates to reflect the new level.

Only users with **edit permission** on the page can change its classification.

## Restriction warnings

Levels can be configured to require page view restrictions (the **Requires protection** flag in [Configuration](Configuration)).

| Scenario                                                              | Warning                                                               |
| --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Level requires protection, but the page has no view restrictions      | "This classification level requires page restrictions"                |
| Level does not require protection, but the page has view restrictions | "This page has unnecessary restrictions for its classification level" |

Warnings appear as a warning icon on the byline badge and as a message in the classification popup, with a link to manage page restrictions.

The app checks both direct page restrictions and restrictions inherited from ancestor pages.

## What gets stored

When a page is classified, the app writes:

1. **Classification property** - the level ID, who classified it, and when (indexed for CQL search)
2. **Byline property** - display title and tooltip for the badge
3. **History entry** - appended to the audit trail (up to 300 entries per page)

All data is stored as Confluence content properties on the page itself.
