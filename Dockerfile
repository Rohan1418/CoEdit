# Stage 1: Build React Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Python ASGI Backend & Unified Static Server
FROM python:3.10-slim
WORKDIR /app

# Install Python production dependencies
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend code and built frontend
COPY backend/ ./backend/
COPY --from=frontend-builder /app/dist ./dist

ENV PORT=10000
EXPOSE 10000

CMD ["sh", "-c", "uvicorn backend.main:socket_app --host 0.0.0.0 --port ${PORT:-10000}"]
