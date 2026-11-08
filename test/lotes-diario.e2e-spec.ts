import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { LotesModule } from '../src/lotes/lotes.module.js';
import {
  type AppPrueba,
  crearAppPrueba,
  DISPOSITIVO_PRUEBA,
} from './utilidades/app-prueba.js';
import { AZP } from './utilidades/tokens-prueba.js';

const OBRA = '8b8b8b8b-8888-4888-8888-888888888888';
const RUTA_DIARIO = `/obras/${OBRA}/diario`;

function entradaDiario(id = randomUUID(), fecha = '2026-11-15') {
  return {
    idOperacion: id,
    tipo: 'ENTRADA_DIARIO',
    creadaEn: '2026-11-15T23:10:00Z',
    datos: {
      id,
      obraId: OBRA,
      fecha,
      clima: 'LLUVIA_LEVE',
      texto: 'Se vació la losa del 2do piso. Lluvia por la tarde.',
    },
  };
}

// Necesita DynamoDB Local (infra: docker compose up -d dynamodb).
describe('POST /lotes con ENTRADA_DIARIO (103, e2e)', () => {
  let prueba: AppPrueba;
  let token: string;

  beforeAll(async () => {
    prueba = await crearAppPrueba([LotesModule]);
    token = await prueba.claves.firmarConRoles(['maestro'], AZP.appObra);
  });

  afterEach(() => {
    prueba.obras.limpiar();
  });

  afterAll(async () => {
    await prueba?.cerrar();
  });

  const enviar = (operaciones: unknown[]) =>
    request(prueba.app.getHttpServer())
      .post('/lotes')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Dispositivo-Id', DISPOSITIVO_PRUEBA)
      .send({ operaciones })
      .expect(200);

  const aceptarDiario = () =>
    prueba.obras.definir('POST', RUTA_DIARIO, (peticion) => ({
      status: 201,
      cuerpo: {
        ...(peticion.cuerpo as object),
        obraId: OBRA,
        registradoPor: '11111111-1111-1111-1111-111111111111',
        registradoEn: '2026-11-15T23:10:01.123456Z',
      },
    }));

  it('llega a Obras POST /obras/{obraId}/diario con id, fecha, clima y texto', async () => {
    aceptarDiario();
    const operacion = entradaDiario();
    const respuesta = await enviar([operacion]);

    expect(respuesta.body.resultados[0]).toMatchObject({
      idOperacion: operacion.idOperacion,
      estado: 'PROCESADO',
      repetida: false,
      status: 201,
      respuesta: { id: operacion.idOperacion, obraId: OBRA },
    });
    const [peticion] = prueba.obras.peticiones;
    expect(peticion.ruta).toBe(RUTA_DIARIO);
    expect(peticion.cuerpo).toEqual({
      id: operacion.idOperacion,
      fecha: '2026-11-15',
      clima: 'LLUVIA_LEVE',
      texto: operacion.datos.texto,
    });
    expect(peticion.encabezados.authorization).toBe(`Bearer ${token}`);
  });

  it('repetida no llama dos veces a Obras', async () => {
    aceptarDiario();
    const operacion = entradaDiario();
    await enviar([operacion]);
    const segunda = await enviar([operacion]);
    expect(segunda.body.resultados[0]).toMatchObject({
      estado: 'PROCESADO',
      repetida: true,
    });
    expect(prueba.obras.llamadas('POST', RUTA_DIARIO)).toBe(1);
  });

  it.each([
    [409, 'DIARIO_DIA_YA_REGISTRADO'],
    [422, 'FECHA_DIARIO_INVALIDA'],
    [422, 'OBRA_NO_EN_EJECUCION'],
    [403, 'SIN_PERMISO'],
  ])('%i %s de Obras queda ERROR con su código', async (status, codigo) => {
    prueba.obras.definir('POST', RUTA_DIARIO, {
      status,
      cuerpo: { title: 'x', status, codigo },
    });
    const respuesta = await enviar([entradaDiario()]);
    expect(respuesta.body.resultados[0]).toMatchObject({
      estado: 'ERROR',
      status,
      respuesta: { codigo },
    });
  });

  it('sin datos.obraId → ERROR 400 OPERACION_INVALIDA sin llamar a Obras', async () => {
    const operacion = entradaDiario();
    const { obraId: _obraId, ...sinObra } = operacion.datos;
    const respuesta = await enviar([{ ...operacion, datos: sinObra }]);
    expect(respuesta.body.resultados[0]).toMatchObject({
      estado: 'ERROR',
      respuesta: { codigo: 'OPERACION_INVALIDA' },
    });
    expect(prueba.obras.peticiones).toHaveLength(0);
  });
});
