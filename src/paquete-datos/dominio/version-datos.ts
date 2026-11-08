import { createHash } from 'node:crypto';
import { type ContenidoPaquete, ordenarContenido } from './paquete-datos.js';

/** JSON con las claves de cada objeto ordenadas (forma canónica). */
export function jsonCanonico(valor: unknown): string {
  if (Array.isArray(valor)) {
    return `[${valor.map((elemento) => jsonCanonico(elemento)).join(',')}]`;
  }
  if (typeof valor === 'object' && valor !== null) {
    const objeto = valor as Record<string, unknown>;
    const claves = Object.keys(objeto)
      .filter((clave) => objeto[clave] !== undefined)
      .sort();
    return `{${claves
      .map((clave) => `${JSON.stringify(clave)}:${jsonCanonico(objeto[clave])}`)
      .join(',')}}`;
  }
  return JSON.stringify(valor);
}

/**
 * `versionDatos` (101): SHA-256 en hexadecimal del JSON del paquete sin `generadoEn`, con las
 * claves ordenadas y las listas ordenadas por `id`.
 */
export function calcularVersionDatos(contenido: ContenidoPaquete): string {
  const { obras, materiales } = ordenarContenido(contenido);
  return createHash('sha256')
    .update(jsonCanonico({ obras, materiales }), 'utf8')
    .digest('hex');
}
