import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ES_PUBLICO } from '../auth/publico.decorator.js';
import type { Solicitud } from './solicitud.js';

export const ENCABEZADO_DISPOSITIVO = 'X-Dispositivo-Id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Guardia global que va después de `JwtGuard` y `RolesGuard`: toda ruta que no es `@Publico()`
 * exige `X-Dispositivo-Id` con el UUID del celular. Si falta o no es UUID responde
 * `400 DISPOSITIVO_REQUERIDO`. Deja el valor en `solicitud.idDispositivo`.
 */
@Injectable()
export class DispositivoGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const esPublico = this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (esPublico) return true;

    const solicitud = contexto.switchToHttp().getRequest<Solicitud>();
    const valor = solicitud.header(ENCABEZADO_DISPOSITIVO)?.trim();
    if (!valor || !UUID.test(valor)) {
      throw new BadRequestException({
        codigo: 'DISPOSITIVO_REQUERIDO',
        detail: `Falta el encabezado ${ENCABEZADO_DISPOSITIVO} con el identificador del celular.`,
      });
    }
    solicitud.idDispositivo = valor.toLowerCase();
    return true;
  }
}
