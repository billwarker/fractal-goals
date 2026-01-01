# Fractal Goals - Startup Scripts

This directory contains convenient shell scripts to start the different components of the Fractal Goals application.

## Quick Start

### Start All Services (Recommended)

```bash
./start-all.sh
```

This will open three new Terminal tabs and start:
- **Flask Server** on port 8001
- **FastAPI Server** on port 8000  
- **React Frontend** on port 5173

### Start Individual Services

If you prefer to start services separately or in different terminal windows:

**Flask Server:**
```bash
./start-flask.sh
```

**FastAPI Server:**
```bash
./start-fastapi.sh
```

**React Frontend:**
```bash
./start-frontend.sh
```

## Service URLs

Once started, you can access:

- **React Frontend**: http://localhost:5173
- **FastAPI API**: http://localhost:8000/api/
- **Flask API**: http://localhost:8001/api/
- **Flask Health Check**: http://localhost:8001/health

## Current Architecture

The application currently runs with **both** Flask and FastAPI servers:

- **FastAPI (port 8000)**: Legacy server, currently used by the React frontend
- **Flask (port 8001)**: New server with improved architecture and page routing
- **React Frontend (port 5173)**: Development server with Vite

## Stopping Services

To stop any service, press `Ctrl+C` in its terminal tab/window.

## Troubleshooting

### Port Already in Use

If you get a "port already in use" error:

1. Check what's running on the port:
   ```bash
   lsof -i :8000  # or :8001, :5173
   ```

2. Kill the process:
   ```bash
   kill -9 <PID>
   ```

### Virtual Environment Issues

If Flask or FastAPI won't start, ensure the virtual environment is set up:

```bash
python3 -m venv fractal-goals-venv
source fractal-goals-venv/bin/activate
pip install -r requirements.txt  # if you have one
pip install flask flask-cors fastapi uvicorn sqlalchemy
```

### Frontend Issues

If the React frontend won't start:

```bash
cd client
npm install
npm run dev
```

## Development Workflow

1. Start all services: `./start-all.sh`
2. Open browser to http://localhost:5173
3. Make changes to code
4. Frontend auto-reloads (Vite HMR)
5. Backend auto-reloads (Flask/FastAPI debug mode)

## Production Deployment

For production, you'll want to:

1. Build the React frontend:
   ```bash
   cd client
   npm run build
   ```

2. Configure Flask to serve the built files from `client/dist`

3. Use a production WSGI server (gunicorn, waitress) instead of Flask's dev server

4. Choose either Flask or FastAPI (not both)
