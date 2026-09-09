# Testing Framework for Fractal Goals

This directory contains the comprehensive test suite for the Fractal Goals application.

## Quick Start

### Install Test Dependencies

```bash
source fractal-goals-venv/bin/activate
pip install -r requirements-test.txt
```

### Run All Tests

```bash
./run-tests.sh db-up
./run-tests.sh
```

### Run Specific Test Suites

```bash
./run-tests.sh unit          # Unit tests only
./run-tests.sh integration   # Integration tests only
./run-tests.sh e2e           # Backend workflow tests
./run-tests.sh browser       # Real app in desktop and mobile Chromium
./run-tests.sh verify        # Cheap local verification path
./run-tests.sh coverage      # With coverage report
./run-tests.sh restore-drill # Local pg_dump/restore verification
```

### Local Postgres Bootstrap

```bash
./run-tests.sh db-up         # Start the local dev/test Postgres container
./run-tests.sh doctor        # Verify venv, node_modules, and DB connectivity
./run-tests.sh db-down       # Stop the container when you're done
```

### Full-suite performance and isolation

`./run-tests.sh backend`, `frontend`, `all`, and `coverage` retain the full test
inventory for their respective suites. `all` starts the backend and frontend suites
concurrently and reports both exit statuses, reducing wall time without changing test
selection. Backend database setup creates the schema
once per pytest session, then deletes rows from all ORM tables in dependency order
and resets serial/identity sequences before
each app-backed test. Tests can still commit, roll back, and use separate connections;
the concurrency suite continues to exercise real PostgreSQL locks. The actual
`models.base` scoped session is removed between tests and the shared engine is
disposed at session end.

Deletion is batched in one transaction: unlike truncation, it avoids replacing
table/index storage on disk for every test. Setup takes an explicit lock timeout
so a leaked connection causes a visible failure instead of hanging indefinitely.

Use a dedicated database whose name contains `test`, with `ENV=testing`. Do not run
two backend pytest processes against the same database: either process can reset
the other's data. Parallel backend execution requires separate databases per worker.

Frontend tests use four threads with per-file isolation. The timeout runner terminates
real hangs and preserves Vitest's normal result reporting. To compare worker settings
without skipping tests, run `npm run test:run -- --pool=forks` or
`npm run test:run -- --maxWorkers=8` from `client/`. Compare the final test/file counts
as well as elapsed time. More workers can increase memory pressure or slow a busy
machine; the default remains bounded. The wall timeout still terminates real hangs.

For backend timing detail without changing test selection or coverage, run
`PYTEST_ADDOPTS="--durations=20" ./run-tests.sh coverage`.
Successful tests capture logs rather than streaming every domain event; failure
reports retain captured logs. Use `PYTEST_ADDOPTS="-o log_cli=true"` when live logs
are useful for debugging.

Measured audit results and remaining production gaps are recorded in
[`planning/production-quality-audit-2026-09-07.md`](../planning/production-quality-audit-2026-09-07.md).

---

## Test Structure

```
tests/
├── __init__.py
├── conftest.py              # Shared fixtures and configuration
├── unit/                    # Models, services, handlers, and delivery boundaries
├── integration/             # API, persistence, and read-model parity tests
├── performance/             # Query-count budgets and regression limits
└── e2e/                     # Authenticated backend workflow tests

client/
├── src/**/__tests__/        # Vitest component, hook, and utility tests
└── e2e/                     # Playwright tests against the real Flask/Vite build
```

---

## Test Categories

### Unit Tests
Fast, isolated tests for individual components:
- Model creation and relationships
- Data validation
- Serialization (to_dict)
- Business logic functions
- Utility functions

**Run:** `./run-tests.sh unit`

### Integration Tests
Tests for API endpoints and database interactions:
- CRUD operations
- API request/response validation
- Database persistence
- Error handling
- Business rule enforcement

**Run:** `./run-tests.sh integration`

### End-to-End Tests
Complete user workflow tests:
- Inline activity creation with builder and goal associations
- Countdown-target start and completion persistence
- Root and activity delta-display setting round trips
- Browser login, goal/session navigation, completion persistence, and responsive behavior

**Run:** `./run-tests.sh e2e` for backend workflows or
`./run-tests.sh browser` for the built application.

---

## Coverage Goals

- **Backend Overall:** 80%+
- **Models:** 90%+
- **API Endpoints:** 85%+
- **Business Logic:** 95%+

### View Coverage Report

```bash
./run-tests.sh coverage
open htmlcov/index.html  # View in browser
```

---

## Critical Test Scenarios

### ✅ Goal Hierarchy
- Create complete hierarchy (UltimateGoal → ImmediateGoal)
- Enforce parent-child type constraints
- Delete goal cascades to children
- Root ID propagation

### ✅ Practice Sessions
- Create session with/without template
- Add/remove/reorder activities
- Update session times
- Calculate duration
- Multi-parent support

### ✅ Activity Instances
- Create instance
- Start/stop timer
- Manual time entry
- Prevent stopping timer never started
- Duration calculation

### ✅ Data Integrity
- Session data hydration (JSON → DB)
- Activity instance persistence
- Metric value storage
- Soft delete behavior
- Audit trail (created_at, updated_at)

---

## Running Tests

### All Tests
```bash
./run-tests.sh
# or
pytest
```

### Specific Test File
```bash
./run-tests.sh file tests/unit/test_models.py
# or
pytest tests/unit/test_models.py
```

