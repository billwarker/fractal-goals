#!/bin/bash

# Test Runner Script for Fractal Goals
# This script runs the test suite with various options

set -euo pipefail
export ENV=testing

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$ROOT_DIR/fractal-goals-venv"
VENV_PYTHON="$VENV_DIR/bin/python"
VENV_PYTEST="$VENV_DIR/bin/pytest"
VENV_PTW="$VENV_DIR/bin/pytest-watch"
CLIENT_DIR="$ROOT_DIR/client"
NPM_BIN="${NPM_BIN:-npm}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored message
print_message() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Print usage
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  all           Run all tests (default)"
    echo "  backend       Run all backend tests"
    echo "  frontend      Run all frontend tests"
    echo "  unit          Run only unit tests"
    echo "  integration   Run only integration tests"
    echo "  e2e           Run only end-to-end tests"
    echo "  smoke         Run quick smoke tests"
    echo "  critical      Run critical functionality tests"
    echo "  coverage      Run tests with detailed coverage report"
    echo "  doctor        Check local test environment without running the full suite"
    echo "  verify        Run cheap repo verification checks"
    echo "  install-hooks Install repo-tracked git hooks into .git/hooks"
    echo "  db-up         Start local Postgres test database with Docker Compose"
    echo "  db-down       Stop local Postgres containers"
    echo "  db-reset      Recreate local Postgres containers and volumes"
    echo "  lint          Run frontend lint and maintainability checks"
    echo "  fix           Run frontend auto-fixes and maintainability checks"
    echo "  maintain      Run frontend maintainability and responsive audits"
    echo "  watch         Run tests in watch mode"
    echo "  file <path>   Run specific test file"
    echo "  help          Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 unit                           # Run unit tests"
    echo "  $0 file tests/unit/test_models.py # Run specific file"
    echo "  $0 coverage                       # Run with coverage"
    exit 1
}

# Activate virtual environment if it exists
activate_venv() {
    if [ -d "$VENV_DIR" ]; then
        print_message "$BLUE" "Activating virtual environment..."
        # shellcheck disable=SC1090
        source "$VENV_DIR/bin/activate"
    else
        print_message "$YELLOW" "Warning: Virtual environment not found"
    fi
}

require_file() {
    local path=$1
    local label=$2
    if [ ! -e "$path" ]; then
        print_message "$RED" "Error: Missing $label at $path"
        exit 1
    fi
}

require_command() {
    local cmd=$1
    local label=$2
    if ! command -v "$cmd" >/dev/null 2>&1; then
        print_message "$RED" "Error: Missing $label ('$cmd')"
        exit 1
    fi
}

ensure_backend_tools() {
    require_file "$VENV_PYTHON" "virtualenv python"

    if [ ! -x "$VENV_PYTEST" ]; then
        print_message "$BLUE" "Installing backend test dependencies into virtual environment..."
        "$VENV_PYTHON" -m pip install -q -r "$ROOT_DIR/requirements-test.txt"
    fi
}

check_backend_db() {
    if ! backend_db_probe; then
        print_message "$RED" "Backend test database is not reachable."
        print_message "$YELLOW" "Expected DATABASE_URL from .env.testing to accept connections."
        print_message "$YELLOW" "Run './run-tests.sh db-up' to start the local Postgres test database."
        print_message "$YELLOW" "If Postgres is already running, this may be a sandbox restriction rather than an app issue."
        exit 1
    fi
}

backend_db_probe() {
    "$VENV_PYTHON" - <<'PY'
import os
import sys
from dotenv import load_dotenv
import psycopg2

load_dotenv(".env.testing")
db_url = os.getenv("DATABASE_URL")
if not db_url:
    print("DATABASE_URL is not set in .env.testing", file=sys.stderr)
    sys.exit(1)

try:
    conn = psycopg2.connect(db_url, connect_timeout=3)
    conn.close()
except Exception as exc:
    print(f"{exc.__class__.__name__}: {exc}", file=sys.stderr)
    sys.exit(1)
PY
}

