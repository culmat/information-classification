# TODO after the Marketplace listing goes live

Nothing here is blocking the app itself — these are placeholder fix-ups to apply once the Atlassian Marketplace listing has a real slug.

## Replace the `TBD` placeholders with the real Marketplace slug

Search the repo for `TBD` or `plugins/tbd` and swap in the real slug from the live listing. Three known call-sites:

- **[README.md:18](../README.md#L18)** — reviews deep-link in the Privacy section:

  ```
  https://marketplace.atlassian.com/apps/TBD/information-classification-for-confluence?tab=reviews
  ```

- **[README.md:25](../README.md#L25)** — "Install via Atlassian Marketplace" link under `## Installation`:

  ```
  [Atlassian Marketplace](https://marketplace.atlassian.com/plugins/tbd)
  ```

- **[src/frontend/AboutPanel.jsx:45](../src/frontend/AboutPanel.jsx#L45)** — `MARKETPLACE_REVIEWS_URL` constant used by the About tab's "review" inline link:
  ```js
  const MARKETPLACE_REVIEWS_URL =
    'https://marketplace.atlassian.com/apps/TBD/information-classification-for-confluence?tab=reviews';
  ```

Each takes the form `/apps/{slug}/...` or `/plugins/{slug}`. The slug is the one Atlassian assigns at listing time.

## Sanity check after the swap

1. Click every updated link — they should land on the live Marketplace listing / reviews tab without a 404.
2. Reload the admin About tab and click "review" in the closing paragraph; verify it opens the real reviews page.
3. `git grep -i 'tbd'` — confirm no stale placeholders remain in tracked files.
