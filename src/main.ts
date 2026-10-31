import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Registros en JSON en producción y en texto legible en desarrollo (convenciones).
    logger: new ConsoleLogger({ json: process.env.NODE_ENV === 'production' }),
  });
  app.disable('x-powered-by');
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 8084);
}

await bootstrap();
