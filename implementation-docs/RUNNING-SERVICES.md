# Fractal Goals - Service Commands

## All services are currently running! ✅

Based on your running terminals, all three services are already active:
- ✅ FastAPI Server (running for 29h44m)
- ✅ Flask Server (running for 4m50s)
- ✅ React Frontend (running for 31h30m)

## To Start Services Manually

If you need to restart any service, open a new terminal and run:

### Terminal 1 - Flask Server (port 8001)
```bash
cd /Users/will/Projects/fractal-goals
source fractal-goals-venv/bin/activate
python app.py
```

### Terminal 2 - FastAPI Server (port 8000)
```bash
cd /Users/will/Projects/fractal-goals
source fractal-goals-venv/bin/activate
python server.py
```

### Terminal 3 - React Frontend (port 5173)
```bash
cd /Users/will/Projects/fractal-goals/client
npm run dev
```

## Quick Access URLs

- **React App**: http://localhost:5173
- **FastAPI API**: http://localhost:8000/api/goals
- **Flask API**: http://localhost:8001/api/goals
- **Flask Health**: http://localhost:8001/health

## Using the Individual Scripts

You can also use the individual startup scripts in separate terminal windows:

```bash
# Terminal 1
./start-flask.sh

# Terminal 2  
./start-fastapi.sh

# Terminal 3
./start-frontend.sh
```

## Current Status

All your services are running and accessible! You can:
1. Visit http://localhost:5173 to use the app
2. The app currently uses FastAPI (port 8000)
3. Flask server (port 8001) is ready for testing the new architecture
