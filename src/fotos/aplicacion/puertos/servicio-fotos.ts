import type { RespuestaDuenio } from '../../../compartido/dominio/respuesta-duenio.js';

export const SERVICIO_FOTOS = Symbol('SERVICIO_FOTOS');

/** Token del usuario y `X-Request-Id` que se reenvían a Obras. */
export interface ContextoFotos {
  token: string;
  requestId: string;
}

/** Obras, dueño de las fotos de avance (005). */
export interface ServicioFotos {
  /** `POST /obras/{obraId}/fotos/url-subida` con `{ fotoId }`. */
  pedirUrlSubida(
    obraId: string,
    fotoId: string,
    contexto: ContextoFotos,
  ): Promise<RespuestaDuenio>;
}
