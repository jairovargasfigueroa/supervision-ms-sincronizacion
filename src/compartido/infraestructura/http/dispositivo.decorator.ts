import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Solicitud } from './solicitud.js';

/** Parámetro del controlador con el `X-Dispositivo-Id` ya validado por `DispositivoGuard`. */
export const Dispositivo = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): string | undefined =>
    contexto.switchToHttp().getRequest<Solicitud>().idDispositivo,
);
