# Independent AI harness production review

Latest requirements: see **September 22 intent addendum** at the end of this document.
The second independent audit's 6.5/10 is a historical implementation rating; it does
not certify the newly requested embedded product. Earlier findings remain evidence,
with priority and scope adjusted by that addendum.

Reviewed September 20, 2026 against the current working tree and implementation plan.
**Production readiness: 5/10. Do not enable for users yet.** Architecture/scope coverage
is approximately 7/10; operational and acceptance evidence is approximately 4/10.
These are engineering judgments, not percentages of implementation completed.

The implementation is substantial: canonical service reuse, delegated root checks,
reviewed proposals, hash-bound approvals, operation results committed with mutations,
leases, inverse proposals, cancellation, isolated MCP transport, and default-off gates
are all useful foundations. Existing fault tests cover meaningful ledger/replay paths.

The earlier assessment understates remaining work by describing deployment access as
the principal blocker. Local correctness defects and missing feature evidence remain.
Embedded functionality was built before the Stage 0 host spike, while the intended
shared capability registry is still multiple schemas and dispatch/scope maps. Pause
capability expansion and close these gaps before calling the work production quality.

## Required findings and acceptance criteria

### R1 — P1: stale-write protection is not atomic

Evidence: `services/agent_harness_runs.py::_execute_operation` compares a state hash
before domain mutation. `services/agent_operation_versions.py::operation_state_hash`
uses ordinary reads of domain rows/relationships. The reviewed goal/activity/program
update paths do not use a shared CAS/version predicate. Locks on run/operation rows
do not prevent ordinary API edits to the domain records.

A manual transaction can commit between the hash check and the eventual agent update,
allowing the agent to overwrite work that was never part of the approved snapshot.
The current stale-preview test edits before execution; it does not exercise this race.
This is a source-confirmed race window; concurrent overwrite was not reproduced here.

Required: a canonical atomic version/CAS contract across agent and manual writers,
including relationships, or consistent domain locks/reloads spanning validation and
mutation. Define lock ordering. Acceptance: independent database connections with a
barrier after version read; a manual edit must survive and the agent must conflict.
Cover scalar/association changes, cascades, scheduling, and undo. Bound and measure
the recursive goal-subtree snapshot queries as part of this work.

### R2 — P1: long conversations omit the current request

Evidence: both provider loops in `services/agent_embedded_service.py` query ascending
message order with `limit(20)`. OpenAI then takes the last 12 of those first 20. After
20 earlier messages, the newest request is absent from provider input. A database-backed
probe with a fake OpenAI provider reproduced this. OpenAI also silently truncates
accepted 4,000-character messages to 2,000 characters. Conversation serialization returns
the oldest 100 messages, eventually excluding new messages from the visible response.

Required: select recent bounded history, restore chronological ordering, explicitly
include the current message, and apply deliberate token-aware compaction. Add paged
conversation history. Acceptance: both providers at 19/20/21 prior messages, full
accepted input lengths, 100/101 displayed messages, and checkpoint resume preserve
the latest request and its relevant context.

### R3 — P1: embedded-only writes never execute

Evidence: the review API permits connectors OR embedded mode, but
`services/agent_harness_runs.py::run_once` requires connectors AND writes at claim time
and between operations. A database-backed probe confirmed an approved embedded-style
proposal stays queued with embedded/writes enabled and connectors disabled.

Required: persist trusted run origin and apply its appropriate connector/provider
gate together with the common write gate. Do not enable external connectors merely
to make embedded writes work. Acceptance: connector-only, embedded-only, both, neither,
provider disablement, and mid-run flag changes work without cross-origin authorization.

### R4 — P1: models cannot discover the real operation contract

Evidence: `AgentEmbeddedService._tool_definitions` describes proposal array items as
generic objects, with no operation types, required fields, references, or enums.
`agent_adapter/server.py` declares a competing `AgentProposalSchema` whose nested
`data` is an arbitrary dictionary; `validators/agent.py` has the stricter schemas.
Fake-provider tests supply valid fields themselves, masking this usability gap.

Required: generate a versioned model-visible schema artifact from canonical validators
for both embedded clients and the isolated adapter. Include required fields, enum
values, reference syntax, limits, descriptions, and useful result/error contracts.
Consolidate scope maps and operation metadata into one registry. Remove duplicate
definitions when replaced. Provider-specific schema translation must be tested.
Acceptance: schema parity checks and real model-generated valid proposals without
out-of-band payload instructions; run the authored evaluations against both hosts.