### Specific Test Function
```bash
pytest tests/unit/test_models.py::TestGoalHierarchy::test_create_ultimate_goal
```

### With Verbose Output
```bash
pytest -v
```

### Stop on First Failure
```bash
pytest -x
```

### Watch Mode (Re-run on File Changes)
```bash
./run-tests.sh watch
# or
pytest-watch
```

---

## Test Markers

Tests can be marked with categories for selective running:

```python
@pytest.mark.unit
def test_model_creation():
    ...

@pytest.mark.integration
def test_api_endpoint():
    ...

@pytest.mark.critical
def test_timer_functionality():
    ...
```

### Run Tests by Marker
```bash
pytest -m unit          # Run only unit tests
pytest -m integration   # Run only integration tests
pytest -m critical      # Run critical functionality tests
pytest -m "not slow"    # Skip slow tests
```

---

## Fixtures

Shared test fixtures are defined in `conftest.py`:

### Database Fixtures
- `app` - Test Flask application
- `client` - Test client for API calls
- `db_session` - Database session

### Sample Data Fixtures
- `sample_ultimate_goal` - Single ultimate goal
- `sample_goal_hierarchy` - Complete goal tree
- `sample_activity_group` - Activity group
- `sample_activity_definition` - Activity with metrics
- `sample_practice_session` - Practice session
- `sample_activity_instance` - Activity instance
- `sample_session_template` - Session template

### Usage Example
```python
def test_create_session(client, sample_goal_hierarchy):
    """Test creating a session."""
    payload = {
        'name': 'Test Session',
        'parent_id': sample_goal_hierarchy['short_term'].id
    }
    response = client.post('/api/sessions', json=payload)
    assert response.status_code == 201
```

---

## Pre-commit Hooks

Install repo-tracked hooks to run verification before commits and pushes:

```bash
./run-tests.sh install-hooks
```

This will run quick unit tests before allowing commits. To skip:

```bash
git commit --no-verify
```

---

## Continuous Integration

GitHub Actions runs on every pull request and pushes to `main`. Backend CI checks
migration reversibility, the production dependency graph, maintainability, the full
unit/integration/performance/e2e inventory in one coverage pass, a logical backup/restore
drill, and the production container. Frontend CI checks its production dependency graph,
lint, coverage, responsive and maintainability budgets, the production build, and
Playwright on desktop and mobile. Consolidating backend tests into one coverage
execution avoids running the same inventory twice.

---

## Writing New Tests

### Unit Test Template

```python
"""
Unit tests for [component name].
"""

import pytest

class Test[ComponentName]:
    """Test [component] functionality."""
    
    def test_[specific_behavior](self, fixture_name):
        """Test that [specific behavior] works correctly."""
        # Arrange
        expected = "expected value"
        
        # Act
        result = function_under_test()
        
        # Assert
        assert result == expected
```

### Integration Test Template

```python
"""
Integration tests for [API endpoint].
"""

import pytest
import json

class Test[EndpointName]:
    """Test [endpoint] API."""
    
    def test_[operation](self, client, sample_data):
        """Test [operation] endpoint."""
        # Arrange
        payload = {'key': 'value'}
        
        # Act
        response = client.post(
            '/api/endpoint',
            data=json.dumps(payload),
            content_type='application/json'
        )
        
        # Assert
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['key'] == 'value'
```

---

## Best Practices

### ✅ DO
- Write tests for all new features
- Write tests that reproduce bugs before fixing
- Use descriptive test names
- Keep tests independent
- Use fixtures for common setup
- Test edge cases and error conditions
- Maintain 80%+ coverage

### ❌ DON'T
- Write tests that depend on other tests
- Use hardcoded IDs or timestamps
- Test implementation details
- Skip writing tests for "simple" code
- Commit code with failing tests
- Ignore test failures

---

## Troubleshooting

### Tests Fail with "No module named 'app'"
```bash
# Make sure you're in the project root
cd /Users/will/Projects/fractal-goals

# Activate virtual environment
source fractal-goals-venv/bin/activate

# Install dependencies
pip install -r requirements.txt
pip install -r requirements-test.txt
```

### Database Errors
Tests use a dedicated local PostgreSQL database. If you see database errors:
- Run `./run-tests.sh db-up` and then `./run-tests.sh doctor`
- Confirm `.env.testing` points to a database whose name contains `test`
- Do not run parallel backend processes against the same test database

### Import Errors
```bash
# Ensure project root is in Python path
export PYTHONPATH=/Users/will/Projects/fractal-goals:$PYTHONPATH
```

---

## Test Coverage Report

After running tests with coverage, view the HTML report:

```bash
./run-tests.sh coverage
open htmlcov/index.html
```

The report shows:
- Overall coverage percentage
- Coverage by file
- Lines covered/missed
- Branch coverage

---

## Next Steps

1. ✅ Install test dependencies
2. ✅ Run initial test suite
3. ✅ Fix any failing tests
4. ✅ Add tests for untested code
5. ✅ Set up pre-commit hooks
6. ✅ Configure CI/CD pipeline
7. ✅ Achieve 80%+ coverage

---

## Resources

- [pytest Documentation](https://docs.pytest.org/)
- [pytest-flask Documentation](https://pytest-flask.readthedocs.io/)
- [Coverage.py Documentation](https://coverage.readthedocs.io/)
- [Testing Best Practices](https://docs.python-guide.org/writing/tests/)

---

**Last Updated:** 2026-09-09

**Status:** Production release gates active

**Coverage:** Backend 81%+; frontend global ratchets enforced in Vitest
