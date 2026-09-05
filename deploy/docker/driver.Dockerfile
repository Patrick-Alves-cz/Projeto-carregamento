FROM node:20-bookworm-slim
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile
ENV EXPO_NO_TELEMETRY=1
EXPOSE 8081
WORKDIR /app/apps/driver
CMD ["pnpm", "exec", "expo", "start", "--web", "--host", "lan", "--port", "8081", "--non-interactive"]
