import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Ajustes de Express que comparten `main.ts` y las pruebas (`test/utilidades/app-prueba.ts`),
 * para que las pruebas vean el mismo comportamiento HTTP que el servicio.
 */
export function configurarApp(app: NestExpressApplication): void {
  app.disable('x-powered-by');
  // El único ETag es el de GET /paquete-datos (`"<versionDatos>"`): sin los débiles que Express
  // calcula solo sobre cualquier respuesta (también sobre los errores).
  app.set('etag', false);
}
