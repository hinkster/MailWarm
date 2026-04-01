FROM node:20-alpine AS base
RUN npm install -g pnpm@9

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
RUN pnpm --filter @mailwarm/database db:generate
RUN pnpm --filter @mailwarm/api build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 mailwarm && adduser --system --uid 1001 mailwarm
COPY --from=builder --chown=mailwarm:mailwarm /app/apps/api/dist ./dist
COPY --from=builder --chown=mailwarm:mailwarm /app/node_modules ./node_modules
COPY --from=builder --chown=mailwarm:mailwarm /app/packages/database/prisma ./prisma
USER mailwarm
EXPOSE 3001
CMD ["node", "dist/server.js"]
