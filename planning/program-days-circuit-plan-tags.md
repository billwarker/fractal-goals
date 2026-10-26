# Program Days: tags on planned circuits, rounds, and round activities

## Context

On the Programs **Days** tab you can tag a planned activity (item header **+ Tag**) and each of its sets. When a session starts, those tags are applied to the activity instance and its sets. A planned circuit has no **+ Tag** at all. The session page can tag a circuit at three levels:
- the run (`CircuitRunTagControl`);
- each round (`CircuitRoundTagControl`);
- each activity within a round (`CircuitMemberTagEditor`).

None of these can be planned ahead.

**Goal:** Program Days can tag a planned circuit to the same extent as the session page: **the circuit**, **a round**, or **an activity within a round**. Editing works like activity and set tags. When the session starts, the tags land exactly where adding them on the session page would put them.

---

## Grade of the existing system against this plan

| Area | Grade | Why |
|---|---|---|
| Tag runtime for circuits | **A** | `CircuitScopeTag` + `CircuitTagOperations` (`_run_targets`, `_round_targets`, `_assign`, preserved keys, "pick one" families, `inherit_run_tags` for rounds added later) already does everything a planned tag needs at session start. |
| Planned-tag pipeline for activities | **A−** | Validation (`validators/prescriptions.py::_validate_tag_ids`), semantic check (`services/prescriptions.py::_check_tag_ids`), creation (`load_planned_tags`, which skips archived tags), and catalog merges and deletes (`tag_reference_rewrites.py`) all exist. They only know `tags` / `sets[].tags`. |
| Circuit prescription model | **C** | The `{notes?, rounds:[{notes?, slots}]}` shape has no tags. The validator and `normalizeCircuitPrescription` drop unknown keys, so tags can't even round-trip. Both also drop slots with no metrics, which would lose a tag-only slot. |
| Tag picker reuse | **B+** | `PlanTagEditor` → `ActivityTagEditor` in controlled mode works with the whole fractal catalog; creating a tag hits the catalog endpoint. It is keyed on `definition.id` (an activity), which is cosmetic only (cache invalidation). |
| Catalog-rewrite coverage | **B** | Rewrites walk every `prescription` in templates, plans and sessions, plus `ActivityInstance.prescription`, but not `rounds[].tags` / `rounds[].slots[].tags`. Nor do they cover `CircuitRun.prescription`, the snapshot taken at session start. |
| **Overall readiness** | **B+** | The runtime is done. The missing piece is the plan format end to end: schema, validation, rewrite, materialisation and UI. |

---

## Design

**Plan shape** (schema version unchanged, all additive):
`{ schema: 1, notes?, tags?: tagId[], rounds: [{ notes?, tags?: tagId[], slots: [{ slot_id, metrics, tags?: tagId[] }] }] }`
- Tag ids are `ActivityTagDefinition` ids, the same as activity plan tags. The limit per list is `MAX_PRESCRIPTION_TAGS`.
- `tags` is omitted when empty, as for activities. Old plans stay valid.
- A slot entry is kept when it has metrics **or** tags. Today it is kept only with metrics.

**At session start** (`CircuitService.create_run`): after the rounds are created, planned tags become scope tags:
- `prescription.tags` → one run-scope `CircuitScopeTag` each (`circuit_round_id = NULL`), assigned to `_run_targets(run)`.
- `rounds[i].tags` → one round-scope `CircuitScopeTag` each on round `i + 1`, assigned to `_round_targets(round)`.
- `rounds[i].slots[j].tags` → direct tags on that round's member target. This is the target `CircuitMemberTagEditor` edits: the member's `activity_set` for a set-based slot, or its `activity_instance` for a setless one. The tags are set like activity planned tags (`target.tags = load_planned_tags(...)`).
- **Order:** member tags first, then run and round scopes. A scope finding a member already tagged records it in `preserved_target_keys`, so removing the scope later on the session page keeps the member's own tag, the same as when it was tagged by hand.
- Tags are loaded with `load_planned_tags`. An archived or deleted tag is skipped and logged, never fails the session, matching activity planned tags.
- Because run scopes persist as rows, rounds added during the session inherit them through the existing `inherit_run_tags`.

**Copy and compare:** unchanged. Copy already doesn't copy tags (`copyCircuitValues` rebuilds rounds without them), which matches the "not copied" rule.

---

## Implementation steps

### 1. Server: schema, validation and rewrites
- `validators/prescriptions.py::validate_circuit_prescription`: read `tags` at the top level, in each round, and in each slot with `_validate_tag_ids`. Write them into the normalised output only when non-empty, and keep a slot when it has metrics or tags. Update the docstring shape.
- `services/prescriptions.py::_check_circuit_prescriptions`: gather all circuit, round and slot tag ids, then call `_active_tag_ids` once and `_check_tag_ids` per path (`"<circuit> plan"`, `"<circuit> round N"`, `"<circuit> round N <activity>"`).
- `services/tag_reference_rewrites.py`:
  - `rewrite_prescription` also rewrites `rounds[].tags` and `rounds[].slots[].tags`, using the same `_rewrite_ids` helper. Extract the "rewrite a list's `tags` field" block the sets loop already uses, and apply it to sets, rounds and slots.
  - `rewrite_planned_tags` also rewrites `CircuitRun.prescription` (query by `_mentions`, like `ActivityInstance`).

