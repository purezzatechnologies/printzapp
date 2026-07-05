FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

COPY package*.json ./

RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

# If public exists
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "dist/server/server.js"]
