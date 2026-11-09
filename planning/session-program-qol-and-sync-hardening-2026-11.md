# Session and program QoL fixes, plus offline sync audit and hardening

## Context

Six quality-of-life gaps in Programs, Create Session, Session Detail, tag display and goal charts, plus recurring sync errors during production sessions.

**Decisions made**
- A previous program day is reused for a session today. There is no back-credit to the past date.
- Auto-link applies only to activities marked "One-off link" in the scoped picker.
- This branch includes the audit report and fixes for its critical and high findings.

**Setup after approval**
- Branch: `feat/session-program-qol-and-sync-hardening`, from `main`. The current branch's deploy-smoke fix stays separate.
- Save this plan to `planning/session-program-qol-and-sync-hardening-2026-11.md`.
- Save the audit to `planning/offline-sync-audit-2026-11-07.md`.

## Grades

**Database: A. No migration is needed.**
- Direct instance links, dated plans and session-to-plan links already support all of this. `sessions.program_session_plan_id` has a non-unique index, so several sessions can reuse one plan.
- Not S yet: `idempotency_records` can't tell "a live request holds this claim" from "the request died", so it relies on a 2-minute timeout. The client fix below tolerates that without a schema change.

| Area | Now | Target | What gets it there |
|---|---|---|---|
| Due goals in the day pane | B | S+ | Pane and calendar share one source |
| Create Session history | C | S+ | Previous days and plans, including days with nothing scheduled today |
| Scoped-picker auto-link | B− | S+ | Works online and offline, reversible, failures isolated |
| Goal icons on cards | C+ | S+ | One rule shared with the Goal Hierarchy pane |
| Session Detail tag display | C | S+ | Names stay readable; "N tags" only when more than two rows are needed |
| Expanded goal charts | C | S+ | One frame and one goal surface shared with Session Detail |
| Offline sync | B− | S+ | Findings below fixed, each with a regression test |

## Audit findings

**Evidence limit:** these come from reading the code plus one local limiter experiment. I have not seen production logs or telemetry, so I can't yet say which finding causes the errors you see.

### Critical

**S1. The queue lock is held across network calls.**
- `flush` runs `lock(drainOnce)`, holding the Web Lock for the whole drain, and `submit` needs the same lock before it can save ([outbox.js](client/src/offline/outbox.js)).
- A tap therefore waits for the queue to finish before it is saved or shown, potentially several 8 s timeouts. Closing the app during that wait loses the change.
- This contradicts ADR 0004's "persist before any network call". A frozen background tab could block writes indefinitely. Unit tests miss it because their lock is a pass-through.

**S2. A short outage permanently rejects changes, out of order.**
- Eight answered failures trigger `retry_exhausted`. With the current backoff that takes about 61–123 s.
- 429s, 5xx responses and `idempotency_in_flight` all count. A request that dies holds its claim for 120 s, so the client can give up before the claim frees.
- Later changes then still go through, so a session can complete while its earlier values were rejected.

**S3. Clock correction can make a retry fail as a different request.**
- `correctActionTime` runs on every send and changes `occurred_at`, but the server hashes the body against the Idempotency-Key.
- The offset is 0 until three clock samples exist, then can jump for devices 2 s or more off.
- A retry can get a permanent 422 `idempotency_key_mismatch`, even if the first attempt was already applied.

### High

**S4. Auth failures are treated as rejected changes.**
- `classifyFailure` looks at whichever error comes back. A 403 from `/auth/refresh` or a CSRF failure permanently rejects the op, when it should pause for sign-in.

**S5. One slow request marks the whole app offline.**
- Timeouts count as network errors in the global interceptor, which pauses all queries and the outbox until a probe succeeds.
- Production makes this more likely: one worker with 4 threads, `max-instances 1`, no `min-instances` set in `cloudbuild.yaml`, and an 8 s outbox timeout.

**S6. Saves trigger refetch bursts that can hit read limits.**
- Online, each save drains the queue and invalidates about 12 query roots.
- My experiment confirmed that the default limits (500/hour, 2,000/day, per route and client IP) still apply to GET routes in write-limited blueprints.
- If each save refetches the same route, about 8.3 saves a minute uses a route's hourly budget. Whether this happens in production needs checking in the logs.

### Medium and low

