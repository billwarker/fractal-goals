#!/bin/zsh
# Start React Frontend with environment selection
# Usage: ./shell-scripts/start-frontend.sh [development|testing|production]
# Default: development

ENV=${1:-development}

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Get the project root (parent of shell-scripts)
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🚀 Starting React Frontend in $ENV mode..."
echo "🌐 API URL: $(grep VITE_API_URL "$PROJECT_ROOT/client/.env.$ENV" | cut -d'=' -f2)"

cd "$PROJECT_ROOT/client"
npm run dev -- --mode $ENV
