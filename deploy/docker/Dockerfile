# syntax=docker/dockerfile:1

FROM node:24-alpine AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV EDUCAD_DOCKER_BUILD=true

COPY package.json package-lock.json ./
COPY vendor/occt-wasm-shell/ ./vendor/occt-wasm-shell/
RUN npm ci

COPY . .
ARG EDUCAD_COMMIT
ENV EDUCAD_COMMIT=${EDUCAD_COMMIT}
RUN mkdir -p apps/web/challenges && npm run build

FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV EDUCAD_SHARED_PROJECTS_DIR=/data/projects
ENV EDUCAD_CHALLENGES_DIR=/data/challenges

RUN mkdir -p /data/projects \
  && chown node:node /data/projects

COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=node:node /app/apps/web/challenges /data/challenges

USER node

EXPOSE 3000
VOLUME ["/data/projects"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e 'fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/health`).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))'

CMD ["node", "apps/web/server.js"]
