import type {
  MaterialPaquete,
  PartidaPaquete,
  StockPaquete,
} from '../../dominio/paquete-datos.js';

export const FUENTE_DATOS = Symbol('FUENTE_DATOS');

/** Token del usuario y `X-Request-Id` que se reenvían a Obras y Materiales. */
export interface ContextoFuente {
  token: string;
  requestId: string;
}

export interface ObraEnEjecucion {
  id: string;
  nombre: string;
  ubicacion: string;
}

/** Obras o Materiales no respondieron bien (`503`) o tardaron más de 5 s (`504`). */
export class FuenteNoDisponibleError extends Error {
  constructor(
    readonly servicio: 'obras' | 'materiales',
    readonly motivo: 'SERVICIO_NO_DISPONIBLE' | 'TIEMPO_AGOTADO',
    detalle: string,
  ) {
    super(detalle);
    this.name = 'FuenteNoDisponibleError';
  }
}

/**
 * Datos del paquete, pedidos con el token del usuario (cada servicio dueño aplica sus reglas de
 * visibilidad). Cualquier falla lanza `FuenteNoDisponibleError`.
 */
export interface FuenteDatos {
  /** Obras `GET /obras?estado=EN_EJECUCION` (ya filtra por las obras asignadas). */
  obrasEnEjecucion(contexto: ContextoFuente): Promise<ObraEnEjecucion[]>;
  /** Obras `GET /obras/{id}`: las partidas. */
  partidas(obraId: string, contexto: ContextoFuente): Promise<PartidaPaquete[]>;
  /** Materiales `GET /obras/{id}/stock`; `404` (todavía no llegó `ObraRegistrada`) → `[]`. */
  stock(obraId: string, contexto: ContextoFuente): Promise<StockPaquete[]>;
  /** Materiales `GET /materiales?soloActivos=true`, todas las páginas. */
  materialesActivos(contexto: ContextoFuente): Promise<MaterialPaquete[]>;
}
