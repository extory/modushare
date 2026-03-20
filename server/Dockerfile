FROM node:20-alpine AS builder

WORKDIR /app

# Install build tools needed for native modules (better-sqlite3, sharp)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache vips-dev

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

RUN mkdir -p /app/data /app/uploads

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/index.js"]
