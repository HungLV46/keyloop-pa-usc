import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

/**
 * Application entry point.
 * Configures global validation, exception filter, CORS, Swagger UI,
 * and starts the HTTP server on the port defined by the PORT env variable.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Appointment Service')
    .setDescription(
      'Dealership service appointment booking API.\n\n' +
        '**Auth stub**: pass `x-customer-id` and `x-tenant-id` headers directly.\n' +
        'In production these are injected from the validated Cognito JWT by API Gateway.',
    )
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'x-customer-id' }, 'customerId')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'x-tenant-id' }, 'tenantId')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Appointment Service listening on port ${port}`);
  console.log(`Swagger UI available at http://localhost:${port}/docs`);
}

bootstrap();
