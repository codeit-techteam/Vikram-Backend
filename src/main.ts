import dns from 'node:dns';
import {
  RequestMethod,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import compression from 'compression';
import helmet from 'helmet';
import morgan from 'morgan';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { setupSwagger, getSwaggerUrl } from './common/config/swagger.config';
import { isOriginAllowed } from './common/config/cors.util';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ApiResponseInterceptor } from './common/interceptors/api-response.interceptor';

dns.setDefaultResultOrder('ipv4first');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useWebSocketAdapter(new IoAdapter(app));

  const configService = app.get(ConfigService);
  const logger = app.get(Logger);
  app.useLogger(logger);

  const port = configService.get<number>('app.port', 3000);
  const apiPrefix = configService.get<string>('app.apiPrefix', 'api');
  const corsOrigins = configService.get<string[]>('cors.origins', []);
  const isProduction =
    configService.get<string>('app.env') === 'production';
  const swaggerEnabled = configService.get<boolean>('swagger.enabled', true);
  const swaggerPath = configService.get<string>('swagger.path', 'docs');

  // APIs are consumed cross-origin by Hub/Admin/Expo web; Helmet's default
  // CORP "same-origin" makes Chrome report a CORS error on the real XHR.
  app.use(
    helmet({
      contentSecurityPolicy: isProduction ? undefined : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(compression());
  app.use(morgan('combined'));

  // Native apps ignore CORS; Expo web / local tools need flexible origins in development.
  const corsOriginOption = isProduction
    ? corsOrigins
    : (
        origin: string | undefined,
        callback: (err: Error | null, allow?: boolean) => void,
      ) => {
        callback(
          null,
          isOriginAllowed(origin, corsOrigins, {
            isProduction: false,
            allowLocalhostInDev: true,
          }),
        );
      };

  app.enableCors({
    origin: corsOriginOption,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-Requested-With',
      'X-Internal-Api-Key',
    ],
    exposedHeaders: ['Content-Disposition'],
    optionsSuccessStatus: 204,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ApiResponseInterceptor(app.get(Reflector)));

  app.setGlobalPrefix(apiPrefix, {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: '/health', method: RequestMethod.GET },
    ],
  });

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  setupSwagger(app);

  // Bind all interfaces so DigitalOcean readiness probes can reach the process.
  await app.listen(port, '0.0.0.0');

  if (swaggerEnabled) {
    logger.log(`Swagger docs: ${getSwaggerUrl(port, apiPrefix, swaggerPath)}`);
  }

  logger.log(`Application running on port ${port}`);
}

bootstrap();
