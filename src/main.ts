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

async function bootstrap(): Promise<void> {
  const env = loadEnv();
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
      // Owner-app surface is mounted at its literal /api/v1/owner/* paths and
      // must NOT receive the admin global prefix.
      { path: 'api/v1/owner/(.*)', method: RequestMethod.ALL },
      // Same for the unified staff app at its literal /api/v1/staff/* paths.
      { path: 'api/v1/staff/(.*)', method: RequestMethod.ALL },
    ],
  });

  const config = new DocumentBuilder()
    .setTitle('Tavelo Super Admin API')
    .setDescription('Phase 1 — auth, admins, roles, permissions, audit')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addTag('Auth')
    .addTag('Admins')
    .addTag('Roles')
    .addTag('Permissions')
    .addTag('Audit')
    .addTag('Health')
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, doc);

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
