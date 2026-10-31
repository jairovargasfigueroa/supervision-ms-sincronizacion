import {
  calcularExpiraEn,
  decidirAnteExistente,
  nuevaOperacion,
  type OperacionProcesada,
} from './operacion.js';
import { Presupuesto } from './presupuesto.js';

const AHORA = new Date('2026-11-15T14:00:00.000Z');

const guardada = (
  cambios: Partial<OperacionProcesada> = {},
): OperacionProcesada => ({
  idOperacion: 'op-1',
  idDispositivo: 'disp-1',
  usuarioId: 'usuario-1',
  tipo: 'MOVIMIENTO_MATERIAL',
  servicioDestino: 'materiales',
  estado: 'PROCESANDO',
  recibidaEn: AHORA.toISOString(),
  actualizadaEn: AHORA.toISOString(),
  expiraEn: calcularExpiraEn(AHORA),
  ...cambios,
});

describe('operación procesada', () => {
  it('expira_en es recibida_en + 30 días en segundos epoch', () => {
    expect(calcularExpiraEn(AHORA)).toBe(
      Date.parse('2026-12-15T14:00:00.000Z') / 1000,
    );
  });

  it('una operación nueva queda PROCESANDO con recibida = actualizada = ahora', () => {
    const operacion = nuevaOperacion(
      {
        idOperacion: 'op-1',
        tipo: 'MOVIMIENTO_MATERIAL',
        creadaEn: '2026-11-15T13:00:00Z',
        datos: { id: 'op-1' },
      },
      'materiales',
      'usuario-1',
      'disp-1',
      AHORA,
    );
    expect(operacion).toEqual(guardada());
  });

  describe('decidirAnteExistente', () => {
    it('de otro usuario → AJENA, aunque esté procesada', () => {
      const otra = guardada({
        estado: 'PROCESADO',
        respuesta: { status: 201, cuerpo: {} },
      });
      expect(decidirAnteExistente(otra, 'usuario-2', AHORA)).toEqual({
        accion: 'AJENA',
      });
    });

    it.each(['PROCESADO', 'ERROR'] as const)(
      '%s → REPETIDA con la respuesta guardada',
      (estado) => {
        const respuesta = { status: 409, cuerpo: { codigo: 'X' } };
        expect(
          decidirAnteExistente(
            guardada({ estado, respuesta }),
            'usuario-1',
            AHORA,
          ),
        ).toEqual({ accion: 'REPETIDA', estado, respuesta });
      },
    );

    it('PROCESANDO de hace más de 60 s → TOMAR con el actualizada_en leído', () => {
      const vieja = guardada({ actualizadaEn: '2026-11-15T13:58:59.000Z' });
      expect(decidirAnteExistente(vieja, 'usuario-1', AHORA)).toEqual({
        accion: 'TOMAR',
        actualizadaEnLeida: '2026-11-15T13:58:59.000Z',
      });
    });

    it('PROCESANDO de hace 60 s o menos → EN_PROCESO', () => {
      const reciente = guardada({ actualizadaEn: '2026-11-15T13:59:00.000Z' });
      expect(decidirAnteExistente(reciente, 'usuario-1', AHORA)).toEqual({
        accion: 'EN_PROCESO',
      });
    });
  });
});

describe('Presupuesto', () => {
  it('se agota al llegar al límite', () => {
    let ahora = 1000;
    const presupuesto = new Presupuesto(20000, () => ahora);
    ahora = 20999;
    expect(presupuesto.agotado()).toBe(false);
    ahora = 21000;
    expect(presupuesto.agotado()).toBe(true);
  });
});
