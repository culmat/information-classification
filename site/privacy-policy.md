---
title: Privacy Policy
description: What data is collected, where it is stored, and GDPR rights.
section: information-classification
order: 60
slug: privacy-policy
---

# Privacy Policy

**Information Classification for Confluence**

## Provider and Contact

|         |                                     |
| ------- | ----------------------------------- |
| Name    | Matthias Cullmann                   |
| Contact | [culm@culm.at](mailto:culm@culm.at) |
| Website | [culm.at](https://culm.at)          |

## How the App Works

Information Classification for Confluence is a Confluence Cloud app that allows teams to classify pages with configurable security levels. The app runs entirely on the [Atlassian Forge](https://developer.atlassian.com/platform/forge/) platform.

## What Data Is Stored

The app stores the following data:

**In Confluence content properties (on each classified page):**

| Data                                   | Purpose                                                                                             |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Classification level ID                | Record the page's current classification level                                                      |
| Atlassian account ID of the classifier | Record who classified the page. This is an opaque platform identifier, not a name or email address. |
| Classification timestamp               | Record when the classification was made                                                             |
| Classification history                 | Audit trail of level changes (up to 300 entries per page)                                           |
| Byline display data                    | Title and tooltip for the classification badge                                                      |

**In Forge Key-Value Storage (per-installation, hosted by Atlassian):**

| Data                 | Purpose                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| Global configuration | Classification levels, default level, contacts, links, languages       |
| Space configurations | Per-space level overrides and defaults                                 |
| Async job state      | Temporary progress data for bulk operations (automatically cleaned up) |

## What Data Is NOT Stored

- No names, email addresses, or other personal information
- No tracking data, analytics, or telemetry
- No cookies
- No data is sent to external services

## Where Data Is Stored

All data is stored within the Atlassian platform - either as Confluence content properties or in Forge Key-Value Storage. The Provider does not operate any servers or infrastructure outside of Atlassian's platform. Data never leaves Atlassian's infrastructure. The Provider has no access to customer data at runtime.

Data residency is governed entirely by [Atlassian's data residency policies](https://www.atlassian.com/trust/privacy/data-residency).

## Data Retention and Deletion

- Classification data is stored as content properties on Confluence pages. When a page is permanently deleted, its content properties are removed by Confluence.
- Global and space configuration data is stored in Forge KVS and persists for the lifetime of the app installation.
- Uninstalling the app removes all Forge KVS data. Content properties on pages may be retained by Confluence.
- There is no separate "delete all data" function; data follows the lifecycle of the pages and the app installation.

## GDPR and Data Subject Rights

The app only stores Atlassian account IDs, which are opaque platform identifiers assigned by Atlassian. The app does not process personal data beyond what Atlassian already manages as part of its platform.

All standard Atlassian mechanisms for data residency, data subject access requests (DSAR), and right-to-erasure work out of the box. When Atlassian processes a data subject request, it applies to the account IDs stored by this app as well.

No separate Data Processing Addendum is required. Atlassian acts as the data processor for all data stored on the Forge platform. The data processing relationship between Atlassian and the customer is governed by [Atlassian's Data Processing Addendum](https://www.atlassian.com/legal/data-processing-addendum).

## Third Parties

The app does not share data with any third parties. The app does not make external API calls. All processing occurs within the Atlassian Forge platform.

## Changes to This Policy

This policy may be updated to reflect changes in the app's functionality or applicable regulations. The "Last updated" date below indicates when the most recent revision was made.

## Contact

For questions about this privacy policy or the app's data practices, contact [culm@culm.at](mailto:culm@culm.at).

---

_Last updated: 7 April 2026_