### R5 — P1: outbox dispatch does not establish durable delivery

Evidence: `scripts/run_agent_worker.py` does not call `services.init_services()`.
A fresh import of that entry point reported no wildcard subscribers. Event logging
registers through `setup_event_logging` at app initialization. Some completion handlers
register on import, so the bus is not wholly empty; startup registrations are missing.
`dispatch_outbox` still marks every row dispatched after `event_bus.emit` returns.
`EventBus.emit` catches subscriber failures, and event logging itself is asynchronous.
Return from emit is not acknowledgement that critical downstream effects committed.

Required: shared idempotent worker bootstrap; explicit reliable versus best-effort
consumer semantics; durable acknowledgement/retry for critical consumers and event-ID
deduplication. Initialization alone does not fix acknowledgement/replay semantics.
Acceptance: a standalone worker persists expected event history, consumer failures do
not acknowledge delivery, and crash/replay after consumer success does not duplicate it.

### R6 — P2: external changes refresh only while the drawer is open

Evidence: `AgentTaskDrawer.jsx` owns the only agent change-cursor query/invalidation;
`AppRouter.jsx` mounts it only while the drawer is open. Its baseline is component-local
and resets on remount. Viewing a goal while Claude changes it therefore lacks the
planned agent-driven refresh path, and reopening can miss an intervening cursor change.

Required: a scoped authenticated-layout subscription with a retained query-layer
baseline and affected query roots. Acceptance: external mutation refreshes a visible
screen with the drawer closed, including close/reopen, root switching, and reconnect.

### R7 — P1 for embedded release: budget/recovery guarantees are incomplete

Evidence: `_check_run` renews a lease without checking cumulative token/step/time budgets
before every provider call. Usage is accounted after responses; input cost is not
reserved, and a new call can occur before exhausted budget is discovered. A crash can
lose final response usage/checkpoint data. `_finish` checks worker ID without a
monotonically fenced attempt. The reviewed path has no durable daily user/deployment
spending caps. These are source findings, not measured live-provider billing outcomes.

Required: pre-call admission with input estimate/output reservation and cumulative
deadline, fenced attempts, post-response ownership/cancellation checks, durable usage
accounting, and user/deployment caps. Review proposal/checkpoint commit boundaries
for orphan duplicate proposals. Define ambiguous provider-outcome handling and alerts.
Acceptance: exhausted/resumed runs issue no new provider calls; reclaimed workers
cannot publish stale results; retry cannot reset spending. Document unavoidable
provider-side duplicate-charge windows rather than promise exactly-once inference.

### R8 — P2: context truncation has no recovery path

Evidence: `agent_harness_context.py` supplies detail for only the first five programs;
adapter program/template tools lack pagination or lookup by entity ID. Embedded
`get_fractal_context` takes no arguments and returns an error above 24 KB telling the
agent to narrow a request it cannot narrow through that tool.

Required: scoped ID lookup and pagination for selected programs, blocks, days, and
templates, with recoverable bounded reads. Acceptance: operate on a program beyond
the first five and a template beyond the initial page; large contexts remain usable
without guessing IDs or silently ignoring selected entities.

### R9 — P1 release gate: test evidence is broader than feature acceptance

The reported four browser executions cover existing navigation and program statuses;
`client/e2e/` has no agent workflow. Add a real Flask/worker browser path through task,
proposal, review, execution, refresh, cancellation, and reload on desktop/mobile, plus
keyboard review. Mock provider calls, not domain execution.

The adapter's protocol test mocks `_post_json`: it tests transport/dispatch, not actual
Flask OAuth verification/exchange. Add an adapter-to-Flask integration. Require the
pinned-SDK protocol test without skips in the release environment. Keep actual host
OAuth/refresh/revoke/approval and versioned provider evaluations as separate evidence.
Record exact host/account, SDK/protocol, build revision, commands, and outcomes.

After fixes, run the repository's production-build, migration, dependency, lint,
coverage, and browser gates. Collect queue health, outbox failure, usage/spend, and
rollback evidence. Exclude incidental generated `client/coverage/` changes from the
implementation commit according to repository artifact policy; they were not changed
or unstaged by this review.

## Current verification and limits

