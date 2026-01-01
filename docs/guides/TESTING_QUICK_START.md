# Quick Start: Testing Framework

**Get started with testing in 5 minutes**

---

## 1. Install Test Dependencies

```bash
# Activate virtual environment
source fractal-goals-venv/bin/activate

# Install testing packages
pip install -r requirements-test.txt
```

---

## 2. Run Your First Tests

```bash
# Run all tests
./run-tests.sh

# Or use pytest directly
pytest
```

**Expected output:**
```
======================== test session starts =========================
collected 100+ items

tests/unit/test_models.py::TestGoalHierarchy::test_create_ultimate_goal PASSED
tests/unit/test_models.py::TestGoalHierarchy::test_goal_hierarchy_relationships PASSED
...

======================== 100+ passed in 5.23s ========================
```

---

## 3. Run Tests with Coverage

```bash
./run-tests.sh coverage
```

**View coverage report:**
```bash
open htmlcov/index.html
```

---

## 4. Install Pre-commit Hook (Optional but Recommended)

```bash
# One-time setup
cp shell-scripts/pre-commit-hook.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

Now tests run automatically before every commit!

---

## 5. Write Your First Test

Create a new test file:

```python
# tests/unit/test_my_feature.py

import pytest

class TestMyFeature:
    """Test my new feature."""
    
    def test_basic_functionality(self):
        """Test that basic functionality works."""
        # Arrange
        expected = "hello"
        
        # Act
        result = "hello"
        
        # Assert
        assert result == expected
```

Run it:
```bash
pytest tests/unit/test_my_feature.py -v
```

---

## Common Commands

```bash
# All tests
./run-tests.sh

# Unit tests only
./run-tests.sh unit

# Integration tests only
./run-tests.sh integration

# With coverage
./run-tests.sh coverage

# Watch mode (re-run on changes)
./run-tests.sh watch

# Specific file
./run-tests.sh file tests/unit/test_models.py

# Stop on first failure
pytest -x

# Verbose output
pytest -v
```

---

## What's Next?

- Read the full guide: `/tests/README.md`
- Review testing strategy: `/docs/planning/TESTING_STRATEGY.md`
- Check implementation details: `/docs/planning/TESTING_FRAMEWORK_IMPLEMENTATION.md`

---

## Troubleshooting

### "No module named 'app'"
```bash
# Make sure you're in project root
cd /Users/will/Projects/fractal-goals

# Activate venv
source fractal-goals-venv/bin/activate
```

### Tests fail
```bash
# Run with verbose output to see details
pytest -v

# Run single test to isolate issue
pytest tests/unit/test_models.py::TestGoalHierarchy::test_create_ultimate_goal -v
```

---

**You're ready to test! 🚀**

Run `./run-tests.sh` to get started.
