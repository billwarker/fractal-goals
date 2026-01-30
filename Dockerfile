# Backend Dockerfile
# Base image: Python 3.12 Slim (Lightweight, robust)
FROM python:3.12-slim

# Set environment variables
# PYTHONDONTWRITEBYTECODE: Prevents Python from writing pyc files to disc
# PYTHONUNBUFFERED: Prevents Python from buffering stdout and stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_HOME=/app \
    PORT=8080

# Set work directory
WORKDIR $APP_HOME

# Install system dependencies (needed for compilation of some python packages like psycopg2)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir gunicorn

# Copy application code
COPY . .

# Create a non-root user for security
RUN addgroup --system appgroup && adduser --system --group appuser
USER appuser

# Expose port (Cloud Run sets $PORT, usually 8080)
EXPOSE $PORT

# Start application with Gunicorn
# -w 4: Number of workers (2-4 x num_cores)
# -b: Bind address
# --access-logfile -: Log to stdout
# --error-logfile -: Log to stderr
CMD exec gunicorn --bind :$PORT --workers 4 --threads 8 --timeout 0 app:app
