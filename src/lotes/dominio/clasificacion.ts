import {
  esProblema,
  problema,
  type Problema,
} from '../../compartido/dominio/problema.js';
import type { RespuestaDuenio } from '../../compartido/dominio/respuesta-duenio.js';

/** Resultado de una operación para la app (101). */
export type EstadoResultado = 'PROCESADO' | 'ERROR' | 'REINTENTAR';

export type { RespuestaDuenio } from '../../compartido/dominio/respuesta-duenio.js';

export type Clasificacion =
  /** El dueño lo aceptó (`2xx`): se guarda `PROCESADO` con su respuesta. */
  | { estado: 'PROCESADO'; status: number; respuesta: unknown }
  /** Rechazo definitivo de las reglas del dueño: se guarda `ERROR` y no se reintenta. */
  | { estado: 'ERROR'; status: number; respuesta: Problema }
  /** No se pudo completar: se borra lo guardado y la app lo vuelve a enviar. */
  | { estado: 'REINTENTAR'; status: number; respuesta: Problema };

/** Rechazos definitivos que lista el diseño (101, «Procesamiento de cada operación», paso 4). */
const RECHAZOS_DEFINITIVOS = new Set([400, 403, 404, 409, 422]);
/** Estados que se reintentan además de los `5xx`. */
const REINTENTABLES = new Set([401, 408, 429]);

/**
 * Clasifica la respuesta del servicio dueño (101):
 * - `2xx` → `PROCESADO`;
 * - `400`, `403`, `404`, `409`, `422` → `ERROR` con el Problem Details del dueño;
 * - `401` (`TOKEN_VENCIDO`, para que la app renueve el token), `408`, `429`, `5xx` → `REINTENTAR`
 *   con el estado recibido; tiempo agotado → `REINTENTAR` `504 TIEMPO_AGOTADO`; error de red →
 *   `REINTENTAR` `503 SERVICIO_NO_DISPONIBLE`.
 *
 * Estados que el diseño no lista (decisión de implementación, `docs/contratos.md`): otro `4xx` es
 * `ERROR` (el dueño rechazó la petición tal como está) y un `1xx` o `3xx` es `REINTENTAR` `503`.
 */
export function clasificarRespuesta(respuesta: RespuestaDuenio): Clasificacion {
  if (respuesta.tipo === 'TIEMPO_AGOTADO') {
    return {
      estado: 'REINTENTAR',
      status: 504,
      respuesta: problema(
        504,
        'TIEMPO_AGOTADO',
        'El servicio dueño no respondió a tiempo.',
      ),
    };
  }
  if (respuesta.tipo === 'ERROR_RED') {
    return {
      estado: 'REINTENTAR',
      status: 503,
      respuesta: problema(
        503,
        'SERVICIO_NO_DISPONIBLE',
        'No se pudo conectar con el servicio dueño.',
      ),
    };
  }

  const { status, cuerpo } = respuesta;
  if (status >= 200 && status < 300) {
    return { estado: 'PROCESADO', status, respuesta: cuerpo };
  }
  if (status === 401) {
    // La app renueva el token antes del siguiente lote (no se muestra al usuario).
    return {
      estado: 'REINTENTAR',
      status,
      respuesta: problema(
        401,
        'TOKEN_VENCIDO',
        'El servicio dueño rechazó el token.',
      ),
    };
  }
  if (REINTENTABLES.has(status) || status >= 500) {
    return {
      estado: 'REINTENTAR',
      status,
      respuesta: esProblema(cuerpo) ? cuerpo : problema(status),
    };
  }
  if (RECHAZOS_DEFINITIVOS.has(status) || (status >= 400 && status < 500)) {
    return {
      estado: 'ERROR',
      status,
      respuesta: esProblema(cuerpo) ? cuerpo : problema(status),
    };
  }
  // 1xx o 3xx: respuesta que no se esperaba de un servicio dueño.
  return {
    estado: 'REINTENTAR',
    status: 503,
    respuesta: problema(
      503,
      'SERVICIO_NO_DISPONIBLE',
      `El servicio dueño respondió ${status}.`,
    ),
  };
}
