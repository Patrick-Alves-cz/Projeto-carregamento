FROM node:20-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
COPY apps/driver/package.json apps/driver/
COPY apps/charger-simulator/package.json apps/charger-simulator/
COPY packages/database/package.json packages/database/
COPY packages/domain/package.json packages/domain/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY packages/ocpp/package.json packages/ocpp/
COPY packages/charger-provider/package.json packages/charger-provider/
COPY packages/payment-provider/package.json packages/payment-provider/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
ENV ADMIN_STANDALONE=1
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm db:generate
RUN pnpm --filter @evcharge/admin... build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build /app/apps/admin/.next/standalone ./
COPY --from=build /app/apps/admin/.next/static ./apps/admin/.next/static
EXPOSE 3000
CMD ["node", "apps/admin/server.js"]