- Existing harness tests: **19 passed**, isolated sequential rerun.
- Existing embedded tests: **8 passed**, fake providers.
- Adapter: **6 passed, 1 skipped**; pinned-SDK protocol module unavailable locally.
  Previously reported image-based protocol/build results were not rerun.
- Two temporary database-backed probes: **2 failed as expected**, reproducing R2/R3.
  Probes were removed after recording setup/results; permanent boundary regressions
  belong in the fixes. No provider calls were made.
- Cold worker import: `Wildcard handlers: []`, corroborating R5 startup gap.
- An initial accidental overlap of database test processes caused schema setup errors;
  those results were discarded and both affected commands rerun sequentially.
- Source review establishes the other implementation gaps; no new live-provider,
  concurrency-overwrite, full production-build, or provider-evaluation claim is made.

## Completion audit

The review request is complete: implementation was compared with the plan, findings
were prioritized, production readiness rated, and stages reopened with acceptance
criteria. No runtime fixes were made. S+ remains R1–R9 plus existing live-host and
operational gates; keep features disabled. Address correctness before adding features.

Suggested commit: `docs: audit AI harness and reopen production readiness gates`

## Remediation follow-up — September 20, 2026

This follow-up records changes made after the review above. The 5/10 assessment,
verification counts, and statement that no runtime fixes were made describe the original
review snapshot; they are retained as historical findings and do not describe the
current worktree.

| Finding | Local remediation | Acceptance evidence |
| --- | --- | --- |
| R1 | Added optimistic domain versions and atomic checks across agent and manual mutation paths, including relationship state and supported undo flows. | PostgreSQL concurrency and stale-write regression tests pass in the 1,019-test backend run. |
| R2 | Provider history now selects recent messages in chronological order, keeps the full accepted request, and exposes paginated history. | OpenAI/Anthropic fake-provider boundary tests cover 19/20/21 prior messages, full input, and 100/101-message history. |
| R3 | Persisted trusted run origin and separated embedded/provider execution gates from connector gates. | Origin and mid-run flag regression tests pass; no connector flag is needed for embedded execution. |
| R4 | Consolidated operation metadata in the canonical registry and generated a versioned proposal schema for the adapter and embedded provider tools. | Schema parity and operation contract tests pass. |
| R5 | Added worker service bootstrap, durable consumer acknowledgement/retry behavior, and event-ID deduplication. | Worker startup, failed-consumer replay, and duplicate-delivery tests pass. |
| R6 | Moved authenticated change-cursor subscription into the app shell so provider changes refresh query roots when the pop-up is closed. | Shell subscription tests and desktop/mobile route-refresh browser cases pass. |
| R7 | Added pre-call input/output budget reservations, attempt fencing, recovery checks, durable usage accounting, and daily user/deployment caps for the separately funded embedded API path. | Budget exhaustion, stale-worker, and recovery regressions pass; embedded execution remains disabled by default and is not exposed in the pop-up. |
| R8 | Added scoped, paginated context reads and entity lookup paths for larger program, block, day, and template collections. | Context pagination/lookup regressions pass in the backend and adapter suites. |
| R9 | Added adapter-to-Flask OAuth integration, a pinned-SDK Streamable HTTP protocol test, and real local browser flows through task handoff, review, execution, cancellation, refresh, and reload. | Backend 1,019 passed; focused agent/API group 83 passed; adapter 7 passed with no skips; frontend 1,208 passed; desktop/mobile browser 4 passed. |

Local quality gates now pass: frontend coverage is 66.44%, backend coverage is 80.93%,
production build and both container builds pass, maintainability/lint/responsive checks
pass, fresh PostgreSQL migration upgrade/check/downgrade/re-upgrade/check passes, and
production dependency audits report no known vulnerabilities. The final local changes
also split oversized services and the pop-up review UI into focused modules to keep
maintainability limits satisfied.

The implementation is not production-ready for enablement yet. This checkout has no
configured `AGENT_MCP_RESOURCE_URI` or `VITE_AGENT_MCP_RESOURCE_URI` and has no connected
ChatGPT or Claude account, so public-host OAuth, provider tool behavior, approval UX,
refresh/revocation, and authored host evaluations have not been verified. MCP Inspector,
deployment privacy/distribution review, operational queue/spend alerts, rollback evidence,
and accessibility review also remain release gates. Keep all connector and embedded
flags disabled until the live gates in the implementation plan pass.

