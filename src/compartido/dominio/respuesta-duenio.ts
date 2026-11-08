/** Lo que pasó al llamar a un servicio dueño (sin depender del cliente HTTP). */
export type RespuestaDuenio =
  | { tipo: 'RESPUESTA'; status: number; cuerpo: unknown }
  | { tipo: 'TIEMPO_AGOTADO' }
  | { tipo: 'ERROR_RED' };
