import { NestFactory } from '@nestjs/core';
import { apiReference } from '@scalar/nestjs-api-reference';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { listEnv } from './common/env';
import { buildOpenApiDocument, REFERENCE_PATH } from './openapi';

const SCALAR_CDN = 'https://cdn.jsdelivr.net';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());

  const allowedOrigins = listEnv('CORS_ORIGIN');

  if (allowedOrigins.length > 0) {
    app.enableCors({ origin: allowedOrigins, credentials: true });
  }

  app.use(
    REFERENCE_PATH,
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", SCALAR_CDN],
          styleSrc: ["'self'", "'unsafe-inline'", SCALAR_CDN],
          fontSrc: ["'self'", SCALAR_CDN, 'data:'],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", SCALAR_CDN],
        },
      },
    }),
    apiReference({ content: buildOpenApiDocument(app) }),
  );

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}

void bootstrap();
