# Beta polish 3 — programs, sessions, onboarding

Branch: `beta-polish-3` (cut from `origin/main` at 4fdf303e; PR #17 is already merged).
On approval this plan is saved as `planning/beta-polish-3-2026-11.md`.

## Context

Nine changes from beta use:
- Copying a day's plan loses its tags.
- Six Session Detail rough edges: two-metric Progress charts, cascade alignment, countdown entry, a `now` keyword, and arithmetic on phones.
- Three account and first-run items.

The goal is to fix each one at the shared seam, so every surface that uses that code gets the fix. No one-off patches.

---

## Grade of the current codebase against this plan

| # | Area | Grade | Why |
|---|------|-------|-----|
| 1 | Copy plan → tags | **C** | `utils/planCopy.js` leaves tags out on purpose ("notes and tags are not"). `keepEntries` also drops a planned set that has tags but no values, so tag-only sets disappear. |
| 2 | Two-metric charts, compact | **C-** | The two charts behave differently. `MetricTrends` compact silently plots only metric 1 ("+1 more"). `ConditionProgressChart` compact plots both lines on two untinted axes with no legend, so you can't tell which axis belongs to which line, and the caption names only the first. |
| 3 | Cascade button placement | **C** | In circuits, `MetricValueEditor`'s `valueAction` (`display: contents`) puts the button *between* the input and its unit, so every field after it moves. In sets, the buttons sit inside the wrapping `setMetricsContent`, so set rows with and without a button lay out differently. |
| 4 | Countdown entry | **C** | Only accepts `MM:SS` (`parseMMSS`). This is a second duration grammar next to the relative-time one. |
| 5 | `now` in relative time | **B-** | `parseRelativeTimeAdjustment` is a single-term regex (`±N[HMS]`). It has no base keyword and no compound terms (`1h30m`). |
| 6 | Arithmetic on phones | **D** (mobile) / A (desktop) | `evaluateArithmeticExpression` works, but `inputMode="decimal"` keypads have no `+ − × ÷`, so phones can't use it. |
| 7 | No-fractal onboarding | **B** | Well built, but the product decision is to retire it. If removed, the flow, the quickstart endpoint, the e2e spec and the index.md section would all be dead code. |
| 8 | Settings from Selection | **D** | Settings opens only from the in-fractal header or a `?settings=` deep link. The Selection page has no way in. |
| 9 | ToS/Privacy at signup | **A-** | Already shipped (`bd85e499`): `AuthModal` has a required checkbox, `validators/auth.py` requires `accepted_terms`, and `token_required` enforces the current versions. Gap: `AuthContext.signup` **hardcodes `accepted_terms: true`** instead of sending what the user ticked. |

**Overall: B-.** The domain foundations are strong. The weak spots are duplicated grammars (durations), inconsistent shared-chart behaviour, and phone input.

---

## S+ plan

### 1. Copy carries tags (Programs → Days)
`client/src/utils/planCopy.js`
- `copyActivityValues` keeps `prescription.tags` and each set's `tags`. A set is kept if it has metrics **or** tags.
- `copyCircuitValues` keeps circuit `tags`, round `tags` and slot `tags`. A slot is kept if it has metrics or tags.
- Archived or deleted tags would fail Save (`services/prescriptions.py` accepts only active tags). So the copy takes an `activeTagIds` set (from the existing tag catalog query) and filters them out. Each dropped tag is added to `skipped` as `{ name: tagName, reason: 'this tag is archived' }`, so `PlanCopyButton`'s "N not copied" already explains it.
- Logged-session sources (`utils/loggedSessionPlan.js`): `loggedActivityValue` adds the instance's **direct** tags and each set's direct tags (not `inherited_tags`). `loggedCircuitRounds` does the same for member and run scopes where present. A plan copied from what was logged then matches what was logged.
- Update the file header comment ("notes are not; tags are").
- Tests: extend `utils/__tests__/planCopy.test.js` for activity, set, circuit, round and slot tags, tag-only sets, archived-tag skip, and the logged source. Extend `SessionPlanCard.test.jsx` to cover the copy → save payload.

### 2. Two-metric Progress charts in compact form
A shared compact two-axis treatment, so both charts read the same way in the sidebar:
- `ChartJSWrapper.applyChartDensity`, compact branch: when there are two or more y scales, each y axis's tick colour comes from its series colour (the dataset `borderColor` for that `yAxisID`). The second axis draws no grid. Each axis keeps 3 ticks and a narrow `afterFit` width cap, so the plot area isn't squeezed.
- `MetricTrends.jsx`: compact plots **both** selected metrics (remove the `shownMetrics` "first only" branch and the "+N more" caption).
- New `analytics/CompactSeriesKey.jsx`: a one-line caption with a colour swatch per series ("● Weight kg  ● Reps · 8 sessions"). It replaces the text captions in both `MetricTrends` (via `CompactChartFrame caption`) and `ConditionProgressChart`. Threshold text shows per series in the key (`goal ≥ 100 kg`), because compact hides annotation labels.
- Tests: `applyChartDensity` unit test (tint and grid rules), `MetricTrends.test.jsx` compact with 2 metrics, and a `ConditionProgressChart` compact caption test. Add a sweep manifest capture of Session Detail with a two-metric chart in the progress pane.

### 3. Cascade buttons after all fields
- Session sets (`SessionActivityItemView.jsx`): move the cascade container out of `setMetricsContent` into its own grid cell after the fields and before `setTrailingControls`. It keeps a fixed slot even when empty (`min-width` = one button, `visibility` handled by content), so every set's fields start and end at the same x. The phone layout (container query ≤760px) puts it on its own row under the fields.
- Circuits (`CircuitMemberMetrics.jsx`): stop passing `valueAction`. Render the member's cascade buttons together in the same trailing slot after all metric fields.
- `MetricValueEditor`: remove the now-unused `valueAction` prop and the `.metricValueWithAction` style (retire dead render paths).
- Tests: update the circuit and set cascade tests to assert the button sits after the last field. Desktop and mobile sweep captures.

### 4 & 5. One time-expression grammar (countdown + `now`)
New `client/src/utils/timeExpressions.js` (pure, `// @vitest-environment node` tests):
- `parseDurationExpression(text)` → seconds. Terms are `\d+(\.\d+)?[hms]`, can be combined (`1h30m`, `1h 30m`) and joined with `+`/`-` (`30m - 15s`). Case-insensitive. `MM:SS` / `H:MM:SS` still work for existing habits.
- `resolveTimeExpression(text, { baseIso, nowMs })` → ISO. If the text starts with `now` (`now`, `now - 30m`), the base is now. Otherwise it is a signed offset from the field's current value (`+10m`, `-5m`, `-1h30m`), as today. `now` anywhere other than the start is an error.
- Errors name the forms: `Use +10m, -1h30m, now, or now - 30m`.

Wiring:
- `dateUtils.parseRelativeTimeAdjustment` / `applyRelativeTimeAdjustment` delegate to it, so `useRelativeTimeAdjustment` (activity timers and circuit runs) gets `now` with no UI fork. The placeholder becomes `+10m or now`. When the start or stop is still empty, the ± panel accepts only `now…` expressions.
- Countdown (`SessionActivityItem.jsx`): `parsedTargetDuration` uses `parseDurationExpression`, rejecting signed or `now` input and requiring > 0. The input placeholder is `30m`, the preview stays `Countdown 30:00`, and invalid text shows the shared message.
- `parseMMSS` stays only if other callers remain. Otherwise it is removed.
- Session start/stop editing on the session header uses the same hook. Check `SessionDetail` start/stop fields and add the ± panel there if it's missing, since the request names "session start and stop".
- Tests: a table-driven `timeExpressions.test.js` (boundaries: `0m`, `now`, `NOW-30M`, `+1h30m`, `1:30`, `now + `, `30`, `-0s`, DST crossing via timezone). Update the `useRelativeTimeAdjustment` and countdown component tests.

### 6. Arithmetic on phones
Keep the numeric keypad and add the missing keys:
- On touch screens (`matchMedia('(pointer: coarse)')`), number and integer metric fields in `MetricValueEditor` get a small **+−** button beside them (`MathKeysToggle` in `components/common/MathKeyBar.jsx`). Duration, select, disabled and read-only fields don't. *(Revised after review: the first version docked a bar to the bottom of the viewport, where it covered the footer.)*
- Tapping it focuses the field and opens a row of keys just under it: `+ − × ÷ ( )` and `=` showing the live result. The keys and the toggle never take focus. Each key inserts at the caret through the native value setter plus an `input` event, so the uncontrolled editor's `onChange` and draft logic run as usual. `=` replaces the text with the result. Blurring the field closes the keys.
- `evaluateArithmeticExpression` reads `× ÷ −` as `* / -`.
- Tests: `components/common/__tests__/MathKeyBar.test.jsx` and the mobile-only `e2e/math-key-bar.spec.js`.

### 7. Retire the no-fractal onboarding flow
- `pages/Selection.jsx`: remove the `WelcomeFlow` branch, `welcomeDismissed` state and storage key, and `quickstartMutation`. A user with no fractals sees the normal Selection page with the **New Fractal** card, which opens `GoalModal`.
- Delete `components/onboarding/welcome/` (component, CSS, tests) and `globalApi.quickstartFractal`.
- Backend: delete `POST /api/fractals/quickstart` (`blueprints/goals_api.py`), `GoalService.quickstart_fractal` (`services/_goal_fractals.py`), its validator, and `tests/integration/test_fractal_quickstart_api.py`. These have no other callers (grep confirmed).
- Rewrite `client/e2e/onboarding.spec.js` around the remaining journey: sign in with no fractals → New Fractal → Goals page → Getting Started checklist, which stays. Remove the `welcome_user_*` fixture accounts if unused.
- `index.md`: replace the "First run" paragraph with the new behaviour.

### 8. Settings button on the Selection page
- Add an `openSettings(tab?)` callback to an existing lightweight context. If none fits, add a small `SettingsLauncherContext` provided by `AppRouter`, which owns `isSettingsOpen`. `NavigationHeader`'s `onOpenSettings` and the `?settings=` deep link use the same function.
- `Selection.jsx`: the profile row becomes `[SETTINGS] [LOGOUT]` side by side under "Welcome, …", sharing one `.profileButton` style (renamed from `.logoutBtn`) with a ≥40px touch target.
- Tests: `Selection.test.jsx` (button opens Settings), sweep capture of Selection signed in.

### 9. Terms and privacy at signup (harden what exists)
- `AuthContext.signup(…, { acceptedTerms })` sends the checkbox's value instead of the literal `true`. `AuthModal` passes `values.acceptedTerms`. The server already rejects `false`. Add a test that an unticked submit can't create an account.
- Confirm no other account-creation path skips consent (invite links reuse `AuthModal`; admin-created users go through re-consent via `legal_acceptance_required`). No new UI needed.

---

## Order of work
1 → 3 → 4/5 → 2 → 6 → 8 → 9 → 7. Self-contained client changes come first. The backend deletion comes last.

## Verification
- `./run-tests.sh frontend`, `./run-tests.sh backend`, `./run-tests.sh lint` (includes typecheck and maintainability).
- Rebuild the client before Playwright (`npm run build`; e2e serves the built dist), then run `./run-tests.sh browser` for the onboarding, session, program-days and auth specs.
- `npm run sweep:quick` for Selection, Session Detail (sets, circuit, progress pane with a two-metric chart) and Program Days.
- Manual checks:
  - On a phone viewport, enter `2.5×4` in a decimal metric.
  - Set a countdown with `30m`.
  - Adjust stop with `now - 5m`.
  - Copy a tagged plan and Save.
  - Sign up with the box unticked.
  - Open Settings from Selection.
