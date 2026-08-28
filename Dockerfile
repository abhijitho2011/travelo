# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++ libc6-compat
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

FROM node:20-alpine AS build
WORKDIR /app
ENV NITRO_PRESET=node-server
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# VITE_API_URL is baked into the client bundle at build time.
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/.output ./.output
COPY --from=build /app/package.json ./package.json
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD wget -qO- http://0.0.0.0:${PORT:-3000}/ || exit 1
CMD ["node", ".output/server/index.mjs"]