| ID | Issue |
|---|---|
| S7 | Pausing an already paused session, or resuming one that isn't paused, returns 400 and rejects the op, although the requested state already holds |
| S8 | Each rejected op gets its own toast, including dependent ops; Review shows "Change" for tags, goal links and several circuit and note kinds |
| S9 | `whenDrained` has no timeout, so adding a circuit can wait forever if the connection or auth drops |
| S10 | A failure while storing the response leaves a stale claim, and a change that already succeeded can run again after 2 minutes |
| S11 | ADR 0004 says both 24 h and 7 days for the action-time limit; the code uses 7 days |

## Implementation

### 1. Due goals in the program day pane
- In `ProgramCalendarPage`, filter the existing `goalDeadlineEvents` to the selected date, then pass the result through `ProgramSidePane` to `ProgramDayPane`. Calendar and pane then can't disagree, including for completed goals.
- Add a "Goals due" card beneath the program day card, including on dates with no program day. The current early return for an empty day must not hide it.
- Each row shows `GoalIcon`, the name and `GoalDueText` for its tone; the date stays in the pane header; completed goals read "Completed". Rows open through `onGoalClick`.
- Mobile gets this through the shared pane.

### 2. Previous program days and plans on Create Session
**Client**
- Keep the active program in `programsById` when nothing is scheduled today, so `SourceSelector` appears. Templates stay the default in that case.
- Add a pure `buildPreviousProgramDays(program, occurrences, templates, todayISO)`, using the existing `useProgramPlanOccurrences`. No new list endpoint is needed.
- `ProgramDayPicker` shows today's days and "Previous days": one row per other day type, most recently occurred first, with its last date and status. Dated plans are picked in the Plan dropdown.
- A program day scheduled today is selected by default, the first of several.
- Resolve template data from the loaded templates. Disable days whose template no longer exists.
- `useSessionPlanChoice` takes `preferLatest`: a previous day defaults to its newest stored plan, otherwise template only, and says so when it has none.
- `SessionPlanChooser` groups options into Today and Previous plans.

**Server: `plan_candidates`**
- Include previous plans already executed, marked `executed: true`.
- Extend the lookback from 14 to 60 days, capped at 30 candidates.
- The default choice still never picks an executed plan.

**Unchanged**
- Past dates' status and streaks.
- Picking a past day doesn't create a plan row; only a stored plan can be chosen.
- The session's block comes from today's date, not the past date.

### 3. Auto-link from the scoped picker
- Split a reusable `useInstanceGoalLinker(rootId, sessionId)` out of `useActivityInstanceGoalAssociation`. The existing hook wraps it, keeping one queued and direct write path.
- In `SessionSection`, after `addActivity` returns, link the new instance when `activityGoalScope.instanceLinkedIds` contains its definition.
- Offline, the link queues behind the add. If the add is rejected, the existing `creates` cascade rejects the link too.
- If only the link fails, the activity stays and an error says so. The header control still removes a link.
- Circuits aren't auto-linked in this pass, because a circuit's members could need different links. The plan doc records this as a known limit.

### 4. Lowest-goal icons on activity cards
- Add pure helpers in `utils/sessionGoalScope.js`:
  - `resolveInstanceGoalIds` combines `activity_goal_ids_by_activity[definition]` and `associated_goal_ids`, and drops paused goals.
  - `lowestGoalIdsPerBranch` removes any goal that has a descendant in the set.
- `useSessionGoalsViewModel` uses the same resolver, so the cards match the Goal Hierarchy pane.
- Replace `InstanceLinkedGoalIcons` with `InstanceGoalIcons`, reading the session goals view by query so it works outside the session provider. Use it on activity cards and in `CircuitMemberHeader`.
- Tooltips say "Linked to X (this instance only)" for direct links and "X" otherwise. Keep the 12 px size and `+N` past four.

### 5. Consistent tag display

**Scope:** activity instance cards and circuit member headers on Session Detail.

**Why tags collapse today**
- `.instanceEditor` uses `flex: 1 1 0`, so the tags only get the width left over in the name row, after the name and action buttons.
- `useTagCountOverflow` allows one row (`flex-wrap: nowrap`), and any overflow collapses to "N tags".
- The same tag can therefore flip between its name and "1 tag" as the name length changes, or when selecting the card adds buttons. The cause is competition for space in that row, not the number of tags.

