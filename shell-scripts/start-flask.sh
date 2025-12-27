#!/bin/zsh
# Start Flask Server with environment selection
# Usage: ./shell-scripts/start-flask.sh [development|testing|production]
# Default: development

ENV=${1:-development}

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Get the project root (parent of shell-scripts)
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🚀 Starting Flask Server in $ENV mode..."
echo "📊 Database: goals_${ENV:0:4}.db"

cd "$PROJECT_ROOT"
export ENV=$ENV
source "$PROJECT_ROOT/fractal-goals-venv/bin/activate"
python "$PROJECT_ROOT/app.py"
