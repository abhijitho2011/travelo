# syntax=docker/dockerfile:1.7
# --- Build the Flutter web app ---
FROM ghcr.io/cirruslabs/flutter:3.44.7 AS build
WORKDIR /app

# API base URL is baked into the web bundle at build time. Overridable via the
# Railway build arg API_BASE_URL — never a localhost address.
ARG API_BASE_URL=https://travelo-admin-api-production.up.railway.app/api/v1

COPY pubspec.yaml pubspec.lock ./
RUN flutter pub get
COPY . .
RUN flutter build web --release --no-wasm-dry-run \
    --dart-define=API_BASE_URL=${API_BASE_URL}

# --- Serve with nginx on $PORT ---
FROM nginx:1.27-alpine AS runtime
RUN apk add --no-cache gettext
COPY --from=build /app/build/web /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# nginx:alpine's entrypoint runs envsubst over /etc/nginx/templates/*.template
# into /etc/nginx/conf.d, so ${PORT} is substituted at container start.
ENV PORT=8080
EXPOSE 8080
