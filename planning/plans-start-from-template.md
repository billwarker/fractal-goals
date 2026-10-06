# Program day plans start from the template; drop the "Added" badge

## Context

On the Days tab, a date's plan is *virtual* until saved. Today a virtual plan is seeded from the **latest earlier saved plan** of the same program day and template (`services/program_session_plans.py:_resolve`, `SOURCE_PREVIOUS_PLAN`). It copies that plan's whole structure: activities added in the plan, set counts, values and tags.

So once the user adds activities to one date's plan and saves, every later date of that day shows those activities too. The user experiences this as their edits leaking into other plans.

The user wants a plan to **be the session template until they modify it**. They also want the blue **"Added"** badge removed from plan items.

Decision confirmed: **keep the last saved plan's values as grey placeholder hints only**. They are not copied into the plan, so the user can still see what they planned last time.

## Grade of the current system against this goal: **C+**

| Area | Grade | Why |
|---|---|---|
| Seed semantics | D | An unsaved date silently inherits another date's edits: added activities, set counts and values. The template stops being the default after the first saved plan. |
| Separation of "reference" vs "content" | B− | The `previous` payload (placeholders) already exists apart from `sections`. The seed just *also* copies it into `sections`. |
| Reset / load / session-from-plan paths | B | All go through one `_resolve`, so a single change fixes every path: the virtual view, `load_plan` for optional templates, `resolve_for_session` for plan refs, and reset. |
| UI copy | C | "Starts from Mon, Sep 28", the reset dialog ("start again from the previous plan") and the "Added" badge all describe the old model. |
| Tests | B | The seed behaviour is pinned in the API, client and e2e tests, so the change is easy to lock in. |

## Target design (S+)

**One rule:** a date's plan is its stored plan if one has been saved, otherwise the session template. Earlier plans are *reference only*: their values appear as placeholders, matched by `item_key`, and are never copied into the plan.

### Backend: `services/program_session_plans.py`

- **Seeding.** In `_resolve`, an unstored plan always resolves to `SOURCE_TEMPLATE` with `typed_template_sections(template)` and `template.revision`.
  - `previous` is still looked up with `_previous_plan`, unchanged, including the rule that plans no longer on the schedule never count. It is still returned, so `_serialize` keeps emitting `previous: {date, sections}` for placeholders.
  - `seeded_from_date` becomes `None` for unstored plans.
- **Materialising a plan.** `_materialize` sets `seeded_from_plan_id=None`, because a plan is no longer copied from another. The column stays (no migration), and existing rows keep their values.
  - `SOURCE_PREVIOUS_PLAN` and its branches are removed.
  - The module docstring changes to say that an unplanned occurrence is the template, and earlier plans only supply reference values.
- **Paths that follow automatically**, since they all call `_resolve`:
  - `load_plan` stores the template for optional templates.
  - `resolve_for_session` materialises the template for a `plan_ref` with no stored plan.
  - `reset_plan` falls back to the template, as before.
  - `template_changed` compares against the template revision, so it is always false for unstored dates.
- **Plan states on the rail.** `list_program_occurrences` keeps its `seeded` state for unstored dates. Its meaning is now "template default".
- **Existing data.** Nothing changes for stored plans.
  - Saved plans are the user's own, so they stay.
  - Unsaved later dates immediately show the template, so the leak goes away with no data repair.

### Client

- **`utils/sessionPlanDraft.js:describePlanSource`.** Drop the `previous_plan` branch: stored gives "Planned", everything else gives "Template default".
- **`components/programs/days/SessionPlanCard.jsx`.**
  - Remove the `added_in_plan` badge (`<Badge … >Added</Badge>`). Keep the `Badge` import if "Optional" still uses it.
  - The reset dialog always says the plan will "start again from the template".
  - Placeholders keep using `entry.previous` through `indexPrescriptionsByItemKey`, unchanged.
- **The `added_in_plan` data flag stays.** `merge_template_changes` (`services/plan_sections.py`) uses it to keep plan-added items when pulling template changes. Only its badge goes.

### Docs

- **`index.md`, Programs section:** replace "an unplanned occurrence is seeded from the latest earlier plan…" with the new rule.

## Critical files

- `services/program_session_plans.py`: `_resolve`, `_serialize`, `_materialize`, docstring.
- `client/src/utils/sessionPlanDraft.js` and `client/src/components/programs/days/SessionPlanCard.jsx`.
- Tests:
  - `tests/integration/test_program_session_plans_api.py`
  - `client/src/utils/__tests__/sessionPlanDraft.test.js`
  - `client/src/components/programs/days/__tests__/ProgramDaysView.test.jsx`
  - `client/e2e/program-session-plans.spec.js`
- `index.md`

## Tests

**API: `test_program_session_plans_api.py`**
- Replace `test_week_two_seeds_from_week_one…` with `test_unsaved_dates_start_from_the_template_with_earlier_values_as_hints`. Save week 1 with an **added activity**, 2 sets and values. Then week 2 must have:
  - `source == 'template'` and `seeded_from_date is None`
  - the template's items only, so no added item and the template's set count
  - `previous.date == week1`, with week 1's values available
- A session from a `plan_ref` on an unsaved date materialises the template, not week 1's structure. The existing `test_session_from_virtual_plan…` covers this; add an assertion after a saved week 1 with an added item.
- Loading an optional template stores the template, even after an earlier saved plan.
- Unchanged:
  - `test_reset_falls_back_to_seed`, since it already expects `template`
  - `test_dormant_plans_neither_show_nor_seed`

**Client**
- `sessionPlanDraft.test.js`: the `describePlanSource` cases.
- `ProgramDaysView.test.jsx`, "seeds the next day…":
  - the fixture becomes `source: 'template'`
  - expect "Template default" and placeholder `100` from `previous`
  - expect no "Added" badge
- `e2e/program-session-plans.spec.js`: next week's card shows "Template default" (not "Starts from"), and the `100` placeholder still appears.

## Verification

1. `./fractal-goals-venv/bin/python -m pytest tests/integration/test_program_session_plans_api.py` and the full backend suite.
2. `cd client && npx vitest run && npx eslint src e2e`.
3. Rebuild, then `npx playwright test e2e/program-session-plans.spec.js` (desktop and mobile).
4. In the app:
   - Add an activity to one date's plan and save. Other dates of that day show only the template's activities, with last week's values as grey placeholders.
   - No "Added" badge appears.
   - Reset returns a date to the template.
5. Save this plan as `planning/plans-start-from-template.md`.
