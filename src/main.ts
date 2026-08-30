import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger, RequestMethod } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';
import * as express from 'express';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';

/**
 * Optional error reporting. Sentry is wired in only when SENTRY_DSN is set AND
 * `@sentry/node` is installed — the dynamic import uses a variable specifier so
 * the package stays an optional peer, not a hard dependency. Correlation IDs are
 * already attached to every log line by the request-context middleware, so an
 * unconfigured deployment still has traceable errors; this just adds Sentry on
 * top when a team wants it.
 */
async function initSentry(dsn: string | undefined): Promise<void> {
  if (!dsn) return;
  try {
    const specifier = '@sentry/node';
    const Sentry = (await import(specifier)) as { init?: (o: Record<string, unknown>) => void };
    Sentry.init?.({
      dsn,
      environment: process.env['NODE_ENV'] ?? 'development',
      tracesSampleRate: 0,
    });
    new Logger('Sentry').log('Sentry error reporting enabled');
  } catch {
    new Logger('Sentry').warn(
      'SENTRY_DSN is set but @sentry/node is not installed — skipping Sentry init.',
    );
  }
}

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  await initSentry(process.env['SENTRY_DSN']);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  // Capture raw body for webhook signature verification.
  app.use(
    express.json({
      verify: (req: express.Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = Buffer.from(buf);
      },
      limit: '2mb',
    }),
  );
  app.use(express.urlencoded({ extended: true }));
  app.useLogger(app.get(PinoLogger));

  app.set('trust proxy', 1);
  app.use(helmet());
  app.enableCors({
    origin:
      env.CORS_ORIGINS === '*'
        ? true
        : env.CORS_ORIGINS.split(',')
            .map((s) => s.trim())
            .filter(Boolean),
    credentials: true,
  });
  app.setGlobalPrefix(env.API_PREFIX, {
    exclude: [
      { path: 'health', method: RequestMethod.ALL },
      { path: 'health/live', method: RequestMethod.ALL },
      { path: 'health/ready', method: RequestMethod.ALL },
      // Prometheus scrape target lives at the root /metrics, not under the API.
      { path: 'metrics', method: RequestMethod.ALL },
      // Owner-app surface is mounted at its literal /api/v1/owner/* paths and
      // must NOT receive the admin global prefix.
      { path: 'api/v1/owner/(.*)', method: RequestMethod.ALL },
      // Same for the unified staff app at its literal /api/v1/staff/* paths.
      { path: 'api/v1/staff/(.*)', method: RequestMethod.ALL },
    ],
  });

  const config = new DocumentBuilder()
    .setTitle('Tavelo API')
    .setDescription(
      'The Tavelo platform API — the admin super-console plus the owner ' +
        '(`/api/v1/owner/*`) and staff (`/api/v1/staff/*`) app surfaces. All ' +
        'responses use the `{success,data,meta}` / `{success:false,error}` envelope.',
    )
    .setVersion(process.env['npm_package_version'] ?? '1.0.0')
    .addBearerAuth()
    .addServer(env.API_PREFIX, 'Admin console (this prefix)')
    .addServer('/api/v1/owner', 'Owner app')
    .addServer('/api/v1/staff', 'Staff app')
    .addTag('Auth')
    .addTag('Admins')
    .addTag('Roles')
    .addTag('Permissions')
    .addTag('Audit')
    .addTag('Billing')
    .addTag('Subscriptions')
    .addTag('Owner Auth')
    .addTag('Staff Auth')
    .addTag('Notifications')
    .addTag('Health')
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  // Serve the raw OpenAPI JSON too, for client generation / versioning.
  SwaggerModule.setup('api/docs', app, doc, { jsonDocumentUrl: 'api/docs-json' });

  await app.listen(env.PORT, '0.0.0.0');
  const logger = new Logger('Bootstrap');
  logger.log(`Tavelo Super Admin API listening on 0.0.0.0:${env.PORT}${env.API_PREFIX}`);
  logger.log(`Swagger docs at http://0.0.0.0:${env.PORT}/api/docs`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error', err);
  process.exit(1);
});