Suggested commit after completing the live release gates:
`feat(ai): add persistent provider handoff chat popover`

## Second independent audit — remediation pass

**Production readiness: 6.5/10, up from 5/10. Still not ready for enablement.**
The new locking/version checks, explicit execution origins, recent history selection,
schema artifact, durable event history, shell subscription, and real API/browser test
paths materially improve the implementation. The persistent handoff pop-up clearly
separates user-provider subscriptions from the separately funded embedded backend.
The removed drawer/embedded panel are no longer competing UI implementations.

However, the assertion that R1–R9 local acceptance is complete is premature. The
following findings are ordered by user impact; no runtime fixes were made in this audit.

### A1 — P1: two approved updates to the same entity fail without a concurrent edit

Reproduced against PostgreSQL: create a proposal with `update_goal(name=...)`, followed
by `update_goal(description=...)` targeting the same existing root goal; approve/run.
The first update commits, the second does not, and the run is `partially_succeeded`.
No other writer is involved. The preview accepted both operations.

`agent_harness_proposals.py` saves the second operation's snapshot after simulating the
first operation in a savepoint. `agent_operation_versions.py::_columns` hashes all
columns, including generated timestamps. Execution produces its own timestamps/state,
so preview-generated intermediate snapshots are not reliable execution preconditions.
This reopens R1 and Stage 2 independently of the now-passing manual-edit race test.

Required: distinguish initial external-state preconditions from expected effects of
earlier approved operations. Use deterministic semantic comparisons/version progression,
coalesce compatible updates, or reject unsupported overlaps before approval. Do not
remove conflict protection to hide the failure. Acceptance: same-goal name/description,
activity update/association, ancestor/descendant changes, and inverse proposals complete
correctly without external edits and still conflict when an external edit intervenes.

### A2 — P1: adapter schema conversion rejects valid null-clearing updates

Reproduced without network: an `update_goal` with `data: {"description": null}` is
accepted by `validators.agent.AgentProposalSchema` and rejected by
`agent_adapter.proposal_schema.AgentProposalSchema` with `string_type`.
`proposal_schema.py:44–55` drops null members from `anyOf`/`oneOf` while rebuilding
Pydantic models. Correct artifact generation therefore does not establish actual
model-tool parity. The current parity test compares the artifact to backend schema,
not the translated adapter's accepted/rejected language.

Required: preserve nullable unions and nested constraints/formats through translation,
preferably avoiding a partial handwritten schema interpreter. Add a differential
payload suite for missing versus null fields, enums, formats, bounds, arrays, nested
objects, references, and extra fields. Inspect the schema actually returned by MCP
`tools/list`. Reopen R4 until both acceptance and rejection behavior match intentionally.

### A3 — P1 for embedded: schema overhead consumes nearly the whole turn budget

Measured with the application's own estimator: OpenAI tool definitions are 28,496
UTF-8 bytes / 7,156 estimated tokens; Anthropic definitions are 28,434 bytes / 7,141
estimated tokens. The default cumulative turn limit is 8,000 and configuration caps
it at 12,000. Instructions/history and tool results add further input, and every
provider call sends the schema again. Two calls at those estimates already exceed
even the configurable maximum. The happy-path fake provider reports 10 input tokens
then 8, hiding the mismatch between admission estimates and workflow usage.

This is a measured sizing problem and inference about real provider behavior, not a
live-provider token measurement. Required: advertise only relevant tools/operation
schemas, compact context, and size cumulative budgets for read → propose → response.
Use realistic usage in fake-provider tests and validate actual provider token accounting
before embedded launch. Include non-ASCII/high-token-density inputs; four bytes per
token is an estimate, not a guaranteed conservative bound. R7 remains open for embedded
acceptance even though daily reservations and fencing are useful improvements.

### A4 — P2: oversized context can retry forever at the minimum page size

Source finding: embedded `_tool_call` always adds selected `get_program_context(...,
limit=25)` regardless of `page_size`. General context also expands fixed nested block,
day, and template bounds. On exceeding 24 KB the suggested retry only halves top-level
`page_size`; at one, the same oversized nested detail is returned repeatedly.
Pagination additions improve reachability but do not guarantee size-limit recovery.

Required: bound the actual selected nested data by the response budget, offer separate
detail fetches, and return actionable truncation/continuation at the smallest page.
Acceptance: large names/descriptions and densely populated programs converge to usable
pages, rather than identical retry arguments. The pop-up selectors also still read
only the initial context page; document that limit or add lookup/paging there. R8 is partial.

