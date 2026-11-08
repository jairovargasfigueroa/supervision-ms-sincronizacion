import {
  esProblema,
  problema,
  type Problema,
} from '../../compartido/dominio/problema.js';
import type { RespuestaDuenio } from '../../compartido/dominio/respuesta-duenio.js';

export type RespuestaUrlSubida =
  /** Respuesta de Obras tal cual (`{ url, claveArchivo, expiraEn }`). */
  | { exito: true; status: number; cuerpo: unknown }
  | { exito: false; problema: Problema };

/**
 * Qué devuelve `POST /fotos/url-subida` según la respuesta de Obras (102):
 * - `2xx` → la misma respuesta;
 * - `4xx` (`400`, `403`, `404`, `422` y los demás) → mismo `status` y `codigo`;
 * - `5xx`, otra respuesta o error de red → `503 SERVICIO_NO_DISPONIBLE`;
 * - tiempo agotado → `504 TIEMPO_AGOTADO`.
 */
export function traducirRespuestaUrlSubida(
  respuesta: RespuestaDuenio,
): RespuestaUrlSubida {
  if (respuesta.tipo === 'TIEMPO_AGOTADO') {
    return {
      exito: false,
      problema: problema(
        504,
        'TIEMPO_AGOTADO',
        'El servicio de Obras tardó demasiado en responder.',
      ),
    };
  }
  if (respuesta.tipo === 'RESPUESTA') {
    const { status, cuerpo } = respuesta;
    if (status >= 200 && status < 300) {
      return { exito: true, status, cuerpo };
    }
    if (status >= 400 && status < 500) {
      return {
        exito: false,
        problema: esProblema(cuerpo) ? { ...cuerpo, status } : problema(status),
      };
    }
  }
  return {
    exito: false,
    problema: problema(
      503,
      'SERVICIO_NO_DISPONIBLE',
      'El servicio de Obras no está disponible.',
    ),
  };
}