docker_compose() {
    (cd "$ROOT_DIR" && docker compose "$@")
}

wait_for_backend_db() {
    local attempts=${1:-20}
    local sleep_seconds=${2:-2}
    local try=1

    while [ "$try" -le "$attempts" ]; do
        if backend_db_probe >/dev/null 2>&1; then
            print_message "$GREEN" "Backend test database is ready."
            return 0
        fi

        print_message "$BLUE" "Waiting for backend test database ($try/$attempts)..."
        sleep "$sleep_seconds"
        try=$((try + 1))
    done

    check_backend_db
}

ensure_frontend_tools() {
    require_file "$CLIENT_DIR/package.json" "client package.json"
    require_file "$CLIENT_DIR/node_modules/.bin/vitest" "frontend test dependencies"
    require_file "$CLIENT_DIR/node_modules/.bin/eslint" "frontend lint dependencies"
}

backend_pytest() {
    (cd "$ROOT_DIR" && "$VENV_PYTHON" -m pytest "$@")
}

backend_pytest_no_cov() {
    (cd "$ROOT_DIR" && "$VENV_PYTHON" -m pytest -o addopts="--verbose --strict-markers" "$@")
}

frontend_vitest() {
    (cd "$CLIENT_DIR" && "$NPM_BIN" run test:run -- "$@")
}

frontend_npm_script() {
    local script=$1
    shift || true
    (cd "$CLIENT_DIR" && "$NPM_BIN" run "$script" -- "$@")
}

run_backend_tests() {
    print_message "$GREEN" "Running backend tests..."
    ensure_backend_tools
    check_backend_db
    backend_pytest_no_cov
}

run_frontend_tests() {
    print_message "$GREEN" "Running frontend tests..."
    ensure_frontend_tools
    frontend_vitest
}

run_doctor() {
    print_message "$GREEN" "Running test environment checks..."
    require_file "$ROOT_DIR/.env.testing" ".env.testing"
    ensure_backend_tools
    ensure_frontend_tools
    check_backend_db
    print_message "$GREEN" "Environment looks ready for backend and frontend test runs."
}

run_verify() {
    print_message "$GREEN" "Running cheap repo verification..."
    ensure_frontend_tools
    bash -n "$ROOT_DIR/run-tests.sh"
    frontend_vitest
    frontend_npm_script check:responsive
}

run_install_hooks() {
    print_message "$GREEN" "Installing git hooks..."
    "$ROOT_DIR/scripts/install-git-hooks.sh"
}

run_db_up() {
    print_message "$GREEN" "Starting local Postgres test database..."
    require_command docker "Docker"
    docker_compose up -d postgres
    ensure_backend_tools
    wait_for_backend_db
}

run_db_down() {
    print_message "$GREEN" "Stopping local Postgres containers..."
    require_command docker "Docker"
    docker_compose down
}

run_db_reset() {
    print_message "$GREEN" "Resetting local Postgres containers and volumes..."
    require_command docker "Docker"
    docker_compose down -v
    docker_compose up -d postgres
    ensure_backend_tools
    wait_for_backend_db
}

run_frontend_maintainability() {
    print_message "$GREEN" "Running frontend maintainability checks..."
    ensure_frontend_tools
    frontend_npm_script check:maintainability
    frontend_npm_script check:responsive
}

run_lint() {
    print_message "$GREEN" "Running lint and maintainability checks..."
    ensure_frontend_tools
    frontend_npm_script lint
    run_frontend_maintainability
}

run_fix() {
    print_message "$GREEN" "Running frontend auto-fix and maintainability checks..."
    ensure_frontend_tools
    frontend_npm_script lint:fix
    run_frontend_maintainability
}

# Run all tests
run_all_tests() {
    print_message "$GREEN" "Running all tests..."
    run_backend_tests
    run_frontend_tests
}

# Run unit tests
run_unit_tests() {
    print_message "$GREEN" "Running unit tests..."
    ensure_backend_tools
    check_backend_db
    backend_pytest_no_cov tests/unit/ -m unit
}

