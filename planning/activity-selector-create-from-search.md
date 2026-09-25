# Create-from-search in the Activity Selector

## Context

In the activity selector (session sections, template builder, goal activity associator), a search
that finds nothing ends in a dead end: `No activities match "sumo squat"`, and the user has to
click **+ Create New Activity Definition** and retype the name. We want the search term itself to
become the path forward: one click opens the builder with the name already filled in. Same for the
**Activity Circuits** tab.

Decisions made:
- **Zero results** → the empty state becomes a clear primary CTA: `+ Create activity "sumo squat"`.
- **Some results, but no exact name match** (e.g. "squat" matches only "Back Squat") → a quieter
  `+ Create "squat"` row at the end of the results.
- **Exact name match exists** → no create-from-search option (avoids duplicates).
- Applies to both the Activities and Activity Circuits tabs.

## Grade of the current code for this feature: **B**

Good:
- One shared picker ([ActivityPicker.jsx](client/src/components/activityPicker/ActivityPicker.jsx)).
  Every selector surface uses it, so a single change reaches all of them.
- The activity builder already accepts id-less seed objects. Copy mode uses this through
  `prepareActivityDefinitionCopy` in [utils/activityBuilder.js](client/src/utils/activityBuilder.js),
  and `_builderKey` remounts the form.

Gaps:
- `onCreateActivity` takes no arguments, so the search term can't reach the builder.
- `getInitialActivityBuilderState` in
  [activityBuilderUtils.js](client/src/components/activityBuilder/activityBuilderUtils.js) treats any
  non-null seed as a full definition. Seeding just `{ name }` would give `hasMetrics: undefined`
  where a fresh create gives `true`. This trap is waiting for any partial seed.
- `CircuitBuilderModal` picks its title with `circuit && !isCopy`, so a seeded create would be
  labelled "Edit Circuit".
- The empty state is plain text with no action, and the search input has no Enter handling.

## Plan (target S+)

### 1. Picker: detect when to offer create-from-search
[activityPickerUtils.js](client/src/components/activityPicker/activityPickerUtils.js)
- Add a pure `getCreateFromSearchState({ searchText, results, allActivities })` that returns
  `{ seedName, mode: 'none' | 'empty' | 'append' }`:
  - `seedName` = `searchText` trimmed, with inner whitespace collapsed and the user's casing kept.
  - Exact-match check: case-insensitive, whitespace-normalised comparison of `seedName` against
    **all** activity names (`model.activities`), not only the search results. This way, a
    same-named activity that the goal scope or copy filter hid still counts as existing.
  - `'empty'` when there are no results and no exact match. `'append'` when there are results but
    no exact match. Otherwise `'none'`.
- Reuse the existing `normalizeSearchText` helper.

### 2. Picker: render the CTA and pass the name through
[ActivityPicker.jsx](client/src/components/activityPicker/ActivityPicker.jsx)
- The new UI shows only when `allowCreateActivity && !isCopyMode && onCreateActivity`.
- **Empty mode:** keep the muted line `No activities match "…"`. Under it, add a primary button:
  `+ Create {itemLabelSingular} "{seedName}"`, e.g. `Create activity "sumo squat"` or
  `Create activity circuit "…"`.
- **Append mode:** after the results, add a dashed row styled like `secondaryAction`:
  `+ Create "{seedName}"`.
- Both call `onCreateActivity({ name: seedName })`.
- **Enter in the search input:** in empty mode it triggers the create. With exactly one result it
  selects that result, which matches the obvious intent. Otherwise it does nothing.
- **Bottom `+ Create New …` button:** while searching with no exact match, it also passes
  `{ name: seedName }`, so both entry points behave the same. When not searching it calls
  `onCreateActivity()` exactly as today.
- Long names wrap or ellipsize in the CTA (`overflow-wrap: anywhere`), and the button has
  `aria-label="Create activity named sumo squat"`.
- Styles go in [ActivityPicker.module.css](client/src/components/activityPicker/ActivityPicker.module.css)
  using the existing tokens (`--color-brand-primary` border/text for the CTA). No new colours.

### 3. Activity builder: safe partial seeds
- In [utils/activityBuilder.js](client/src/utils/activityBuilder.js), add
  `prepareActivityDefinitionDraft({ name })`. It returns
  `{ _builderKey: Date.now(), id: undefined, name }` plus the same defaults as a blank create:
  `has_metrics: true`, `track_progress: true`, and empty metric and split lists.
