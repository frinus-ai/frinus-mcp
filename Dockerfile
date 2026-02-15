FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src/ ./src/
COPY tsconfig.json ./
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY --from=builder /app/dist/ ./dist/
ENV NODE_ENV=production
ENV MEMORY_SERVICE_URL=http://memory:8001
CMD ["node", "dist/index.js"]
