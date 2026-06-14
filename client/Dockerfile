# Frontend Dockerfile

# =======================================
# Stage 1: Build Request
# =======================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies (cache optimized)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code
COPY . .

# Build for production
# VITE_API_URL must be available at build time
ARG VITE_API_URL
ARG VITE_LANDING_EXAMPLES_STATIC_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_LANDING_EXAMPLES_STATIC_URL=$VITE_LANDING_EXAMPLES_STATIC_URL
RUN npm run build

# =======================================
# Stage 2: Production Server (Nginx)
# =======================================
FROM nginx:alpine-slim

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# The official nginx entrypoint renders templates in /etc/nginx/templates.
ENV BACKEND_URL=https://fractal-backend-195572181270.us-east1.run.app
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Expose port
EXPOSE 8080

# Start Nginx
# Cloud Run expects the container to listen on $PORT (defaults to 8080)
# Nginx default listens on 80. We need to configure it to listen on 8080 or use env substitution.
# Nginx is configured to listen on 8080 in nginx.conf, matching Cloud Run default.
CMD ["nginx", "-g", "daemon off;"]
