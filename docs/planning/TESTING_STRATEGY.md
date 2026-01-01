# Testing Strategy for Fractal Goals

**Created:** 2026-01-01  
**Status:** Planning  
**Priority:** CRITICAL

---

## Overview

This document outlines the comprehensive testing strategy for the Fractal Goals application. The goal is to prevent regressions and ensure all major features work correctly before committing new code.

---

## Testing Pyramid

```
        /\
       /  \  E2E Tests (10%)
      /----\
     /      \  Integration Tests (30%)
    /--------\
   /          \  Unit Tests (60%)
  /--------------\
```

### Test Distribution
- **Unit Tests (60%)**: Fast, isolated tests for individual functions/components
- **Integration Tests (30%)**: Test API endpoints and database interactions
- **E2E Tests (10%)**: Test complete user workflows through the UI

---

## Technology Stack

### Backend Testing
- **pytest**: Test framework
- **pytest-flask**: Flask-specific testing utilities
- **pytest-cov**: Code coverage reporting
- **factory_boy**: Test data factories
- **faker**: Generate realistic test data

### Frontend Testing
- **Vitest**: Fast unit test runner (Vite-native)
- **React Testing Library**: Component testing
- **MSW (Mock Service Worker)**: API mocking
- **Playwright**: E2E testing

### CI/CD
- **GitHub Actions**: Automated test runs on push/PR
- **Pre-commit hooks**: Run tests before commits

---

## Backend Testing Structure

### Directory Structure
```
/tests/
├── __init__.py
├── conftest.py                 # Shared fixtures
├── factories.py                # Test data factories
├── /unit/
│   ├── test_models.py          # Model unit tests
│   ├── test_goal_hierarchy.py  # Goal hierarchy logic
│   ├── test_activity_logic.py  # Activity calculations
│   └── test_utils.py           # Utility functions
├── /integration/
│   ├── test_goals_api.py       # Goals API endpoints
│   ├── test_sessions_api.py    # Sessions API endpoints
│   ├── test_activities_api.py  # Activities API endpoints
│   ├── test_timers_api.py      # Timers API endpoints
│   └── test_templates_api.py   # Templates API endpoints
└── /e2e/
    └── test_workflows.py       # Complete user workflows
```

### Test Coverage Goals
- **Models**: 90%+ coverage
- **API Endpoints**: 85%+ coverage
- **Business Logic**: 95%+ coverage
- **Overall**: 80%+ coverage

---

## Frontend Testing Structure

### Directory Structure
```
/client/tests/
├── setup.js                    # Test setup and global mocks
├── /unit/
│   ├── /components/
│   │   ├── Sidebar.test.jsx
│   │   ├── ActivityBuilder.test.jsx
│   │   └── SessionActivityItem.test.jsx
│   ├── /utils/
│   │   ├── api.test.js
│   │   ├── dateUtils.test.js
│   │   ├── goalHelpers.test.js
│   │   └── metricsHelpers.test.js
│   └── /contexts/
│       ├── GoalContext.test.jsx
│       └── SessionContext.test.jsx
├── /integration/
│   ├── FractalGoals.test.jsx   # Main fractal view
│   ├── SessionDetail.test.jsx  # Session detail page
│   └── ManageActivities.test.jsx
└── /e2e/
    ├── goal-creation.spec.js   # Create and manage goals
    ├── session-workflow.spec.js # Complete session workflow
    └── activity-timer.spec.js  # Timer functionality
```

### Test Coverage Goals
- **Components**: 70%+ coverage
- **Utils**: 90%+ coverage
- **Pages**: 60%+ coverage
- **Overall**: 70%+ coverage

---

## Critical Test Scenarios

### 1. Goal Hierarchy Tests
- ✅ Create goal hierarchy (UltimateGoal → NanoGoal)
- ✅ Enforce parent-child type constraints
- ✅ Delete goal and all descendants
- ✅ Update goal properties
- ✅ Toggle goal completion
- ✅ Add/remove targets
- ✅ Calculate goal age correctly

### 2. Practice Session Tests
- ✅ Create session with/without template
- ✅ Add activities to session
- ✅ Reorder activities
- ✅ Remove activities
- ✅ Update session times
- ✅ Calculate session duration
- ✅ Link session to multiple short-term goals
- ✅ Delete session

### 3. Activity Instance Tests
- ✅ Create activity instance
- ✅ Start timer
- ✅ Stop timer
- ✅ Manual time entry
- ✅ Update metric values
- ✅ Handle splits (left/right)
- ✅ Calculate multiplicative metrics
- ✅ Prevent stopping timer that was never started

### 4. Activity Definition Tests
- ✅ Create activity with metrics
- ✅ Create activity with splits
- ✅ Update activity definition
- ✅ Delete activity (check cascade)
- ✅ Organize activities by groups
- ✅ Reorder activity groups