**Changes**
- Keep tags beside the activity name, as in your screenshot. When they don't fit, they wrap onto the next line, left-aligned, without squeezing the name or timer controls.
- Replace the leftover-width check with a pure `tagsFitInRows(widths, gap, availableWidth, maxRows)`.
- Instance cards and circuit member headers measure against the full identity column, and allow **two rows of tags**.
- Show "N tags" only when the tags would need more than two rows. That threshold depends on width, so a narrow phone collapses sooner than a desktop, and the same rule applies at every size.
- The Add Tag button counts as one item when the card is selected.
- Long names are cut off at 180 px with the full name in `title`, so one tag can't break the layout.
- Selecting a card may move tags to the next line, but must not change names into "N tags" unless the two-row limit is exceeded.
- Whole-circuit tags follow the same two-row rule, with a boundary on the run's name column.
- **Unchanged:** set rows and circuit round editors stay on one row, because space there is tighter. They use the same shared measurement, against the row's spare width.
- Record the rule in `planning/ui-contracts-reference.md`.

### 6. One expanded chart for goals and session progress

**What differs today**

| | Session Detail: `ExpandedProgressChart` | Goal page: `ExpandedGoalChart` |
|---|---|---|
| Chart path | `ProgressChartView`, wrapped in `ChartGoalSurface` | `GoalChartView` to `SavedViewChart`, read-only with no surface |
| Crosshair with axis values | Yes, via Set goal | No |
| Set goal, pin, right-click or long-press | Yes | No |
| Click a goal marker to open it | Yes | No: markers draw, but `onOpenGoal` is missing |
| Extend axes | Yes | No: `axisExtension` isn't registered |
| Open in Analytics | Yes | No |
| Title | One header | Two: saved name plus the chart's own title, as in your screenshot |

The chart components are already shared, so this is a wrapper and frame difference. The two views don't need separate chart code.

**Changes**
- Extract `components/analytics/ExpandedChartFrame.jsx`, used by both views. It owns the fade, focus, Escape handling (annotate mode exits first), header, actions, and `pageGridSnap` and `axisExtension` registration.
- Give `SavedViewChart` an optional `goalSurface` prop that wraps its chart in the existing `ChartGoalSurface`, as `ProfileWindow` does. Support follows `canSetGoalFromChart`, so other chart types stay read-only inside the same frame.
- Pass the saved view's id as `chartToSave.reusableViewId`, so a goal set from this chart reuses that view instead of creating a copy.
- Apply the surface to the default threshold chart too, sharing the rule from `progressGoalChart` as a `conditionGoalChart(condition)` helper and moving `GoalSurfaceChart` somewhere both views can import.
- Show one title: the saved name in the frame header, with the chart's own title hidden when expanded.
- Add Open in Analytics using `buildAnalyticsLink`.
- Clicking the marker of the goal you're already viewing does nothing, instead of opening the same goal on top of itself.

**Kept different on purpose**
- Highlighting the current session and linking hover to the pane apply only on Session Detail, because a goal page has no current session.
- Compact charts in the goal panel and Progress pane stay simplified; everything above applies when expanded.
- Desktop goal charts still close with the details pane's Collapse button, and mobile keeps its pager and "Back to goal".
- Saved views keep their existing limit of the newest 500 instances.

### 7. Sync hardening

| Finding | Fix |
|---|---|
| S1 | Use a short queue lock for store changes and a separate drain lock for sending. `submit` never waits on the network. Persist a `sendingUntil` lease so other tabs won't coalesce or cancel an op being sent. A visible tab can steal the drain lock once the lease expires |
| S2 | Don't count no-response, 408, 429, 502/503/504 or `idempotency_in_flight` toward giving up, and honour `Retry-After`. Other 5xx responses need at least 8 attempts and 30 minutes. Keep the 24 h ceiling for failures the server answered |
| S3 | Apply clock correction once, on first send, and persist that body for all retries |
| S4 | Classify failures from `/auth/*` and CSRF as `auth`, which pauses the queue |
| S5 | On a timeout, probe first and go offline only if the probe fails. Raise the outbox timeout from 8 s to 15 s. Add a telemetry event recording why the app went offline |
| S6 | Debounce post-drain invalidation to about 1.5 s of quiet per session and narrow its roots. Raise the default read limit to 3,000/hour and 20,000/day; write limits stay unchanged |
| S7 | Return 200 when the session is already in the requested pause state |
| S8 | Combine rejection toasts per drain and add the missing Review labels |
| S9 | Add a timeout to `whenDrained` for adding a circuit, with a clear error |
| S11 | Update ADR 0004, including the new retry and lock rules |

**S10** is recorded as accepted risk: fixing it properly needs a schema change, and S7 and the existing create replays reduce its impact.

