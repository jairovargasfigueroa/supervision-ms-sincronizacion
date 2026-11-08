export const ESTADO_DISPOSITIVO_REPOSITORIO = Symbol(
  'ESTADO_DISPOSITIVO_REPOSITORIO',
);

/** Tabla `estado_dispositivo` (`docs/datos.md`). Solo escribe los atributos que recibe. */
export interface EstadoDispositivoRepositorio {
  /** Después de un lote: `usuario_id` y `ultima_sincronizacion`. */
  registrarLote(
    idDispositivo: string,
    usuarioId: string,
    ahora: string,
  ): Promise<void>;
  /** Después de un paquete: además `version_datos` y, si vino, `obra_id`. */
  registrarPaquete(
    idDispositivo: string,
    usuarioId: string,
    obraId: string | undefined,
    versionDatos: string,
    ahora: string,
  ): Promise<void>;
}
