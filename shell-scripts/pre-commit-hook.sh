#!/bin/bash

# Pre-commit Hook for Fractal Goals
# This script runs quick smoke tests before allowing a commit
#
# To install: cp shell-scripts/pre-commit-hook.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Running pre-commit tests...${NC}"

# Activate virtual environment
if [ -d "fractal-goals-venv" ]; then
    source fractal-goals-venv/bin/activate
fi

# Run quick smoke tests (unit tests only, no integration tests)
# This should complete in under 30 seconds
pytest tests/unit/ -v --tb=short -x

# Check exit code
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Pre-commit tests passed${NC}"
    exit 0
else
    echo -e "${RED}✗ Pre-commit tests failed${NC}"
    echo -e "${YELLOW}Commit aborted. Fix the failing tests and try again.${NC}"
    echo -e "${YELLOW}To skip this check, use: git commit --no-verify${NC}"
    exit 1
fi
