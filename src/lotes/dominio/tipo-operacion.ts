import { problema, type Problema } from '../../compartido/dominio/problema.js';

export type ServicioDestino = 'materiales' | 'obras';

/** Un tipo de operación que la app puede mandar en un lote. */
export interface DefinicionTipo {
  tipo: string;
  servicio: ServicioDestino;
  /** La operación crea un registro cuyo `id` es el `idOperacion` (`datos.id` debe ser igual). */
  creaRegistro: boolean;
  /**
   * La ruta del servicio dueño lleva `datos.obraId` (`POST /obras/{obraId}/…`): sin él, o si no es
   * texto, la operación es `OPERACION_INVALIDA` (no se puede enviar).
   */
  rutaConObra?: boolean;
}

/**
 * Tabla de tipos de operación y servicio destino (101, «Tipos de operación y servicio destino»).
 * La 102 agregó `FOTO_AVANCE` y la 103, `ENTRADA_DIARIO`.
 */
export const TIPOS_OPERACION: Readonly<Record<string, DefinicionTipo>> = {
  // Materiales POST /movimientos con cuerpo = datos
  MOVIMIENTO_MATERIAL: {
    tipo: 'MOVIMIENTO_MATERIAL',
    servicio: 'materiales',
    creaRegistro: true,
  },
  // 102: Obras POST /obras/{datos.obraId}/fotos con { id, partidaId, claveArchivo, tomadaEn }
  FOTO_AVANCE: {
    tipo: 'FOTO_AVANCE',
    servicio: 'obras',
    creaRegistro: true,
    rutaConObra: true,
  },
  // 103: Obras POST /obras/{datos.obraId}/diario con { id, fecha, clima, texto }
  ENTRADA_DIARIO: {
    tipo: 'ENTRADA_DIARIO',
    servicio: 'obras',
    creaRegistro: true,
    rutaConObra: true,
  },
};

/** Operación tal como llega en el lote (ya validada su forma). */
export interface OperacionRecibida {
  idOperacion: string;
  tipo: string;
  creadaEn: string;
  datos: Record<string, unknown>;
}

export type ValidacionTipo =
  | { valida: true; definicion: DefinicionTipo }
  | { valida: false; status: 400; respuesta: Problema };

/**
 * Comprueba el tipo; en los que crean un registro, que `idOperacion` sea igual a `datos.id`; y en
 * los que van a una ruta de una obra, que venga `datos.obraId`.
 * Si no, el resultado es `ERROR` `400 TIPO_OPERACION_DESCONOCIDO` u `OPERACION_INVALIDA` y la
 * operación no se guarda en DynamoDB.
 */
export function validarTipo(operacion: OperacionRecibida): ValidacionTipo {
  const definicion = Object.hasOwn(TIPOS_OPERACION, operacion.tipo)
    ? TIPOS_OPERACION[operacion.tipo]
    : undefined;
  if (!definicion) {
    return {
      valida: false,
      status: 400,
      respuesta: problema(
        400,
        'TIPO_OPERACION_DESCONOCIDO',
        `El tipo de operación ${operacion.tipo} no se reconoce.`,
      ),
    };
  }
  if (definicion.creaRegistro && operacion.datos.id !== operacion.idOperacion) {
    return {
      valida: false,
      status: 400,
      respuesta: problema(
        400,
        'OPERACION_INVALIDA',
        'idOperacion debe ser igual a datos.id.',
      ),
    };
  }
  if (
    definicion.rutaConObra &&
    (typeof operacion.datos.obraId !== 'string' ||
      operacion.datos.obraId.trim() === '')
  ) {
    return {
      valida: false,
      status: 400,
      respuesta: problema(400, 'OPERACION_INVALIDA', 'Falta datos.obraId.'),
    };
  }
  return { valida: true, definicion };
}
