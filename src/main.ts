import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('app.port', 3000);
  const apiPrefix = config.get<string>('app.apiPrefix', 'api/v1');
  const frontendUrl = config.get<string>('app.frontendUrl', '*');

  app.use(helmet());
  app.use(compression());

  app.enableCors({
    origin: frontendUrl === '*' ? true : frontendUrl.split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.setGlobalPrefix(apiPrefix);
  app.useWebSocketAdapter(new IoAdapter(app));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swaggerEnabled = config.get<boolean>('app.swagger.enabled', true);
  if (swaggerEnabled) {
    const swaggerPath = config.get<string>('app.swagger.path', 'docs');
    const swaggerConfig = new DocumentBuilder()
      .setTitle(config.get<string>('app.swagger.title', 'Real Estate API'))
      .setDescription(
        config.get<string>('app.swagger.description', '') +
          '\n\n**WebSocket** — Connect to `/ws` with `Authorization: Bearer <token>`\n\nEmit: `join_conversation`, `send_message`, `typing`, `watch_property`\n\nReceive: `new_message`, `property_created`, `property_updated`, `property_deleted`, `price_changed`, `visit_booked`',
      )
      .setVersion(config.get<string>('app.swagger.version', '1.0.0'))
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .addTag('Auth')
      .addTag('Users')
      .addTag('Properties')
      .addTag('Visits')
      .addTag('Chat')
      .addTag('Shortlist')
      .addTag('Saved Searches')
      .addTag('Analytics')
      .addTag('Health')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(swaggerPath, app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
    logger.log(`Swagger: http://127.0.0.1:${port}/${swaggerPath}`);
  }

  app.enableShutdownHooks();
  await app.listen(port, '127.0.0.1');
  logger.log(`App running on http://127.0.0.1:${port}/${apiPrefix}`);
}

bootstrap();
