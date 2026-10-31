/** Datos livianos que la app guarda para trabajar sin señal (101, `GET /paquete-datos`). */
export interface PartidaPaquete {
  id: string;
  codigo: string;
  nombre: string;
  unidad: string;
}

export interface StockPaquete {
  materialId: string;
  cantidad: number;
  minimo: number;
  estado: string;
}

export interface ObraPaquete {
  id: string;
  nombre: string;
  ubicacion: string;
  partidas: PartidaPaquete[];
  stock: StockPaquete[];
}

export interface MaterialPaquete {
  id: string;
  codigo: string;
  nombre: string;
  unidad: string;
  unidadPlural: string;
}

/** Lo que entra en `versionDatos`: el paquete sin `versionDatos` ni `generadoEn`. */
export interface ContenidoPaquete {
  obras: ObraPaquete[];
  materiales: MaterialPaquete[];
}

export interface PaqueteDatos extends ContenidoPaquete {
  versionDatos: string;
  generadoEn: string;
}

const porClave =
  <T>(clave: (elemento: T) => string) =>
  (a: T, b: T) =>
    clave(a) < clave(b) ? -1 : clave(a) > clave(b) ? 1 : 0;

/**
 * Ordena las listas por `id` (el stock por `materialId`, que es su identificador) para que el
 * paquete y su versión no dependan del orden en que respondieron los servicios.
 */
export function ordenarContenido(
  contenido: ContenidoPaquete,
): ContenidoPaquete {
  return {
    obras: contenido.obras
      .map((obra) => ({
        ...obra,
        partidas: [...obra.partidas].sort(porClave((p) => p.id)),
        stock: [...obra.stock].sort(porClave((s) => s.materialId)),
      }))
      .sort(porClave((o) => o.id)),
    materiales: [...contenido.materiales].sort(porClave((m) => m.id)),
  };
}