- Harden `getInitialActivityBuilderState`: when the seed has no `id`, merge it over the blank-create
  defaults instead of reading raw fields. Partial seeds can then never produce `undefined` flags.
  Copy seeds still work because they supply every field.

### 4. Wire the seed at every activity-create consumer
Each handler takes an optional `seed` and calls
`openActivityBuilder(seed ? prepareActivityDefinitionDraft(seed) : null)`. Consumers that stay
argument-less are unaffected.
- [SessionSection.jsx](client/src/components/sessionDetail/SessionSection.jsx):
  `handleCreateActivityDefinition`, plus the `onCreateCircuitDefinition` passthrough (step 5).
- [TemplateBuilderModal.jsx](client/src/components/modals/TemplateBuilderModal.jsx): both
  `ActivitySelectorPanel` usages (activity and circuit create).
- [GoalDetailModalRenderSurface.jsx](client/src/components/goalDetail/GoalDetailModalRenderSurface.jsx)
  and its controller: `onCreateActivity` (associator) and `handleCreateActivityFromActivities`. Set
  `activityBuilderTemplate` to the draft instead of `null`.
- [ActivityAssociator.jsx](client/src/components/goalDetail/ActivityAssociator.jsx): already passes
  the handler through unchanged.
- [ActivitySelectorPanel.jsx](client/src/components/common/ActivitySelectorPanel.jsx): no logic
  change, because it forwards the argument.

### 5. Circuits tab
- In [utils/circuitDefinition.js](client/src/utils/circuitDefinition.js), add
  `prepareCircuitDefinitionDraft({ name })` → `{ name, description: '', group_id: '', slots: [] }`.
- `openCircuitBuilder('create', seed ? prepareCircuitDefinitionDraft(seed) : null)` in
  [useSessionCircuitDefinitionBuilder.js](client/src/components/sessionDetail/useSessionCircuitDefinitionBuilder.js)
  consumers and in `TemplateBuilderModal`.
- Fix the title in [CircuitBuilderModal.jsx](client/src/components/circuits/CircuitBuilderModal.jsx):
  `circuit?.id && !isCopy ? 'Edit Circuit' : 'Create Circuit'`. Check that its save path decides
  create vs edit by `mode`/`id`, not by whether `circuit` is truthy. Session and template builders
  already branch on `mode`.

### 6. Tests
- `activityPickerUtils` unit tests for `getCreateFromSearchState`: empty, append, exact match
  (case and whitespace variants), a hidden-but-existing exact match, and whitespace-only input.
- [ActivitySelectorPanel.test.jsx](client/src/components/common/__tests__/ActivitySelectorPanel.test.jsx):
  - Typing an unmatched term shows the CTA, and clicking it calls `onCreateActivityDefinition`
    with `{ name }`.
  - A partial match shows the append row. An exact match shows neither.
  - Enter in the search input triggers the create.
  - The CTA is hidden in copy mode and when `allowCreate` is false.
  - The circuits tab calls `onCreateCircuitDefinition({ name })`.
- `ActivityBuilder` test: a `prepareActivityDefinitionDraft({ name: 'Sumo Squat' })` seed pre-fills
  the name, keeps metrics enabled, and shows the "Create Activity" label.
- `SessionSection` test: CTA → builder opens with the name, and after save the new activity is
  added to the section (the existing `handleActivityCreated` path).
- `CircuitBuilderModal`: a seeded create shows "Create Circuit".

## Verification
1. `cd client && npm test -- ActivityPicker ActivitySelectorPanel ActivityBuilder SessionSection CircuitBuilder`,
   then the full `npm test` and `npm run lint`.
2. Manual check with `npm run dev`, on a session section:
   - Search "sumo squat" → click the CTA → builder shows "Sumo squat"-style name → save → activity
     appears in the section.
   - Search "squat" → append row appears. Search an exact existing name → no create row.
   - Activity Circuits tab → search → CTA → circuit builder titled "Create Circuit" with the name
     filled in.
   - Repeat once in the Template Builder and the Goal detail associator.


## Revision (2026-09-25): no separate CTA
The standalone blue CTA and the partial-match row were removed after review. The search term
now goes into the existing `+ Create New Activity Definition` / `+ Create New Activity Circuit`
button, e.g. `+ Create New Activity Definition "sumo squat"`, which keeps its standard dashed
style. The rules for when a term is offered (no results, or no exact name match) and Enter-to-create
are unchanged.
