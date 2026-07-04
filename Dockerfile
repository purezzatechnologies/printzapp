# =========================
# Builder Stage
# =========================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source
COPY . .

# Build app
RUN npm run build

# =========================
# Runtime Stage
# =========================
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy build output
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/server/server.js"]