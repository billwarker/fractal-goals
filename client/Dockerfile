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
RUN npm run build

# =======================================
# Stage 2: Production Server (Nginx)
# =======================================
FROM nginx:alpine-slim

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration (optional, using default for now but robust apps need it)
# We will create a simple nginx.conf to support client-side routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 8080

# Start Nginx
# Cloud Run expects the container to listen on $PORT (defaults to 8080)
# Nginx default listens on 80. We need to configure it to listen on 8080 or use env substitution.
# Using 'sed' to update the port in default conf at runtime is a common Cloud Run pattern for Nginx.
CMD sh -c "envsubst '\$PORT' < /etc/nginx/conf.d/default.conf > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"
