# ===============================
# Build Stage
# ===============================
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./

# If using npm
RUN npm install

# Copy project
COPY . .

# Build application
RUN npm run build

# ===============================
# Production Stage
# ===============================
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy built application
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
