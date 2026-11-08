/**
 * Error con código del catálogo (`docs/mensajes.md` de la carpeta general) y estado HTTP.
 * `problem-details.filter.ts` lo convierte en Problem Details.
 */
export class ErrorAplicacion extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
    readonly status: number,
  ) {
    super(mensaje);
    this.name = 'ErrorAplicacion';
  }
}
