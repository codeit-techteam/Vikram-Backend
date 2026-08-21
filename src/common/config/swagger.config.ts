import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../constants/swagger.constants';

export function setupSwagger(app: INestApplication): void {
  const configService = app.get(ConfigService);
  const isEnabled = configService.get<boolean>('swagger.enabled', true);

  if (!isEnabled) {
    return;
  }

  const appName = configService.get<string>('app.name', 'Bajriwala ERP API');
  const port = configService.get<number>('app.port', 3000);
  const swaggerPath = configService.get<string>('swagger.path', 'docs');

  const config = new DocumentBuilder()
    .setTitle(appName)
    .setDescription(
      'Bajriwala ERP Marketplace API — shared backend for Customer App, Hub Panel, and Admin Panel.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT access token',
        in: 'header',
      },
      SWAGGER_BEARER_AUTH,
    )
    // Host only — paths already include /api/v1 via useGlobalPrefix + URI versioning
    .addServer(`http://localhost:${port}`, 'Local Development')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (_controllerKey: string, methodKey: string) =>
      methodKey,
  });

  SwaggerModule.setup(swaggerPath, app, document, {
    useGlobalPrefix: true,
    jsonDocumentUrl: 'docs-json',
    customSiteTitle: `${appName} — API Docs`,
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      showRequestDuration: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });
}

export function getSwaggerUrl(
  port: number,
  apiPrefix: string,
  swaggerPath: string,
): string {
  return `http://localhost:${port}/${apiPrefix}/${swaggerPath}`;
}