# Run integration tests
run_integration_tests() {
    print_message "$GREEN" "Running integration tests..."
    ensure_backend_tools
    check_backend_db
    backend_pytest_no_cov tests/integration/ -m integration
}

# Run e2e tests
run_e2e_tests() {
    print_message "$GREEN" "Running end-to-end tests..."
    if [ ! -d "$ROOT_DIR/tests/e2e" ]; then
        print_message "$YELLOW" "No backend e2e suite found at tests/e2e"
    else
        ensure_backend_tools
        check_backend_db
        backend_pytest_no_cov tests/e2e/ -m e2e
    fi
}

# Run smoke tests
run_smoke_tests() {
    print_message "$GREEN" "Running smoke tests..."
    ensure_backend_tools
    check_backend_db
    if rg -n "@pytest\\.mark\\.smoke" "$ROOT_DIR/tests" >/dev/null 2>&1; then
        backend_pytest_no_cov -m smoke
    else
        print_message "$YELLOW" "No smoke-marked backend tests found; running backend unit suite instead."
        backend_pytest_no_cov tests/unit/ -m unit
    fi

    ensure_frontend_tools
    frontend_vitest
}

# Run critical tests
run_critical_tests() {
    print_message "$GREEN" "Running critical functionality tests..."
    ensure_backend_tools
    check_backend_db
    backend_pytest_no_cov -m critical
}

# Run with coverage
run_with_coverage() {
    print_message "$GREEN" "Running tests with coverage..."
    ensure_backend_tools
    check_backend_db
    backend_pytest --cov=. --cov-report=html --cov-report=term-missing
    print_message "$GREEN" "Coverage report generated in htmlcov/index.html"
}

# Run in watch mode
run_watch_mode() {
    print_message "$GREEN" "Running tests in watch mode..."
    print_message "$YELLOW" "Tests will re-run when files change. Press Ctrl+C to exit."
    ensure_backend_tools
    "$VENV_PTW"
}

# Run specific file
run_specific_file() {
    local file=$1
    if [ -z "$file" ]; then
        print_message "$RED" "Error: No file specified"
        usage
    fi
    if [ ! -e "$file" ]; then
        print_message "$RED" "Error: File not found: $file"
        exit 1
    fi

    print_message "$GREEN" "Running tests in $file..."
    case "$file" in
        client/*)
            ensure_frontend_tools
            local rel_file="${file#client/}"
            frontend_vitest "$rel_file"
            ;;
        *)
            ensure_backend_tools
            check_backend_db
            backend_pytest_no_cov "$file" -v
            ;;
    esac
}

# Main script
main() {
    local command=${1:-all}
    
    # Activate virtual environment
    activate_venv
    
    # Run tests based on command
    case "$command" in
        all)
            run_all_tests
            ;;
        backend)
            run_backend_tests
            ;;
        frontend)
            run_frontend_tests
            ;;
        unit)
            run_unit_tests
            ;;
        integration)
            run_integration_tests
            ;;
        e2e)
            run_e2e_tests
            ;;
        smoke)
            run_smoke_tests
            ;;
        critical)
            run_critical_tests
            ;;
        coverage)
            run_with_coverage
            ;;
        doctor)
            run_doctor
            ;;
        verify)
            run_verify
            ;;
        install-hooks)
            run_install_hooks
            ;;
        db-up)
            run_db_up
            ;;
        db-down)
            run_db_down
            ;;
        db-reset)
            run_db_reset
            ;;
        lint)
            run_lint
            ;;
        fix)
            run_fix
            ;;
        maintain)
            run_frontend_maintainability
            ;;
        watch)
            run_watch_mode
            ;;
        file)
            run_specific_file "$2"
            ;;
        help|--help|-h)
            usage
            ;;
        *)
            print_message "$RED" "Error: Unknown command '$command'"
            usage
            ;;
    esac
    
    # Check exit code
    if [ $? -eq 0 ]; then
        print_message "$GREEN" "✓ Tests completed successfully"
    else
        print_message "$RED" "✗ Tests failed"
        exit 1
    fi
}

# Run main function
main "$@"
