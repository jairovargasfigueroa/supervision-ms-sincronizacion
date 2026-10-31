import type {
  ClienteRest,
  ContextoLlamada,
  ResultadoLlamada,
} from './cliente-rest.js';

/** Llamadas a Obras con el token del usuario (contratos de Obras: 006 y 002). */
export class ObrasCliente {
  constructor(private readonly cliente: ClienteRest) {}

  /** `GET /obras?estado=EN_EJECUCION`: Obras ya filtra por las obras que el usuario ve. */
  listarEnEjecucion(contexto: ContextoLlamada): Promise<ResultadoLlamada> {
    return this.cliente.llamar('GET', '/obras?estado=EN_EJECUCION', contexto);
  }

  /** `GET /obras/{id}`: detalle con las partidas. */
  obtener(
    obraId: string,
    contexto: ContextoLlamada,
  ): Promise<ResultadoLlamada> {
    return this.cliente.llamar(
      'GET',
      `/obras/${encodeURIComponent(obraId)}`,
      contexto,
    );
  }
}
