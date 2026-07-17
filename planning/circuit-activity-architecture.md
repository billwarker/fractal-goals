# S+ Circuit Activity Architecture

## Summary

Introduce reusable circuit definitions managed beside activities, then snapshot them into session-specific circuit runs. A circuit is one ordered session item containing ordered activity slots, planned-but-adjustable rounds, a top-level circuit clock, explicit round clocks, and exclusive member work intervals.

Use “Round” for one complete pass through the circuit. Circuit elapsed time includes between-round gaps; round time runs from explicit round start to confirmed round end; activity totals receive only exclusive member work, preventing duplicated time.

## Data Model and Migration

- Add reusable `CircuitDefinition` and ordered `CircuitSlot` tables scoped to a fractal. Definitions contain name, description, planned rounds, lifecycle/version fields, and activity-definition slots with optional display labels.
- Add snapshotted `CircuitRun`, `CircuitRunSlot`, `CircuitRound`, and `CircuitRoundMember` tables:
  - Runs retain their original name, configuration, activity behavior, and ordering after definition edits.
  - Planned round/member rows are created with explicit `planned`, `active`, `completed`, `skipped`, or `unfinished` status.
  - Increasing rounds adds occurrences; reducing rounds removes only trailing unstarted occurrences.
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

- Introduce a canonical session work-interval ledger with a database-enforced maximum of one open work interval per session.
  - Ordinary activity timers and circuit member timing use the same service and locking path.
  - Starting another subject returns the active subject; the UI offers an atomic stop-and-switch action.
  - Activity, set, and member durations are derived from non-overlapping intervals rather than independent stopwatches.
- Circuit, round, and member timing behavior:
  - Circuit start and completion are explicit.
  - Circuit duration is unpaused elapsed time between those bounds and includes gaps between rounds.
  - Rounds start explicitly and end only when confirmed; duration is unpaused elapsed time between those events.
  - Member timing starts/switches explicitly. Completing a member stops its work interval but leaves the round running.
  - Transition/rest time counts toward circuit and active-round elapsed time but not activity work.
  - Pausing a circuit or session atomically pauses the circuit, active round, and active member; resume restores the same state.
- Historical corrections edit interval boundaries, statuses, metrics, and notes through one transactional service.
  - Member intervals must be non-overlapping and contained by their round.
  - Round intervals must be contained by the circuit.
  - All derived durations and analytics projections are recomputed after correction.
- Circuit completion may preserve planned or started occurrences as `unfinished` after confirmation. Skips are always explicit records rather than deleted/missing data.
- Archive circuit definitions with soft deletion. Historical runs and snapshots remain immutable in structure, while their recorded result data remains correctable.

## APIs and UI

- Add owned, root-scoped circuit definition endpoints for list, detail, create, atomic slot replacement/update, archive, and restore.
- Add circuit-run endpoints for insertion into a session, detail, start/pause/resume/complete, round adjustment/start/complete, member start/switch/complete/skip, and reconciled historical correction.
- Return typed session items and complete circuit-run projections with slots, rounds, member results, active timing state, and derived durations. Use conflict responses for stale versions and active-work collisions.
- Add a Circuits surface to Manage Activities with list cards and a builder for core fields, planned rounds, and ordered activity slots. Slots inherit their activity definition’s metrics and set behavior.
- Extend session-template and live-session item pickers to add circuits as single ordered items.
- Render a circuit as one expandable session item, with nested slot numbering such as `1.1`, `1.2`, and `1.3`, then show those slots within each named round.
- Provide clear Start Circuit, Start Round, Start/Switch Member, Complete/Skip Member, End Round, Pause/Resume, and Complete Circuit controls with confirmation for incomplete work.
- Derive circuit goal relevance from the union of member activity associations; do not create separate circuit-goal associations.

## Analytics, Compatibility, and Quality Gates

- Include exclusive circuit-member work in existing activity history, targets, progress comparisons, notes, and duration totals.
- Add circuit history and trend views for circuit elapsed duration, round durations, member work totals, completion/skip rates, and changes over time.
- Add circuit definitions, runs, rounds, members, and normalized sets to the governed analytics catalog with tenant isolation.
- Keep session duration independent: circuit and activity times are categorized subviews and are never summed into the session clock.
- Add quota/storage accounting and domain events for definitions, runs, rounds, members, sets, corrections, and lifecycle changes.
- Update `index.md` as part of implementation and delete superseded JSON-set, positional-note, legacy section-ordering, and multiple-active-timer code.

## Test Plan

- Migration tests cover empty sets, populated sets, metrics/splits, positional notes, completed history, active timers, malformed legacy JSON, rollback safety, and idempotent backfill.
- Model/service tests enforce ownership, snapshot isolation, unique slot ordering, no nesting, exclusive active work, valid result linkage, interval containment, pause propagation, skips, unfinished completion, and round-count adjustment.
- API tests cover CRUD, archive behavior, template instantiation, optimistic conflicts, atomic switching, validation errors, historical correction, and cross-fractal access denial.
- Frontend tests cover circuit building, typed ordering, template/session insertion, nested numbering, mixed set/non-set rounds, timer transitions, pause/resume, incomplete confirmation, corrections, and accessible keyboard/mobile operation.
- Analytics tests prove that member intervals roll up exactly once, circuit/round time does not inflate activity totals, set history retains stable identity, and session totals remain independent.
- End-to-end acceptance scenario: run two rounds of set-based Activity A plus non-set Activity B, include transitions and a between-round gap, pause once, skip one occurrence, and verify every circuit, round, set, activity, and session duration reconciles precisely.

## Assumptions and S+ Audit

- V1 circuit definitions contain only name, description, planned rounds, ordered slots, and optional slot labels; timing targets, rest prescriptions, and behavioral overrides are deferred.
- Existing templates reference definitions, while every session run snapshots them.
- Current implementation quality is strong for ordinary activities but materially below the circuit requirement because sets and ordering are positional JSON and concurrent timers are supported.
- The plan reaches S+ when there is one normalized set model, one typed session-item model, one authoritative work ledger, database-enforced timing invariants, complete migration coverage, and no legacy competing write paths.

## Commit Message

`feat: add normalized circuit runs, rounds, sets, and exclusive timing`
