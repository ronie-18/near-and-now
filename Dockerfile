# Near and Now — backend API (Express, npm workspaces monorepo)
# Build:  docker build -t nearandnow-api .
# Run:    docker run -p 3000:3000 --env-file .env nearandnow-api

# ---- build stage ----
FROM node:22-alpine AS build
WORKDIR /app

# Install backend workspace deps using the root lockfile
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
RUN npm ci --workspace=backend

# Compile TypeScript -> backend/dist
COPY backend ./backend
RUN npm run build --workspace=backend

# ---- runtime stage ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

# Production deps only
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
RUN npm ci --workspace=backend --omit=dev && npm cache clean --force

COPY --from=build /app/backend/dist ./backend/dist

USER node
EXPOSE 3000

# server.ts listens whenever VERCEL is unset, binding 0.0.0.0:$PORT (default 3000)
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:${PORT:-3000}/health || exit 1

CMD ["node", "backend/dist/server.js"]
