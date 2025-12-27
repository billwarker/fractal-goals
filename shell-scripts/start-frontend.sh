#!/bin/zsh
# Start React Frontend with environment selection
# Usage: ./start-frontend.sh [development|testing|production]
# Default: development

ENV=${1:-development}

echo "🚀 Starting React Frontend in $ENV mode..."
echo "🌐 API URL: $(grep VITE_API_URL client/.env.$ENV | cut -d'=' -f2)"

cd client
npm run dev -- --mode $ENV
