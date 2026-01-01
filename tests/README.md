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
./run-tests.sh
```

### Run Specific Test Suites

```bash
./run-tests.sh unit          # Unit tests only
./run-tests.sh integration   # Integration tests only
./run-tests.sh coverage      # With coverage report
```

---

## Test Structure

```
tests/
├── __init__.py
├── conftest.py              # Shared fixtures and configuration
├── unit/                    # Unit tests (60% of tests)
│   ├── test_models.py       # Database model tests
│   ├── test_goal_hierarchy.py
│   └── test_utils.py
├── integration/             # Integration tests (30% of tests)
│   ├── test_goals_api.py    # Goals API endpoint tests
│   ├── test_sessions_api.py # Sessions API endpoint tests
│   ├── test_activities_api.py
│   ├── test_timers_api.py   # Timer functionality tests
│   └── test_templates_api.py
└── e2e/                     # End-to-end tests (10% of tests)
    └── test_workflows.py    # Complete user workflows
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
Complete user workflow tests (to be implemented):
- Goal creation workflow
- Session logging workflow
- Timer usage workflow
- Template management workflow

**Run:** `./run-tests.sh e2e`

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
- Create complete hierarchy (UltimateGoal → NanoGoal)
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

Install pre-commit hooks to run tests before every commit:

```bash
cp shell-scripts/pre-commit-hook.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

This will run quick unit tests before allowing commits. To skip:

```bash
git commit --no-verify
```

---

## Continuous Integration

### GitHub Actions (To Be Configured)

Create `.github/workflows/test.yml`:

```yaml
name: Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install -r requirements-test.txt
      - name: Run tests
        run: pytest --cov=. --cov-report=xml
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

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
Tests use temporary in-memory databases. If you see database errors:
- Check that `conftest.py` is creating the test database correctly
- Verify all models are imported in `conftest.py`
- Check for missing migrations

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

**Last Updated:** 2026-01-01  
**Status:** Initial Implementation  
**Coverage:** TBD (run tests to generate)
