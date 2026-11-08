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

  /** `POST /obras/{obraId}/fotos/url-subida` con `{ fotoId }` (005; lo pide la app por la 102). */
  pedirUrlSubida(
    obraId: string,
    fotoId: string,
    contexto: ContextoLlamada,
  ): Promise<ResultadoLlamada> {
    return this.cliente.llamar(
      'POST',
      `/obras/${encodeURIComponent(obraId)}/fotos/url-subida`,
      contexto,
      { fotoId },
    );
  }

  /** `POST /obras/{obraId}/fotos` (005; operación `FOTO_AVANCE` de la 102). */
  registrarFoto(
    obraId: string,
    cuerpo: unknown,
    contexto: ContextoLlamada,
  ): Promise<ResultadoLlamada> {
    return this.cliente.llamar(
      'POST',
      `/obras/${encodeURIComponent(obraId)}/fotos`,
      contexto,
      cuerpo,
    );
  }

  /** `POST /obras/{obraId}/diario` (103; operación `ENTRADA_DIARIO`). */
  registrarDiario(
    obraId: string,
    cuerpo: unknown,
    contexto: ContextoLlamada,
  ): Promise<ResultadoLlamada> {
    return this.cliente.llamar(
      'POST',
      `/obras/${encodeURIComponent(obraId)}/diario`,
      contexto,
      cuerpo,
    );
  }

  /** `GET /obras/{obraId}/diario` sin `desde` ni `hasta`: los últimos 30 días (103). */
  listarDiario(
    obraId: string,
    contexto: ContextoLlamada,
  ): Promise<ResultadoLlamada> {
    return this.cliente.llamar(
      'GET',
      `/obras/${encodeURIComponent(obraId)}/diario`,
      contexto,
    );
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
