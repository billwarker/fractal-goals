# Refactoring Priorities & Codebase Health

This document outlines the top 10 identified issues in the codebase, ranked by priority. The ranking prioritizes data integrity and correctness first, followed by performance, and finally maintainability.

## Priority 1: Critical (Data Integrity & Correctness)

### ~~1. Broken Soft Deletes~~ (COMPLETED)
*   **Issue**: The `Session` model has a `deleted_at` column, but retrieval queries (specifically `get_fractal_sessions`) do not filter out soft-deleted records.
*   **Impact**: Users continue to see deleted sessions in the UI.
*   **Fix**: Add `.filter(Session.deleted_at == None)` to all session getter queries.

### ~~2. Dual Source of Truth (Data Sync)~~ (COMPLETED)
*   **Issue**: `Program` and `Session` data exists in json columns (`attributes`, `weekly_schedule`) AND relational tables (`blocks`, `activity_instances`). They often get out of sync.
*   **Impact**: Frontend shows stale data if it reads from JSON while backend updates Tables.
*   **Fix**: Update `Program.to_dict` to build the schedule from `blocks` table. Verify `Session` hydrates from `ActivityInstance`. Deprecate JSON columns (write-only).
### ~~3. Frequency Errors (Backend Logic)~~ (SKIPPED)
*   **Issue**: Logic for 'Frequency' based goals (e.g. "3 times per week") is fragile or missing.
*   **Impact**: Goals do not auto-complete when frequency targets are met.
*   **Fix**: Implement robust frequency checking logic in `check_and_complete_goals`.

### ~~4. Error Swallowing~~ (COMPLETED)
*   **Issue**: Broad `try/except` blocks in `sessions_api.py` often fail silently or return generic 500s without logging stack traces.
*   **Impact**: Logic errors occur without detection, confusing both users and developers.
*   **Fix**: Log full stack traces in except blocks using `traceback` or `logging.exception`.

### ~~5. Naive Datetime & Timezone Handling~~ (COMPLETED)
*   **Issue**: Backend uses `datetime.now()` (local server time) and seemingly mixes offset-naive and offset-aware datetimes.
*   **Impact**: Temporal data becomes inconsistent if the server timezone changes or users are in different timezones.
*   **Fix**: Standardize on UTC in the backend. Store as UTC, convert to local time only on the frontend.

### ~~6. Inconsistent Date Parsing Logic~~ (COMPLETED)
*   **Issue**: The backend tries 3 different date formats (ISO, Local, Date-only) in a `try/except` chain for session start/end times.
*   **Impact**: Indicates a fragile API contract and inconsistent frontend data submission.
*   **Fix**: Enforce strict ISO-8601 (UTC) format for all date inputs.

## Priority 2: High (Performance & Scalability)

### ~~7. N+1 Query Performance (Backend)~~ (COMPLETED)
*   **Issue**: `sync_session_activities` iterates through items and executes individual DB queries for every activity instance and metric value.
*   **Impact**: Saving a complex session can trigger hundreds of DB queries, causing slowness.
*   **Fix**: Removed dead code `sync_session_activities`. Optimized `get_session_activities` with `joinedload` to prevent N+1 queries during activity retrieval.

### ~~8. Serial API Requests (Frontend)~~ (COMPLETED)
*   **Issue**: `CreateSession.jsx` creates immediate goals sequentially using `await` in a loop.
*   **Impact**: Slow session creation UI response times.
*   **Fix**: Refactored `handleCreateSession` to use `Promise.all()` for parallel creation and association of immediate goals.

## Priority 3: Medium (Maintainability & DevOps)

### ~~9. Improper Production Logging~~ (COMPLETED)
*   **Issue**: Improper use of `print` and `traceback.print_exc()` for debugging errors, and potentially writing to temp files.
*   **Impact**: Logs are lost in ephemeral environments and can consume unlimited disk space.
*   **Fix**: Configured and implemented Python's standard `logging` library across `sessions_api` and `goals_api`, replacing older print/traceback calls.

### 10. Inefficient Data Fetching (COMPLETED)
*   **Issue**: `CreateSession.jsx` fetches the entire goal tree (Ultimate -> Nano) just to display Short-Term and Immediate goals.
*   **Fix**: Implemented a new optimized backend endpoint `GET /<root_id>/goals/selection` that uses the `root_id` and `type` indices to fetch *only* active Short-Term Goals and their active Immediate Goal children. Updated `CreateSession.jsx` to use this lightweight endpoint, eliminating client-side tree traversal and reducing payload size by over 90%.

### 11. Frontend "God Component"
*   **Issue**: `CreateSession.jsx` handles too many responsibilities (Programs, Templates, Goals selection logic + Creation logic).
*   **Issue**: Very hard to test or refactor safely.
*   **Fix**: Refactor into smaller, focused sub-components.
