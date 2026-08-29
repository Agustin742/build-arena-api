import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';

export const REFERENCE_PATH = '/reference';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Build Arena API')
    .setDescription(
      'Turn-based build duels resolved server-side. Register, log in, and send the access token as a bearer credential.',
    )
    .setVersion(process.env.APP_VERSION ?? 'dev')
    .addBearerAuth()
    .build();

  return SwaggerModule.createDocument(app, config);
}
