import type { RespuestaDuenio } from '../../dominio/clasificacion.js';
import type {
  DefinicionTipo,
  OperacionRecibida,
} from '../../dominio/tipo-operacion.js';

export const DESPACHADOR = Symbol('DESPACHADOR');

/** Token del usuario y `X-Request-Id` que se reenvían al servicio dueño. */
export interface ContextoEnvio {
  token: string;
  requestId: string;
}

/** Envía la operación al servicio dueño según su tipo (tabla de tipos de operación). */
export interface Despachador {
  enviar(
    definicion: DefinicionTipo,
    operacion: OperacionRecibida,
    contexto: ContextoEnvio,
  ): Promise<RespuestaDuenio>;
}
