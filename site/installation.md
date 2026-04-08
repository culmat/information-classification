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

Once installed, a classification badge appears in the byline of every page. Pages are initially unclassified and show the default level (Internal).

## First-time setup

The app ships with four default levels based on ISO 27001:

| Level        | Color  | Description                                                                          |
| ------------ | ------ | ------------------------------------------------------------------------------------ |
| Public       | Green  | Intended for general publication, no restrictions                                    |
| Internal     | Blue   | Available to all employees, normal business sharing                                  |
| Confidential | Orange | Authorized personnel only, requires page restrictions                                |
| Secret       | Red    | Disallowed by default - a placeholder for data that must not be stored in Confluence |

The default classification for unclassified pages is **Internal**.

These defaults are a starting point. You can rename, recolor, add, or remove levels in the [global configuration](Configuration).

## Permissions

| Area                     | Who can access                  |
| ------------------------ | ------------------------------- |
| Byline badge (read-only) | All logged-in users             |
| Change classification    | Users with page edit permission |
| Global settings          | Confluence site administrators  |
| Space settings           | Space administrators            |
