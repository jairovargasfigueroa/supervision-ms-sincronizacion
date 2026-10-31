import type {
  ClienteRest,
  ContextoLlamada,
  ResultadoLlamada,
} from './cliente-rest.js';

/** Tamaño de página máximo de `GET /materiales` (convenciones, «Paginación»). */
export const TAMANO_PAGINA_MATERIALES = 100;

/** Llamadas a Materiales con el token del usuario (contratos de Materiales: 003 y 004). */
export class MaterialesCliente {
  constructor(private readonly cliente: ClienteRest) {}

  /** `GET /materiales?soloActivos=true`, una página de 100 (respuesta `{ items, total, pagina, tamano }`). */
  listarActivos(
    pagina: number,
    contexto: ContextoLlamada,
  ): Promise<ResultadoLlamada> {
    return this.cliente.llamar(
      'GET',
      `/materiales?soloActivos=true&pagina=${pagina}&tamano=${TAMANO_PAGINA_MATERIALES}`,
      contexto,
    );
  }

  /** `GET /obras/{obraId}/stock`. */
  stockDeObra(
    obraId: string,
    contexto: ContextoLlamada,
  ): Promise<ResultadoLlamada> {
    return this.cliente.llamar(
      'GET',
      `/obras/${encodeURIComponent(obraId)}/stock`,
      contexto,
    );
  }

  /** `POST /movimientos` con el cuerpo tal como llegó en `datos` (operación `MOVIMIENTO_MATERIAL`). */
  registrarMovimiento(
    datos: unknown,
    contexto: ContextoLlamada,
  ): Promise<ResultadoLlamada> {
    return this.cliente.llamar('POST', '/movimientos', contexto, datos);
  }
}
