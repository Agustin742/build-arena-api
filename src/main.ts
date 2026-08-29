import { NestFactory } from '@nestjs/core';
import { apiReference } from '@scalar/nestjs-api-reference';

import { AppModule } from './app.module';
import { buildOpenApiDocument, REFERENCE_PATH } from './openapi';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(REFERENCE_PATH, apiReference({ content: buildOpenApiDocument(app) }));

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}

void bootstrap();
