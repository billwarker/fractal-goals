#!/bin/zsh
# Kill all Fractal Goals services
# Usage: ./shell-scripts/kill-all.sh

echo "🛑 Stopping all Fractal Goals services..."

# Kill processes on port 5173 (frontend)
FRONTEND_PIDS=$(lsof -ti:5173 2>/dev/null)
if [ -n "$FRONTEND_PIDS" ]; then
    echo "  Killing frontend on port 5173 (PIDs: $FRONTEND_PIDS)"
    kill -9 $FRONTEND_PIDS 2>/dev/null
fi

# Kill processes on port 5174 (frontend fallback)
FRONTEND_ALT_PIDS=$(lsof -ti:5174 2>/dev/null)
if [ -n "$FRONTEND_ALT_PIDS" ]; then
    echo "  Killing frontend on port 5174 (PIDs: $FRONTEND_ALT_PIDS)"
    kill -9 $FRONTEND_ALT_PIDS 2>/dev/null
fi

# Kill processes on port 8001 (backend)
BACKEND_PIDS=$(lsof -ti:8001 2>/dev/null)
if [ -n "$BACKEND_PIDS" ]; then
    echo "  Killing backend on port 8001 (PIDs: $BACKEND_PIDS)"
    kill -9 $BACKEND_PIDS 2>/dev/null
fi

echo "✅ All services stopped"
echo ""
echo "To restart:"
echo "  ./shell-scripts/start-all.sh development"