**Needs your decision, not part of this branch**
- `--min-instances 1` would remove cold starts during sessions but adds Cloud Run cost.
- Production read access: with your OK, I can aggregate `offline_op_rejected` and `offline_sync_drained` from `product_events`, and 429s from Cloud Run logs. That would show which findings are actually causing your errors.

## Critical files
- **Sync:** `client/src/offline/{outbox,outboxTransport,engine,connectivity,sessionOpHandlers}.js`, `SessionSyncIndicator.jsx`, `extensions.py`, `services/timer_service.py`
- **Create Session:** `pages/CreateSession.jsx`, `hooks/useCreateSessionPageData.js`, `components/createSession/{ProgramDayPicker,SessionPlanChooser}.jsx`, `services/program_session_plans.py`
- **Session Detail:** `SessionSection.jsx`, `useActivityInstanceGoalAssociation.js`, `InstanceLinkedGoalIcons.jsx`, `SessionActivityItemView.jsx`, `CircuitMemberHeader.jsx`, `useSessionGoalsViewModel.js`, `utils/sessionGoalScope.js`
- **Programs:** `pages/ProgramCalendarPage.jsx`, `ProgramSidePane.jsx`, `ProgramDayPane.jsx`
- **Tags:** `components/sessionDetail/{useTagCountOverflow.js,ActivityTagEditor.jsx,ActivityTagEditor.module.css,SessionActivityItem.module.css,SessionActivityItemView.jsx}`, `components/circuits/{CircuitMemberHeader.jsx,CircuitTagControls.jsx,CircuitScopeTagEditor.jsx}`
- **Charts:** new `components/analytics/ExpandedChartFrame.jsx`, `components/analytics/SavedViewChart.jsx`, `components/goalCharts/{ExpandedGoalChart,GoalChartView}.jsx`, `components/sessionDetail/{ExpandedProgressChart,ProgressChartView}.jsx`
- **Docs:** `index.md`, ADR 0004, `planning/ui-contracts-reference.md`, `planning/programs-domain-reference.md`

## Verification

**Regression tests, written to fail first**
- **S1:** a FIFO test lock with a stalled `send`: `submit` still persists and patches immediately.
- **S2:** a simulated outage of over 2 minutes leaves the head op pending and later ops unsent; a poison 500 is still rejected after the ceiling.
- **S3:** a retry sends a byte-identical body after the clock offset changes.
- **S4:** a refresh 403 pauses the queue and rejects nothing.
- **S5:** a timeout with a successful probe stays online; a failed probe goes offline.
- **S6:** a burst of saves causes one invalidation, and a backend test covers the new read limit.
- **S7:** repeat pause and resume return 200.

**Feature tests**
- **Item 1:** due card on scheduled and empty dates; completed goals; pane and calendar agree.
- **Item 2:** view-model boundaries (today excluded, repeating days, missing template); backend tests for executed plans, the 60-day boundary and the cap; a past-day session leaves the past date's status unchanged.
- **Item 3:** one-off versus catalog definitions; online and offline; a rejected add cascades to the link.
- **Item 4:** same-branch deduplication, multiple branches, paused goals, direct link plus inherited ancestor, parity with the hierarchy pane.
- **Item 5:** `tagsFitInRows` boundaries (exact fit, one pixel over, a single tag wider than the row, Add Tag button counted). In `session-detail-width.spec.js`, on desktop and mobile: one tag shows its name selected and unselected, many tags collapse to "N tags" at phone width, and the card never scrolls horizontally.
- **Item 6:** on an expanded goal chart: the crosshair shows axis values, a goal can be set, markers open other goals, and the current goal's marker does nothing. Setting a goal reuses the saved view. Unsupported charts have no Set goal button. Escape leaves annotate mode before closing. One title shows. The existing `ExpandedProgressChart` tests and `goal-charts.spec.js` still pass, with new browser coverage for the goal page.

**Commands and manual checks**
- `./run-tests.sh all`, `./run-tests.sh lint`, `./run-tests.sh browser`
- Run the app and repeat each screenshot scenario, on desktop and mobile widths. On Session Detail, resize a card with one, three and many tags and select it at each size. Open the same scatter from Session Detail and from a goal, and compare hover, Set goal and markers side by side.
- For sync, in the browser: throttle the network and confirm taps stay instant, go offline and back, and return 503s for 3 minutes and confirm nothing is rejected.
