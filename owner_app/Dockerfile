# syntax=docker/dockerfile:1.7
# --- Build the Flutter web app ---
FROM ghcr.io/cirruslabs/flutter:stable AS build
WORKDIR /app

# API base URL is baked into the web bundle at build time. Overridable via the
# Railway build arg API_BASE_URL — never a localhost address.
ARG API_BASE_URL=https://travelo-admin-api-production.up.railway.app/api/v1

# Firebase web config (public by design). Supplied as Railway service variables,
# which Railway forwards to the build as args; defaults keep local builds working.
ARG FIREBASE_API_KEY=AIzaSyDTyOc2-jyPMirqGEzm_IKdsD05bYPY2N4
ARG FIREBASE_AUTH_DOMAIN=tavelo-c4669.firebaseapp.com
ARG FIREBASE_PROJECT_ID=tavelo-c4669
ARG FIREBASE_STORAGE_BUCKET=tavelo-c4669.firebasestorage.app
ARG FIREBASE_MESSAGING_SENDER_ID=754494069859
ARG FIREBASE_APP_ID=1:754494069859:web:66edfe94fdba8e6e762c56
ARG FIREBASE_MEASUREMENT_ID=G-B925V8XDZJ

COPY pubspec.yaml pubspec.lock ./
RUN flutter pub get
COPY . .
RUN flutter build web --release --no-wasm-dry-run \
    --dart-define=API_BASE_URL=${API_BASE_URL} \
    --dart-define=FIREBASE_API_KEY=${FIREBASE_API_KEY} \
    --dart-define=FIREBASE_AUTH_DOMAIN=${FIREBASE_AUTH_DOMAIN} \
    --dart-define=FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID} \
    --dart-define=FIREBASE_STORAGE_BUCKET=${FIREBASE_STORAGE_BUCKET} \
    --dart-define=FIREBASE_MESSAGING_SENDER_ID=${FIREBASE_MESSAGING_SENDER_ID} \
    --dart-define=FIREBASE_APP_ID=${FIREBASE_APP_ID} \
    --dart-define=FIREBASE_MEASUREMENT_ID=${FIREBASE_MEASUREMENT_ID}

# --- Serve with nginx on $PORT ---
FROM nginx:1.27-alpine AS runtime
RUN apk add --no-cache gettext
COPY --from=build /app/build/web /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# nginx:alpine's entrypoint runs envsubst over /etc/nginx/templates/*.template
# into /etc/nginx/conf.d, so ${PORT} is substituted at container start.
ENV PORT=8080
EXPOSE 8080