### 5. Session Template Tests
- ✅ Create template from scratch
- ✅ Create template from existing session
- ✅ Load template into session
- ✅ Update template
- ✅ Delete template

### 6. Timer Workflow Tests
- ✅ Start timer → creates instance if missing
- ✅ Stop timer → calculates duration
- ✅ Manual time entry → validates times
- ✅ Multiple timers in same session
- ✅ Timer state persistence

### 7. Data Integrity Tests
- ✅ Session data hydration (JSON → DB)
- ✅ Activity instance persistence
- ✅ Metric value storage
- ✅ Soft delete behavior
- ✅ Audit trail (created_at, updated_at)
- ✅ Root ID propagation

### 8. Edge Cases
- ✅ Empty sessions
- ✅ Sessions with no activities
- ✅ Activities with no metrics
- ✅ Concurrent timer operations
- ✅ Invalid datetime formats
- ✅ Missing required fields
- ✅ Orphaned records cleanup

---

## Test Data Strategy

### Fixtures (Backend)
```python
@pytest.fixture
def test_db():
    """Create a fresh test database for each test"""
    
@pytest.fixture
def sample_fractal():
    """Create a complete goal hierarchy"""
    
@pytest.fixture
def sample_session():
    """Create a session with activities"""
    
@pytest.fixture
def sample_activities():
    """Create activity definitions with metrics"""
```

### Factories (Backend)
```python
class GoalFactory(factory.Factory):
    class Meta:
        model = Goal
    
    id = factory.LazyFunction(lambda: str(uuid.uuid4()))
    name = factory.Faker('sentence', nb_words=3)
    type = 'UltimateGoal'
    
class ActivityDefinitionFactory(factory.Factory):
    # ...
```

### Mocks (Frontend)
```javascript
// Mock API responses
export const mockGoalTree = { /* ... */ };
export const mockSession = { /* ... */ };
export const mockActivities = [ /* ... */ ];
```

---

## Running Tests

### Backend Tests
```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=. --cov-report=html

# Run specific test file
pytest tests/integration/test_sessions_api.py

# Run specific test
pytest tests/unit/test_models.py::test_goal_hierarchy

# Run in watch mode
pytest-watch
```

### Frontend Tests
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test SessionDetail.test.jsx

# Run in watch mode
npm test -- --watch

# Run E2E tests
npm run test:e2e
```

### Pre-commit Tests
```bash
# Run quick smoke tests before commit
./scripts/pre-commit-tests.sh
```

---

## CI/CD Integration

### GitHub Actions Workflow
```yaml
name: Test Suite

on: [push, pull_request]

jobs:
  backend-tests:
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
          pip install pytest pytest-cov
      - name: Run tests
        run: pytest --cov=. --cov-report=xml
      - name: Upload coverage
        uses: codecov/codecov-action@v3

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Set up Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: cd client && npm ci
      - name: Run tests
        run: cd client && npm test -- --coverage
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

---

## Test-Driven Development Workflow

### For New Features
1. **Write failing tests first** (TDD approach)
2. **Implement minimal code** to pass tests
3. **Refactor** while keeping tests green
4. **Add edge case tests**
5. **Verify coverage** meets thresholds

### For Bug Fixes
1. **Write test that reproduces bug**
2. **Verify test fails**
3. **Fix the bug**
4. **Verify test passes**
5. **Add regression test** to prevent recurrence

### Before Committing
1. **Run full test suite** (`npm test && pytest`)
2. **Check coverage** (must meet thresholds)
3. **Fix any failing tests**
4. **Update tests** if API changed
5. **Commit with test results**

---

## Coverage Thresholds

### Backend (pytest.ini)
```ini
[tool:pytest]
addopts = --cov=. --cov-fail-under=80
```

### Frontend (vitest.config.js)
```javascript
export default {
  test: {
    coverage: {
      lines: 70,
      functions: 70,
      branches: 65,
      statements: 70
    }
  }
}
```

---

## Next Steps

1. ✅ Install testing dependencies
2. ✅ Set up test directory structure
3. ✅ Create conftest.py and fixtures
4. ✅ Write first unit tests (models)
5. ✅ Write integration tests (API endpoints)
6. ✅ Set up frontend testing (Vitest)
7. ✅ Write component tests
8. ✅ Set up E2E testing (Playwright)
9. ✅ Configure CI/CD pipeline
10. ✅ Add pre-commit hooks

---

## Success Metrics

- **Test Coverage**: 80%+ backend, 70%+ frontend
- **Test Speed**: Full suite runs in < 2 minutes
- **Reliability**: 0% flaky tests
- **Maintenance**: Tests updated with every feature
- **CI/CD**: All tests pass before merge
- **Regression Prevention**: No bugs reoccur after fix

---

**This testing framework will prevent the continuous addition of errors and ensure production-quality code.**