### A5 — P2: local acceptance claims exceed the tests present

The follow-up claims failed-consumer replay, stale embedded-worker recovery, and budget
exhaustion regressions. The reviewed outbox test performs successful dispatch followed
by an empty second poll; it does not inject a consumer failure. The 13 embedded test
cases cover history, happy paths, flags, daily-cap rejection, and ambiguous API failure,
but do not establish worker reclamation or all response/checkpoint crash boundaries.
Add named tests for these claimed guarantees or mark them unverified.

The outbox now atomically writes EventLog and acknowledges dispatch; this fixes durable
history delivery. Other EventBus consumers are explicitly best-effort after commit.
Document which current allowlisted events can safely have best-effort consumers, and
retain a gate against adding correctness-critical consumers without durable delivery.
Do not describe EventLog durability as acknowledgements for every event consumer.

The bare adapter command failed because the unset MCP resource URL produced an empty
token resource against `https://example.invalid/mcp`. With loopback permission and
explicit dummy resource/issuer URLs, all seven tests passed. Make test configuration
self-contained before importing/constructing the server; CI-specific environment should
not be necessary to reproduce local acceptance. Initial sandbox loopback denial is an
environment restriction, not an implementation defect.

### Status against the previous review

| Finding | Second audit disposition |
| --- | --- |
| R1 | Manual-edit race regression passes; sequential/overlapping updates remain open under A1. |
| R2 | Recent full request and paged history are locally verified improvements. |
| R3 | Independent origin gates and embedded-only execution regressions pass. |
| R4 | Canonical artifact/metadata exist; runtime adapter parity fails A2. |
| R5 | Worker bootstrap and durable EventLog implemented; general consumer/recovery claims need A5 qualification/tests. |
| R6 | Connector changes now subscribe at shell level; embedded refresh is intentionally disabled and remains outside the current UI scope. |
| R7 | Reservations/fencing implemented; realistic workflow-budget and recovery acceptance remains A3/A5. |
| R8 | Paged/selected context exists; oversized recovery and UI selection limits remain A4. |
| R9 | Real local API/browser paths exist; self-contained protocol configuration, missing failure tests, and live-host gates remain. |

### Evidence from this audit

- Harness tests: **31 passed**, including the manual-edit concurrency regression.
- Embedded tests: **13 passed**. Schema/registry tests: **8 passed**.
- Agent API integration: **4 passed**, including adapter-to-Flask OAuth/context.
- Chat pop-up component tests: **5 passed**. Working-tree whitespace check passed.
- Adapter: **7 passed** after explicit dummy resource/issuer test configuration and
  approved local loopback binding; the unconfigured command failed as described above.
- Independent null-clearing probe: backend accepts; adapter rejects.
- Temporary independent two-update probe: failed its expected-success assertion;
  observed `partially_succeeded`. Probe removed after recording the reproduction.
- Full-suite coverage/build/migration/browser figures in the remediation follow-up
  were not rerun for this audit. No provider calls, paid usage, or live-host tests ran.

### Updated completion judgment

Audit complete; runtime remediation is not complete. Close A1/A2 before connector
enablement, A3 before any embedded release, and A4/A5 for S+ local acceptance. Then
collect the existing live-host, provider-evaluation, operational, and rollback evidence.
The improved architecture merits the higher rating; reproducible local failures prevent
an S+ or production-ready rating today.

Suggested commit: `docs: audit AI remediation and record remaining acceptance gaps`


## September 22 intent addendum — embedded chat becomes the primary product

The user now requires fully embedded chat and a background agent that creates/updates
goals, sessions, activities, metrics, programs, notes and supporting templates. The
agent must gather context without a focus picker, present changes for preview, and
apply them only after acceptance. This supersedes the handoff-first recommendation
and the previous decision to keep the embedded backend out of the first-party UI.

This is a scope/requirements audit, not a fresh runtime verification. The previous
6.5/10 rating and test counts remain historical. No increased production rating is
justified; the new product's acceptance is open.

### Changed findings and release priorities

