# UI Kit Patterns

Frontend is built on Atlassian UI Kit (`@forge/react`). No standard React DOM elements — only UI Kit components.

## Component patterns used in this project

### Tabs

Used in byline popup (Classification / Resources / History), admin dashboard (Levels / Contacts / Links / Audit / Languages), and space settings (Configuration / Statistics).

```jsx
<Tabs id="my-tabs">
  <TabList>
    <Tab>First</Tab>
    <Tab>Second</Tab>
  </TabList>
  <TabPanel>{/* First content */}</TabPanel>
  <TabPanel>{/* Second content */}</TabPanel>
</Tabs>
```

`Tabs` requires `id`. `Tab` takes only text children — no props. Lazy-load data on tab switch via `onChange={(index) => { if (index === 1) loadData(); }}`.

### DynamicTable vs cards

`DynamicTable` with `rowsPerPage` gives built-in pagination. Works well in wide containers (admin, space settings). In narrow containers (byline popup), table columns compress and dates become unreadable — use stacked `Box` cards instead.

### Charts

`DonutChart` and `BarChart` available since `@forge/react` 11.2.0. Used for classification distribution and monthly trends in admin and space settings Audit/Statistics tabs.

### Lozenge

Always use `isBold` for filled rendering. Look up the level color from config:

```jsx
const levelAppearance = (levelId) => {
  const level = config?.levels?.find((l) => l.id === levelId);
  return level ? colorToLozenge(level.color) : 'default';
};

<Lozenge isBold appearance={levelAppearance('confidential')}>confidential</Lozenge>
```

Color mapping is in `src/shared/constants.js` (`colorToLozenge`).

### xcss styling

Use design tokens, never raw CSS values:

```jsx
const cardStyle = xcss({
  padding: 'space.100',
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'border.radius',
});
```

## Known issues

- **DatePicker empty state:** Passing `value=""` or `value={undefined}` renders "2/18/1993" instead of blank. This is a Forge UI Kit bug.

## See also

- [AGENTS.md](../AGENTS.md) — full list of allowed UI Kit components
- [testing.md](testing.md) — verifying UI with shared browser MCP
