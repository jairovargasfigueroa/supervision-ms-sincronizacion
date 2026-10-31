import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Solicitud } from './solicitud.js';

/** Parámetro del controlador con el `X-Request-Id` de la petición (para reenviarlo). */
export const RequestId = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): string | undefined =>
    contexto.switchToHttp().getRequest<Solicitud>().requestId,
);
