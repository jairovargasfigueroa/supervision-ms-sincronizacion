import type {
  OperacionProcesada,
  RespuestaGuardada,
} from '../../dominio/operacion.js';

export const OPERACION_PROCESADA_REPOSITORIO = Symbol(
  'OPERACION_PROCESADA_REPOSITORIO',
);

/** Tabla `operacion_procesada` (`docs/datos.md`). Las fechas van en ISO 8601 UTC. */
export interface OperacionProcesadaRepositorio {
  /** `PutItem` «solo si no existe». `false` si ya había un elemento con ese `idOperacion`. */
  crearSiNoExiste(operacion: OperacionProcesada): Promise<boolean>;
  /** `GetItem` con lectura consistente. */
  leer(idOperacion: string): Promise<OperacionProcesada | undefined>;
  /**
   * Toma un `PROCESANDO` abandonado: `UpdateItem` de `actualizada_en` condicionado a
   * `estado = PROCESANDO AND actualizada_en = <valor leído>`. `false` si otro lo tomó antes.
   */
  tomar(
    idOperacion: string,
    actualizadaEnLeida: string,
    ahora: string,
  ): Promise<boolean>;
  /** Guarda `PROCESADO` o `ERROR` con la respuesta del dueño (condicionado a `PROCESANDO`). */
  completar(
    idOperacion: string,
    estado: 'PROCESADO' | 'ERROR',
    respuesta: RespuestaGuardada,
    ahora: string,
  ): Promise<void>;
  /** Libera el identificador para el siguiente intento: `DeleteItem` condicionado a `PROCESANDO`. */
  liberar(idOperacion: string): Promise<void>;
}