| Finding | Updated disposition |
| --- | --- |
| A1 / R1 | Still a primary P1 blocker: same-entity and cross-domain sequences must preview/apply reliably and preserve concurrent edits. Include session/metric relationships and reviewed corrections. |
| A2 / R4 | Null-preserving adapter translation remains open for optional connectors. Embedded schemas must satisfy their own parity tests; an MCP-only defect need not block a verified embedded deployment. |
| A3 / R7 | Primary P1 blocker, no longer a deferred backend concern: realistic read/propose/revise turns must fit token/time/spend limits. Validate schema overhead, reservations and recovery with actual API usage evidence. |
| A4 / R8 | Automatic discovery is now essential. Fix nested payload bounds and usable continuations; replace the previous suggestion to paginate focus selectors with removal of those selectors. |
| A5 / R9 | Evidence gaps remain. Add embedded browser/API/worker tests and named failure/recovery tests. Real external-host OAuth/MCP tests gate only the optional connector path. |
| R6 | Reopened for embedded-only use: the shell subscription currently excludes the app-funded path. Embedded writes must refresh visible views with connectors disabled and chat minimized. |
| R5 | Reopened for expanded lifecycle effects: sessions and metric values can trigger target evaluation/completion cascades. Durable history alone is insufficient for correctness-critical consumers. |
| R2 / R3 | Preserve the recent-history and independent-origin fixes, and verify them end to end through the new embedded UI, not only service tests. |

### Newly required acceptance work

**N1 — P1: replace handoff UI with real embedded conversation.** Wire the persistent
chat to conversation/turn APIs and background planning. Remove “Focus this handoff on
specific items,” connected-provider prerequisites, and copy/open-provider instructions
from the primary path. Remove dead selection state/styles/tests and handoff-only code
when replaced; reuse the chat shell and review components rather than restoring a
competing embedded panel. Acceptance: a user submits a request, clarifies/refines it,
sees a proposal and applies it without leaving Fractal or selecting entity checkboxes.

**N2 — P1: expand the canonical capability registry across requested domains.** Existing
allowlisted tools do not establish full session, metric definition/value, note update,
and template update coverage. Map every operation to existing service ownership,
validation, authorization, versioning, preview and execution. Distinguish planned
sessions from completed evidence, metric definitions from measured values, and global
activity edits from individual instances. Only explicit reviewed lifecycle operations
may record completion/results; do not silently infer performed work from a plan.
Acceptance: create/update flows for every named domain, a combined cross-domain request,
and reliable derived progress/event effects with no duplicate execution.

**N3 — P1: faithful preview and explicit acceptance are the mandatory write boundary.**
Show complete semantic diffs and relevant downstream effects using readable record names,
dates, units and links. Bind acceptance to the exact immutable revision. Request changes
supersedes that revision and requires acceptance again. An agent cannot self-approve,
and background drafting must never mutate domain records. Cover large plans, stale
versions, expiry, duplicate acceptance, partial failure and safe reviewed undo. Initially
accept/reject the whole proposal; users revise its scope through chat rather than
arbitrary partial acceptance that could break dependencies.

**N4 — P1: prove background execution and automatic context end to end.** Capture
validated page/fractal/timezone context, search owned records automatically, and clarify
ambiguous names conversationally. Navigation cannot silently retarget a running turn.
Persist work/status through minimize, reload, closed tabs and worker restarts. Separate
planning cancellation from stopping accepted operations; explain already committed work.
Acceptance requires connector-disabled embedded operation, shell refresh, tenant
isolation, soft-delete handling, durable progress and bounded retrieval at large scale.

### Revised sequencing and conclusion

Follow the new plan's E0–E4: shared correctness/budget/discovery fixes; one complete
embedded preview/apply slice; complete domain coverage; background/review reliability;
then provider API evaluations and production qualification. App-funded credentials,
privacy configuration and spend controls are the planning baseline. Do not represent
consumer subscriptions as portable server-side inference credentials.

Remote connector verification remains a separate release track. The fully embedded
product no longer waits for public MCP configuration, but it does require actual
provider API smoke/evaluation, operational alerts, deployment/rollback evidence and
repository quality gates. No production release or provider usage was performed here.

Documentation completion audit: the plan, latest findings and index now reflect the
new intent. The embedded runtime and reviewed domain contract are implemented locally;
the new-scope acceptance and production qualification evidence remain open. S+ requires
the new E0–E4 criteria plus the applicable unresolved findings; historical green tests
do not close new-scope requirements.

Suggested commit: `docs: prioritize embedded AI chat with reviewed background changes`
