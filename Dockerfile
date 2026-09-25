# Backend Dockerfile
# Two stages: dependencies are compiled into wheels with the build toolchain,
# and the runtime image installs only those wheels, so no compiler ships.

# =======================================
# Stage 1: Build wheels
# =======================================
FROM python:3.12-slim AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt

# =======================================
# Stage 2: Runtime
# =======================================
FROM python:3.12-slim

# PYTHONDONTWRITEBYTECODE: Prevents Python from writing pyc files to disc
# PYTHONUNBUFFERED: Prevents Python from buffering stdout and stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    APP_HOME=/app \
    PORT=8080 \
    WEB_CONCURRENCY=2 \
    GUNICORN_THREADS=4 \
    GUNICORN_TIMEOUT=210

WORKDIR $APP_HOME

# Install only the prebuilt wheels; --no-index guarantees nothing is fetched or compiled here.
COPY requirements.txt .
COPY --from=builder /wheels /wheels
RUN pip install --no-cache-dir --no-index --find-links=/wheels -r requirements.txt \
    && rm -rf /wheels

# Copy application code
COPY . .

# Create a non-root user for security
RUN addgroup --system appgroup && adduser --system --group appuser
USER appuser

# Expose port (Cloud Run sets $PORT, usually 8080)
EXPOSE $PORT

# Start application with Gunicorn. The access log records the forwarded chain
# so the trusted proxy hop count (TRUSTED_PROXY_HOPS) can be verified.
CMD exec gunicorn --bind :$PORT --workers $WEB_CONCURRENCY --threads $GUNICORN_THREADS --timeout $GUNICORN_TIMEOUT \
    --access-logfile - --error-logfile - \
    --access-logformat '%(h)s xff="%({x-forwarded-for}i)s" %(t)s "%(r)s" %(s)s %(b)s %(M)sms' \
    app:app
