#!/bin/bash

# Test Runner Script for Fractal Goals
# This script runs the test suite with various options

set -e  # Exit on error

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
    echo "  unit          Run only unit tests"
    echo "  integration   Run only integration tests"
    echo "  e2e           Run only end-to-end tests"
    echo "  smoke         Run quick smoke tests"
    echo "  critical      Run critical functionality tests"
    echo "  coverage      Run tests with detailed coverage report"
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
    if [ -d "fractal-goals-venv" ]; then
        print_message "$BLUE" "Activating virtual environment..."
        source fractal-goals-venv/bin/activate
    else
        print_message "$YELLOW" "Warning: Virtual environment not found"
    fi
}

# Install test dependencies
install_deps() {
    print_message "$BLUE" "Checking test dependencies..."
    pip install -q -r requirements-test.txt
}

# Run all tests
run_all_tests() {
    print_message "$GREEN" "Running all tests..."
    pytest
}

# Run unit tests
run_unit_tests() {
    print_message "$GREEN" "Running unit tests..."
    pytest tests/unit/ -m unit
}

# Run integration tests
run_integration_tests() {
    print_message "$GREEN" "Running integration tests..."
    pytest tests/integration/ -m integration
}

# Run e2e tests
run_e2e_tests() {
    print_message "$GREEN" "Running end-to-end tests..."
    pytest tests/e2e/ -m e2e
}

# Run smoke tests
run_smoke_tests() {
    print_message "$GREEN" "Running smoke tests..."
    pytest -m smoke
}

# Run critical tests
run_critical_tests() {
    print_message "$GREEN" "Running critical functionality tests..."
    pytest -m critical
}

# Run with coverage
run_with_coverage() {
    print_message "$GREEN" "Running tests with coverage..."
    pytest --cov=. --cov-report=html --cov-report=term-missing
    print_message "$GREEN" "Coverage report generated in htmlcov/index.html"
}

# Run in watch mode
run_watch_mode() {
    print_message "$GREEN" "Running tests in watch mode..."
    print_message "$YELLOW" "Tests will re-run when files change. Press Ctrl+C to exit."
    pytest-watch
}

# Run specific file
run_specific_file() {
    local file=$1
    if [ -z "$file" ]; then
        print_message "$RED" "Error: No file specified"
        usage
    fi
    print_message "$GREEN" "Running tests in $file..."
    pytest "$file" -v
}

# Main script
main() {
    local command=${1:-all}
    
    # Activate virtual environment
    activate_venv
    
    # Install dependencies
    install_deps
    
    # Run tests based on command
    case "$command" in
        all)
            run_all_tests
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
