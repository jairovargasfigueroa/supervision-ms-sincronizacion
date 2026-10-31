import {
  createServer,
  type IncomingHttpHeaders,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';

/** Petición que recibió el servidor simulado. */
export interface PeticionRecibida {
  metodo: string;
  /** Ruta sin la consulta, por ejemplo `/obras/123/stock`. */
  ruta: string;
  consulta: URLSearchParams;
  encabezados: IncomingHttpHeaders;
  cuerpo: unknown;
}

/** Lo que responde el servidor simulado a una ruta. */
export interface RespuestaSimulada {
  status: number;
  cuerpo?: unknown;
  /** Espera antes de responder (para probar el tiempo máximo). */
  demoraMs?: number;
  /** Corta la conexión sin responder (para probar un error de red). */
  cortar?: boolean;
}

export type Manejador = (
  peticion: PeticionRecibida,
) => RespuestaSimulada | Promise<RespuestaSimulada>;

/**
 * Servidor HTTP de prueba que simula a Obras o Materiales: responde lo que se define por
 * método y ruta, guarda las peticiones recibidas y cuenta las llamadas. Una ruta sin definir
 * responde `404 RUTA_NO_ENCONTRADA`.
 */
export class ServidorSimulado {
  readonly peticiones: PeticionRecibida[] = [];
  private readonly rutas = new Map<string, Manejador>();
  private servidor?: Server;
  private readonly pendientes = new Set<NodeJS.Timeout>();
  url = '';

  static async iniciar(): Promise<ServidorSimulado> {
    const simulado = new ServidorSimulado();
    await simulado.escuchar();
    return simulado;
  }

  /** Define la respuesta de `metodo ruta` (fija o calculada con cada petición). */
  definir(
    metodo: string,
    ruta: string,
    respuesta: RespuestaSimulada | Manejador,
  ): void {
    this.rutas.set(
      `${metodo.toUpperCase()} ${ruta}`,
      typeof respuesta === 'function' ? respuesta : () => respuesta,
    );
  }

  /** Cuántas veces se llamó `metodo ruta`. */
  llamadas(metodo: string, ruta: string): number {
    return this.peticiones.filter(
      (peticion) =>
        peticion.metodo === metodo.toUpperCase() && peticion.ruta === ruta,
    ).length;
  }

  /** Olvida las rutas definidas y las peticiones recibidas (entre pruebas). */
  limpiar(): void {
    this.rutas.clear();
    this.peticiones.length = 0;
  }

  async cerrar(): Promise<void> {
    for (const espera of this.pendientes) clearTimeout(espera);
    this.servidor?.closeAllConnections();
    await new Promise<void>((resolver) =>
      this.servidor ? this.servidor.close(() => resolver()) : resolver(),
    );
  }

  private escuchar(): Promise<void> {
    this.servidor = createServer((solicitud, respuesta) => {
      const partes: Buffer[] = [];
      solicitud.on('data', (parte: Buffer) => partes.push(parte));
      solicitud.on('end', () => {
        const direccion = new URL(solicitud.url ?? '/', 'http://simulado');
        const texto = Buffer.concat(partes).toString('utf8');
        const peticion: PeticionRecibida = {
          metodo: solicitud.method ?? 'GET',
          ruta: direccion.pathname,
          consulta: direccion.searchParams,
          encabezados: solicitud.headers,
          cuerpo: texto ? JSON.parse(texto) : undefined,
        };
        this.peticiones.push(peticion);
        void this.responder(peticion, respuesta);
      });
    });
    return new Promise((resolver) =>
      this.servidor!.listen(0, '127.0.0.1', () => {
        const { port } = this.servidor!.address() as AddressInfo;
        this.url = `http://127.0.0.1:${port}`;
        resolver();
      }),
    );
  }

  private async responder(
    peticion: PeticionRecibida,
    respuesta: ServerResponse,
  ): Promise<void> {
    const manejador = this.rutas.get(`${peticion.metodo} ${peticion.ruta}`);
    const definida: RespuestaSimulada = manejador
      ? await manejador(peticion)
      : {
          status: 404,
          cuerpo: {
            type: 'about:blank',
            title: 'No encontrado',
            status: 404,
            codigo: 'RUTA_NO_ENCONTRADA',
          },
        };
    if (definida.demoraMs) {
      await new Promise<void>((resolver) => {
        const espera = setTimeout(() => {
          this.pendientes.delete(espera);
          resolver();
        }, definida.demoraMs);
        this.pendientes.add(espera);
      });
    }
    if (respuesta.destroyed) return;
    if (definida.cortar) {
      respuesta.socket?.destroy();
      return;
    }
    if (definida.cuerpo === undefined) {
      respuesta.writeHead(definida.status).end();
      return;
    }
    const esProblema =
      definida.status >= 400 &&
      typeof definida.cuerpo === 'object' &&
      definida.cuerpo !== null &&
      'codigo' in definida.cuerpo;
    respuesta
      .writeHead(definida.status, {
        'Content-Type': esProblema
          ? 'application/problem+json'
          : 'application/json',
      })
      .end(JSON.stringify(definida.cuerpo));
  }
}
