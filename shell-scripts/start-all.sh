#!/bin/zsh
# Start both Frontend and Backend with environment selection
# Usage: ./shell-scripts/start-all.sh [development|testing|production]
# Default: development

ENV=${1:-development}

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Get the project root (parent of shell-scripts)
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=================================================="
echo "🚀 Starting Fractal Goals Application"
echo "📦 Environment: $ENV"
echo "📁 Project Root: $PROJECT_ROOT"
echo "=================================================="
echo ""

# Create logs directory if it doesn't exist
mkdir -p "$PROJECT_ROOT/logs"

# Start Flask backend in background
echo "Starting Flask backend..."
cd "$PROJECT_ROOT"
export ENV=$ENV
source "$PROJECT_ROOT/fractal-goals-venv/bin/activate"
python "$PROJECT_ROOT/app.py" > "$PROJECT_ROOT/logs/${ENV}_backend.log" 2>&1 &
BACKEND_PID=$!
echo "✓ Backend started (PID: $BACKEND_PID)"

# Wait a moment for backend to initialize
sleep 2

# Start React frontend in background
echo "Starting React frontend..."
cd "$PROJECT_ROOT/client"
npm run dev -- --mode $ENV > "$PROJECT_ROOT/logs/${ENV}_frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "✓ Frontend started (PID: $FRONTEND_PID)"

echo ""
echo "=================================================="
echo "✅ Application started successfully!"
echo "=================================================="
echo "Backend:  http://localhost:8001"
echo "Frontend: http://localhost:5173"
echo "Logs:     $PROJECT_ROOT/logs/${ENV}_*.log"
echo ""
echo "Backend PID:  $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "To stop both services:"
echo "  kill $BACKEND_PID $FRONTEND_PID"
echo "=================================================="

# Keep script running and wait for both processes
wait $BACKEND_PID $FRONTEND_PID
