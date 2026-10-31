import type { Request } from 'express';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';

/**
 * Petición HTTP con lo que agregan el middleware de `X-Request-Id`, el guardia del token y el
 * del dispositivo.
 */
export type Solicitud = Request & {
  requestId?: string;
  usuario?: UsuarioAutenticado;
  /** `X-Dispositivo-Id` ya validado (UUID del celular). */
  idDispositivo?: string;
};
