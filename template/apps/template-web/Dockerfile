# syntax=docker/dockerfile:1.29

FROM node:26.13.1-alpine3.24 AS build
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo
COPY package.json ./
RUN npm install --global --no-fund --no-audit --no-update-notifier "$(node -p "require('./package.json').packageManager.split('+')[0]")"
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --ignore-scripts \
    && pnpm --filter "template-web^..." --if-present run build \
    && pnpm --filter template-web deploy /build \
    && (cd /build && node --run build) \
    && rm -rf /build/.next/cache \
    && pnpm --filter template-web deploy --prod /out

FROM node:26.13.1-alpine3.24
RUN apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 NEXT_OTEL_FETCH_DISABLED=1
WORKDIR /app
COPY --from=build /out/package.json /out/next.config.ts ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /build/.next ./.next
USER node
EXPOSE 3000
CMD ["node", "--import", "@zigordev/otel/register", "node_modules/next/dist/bin/next", "start"]