### 2. Server: applying them at session start
- `services/circuit_tag_operations.py`: add `apply_planned_scopes(run, prescription)`:
  - load the tags via `load_planned_tags`;
  - **members first:** for each round number and planned slot, find the round's `CircuitRoundMember` whose run slot's `source_slot_id` is that `slot_id`, then add the tags to `_member_target(member)` (skipping ones it already holds);
  - for each run tag, call `_assign(_locked_targets(_run_targets(run)))` and add a `CircuitScopeTag` with incremental `sort_order` and `preserved_target_keys`;
  - do the same per round tag, using `_round_targets`;
  - skip a tag already scoped at that level;
  - no commit, because the caller owns the transaction.
- `services/circuit_service.py::create_run`: after `_create_round_occurrences`, if the prescription has any tags, flush, reload the run with members (`self._run`), and call `apply_planned_scopes`. Check storage quota for the planned assignments the way `inherit_run_tags` does.
- Offline: placeholder runs (`offline/circuitOps.js`) carry no prescription. The server applies planned tags when the queued create syncs, so no client change is needed.

### 3. Client: model
- `utils/prescriptionModel.js`:
  - `normalizeCircuitPrescription` keeps `tags` (via `cleanTags`) at the top level, per round and per slot.
  - `normalizeCircuitPrescription` keeps a slot when it has metrics or tags (today: metrics only).
  - Add `withCircuitTags(prescription, tags)`, `withRoundTags(prescription, roundIndex, tags)` and `withCircuitSlotTags(prescription, roundIndex, slotId, tags)`.
  - `withAddedRound` repeats values only, not tags, mirroring `withAddedSet`.
  - The summary at the `parts.push('tags')` line also counts circuit, round and slot tags.

### 4. Client: UI
- `components/prescriptions/PlanTagEditor.jsx`: accept `scopeId` (defaults to `definition.id`) so a circuit can use it. Circuit ids only drive cache invalidation.
- `components/programs/days/SessionPlanCard.jsx`: in the item header, where the activity `PlanTagEditor` is gated on `definition`, add a circuit branch:
  - `scopeId={circuit.id}`;
  - `tagIds={item.prescription?.tags}`;
  - it saves with `withCircuitTags`;
  - it is editable when the item is selected, like activities.
- `components/prescriptions/CircuitPrescriptionEditor.jsx`:
  - new props `rootId` and `circuitId`;
  - render a `PlanTagEditor` in each `roundHeader`, after the title. It saves with `withRoundTags`, is editable only when that round is selected (`editable && isSelected`, as sets do), and shows the circuit tags as `inheritedTags`, as set tags show activity tags;
  - render a `PlanTagEditor` in each round's activity row (`roundSlot`), after its values. It is keyed on the activity (`definition={slot.definition}`), saves with `withCircuitSlotTags`, and is editable only when that member is selected (`selectedSlot`, as on the session page). Its `inheritedTags` are the circuit tags plus that round's tags, as in `CircuitMemberTagEditor`;
  - read-only cards show assigned tags only (`PlanTagEditor` already hides when there's nothing to show);
  - keep the round header's height steady so the two columns stay aligned.
- `components/modals/TemplateItemPlanEditor.jsx`: pass `rootId`/`circuitId` so base templates get round and member tags too. Its circuit-level tags come from the same model if the template item header renders `PlanTagEditor`. Wire it where the activity one is.

### 5. Docs
- `planning/programs-domain-reference.md`: the circuit plan shape includes tags, and they become run and round scope tags and member tags at session start.
- After approval, save this plan as `planning/program-days-circuit-plan-tags.md`.

---

## Verification
- **Server tests** (`tests/`), next to the existing prescription, circuit-tag and session-creation tests:
  - the validator accepts and normalises circuit, round and slot tags, rejects non-string or too many, drops empty lists, and keeps a tag-only slot;
  - the semantic check rejects unknown or deleted tag ids with the round path in the message;
  - creating a session from a plan with circuit and round tags gives the run and round `CircuitScopeTag` rows; members and instances carry the tags (setless members per round, set-based slots on the instance); an archived planned tag is skipped and the session is still created;
  - planned member tags land on the round member's set (set-based slot) or instance (setless slot) and nowhere else;
  - removing a run scope on the session page keeps a member's own planned tag (preserved keys);
  - adding a round mid-session inherits the planned run tags;
  - a catalog merge or delete rewrites `rounds[].tags` and `rounds[].slots[].tags` in plans and in `CircuitRun.prescription`.
- **Client tests:**
  - `prescriptionModel` keeps and cleans circuit, round and slot tags, `withRoundTags` / `withCircuitSlotTags`, a tag-only slot surviving normalisation, and `withAddedRound` not copying tags;
  - `CircuitPrescriptionEditor`: the round picker is editable only when the round is selected, and the member picker only when that member is selected; round tags inherit circuit tags, and member tags inherit circuit and round tags;
  - `SessionPlanCard`: the circuit header has **+ Tag**, and Save sends `prescription.tags`, `rounds[].tags` and `rounds[].slots[].tags`;
  - `planCopy` still copies no tags.
- **Commands:** `./run-tests.sh` (or `pytest tests -k "prescription or circuit_tag or session_creation or tag_reference"`); `cd client && npx vitest run src/components/programs/days src/components/prescriptions src/utils && npm run lint`.
- **Manual (`/run`):** Programs → Days:
  1. Select the superset and add a circuit tag. Select Round 2 and add a round tag. Select Round 3's FL Holds and add a tag. Save, reload, and check the tags persist.
  2. Start the session from that day. On the session page the run shows the circuit tag, round 2 shows its tag, and round 3's FL Holds shows its own tag.
  3. Add a round there; it inherits the circuit tag.
