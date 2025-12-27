#!/bin/zsh
# Kill all Fractal Goals services
# Usage: ./shell-scripts/kill-all.sh

echo "🛑 Stopping all Fractal Goals services..."

# Function to kill processes on a port
kill_port() {
    local port=$1
    local pids=$(lsof -ti:$port 2>/dev/null)
    
    if [ -n "$pids" ]; then
        echo "  Killing processes on port $port..."
        # Convert newlines to spaces and kill each PID
        echo "$pids" | while read pid; do
            if [ -n "$pid" ]; then
                kill -9 $pid 2>/dev/null && echo "    ✓ Killed PID $pid" || echo "    ✗ Failed to kill PID $pid"
            fi
        done
    fi
}

# Kill processes on port 5173 (frontend)
kill_port 5173

# Kill processes on port 5174 (frontend fallback)
kill_port 5174

# Kill processes on port 8001 (backend)
kill_port 8001

# Wait a moment for processes to die
sleep 1

# Verify all ports are free
echo ""
echo "Verification:"
lsof -ti:5173 >/dev/null 2>&1 && echo "  ⚠️  Port 5173 still in use!" || echo "  ✓ Port 5173 is free"
lsof -ti:5174 >/dev/null 2>&1 && echo "  ⚠️  Port 5174 still in use!" || echo "  ✓ Port 5174 is free"
lsof -ti:8001 >/dev/null 2>&1 && echo "  ⚠️  Port 8001 still in use!" || echo "  ✓ Port 8001 is free"

echo ""
echo "✅ All services stopped"
echo ""
echo "To restart:"
echo "  ./shell-scripts/start-all.sh development"
