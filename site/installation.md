---
title: Installation
description: Install from the Marketplace and first-time setup.
section: information-classification
order: 10
---

# Installation

**Information Classification** is a Confluence Cloud app. It requires a [Confluence Cloud](https://www.atlassian.com/software/confluence) instance and a Confluence administrator to install it.

## Install from the Atlassian Marketplace

1. Go to **Confluence Settings -> Manage apps** (you need site-admin access).
2. Click **Find new apps** and search for **Information Classification**.
3. Click **Get app** and follow the prompts.

Once installed, the app ships with no classification scheme preselected. The byline badge stays hidden until a site administrator completes first-time setup.

## First-time setup

1. Open **Confluence Settings -> Apps -> Information Classification**.
2. A setup wizard offers three starting templates. Pick one, or choose **Start from scratch** to define your own levels.

| Template               | Levels                                            |
| ---------------------- | ------------------------------------------------- |
| **ISO 27001**          | Public / Internal / Confidential / Secret         |
| **NIST**               | Public / Internal / Confidential / Restricted     |
| **Government**         | Unclassified / Confidential / Secret / Top Secret |
| **Start from scratch** | Empty - add levels yourself                       |

After a template is applied, you can rename, recolor, reorder, add, or remove levels in the [global configuration](Configuration). Deleting every level returns you to the setup wizard, so you can switch schemes any time.

Classification levels are optional: if the config is empty, the byline badge is hidden and pages remain silently unclassified.

## Permissions

| Area                     | Who can access                  |
| ------------------------ | ------------------------------- |
| Byline badge (read-only) | All logged-in users             |
| Change classification    | Users with page edit permission |
| Global settings          | Confluence site administrators  |
| Space settings           | Space administrators            |
