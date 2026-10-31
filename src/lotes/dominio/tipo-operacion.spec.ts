import { TIPOS_OPERACION, validarTipo } from './tipo-operacion.js';

const ID = '7d0f8a52-1c3e-4b6a-9f2d-5e4c3b2a1f0e';

const operacion = (tipo: string, datos: Record<string, unknown>) => ({
  idOperacion: ID,
  tipo,
  creadaEn: '2026-11-15T14:00:00Z',
  datos,
});

describe('tipos de operación', () => {
  it('MOVIMIENTO_MATERIAL va a Materiales y crea un registro', () => {
    expect(TIPOS_OPERACION.MOVIMIENTO_MATERIAL).toEqual({
      tipo: 'MOVIMIENTO_MATERIAL',
      servicio: 'materiales',
      creaRegistro: true,
    });
  });

  it('acepta un MOVIMIENTO_MATERIAL con datos.id igual a idOperacion', () => {
    expect(
      validarTipo(operacion('MOVIMIENTO_MATERIAL', { id: ID, cantidad: 1 })),
    ).toEqual({
      valida: true,
      definicion: TIPOS_OPERACION.MOVIMIENTO_MATERIAL,
    });
  });

  it.each(['TIPO_INVENTADO', 'OTRO', 'toString', '__proto__'])(
    'un tipo que no está en la tabla (%s) → 400 TIPO_OPERACION_DESCONOCIDO',
    (tipo) => {
      expect(validarTipo(operacion(tipo, { id: ID }))).toMatchObject({
        valida: false,
        status: 400,
        respuesta: { status: 400, codigo: 'TIPO_OPERACION_DESCONOCIDO' },
      });
    },
  );

  it.each([
    ['otro id', { id: 'a1b2c3d4-0000-4000-8000-000000000000' }],
    ['sin id', { cantidad: 1 }],
  ])('%s en datos → 400 OPERACION_INVALIDA', (_caso, datos) => {
    expect(validarTipo(operacion('MOVIMIENTO_MATERIAL', datos))).toMatchObject({
      valida: false,
      status: 400,
      respuesta: {
        title: 'Operación inválida',
        status: 400,
        codigo: 'OPERACION_INVALIDA',
      },
    });
  });

  describe('FOTO_AVANCE (102)', () => {
    it('va a Obras, crea un registro y necesita datos.obraId', () => {
      expect(TIPOS_OPERACION.FOTO_AVANCE).toEqual({
        tipo: 'FOTO_AVANCE',
        servicio: 'obras',
        creaRegistro: true,
        rutaConObra: true,
      });
      expect(
        validarTipo(operacion('FOTO_AVANCE', { id: ID, obraId: 'obra-1' })),
      ).toMatchObject({ valida: true });
    });

    it.each([
      ['sin obraId', { id: ID }],
      ['obraId vacío', { id: ID, obraId: ' ' }],
      ['obraId que no es texto', { id: ID, obraId: 5 }],
      ['datos.id distinto', { id: 'otro', obraId: 'obra-1' }],
    ])('%s → 400 OPERACION_INVALIDA', (_caso, datos) => {
      expect(validarTipo(operacion('FOTO_AVANCE', datos))).toMatchObject({
        valida: false,
        respuesta: { codigo: 'OPERACION_INVALIDA' },
      });
    });
  });
});
