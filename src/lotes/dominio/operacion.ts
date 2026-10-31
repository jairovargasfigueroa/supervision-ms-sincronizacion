import type { EstadoResultado } from './clasificacion.js';
import { problema, type Problema } from './problema.js';
import type { OperacionRecibida, ServicioDestino } from './tipo-operacion.js';

/** Estado guardado en `operacion_procesada` (`docs/datos.md`). */
export type EstadoGuardado = 'PROCESANDO' | 'PROCESADO' | 'ERROR';

/** Respuesta del servicio dueño que se guarda y se devuelve si la operación se repite. */
export interface RespuestaGuardada {
  status: number;
  cuerpo: unknown;
}

/** Elemento de `operacion_procesada`. Fechas en ISO 8601 UTC; `expiraEn` en segundos *epoch*. */
export interface OperacionProcesada {
  idOperacion: string;
  idDispositivo: string;
  usuarioId: string;
  tipo: string;
  servicioDestino: ServicioDestino;
  estado: EstadoGuardado;
  /** Ausente mientras está `PROCESANDO`. */
  respuesta?: RespuestaGuardada;
  recibidaEn: string;
  actualizadaEn: string;
  expiraEn: number;
}

/** Resultado de una operación del lote, en el mismo orden en que llegó (101). */
export interface ResultadoOperacion {
  idOperacion: string;
  estado: EstadoResultado;
  /** `true` cuando sale de lo guardado y no se llamó al servicio dueño. */
  repetida: boolean;
  status: number;
  respuesta: unknown;
}

/** El servidor recuerda cada operación 30 días (101, criterio 19). */
export const DIAS_RETENCION = 30;
/** Un `PROCESANDO` sin cambios por más de 60 s quedó abandonado (un proceso anterior se cortó). */
export const SEGUNDOS_ABANDONO = 60;

/** `expira_en` = `recibida_en` + 30 días, en segundos *epoch* (TTL de DynamoDB). */
export function calcularExpiraEn(recibidaEn: Date): number {
  return Math.floor(recibidaEn.getTime() / 1000) + DIAS_RETENCION * 24 * 3600;
}

/** Elemento nuevo en `PROCESANDO` para el paso 1 («guardar solo si no existe»). */
export function nuevaOperacion(
  operacion: OperacionRecibida,
  servicioDestino: ServicioDestino,
  usuarioId: string,
  idDispositivo: string,
  ahora: Date,
): OperacionProcesada {
  const iso = ahora.toISOString();
  return {
    idOperacion: operacion.idOperacion,
    idDispositivo,
    usuarioId,
    tipo: operacion.tipo,
    servicioDestino,
    estado: 'PROCESANDO',
    recibidaEn: iso,
    actualizadaEn: iso,
    expiraEn: calcularExpiraEn(ahora),
  };
}

/** Qué hacer cuando la operación ya estaba guardada (paso 2). */
export type DecisionExistente =
  | { accion: 'AJENA' }
  | {
      accion: 'REPETIDA';
      respuesta: RespuestaGuardada;
      estado: 'PROCESADO' | 'ERROR';
    }
  | { accion: 'TOMAR'; actualizadaEnLeida: string }
  | { accion: 'EN_PROCESO' };

/**
 * Paso 2 del procesamiento (101):
 * - de otro usuario → `AJENA` (no se devuelve la respuesta guardada);
 * - `PROCESADO` o `ERROR` → `REPETIDA` con lo guardado;
 * - `PROCESANDO` de hace más de 60 s → `TOMAR`;
 * - `PROCESANDO` reciente → `EN_PROCESO`.
 */
export function decidirAnteExistente(
  guardada: OperacionProcesada,
  usuarioId: string,
  ahora: Date,
): DecisionExistente {
  if (guardada.usuarioId !== usuarioId) return { accion: 'AJENA' };
  if (
    (guardada.estado === 'PROCESADO' || guardada.estado === 'ERROR') &&
    guardada.respuesta
  ) {
    return {
      accion: 'REPETIDA',
      estado: guardada.estado,
      respuesta: guardada.respuesta,
    };
  }
  const actualizada = Date.parse(guardada.actualizadaEn);
  if (
    Number.isNaN(actualizada) ||
    ahora.getTime() - actualizada > SEGUNDOS_ABANDONO * 1000
  ) {
    return { accion: 'TOMAR', actualizadaEnLeida: guardada.actualizadaEn };
  }
  return { accion: 'EN_PROCESO' };
}

/** Resultado `ERROR` o `REINTENTAR` propio de Sincronización (sin llamar al dueño). */
export function resultadoPropio(
  idOperacion: string,
  estado: 'ERROR' | 'REINTENTAR',
  respuesta: Problema,
): ResultadoOperacion {
  return {
    idOperacion,
    estado,
    repetida: false,
    status: respuesta.status,
    respuesta,
  };
}

export const operacionAjena = (idOperacion: string) =>
  resultadoPropio(
    idOperacion,
    'ERROR',
    problema(403, 'OPERACION_AJENA', 'La operación la envió otro usuario.'),
  );

export const operacionEnProceso = (idOperacion: string) =>
  resultadoPropio(
    idOperacion,
    'REINTENTAR',
    problema(
      409,
      'OPERACION_EN_PROCESO',
      'Otra petición está procesando la misma operación.',
    ),
  );

export const loteSinTiempo = (idOperacion: string) =>
  resultadoPropio(
    idOperacion,
    'REINTENTAR',
    problema(
      504,
      'TIEMPO_AGOTADO',
      'Se agotó el tiempo del lote antes de procesar la operación.',
    ),
  );

export const almacenNoDisponible = (idOperacion: string) =>
  resultadoPropio(
    idOperacion,
    'REINTENTAR',
    problema(
      503,
      'SERVICIO_NO_DISPONIBLE',
      'No se pudo registrar la operación.',
    ),
  );
