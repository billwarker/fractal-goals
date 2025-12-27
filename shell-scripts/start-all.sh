#!/bin/zsh
# Start both Frontend and Backend with environment selection
# Usage: ./start-all.sh [development|testing|production]
# Default: development

ENV=${1:-development}

echo "=================================================="
echo "🚀 Starting Fractal Goals Application"
echo "📦 Environment: $ENV"
echo "=================================================="
echo ""

# Create logs directory if it doesn't exist
mkdir -p logs

# Start Flask backend in background
echo "Starting Flask backend..."
export ENV=$ENV
source fractal-goals-venv/bin/activate
python app.py > logs/${ENV}_backend.log 2>&1 &
BACKEND_PID=$!
echo "✓ Backend started (PID: $BACKEND_PID)"

# Wait a moment for backend to initialize
sleep 2

# Start React frontend in background
echo "Starting React frontend..."
cd client
npm run dev -- --mode $ENV > ../logs/${ENV}_frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..
echo "✓ Frontend started (PID: $FRONTEND_PID)"

echo ""
echo "=================================================="
echo "✅ Application started successfully!"
echo "=================================================="
echo "Backend:  http://localhost:8001"
echo "Frontend: http://localhost:5173"
echo "Logs:     logs/${ENV}_*.log"
echo ""
echo "Backend PID:  $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "To stop both services:"
echo "  kill $BACKEND_PID $FRONTEND_PID"
echo "=================================================="

# Keep script running and wait for both processes
wait $BACKEND_PID $FRONTEND_PID
