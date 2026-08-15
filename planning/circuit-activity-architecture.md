# S+ Circuit Activity Architecture

## Summary

Introduce reusable circuit definitions managed beside activities, then snapshot them into session-specific circuit runs. A circuit is one ordered session item containing ordered activity slots, structural rounds, and one top-level circuit clock.

Use “Round” for one complete pass through the circuit. Set-based activities align one stable normalized set with each round; non-set activities align one untimed activity instance with each round. Child results retain metrics but never receive circuit duration.

## Data Model and Migration

- Add reusable `CircuitDefinition` and ordered `CircuitSlot` tables scoped to a fractal. Definitions contain name, description, lifecycle/version fields, and activity-definition slots. Execution always begins with one round; subsequent rounds are added explicitly to each run. Slot labels and behavioral overrides are intentionally absent.
- Add snapshotted `CircuitRun`, `CircuitRunSlot`, `CircuitRound`, and `CircuitRoundMember` tables:
  - Runs retain their original name, configuration, activity behavior, and ordering after definition edits.
  - Round/member rows are structural and carry no lifecycle or timing state.
  - Increasing or reducing rounds is allowed throughout an unfinished parent session, including while the circuit is active or after the circuit is marked complete.
  - Duplicate activity definitions are allowed as distinct slots; nested circuits are prohibited.
- Normalize sets globally into `ActivitySet` rows with stable IDs, order, status, duration, notes, timestamps, and optional circuit-round-member linkage.
  - Backfill current `ActivityInstance.data.sets` values and positional set notes.
  - Extend metric values and notes with stable set relationships.
  - Continue serializing `sets` in API responses for client compatibility, but generate them from rows.
  - Remove JSON-set writes, positional set identity, legacy merge paths, and other competing set implementations after backfill.
- Result mapping:
  - A set-based circuit slot creates one `ActivityInstance` per slot per circuit run and one `ActivitySet` per round.
  - A non-set slot creates a normal `ActivityInstance` per round.
  - Each round member links to exactly one set or non-set instance, enforced by database constraints.
- Replace `sections[].activity_ids` with canonical typed ordered items: ordinary activity items reference an instance; circuit items reference a circuit run. Add a read migration for legacy structures, then remove dual-write behavior.
- Session templates reference managed circuit definitions as typed items. Session creation snapshots the current circuit into a run. Archived circuits remain usable by existing templates but disappear from new selectors.

## Timing and Lifecycle

- Keep the canonical session work-interval ledger exclusively for ordinary activity timers.
- Circuit start and completion are explicit. Circuit duration is unpaused elapsed time between the run boundaries and includes all transitions and rests; pause/resume belongs exclusively to the parent session lifecycle.
- Rounds and members have no start/stop/duration lifecycle. Circuit child `ActivityInstance` rows always keep `time_start`, `time_stop`, and `duration_seconds` null.
- Prevent ordinary activity timers and active or paused circuits from overlapping within a session.
- Completed circuit timing remains correctable through the shared relative start/stop adjustment. Member metrics remain editable through their canonical metric update path.
- Circuit completion marks every generated child result complete and completes aligned `ActivitySet` rows without assigning child time.
- Archive circuit definitions with soft deletion. Historical runs retain their definition snapshots, while their round structure and recorded result data remain correctable until the parent session is complete.

## APIs and UI

- Add owned, root-scoped circuit definition endpoints for list, detail, create, atomic slot replacement/update, archive, and restore.
- Add circuit-run endpoints for insertion into a session, detail, start/complete, timing adjustment, individual round addition/removal, and member metrics. Circuit pause/resume propagates exclusively through the parent session lifecycle.
- Return typed session items and circuit-run projections with top-level timing plus structural slots, rounds, and member results. Round/member timing and lifecycle fields are absent.
- Add a Circuits surface to Manage Activities with list cards and a builder for core fields and ordered activity slots. Slots inherit their activity definition’s metrics and set behavior; round count is run-owned rather than definition-owned.
- Extend session-template and live-session item pickers to add circuits as single ordered items.
- Render a circuit as one expandable session item whose nested indexes use round/activity coordinates: Round 1 contains `1.1`, `1.2`, and `1.3`; Round 2 restarts the slot position as `2.1`, `2.2`, and `2.3`. The member's shared set-style metric row does not repeat another inner result index.
- Provide synchronized Start, Stop, and Duration fields plus Start and Complete actions only on the circuit container. Parent-session pause displays the circuit as paused and parent-session resume continues it; there is no standalone circuit pause/resume action. Actions remain authoritative, while the shared relative-time adjustment is the sole timing-correction workflow.
- Derive circuit goal relevance from the union of member activity associations; do not create separate circuit-goal associations.
- Keep quick-entry sessions activity-only: their atomic create-and-complete workflow has no interactive round or circuit-timer phase. Managed circuits remain available in standard sessions and session templates.
- Keep interactive authoring within 100 rounds, 50 slots, and 1,000 generated results. Session detail initially renders ten rounds and progressively reveals more, bounding mobile DOM work without truncating persisted results.

## Analytics, Compatibility, and Quality Gates

- Include circuit child metrics in existing activity history, targets, and progress comparisons while excluding circuit duration from child activity duration totals.
- Use existing Sessions summaries, session detail, and the governed analytics catalog for circuit history. The abandoned dedicated circuit-history and circuit-trend endpoints remain removed.
- Add circuit definitions, runs, rounds, members, and normalized sets to the governed analytics catalog with tenant isolation.
- Keep session duration independent: circuit and activity times are categorized subviews and are never summed into the session clock.
- Add quota/storage accounting and domain events for definitions, runs, sets, and top-level lifecycle changes.
- Serialize definition edits with a row lock before optimistic-version evaluation. Session structure, timer, run deletion, and round mutations share a session-first lock order.
- Update `index.md` as part of implementation and delete superseded JSON-set, positional-note, legacy section-ordering, and multiple-active-timer code.

## Test Plan

- Migration tests cover empty sets, populated sets, metrics/splits, positional notes, completed history, active timers, malformed legacy JSON, rollback safety, and idempotent backfill.
- Model/service tests enforce ownership, snapshot isolation, unique slot ordering, no nesting, timer exclusivity, valid result linkage, null child timing, pause propagation, completion, and round adjustment across planned, active, and completed circuit states until the parent session completes.
- API tests cover CRUD, archive behavior, template instantiation, active-timer conflicts, validation errors, metrics, and cross-fractal access denial.
- Frontend tests cover circuit building, typed ordering, template/session insertion, nested numbering, mixed set/non-set rounds, top-level timer transitions, pause/resume, progressive rendering, and accessible keyboard/mobile operation.
- Analytics tests prove that circuit duration is counted at the circuit/section level and never inflates child activity totals, while set history retains stable identity.
- End-to-end acceptance scenario: run two rounds of set-based Activity A plus non-set Activity B, record metrics, pause once, complete the circuit, and verify that only the circuit has timing while every child result remains untimed.

## Assumptions and S+ Audit

- Circuit definitions contain only name, description, an optional activity group, and ordered activity slots; timing targets, round prescriptions, rest prescriptions, slot labels, and behavioral overrides are intentionally absent.
- Existing templates reference definitions, while every session run snapshots them.
- Current implementation quality is strong for ordinary activities but materially below the circuit requirement because sets and ordering are positional JSON and concurrent timers are supported.
- The plan reaches S+ when there is one normalized set model, one typed session-item model, exactly one circuit timer owner, database-enforced structural invariants, complete migration coverage, and no legacy round/member timing paths.

## Commit Message

`feat: add normalized circuit runs, rounds, sets, and exclusive timing`
