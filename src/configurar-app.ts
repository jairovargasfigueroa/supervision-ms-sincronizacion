import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';

/** Cuerpo máximo de `POST /lotes` (101): 20 operaciones caben de sobra. */
export const LIMITE_CUERPO = '256kb';

/**
 * Ajustes de Express que comparten `main.ts` y las pruebas (`test/utilidades/app-prueba.ts`),
 * para que las pruebas vean el mismo comportamiento HTTP que el servicio.
 */
export function configurarApp(app: NestExpressApplication): void {
  app.disable('x-powered-by');
  // El único ETag es el de GET /paquete-datos (`"<versionDatos>"`): sin los débiles que Express
  // calcula solo sobre cualquier respuesta (también sobre los errores).
  app.set('etag', false);
  // Respuestas con gzip para gastar menos datos móviles (decisión del equipo, 101), cuando el
  // cliente manda Accept-Encoding: gzip y la respuesta pasa de 1 KB (umbral de compression).
  app.use(compression());
  // Más grande: 413 ARCHIVO_DEMASIADO_GRANDE (problem-details.filter.ts).
  app.useBodyParser('json', { limit: LIMITE_CUERPO });
}
