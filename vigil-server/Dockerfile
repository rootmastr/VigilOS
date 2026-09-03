# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including dev for prisma CLI)
RUN npm install

# Generate Prisma client
RUN npx prisma@6.9.0 generate

# Production stage
FROM node:20-alpine

RUN apk add --no-cache dumb-init curl

RUN addgroup -g 1001 -S vigil && \
    adduser -S vigil -u 1001 -G vigil

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy Prisma client + CLI from builder (needed for db:migrate:prod)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY prisma ./prisma
COPY src ./src

RUN chown -R vigil:vigil /app

USER vigil

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "npx prisma@6.9.0 migrate deploy && node src/server.js"]
