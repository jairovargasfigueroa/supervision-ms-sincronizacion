import { Logger } from '@nestjs/common';

/** Datos de la petición del usuario que se reenvían al servicio dueño. */
export interface ContextoLlamada {
  /** Token del usuario (Sincronización no tiene cliente propio en Keycloak). */
  token: string;
  requestId: string;
}

/**
 * Resultado de una llamada a Obras o Materiales. La interpretación (procesado, rechazo,
 * reintento, falla del paquete) la hace quien llama.
 */
export type ResultadoLlamada =
  | { tipo: 'RESPUESTA'; status: number; cuerpo: unknown }
  | { tipo: 'TIEMPO_AGOTADO' }
  | { tipo: 'ERROR_RED' };

/**
 * Cliente HTTP mínimo con el `fetch` de Node: reenvía el token del usuario y el `X-Request-Id`
 * y corta la llamada a los `tiempoMaximoMs` (5 s). Nunca lanza por la respuesta ni por la red:
 * devuelve un `ResultadoLlamada`. No registra el token ni los cuerpos.
 */
export class ClienteRest {
  private readonly registro: Logger;

  constructor(
    private readonly nombre: string,
    private readonly urlBase: string,
    private readonly tiempoMaximoMs: number,
  ) {
    this.registro = new Logger(`Cliente${nombre}`);
  }

  async llamar(
    metodo: 'GET' | 'POST' | 'PUT',
    ruta: string,
    contexto: ContextoLlamada,
    cuerpo?: unknown,
  ): Promise<ResultadoLlamada> {
    const encabezados: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${contexto.token}`,
      'X-Request-Id': contexto.requestId,
    };
    if (cuerpo !== undefined) encabezados['Content-Type'] = 'application/json';
    const inicio = performance.now();
    try {
      const opciones: RequestInit = {
        method: metodo,
        headers: encabezados,
        signal: AbortSignal.timeout(this.tiempoMaximoMs),
      };
      if (cuerpo !== undefined) opciones.body = JSON.stringify(cuerpo);
      const respuesta = await fetch(`${this.urlBase}${ruta}`, opciones);
      const texto = await respuesta.text();
      return {
        tipo: 'RESPUESTA',
        status: respuesta.status,
        cuerpo: leerCuerpo(texto),
      };
    } catch (error) {
      const ms = Math.round(performance.now() - inicio);
      const nombre = error instanceof Error ? error.name : '';
      if (nombre === 'TimeoutError' || nombre === 'AbortError') {
        this.registro.warn(
          `${metodo} ${sinConsulta(ruta)} tiempo agotado (${ms} ms) requestId=${contexto.requestId}`,
        );
        return { tipo: 'TIEMPO_AGOTADO' };
      }
      this.registro.warn(
        `${metodo} ${sinConsulta(ruta)} error de red (${nombre || 'desconocido'}) requestId=${contexto.requestId}`,
      );
      return { tipo: 'ERROR_RED' };
    }
  }
}

/** JSON si se puede leer; si no, el texto tal cual; `null` si vino vacío. */
function leerCuerpo(texto: string): unknown {
  if (texto === '') return null;
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

function sinConsulta(ruta: string): string {
  return ruta.split('?')[0];
}
