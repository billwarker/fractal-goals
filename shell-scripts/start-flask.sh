#!/bin/zsh
# Start Flask Server with environment selection
# Usage: ./start-flask.sh [development|testing|production]
# Default: development

ENV=${1:-development}

echo "🚀 Starting Flask Server in $ENV mode..."
echo "📊 Database: goals_${ENV:0:4}.db"

export ENV=$ENV
source fractal-goals-venv/bin/activate
python app.py
