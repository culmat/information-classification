---
title: Recursive Classification
description: Tree classification, async processing, and progress tracking.
section: information-classification
order: 40
slug: recursive-classification
---

# Recursive Classification

Recursive classification lets you apply a classification level to a page and all of its sub-pages in one operation.

## How to use it

1. Click the byline badge on the parent page.
2. Click **Change Classification**.
3. Select the target level.
4. Toggle **Apply to all sub-pages**. The dialog shows how many sub-pages will be updated.
5. Click **Apply**.

Only sub-pages that currently have a different classification are updated. Pages already at the target level are skipped.

## Synchronous vs. asynchronous

The app automatically chooses the processing mode based on the number of pages:

| Pages to update | Mode         | Behavior                                                                  |
| --------------- | ------------ | ------------------------------------------------------------------------- |
| Up to 50        | Synchronous  | Processed immediately, result shown in the dialog                         |
| More than 50    | Asynchronous | Parent page classified immediately, sub-pages processed in the background |

### Asynchronous processing

For large page trees, the app:

1. Classifies the parent page immediately.
2. Queues the remaining sub-pages for background processing.
3. Shows a progress bar with an estimated time of arrival.
4. You can close the dialog - processing continues in the background.
5. Re-open the dialog on the same page to see current progress.

Progress updates appear every 10 pages. When complete, the dialog shows the final count of classified and failed pages.

## Timeout handling

Synchronous processing has a 20-second time limit. If the operation times out (e.g. on a large tree that was underestimated), the app reports how many pages were classified and how many remain. You can re-run the operation to continue where it left off.

## Reclassification

Administrators can also reclassify all pages at a given level to a different level - for example, when removing or renaming a level. This is available in the global [Configuration](Configuration) under the Levels tab and uses the same asynchronous processing pipeline.
