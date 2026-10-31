import type { ResultadoOperacion } from '../../dominio/operacion.js';

/** Respuesta `200` de `POST /lotes`: un resultado por operación, en el mismo orden. */
export interface ResultadoLoteRespuesta {
  resultados: ResultadoOperacion[];
}
