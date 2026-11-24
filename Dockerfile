# EngClass LMS — production image (Next.js 15 + Prisma + PostgreSQL)
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable && corepack prepare pnpm@10.34.9 --activate
WORKDIR /app

FROM base AS build
# postinstall copies pdf.js worker + MediaPipe assets, so scripts/ must exist before install
COPY package.json pnpm-lock.yaml ./
COPY scripts ./scripts
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile
COPY . .
# NEXT_PUBLIC_* values are inlined at build time
ARG NEXT_PUBLIC_APP_NAME=EngClass
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS=false
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=
ARG NEXT_PUBLIC_GOOGLE_PICKER_API_KEY=
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS=$NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS \
    NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID \
    NEXT_PUBLIC_GOOGLE_PICKER_API_KEY=$NEXT_PUBLIC_GOOGLE_PICKER_API_KEY
RUN pnpm prisma generate && pnpm build

FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 LOCAL_UPLOAD_DIR=/app/uploads
# Keep the full node_modules (incl. prisma CLI and tsx) so migrations and `pnpm db:seed` can run in the container
COPY --from=build /app /app
# source copied from the host may be owner-only (strict umask); the runtime user must read it
RUN chmod -R a+rX /app/prisma /app/public /app/scripts /app/package.json \
  && mkdir -p /app/uploads && chown -R node:node /app/uploads /app/.next
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/login >/dev/null || exit 1
# Call binaries directly: the non-root user has no corepack/pnpm cache at runtime
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node_modules/.bin/next start -H 0.0.0.0 -p 3000"]
