import { createHash } from 'node:crypto';
import type { ContenidoPaquete } from './paquete-datos.js';
import { calcularVersionDatos, jsonCanonico } from './version-datos.js';

const contenido = (): ContenidoPaquete => ({
  obras: [
    {
      id: 'b',
      nombre: 'Obra B',
      ubicacion: 'Calle 2',
      partidas: [
        { id: 'p2', codigo: 'P-02', nombre: 'Muro', unidad: 'm2' },
        { id: 'p1', codigo: 'P-01', nombre: 'Losa', unidad: 'm2' },
      ],
      stock: [
        { materialId: 'm2', cantidad: 5, minimo: 1, estado: 'OK' },
        { materialId: 'm1', cantidad: 120, minimo: 100, estado: 'JUSTO' },
      ],
    },
    {
      id: 'a',
      nombre: 'Obra A',
      ubicacion: 'Calle 1',
      partidas: [],
      stock: [],
    },
  ],
  materiales: [
    {
      id: 'm2',
      codigo: 'ARE',
      nombre: 'Arena',
      unidad: 'm3',
      unidadPlural: 'm3',
    },
    {
      id: 'm1',
      codigo: 'CEM',
      nombre: 'Cemento',
      unidad: 'bolsa',
      unidadPlural: 'bolsas',
    },
  ],
});

describe('versionDatos', () => {
  it('JSON canónico: claves ordenadas, sin espacios', () => {
    expect(jsonCanonico({ b: 1, a: [{ d: true, c: null }], e: 'x' })).toBe(
      '{"a":[{"c":null,"d":true}],"b":1,"e":"x"}',
    );
  });

  it('es el SHA-256 hexadecimal del JSON canónico con las listas ordenadas por id', () => {
    const ordenado = {
      materiales: [
        {
          codigo: 'CEM',
          id: 'm1',
          nombre: 'Cemento',
          unidad: 'bolsa',
          unidadPlural: 'bolsas',
        },
        {
          codigo: 'ARE',
          id: 'm2',
          nombre: 'Arena',
          unidad: 'm3',
          unidadPlural: 'm3',
        },
      ],
      obras: [
        {
          id: 'a',
          nombre: 'Obra A',
          partidas: [],
          stock: [],
          ubicacion: 'Calle 1',
        },
        {
          id: 'b',
          nombre: 'Obra B',
          partidas: [
            { codigo: 'P-01', id: 'p1', nombre: 'Losa', unidad: 'm2' },
            { codigo: 'P-02', id: 'p2', nombre: 'Muro', unidad: 'm2' },
          ],
          stock: [
            { cantidad: 120, estado: 'JUSTO', materialId: 'm1', minimo: 100 },
            { cantidad: 5, estado: 'OK', materialId: 'm2', minimo: 1 },
          ],
          ubicacion: 'Calle 2',
        },
      ],
    };
    const esperado = createHash('sha256')
      .update(JSON.stringify(ordenado))
      .digest('hex');
    expect(calcularVersionDatos(contenido())).toBe(esperado);
    expect(esperado).toMatch(/^[0-9a-f]{64}$/);
  });

  it('no depende del orden en que llegaron las listas', () => {
    const invertido = contenido();
    invertido.obras.reverse();
    invertido.materiales.reverse();
    invertido.obras[1].stock.reverse();
    expect(calcularVersionDatos(invertido)).toBe(
      calcularVersionDatos(contenido()),
    );
  });

  it('cambia si cambia el stock', () => {
    const otro = contenido();
    otro.obras[0].stock[0].cantidad = 4;
    expect(calcularVersionDatos(otro)).not.toBe(
      calcularVersionDatos(contenido()),
    );
  });

  it('el diario (103) entra en la versión y no depende de su orden', () => {
    const conDiario = (orden: 'normal' | 'invertido') => {
      const c = contenido();
      const diario = [
        { id: 'd1', fecha: '2026-11-14', clima: 'SOLEADO', texto: 'Día uno.' },
        { id: 'd2', fecha: '2026-11-15', clima: 'NUBLADO', texto: 'Día dos.' },
      ];
      c.obras[0].diario = orden === 'normal' ? diario : diario.reverse();
      return c;
    };
    expect(calcularVersionDatos(conDiario('normal'))).toBe(
      calcularVersionDatos(conDiario('invertido')),
    );
    expect(calcularVersionDatos(conDiario('normal'))).not.toBe(
      calcularVersionDatos(contenido()),
    );
  });
});
