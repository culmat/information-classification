---
title: Trust Center
description: Security, data practices, privacy, compliance, and support.
section: information-classification
order: 60
---

# Trust Center

Information Classification for Confluence is designed with a minimal footprint: it stores only what is strictly necessary to record page classifications, runs entirely within Atlassian's infrastructure, and gives customers full control over their data.

## Platform & Architecture

The app is built on [Atlassian Forge](https://developer.atlassian.com/platform/forge/), Atlassian's serverless cloud platform. This means:

- All code runs inside Atlassian's infrastructure - there are no external servers operated by the Provider
- The app makes no outbound network calls to third-party services
- All data remains within your Atlassian instance's hosting environment
- The Provider has no access to customer data at runtime

## Data Stored

Data is stored in two locations, both hosted and managed by Atlassian:

**Confluence content properties** (on each classified page):

| Data                                   | Purpose                                                                                   |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| Classification level ID                | Record the page's current classification level                                            |
| Atlassian account ID of the classifier | Record who classified the page. Opaque platform identifier - not a name or email address. |
| Classification timestamp               | Record when the classification was made                                                   |
| Classification history                 | Audit trail of level changes (up to 300 entries per page)                                 |
| Byline display data                    | Title and tooltip for the classification badge                                            |

**Forge Key-Value Storage** (per-installation, hosted by Atlassian):

| Data                 | Purpose                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| Global configuration | Classification levels, default level, contacts, links, languages       |
| Space configurations | Per-space level overrides and defaults                                 |
| Async job state      | Temporary progress data for bulk operations (automatically cleaned up) |

### What is NOT stored

- No names, email addresses, or other personal information
- No tracking data, analytics, or telemetry
- No cookies
- No data is transmitted to the Provider or any external service

## Security

Security is provided by the Atlassian Forge platform:

- **Storage isolation** - each Confluence installation has its own Forge Key-Value Storage; data from one site cannot be accessed by another
- **Encrypted storage** - Atlassian encrypts data at rest and in transit as part of the Forge platform
- **No Provider access** - the Provider cannot query or read customer data at runtime
- **Forge sandbox** - Forge restricts what the app can do at the platform level; outbound network calls require explicit allowlist approval from Atlassian
- **Zero egress** - the app makes no external API calls; all processing occurs via the Forge `requestConfluence` bridge

### Reporting a vulnerability

Please do not open public GitHub issues for suspected vulnerabilities. Preferred: [report privately via GitHub](https://github.com/culmat/information-classification/security/advisories/new). Fallback: email <culm@culm.at>. The full policy lives in [SECURITY.md](https://github.com/culmat/information-classification/blob/main/SECURITY.md).

## Privacy & GDPR

The app processes only Atlassian account IDs, which are opaque platform identifiers managed by Atlassian - not personal data that the Provider controls.

- **Data subject requests (DSAR)** - handled via standard Atlassian mechanisms; no separate request to the Provider is needed
- **Right to erasure** - Atlassian's erasure processes apply to account IDs stored by this app automatically
- **No Data Processing Addendum required** - Atlassian acts as data processor for all data on the Forge platform under [Atlassian's DPA](https://www.atlassian.com/legal/data-processing-addendum)
- **No third-party data sharing** - the app shares no data with third parties

See the [Privacy Policy](privacy-policy.html) for the full data practices statement.

## Data Residency

Data residency is governed entirely by Atlassian's platform. Customers who have configured a data residency region for their Atlassian products benefit from that configuration automatically.

See [Atlassian's data residency documentation](https://www.atlassian.com/trust/privacy/data-residency) for details on supported regions and how to configure them.

## Data Retention & Deletion

- Classification data is stored as content properties on Confluence pages. When a page is **permanently deleted**, its content properties are removed by Confluence.
- Global and space configuration data is stored in Forge KVS and persists for the lifetime of the app installation.
- **Uninstalling the app** removes all Forge KVS data. Content properties on pages may be retained by Confluence.

## Compliance

- **Atlassian Marketplace** - the app is listed on the Atlassian Marketplace and subject to Atlassian's partner and security review process
- **Forge security model** - the app operates under Atlassian's Forge sandbox, which enforces capability-based access controls at the platform level
- **Acceptable use** - the app is intended for information classification and awareness within Confluence. Classification labels are advisory; they do not enforce access controls. Page view restrictions must be managed separately through Confluence's built-in permission system.

## Support

|                |                                                                             |
| -------------- | --------------------------------------------------------------------------- |
| Email          | <culm@culm.at>                                                              |
| Issue Tracker  | [Known issues](https://github.com/culmat/information-classification/issues) |
| Business hours | Mon-Fri, 09:00-17:00 CET                                                    |
| Response SLA   | 5 business days                                                             |

## Legal

| Document                              | Description                                                            |
| ------------------------------------- | ---------------------------------------------------------------------- |
| [Privacy Policy](privacy-policy.html) | What data is collected, how it is stored, GDPR rights                  |
| [Terms](terms.html)                   | End user terms, governing law (Swiss law / Basel-Stadt), support terms |
