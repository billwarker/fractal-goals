#!/bin/zsh

# Fractal Goals - Start All Services
# This script starts Flask, FastAPI, and React frontend in separate terminal tabs

echo "🚀 Starting Fractal Goals Application..."
echo ""

# Get the project directory
PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Function to open a new terminal tab and run a command
run_in_new_tab() {
    local title=$1
    local command=$2
    
    osascript <<EOF
tell application "Terminal"
    activate
    tell application "System Events" to keystroke "t" using {command down}
    delay 0.5
    do script "cd '$PROJECT_DIR' && echo '=== $title ===' && $command" in front window
end tell
EOF
}

# Start Flask Server (port 8001)
echo "📦 Starting Flask Server (port 8001)..."
run_in_new_tab "Flask Server" "source fractal-goals-venv/bin/activate && python app.py"

# Wait a moment
sleep 1

# Start FastAPI Server (port 8000)
echo "⚡ Starting FastAPI Server (port 8000)..."
run_in_new_tab "FastAPI Server" "source fractal-goals-venv/bin/activate && python server.py"

# Wait a moment
sleep 1

# Start React Frontend (port 5173)
echo "⚛️  Starting React Frontend (port 5173)..."
run_in_new_tab "React Frontend" "cd client && npm run dev"

echo ""
echo "✅ All services starting in separate terminal tabs!"
echo ""
echo "Services:"
echo "  - Flask Server:    http://localhost:8001"
echo "  - FastAPI Server:  http://localhost:8000"
echo "  - React Frontend:  http://localhost:5173"
echo ""
echo "Press Ctrl+C in each tab to stop the respective service."
