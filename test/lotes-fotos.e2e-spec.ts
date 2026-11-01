import { randomUUID } from 'node:crypto';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import request from 'supertest';
import { LotesModule } from '../src/lotes/lotes.module.js';
import {
  type AppPrueba,
  crearAppPrueba,
  DISPOSITIVO_PRUEBA,
} from './utilidades/app-prueba.js';
import { AZP } from './utilidades/tokens-prueba.js';

const OBRA = '6f6f6f6f-6666-4666-8666-666666666666';
const PARTIDA = '7a7a7a7a-7777-4777-8777-777777777777';
const RUTA_FOTOS = `/obras/${OBRA}/fotos`;

function fotoAvance(id = randomUUID()) {
  return {
    idOperacion: id,
    tipo: 'FOTO_AVANCE',
    creadaEn: '2026-11-15T15:20:00Z',
    datos: {
      id,
      obraId: OBRA,
      partidaId: PARTIDA,
      claveArchivo: `fotos/${OBRA}/${id}.jpg`,
      tomadaEn: '2026-11-15T15:20:00Z',
    },
  };
}

const FOTO_REGISTRADA = (id: string) => ({
  id,
  partidaId: PARTIDA,
  registradoPor: '11111111-1111-1111-1111-111111111111',
  registradoEn: '2026-11-15T15:20:00Z',
  publicadaCliente: false,
});

// Necesita DynamoDB Local (infra: docker compose up -d dynamodb).
describe('POST /lotes con FOTO_AVANCE (102, e2e)', () => {
  let prueba: AppPrueba;
  let token: string;

  beforeAll(async () => {
    prueba = await crearAppPrueba([LotesModule]);
    token = await prueba.claves.firmarConRoles(['maestro'], AZP.appObra);
  });

  afterEach(() => {
    prueba.obras.limpiar();
    prueba.materiales.limpiar();
  });

  afterAll(async () => {
    await prueba?.cerrar();
  });

  const enviar = (operaciones: unknown[]) =>
    request(prueba.app.getHttpServer())
      .post('/lotes')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Dispositivo-Id', DISPOSITIVO_PRUEBA)
      .set('X-Request-Id', 'req-fotos')
      .send({ operaciones })
      .expect(200);

  const aceptarFotos = () =>
    prueba.obras.definir('POST', RUTA_FOTOS, (peticion) => ({
      status: 201,
      cuerpo: FOTO_REGISTRADA((peticion.cuerpo as { id: string }).id),
    }));

  it('llega a Obras POST /obras/{obraId}/fotos con id, partidaId, claveArchivo y tomadaEn', async () => {
    aceptarFotos();
    const operacion = fotoAvance();
    const respuesta = await enviar([
      {
        ...operacion,
        // Un campo que no está en el contrato de FOTO_AVANCE: no se reenvía
        datos: { ...operacion.datos, otro: 'x' },
      },
    ]);

    expect(respuesta.body.resultados[0]).toEqual({
      idOperacion: operacion.idOperacion,
      estado: 'PROCESADO',
      repetida: false,
      status: 201,
      respuesta: FOTO_REGISTRADA(operacion.idOperacion),
    });
    const [peticion] = prueba.obras.peticiones;
    expect(peticion.ruta).toBe(RUTA_FOTOS);
    expect(peticion.cuerpo).toEqual({
      id: operacion.idOperacion,
      partidaId: PARTIDA,
      claveArchivo: operacion.datos.claveArchivo,
      tomadaEn: '2026-11-15T15:20:00Z',
    });
    expect(peticion.encabezados.authorization).toBe(`Bearer ${token}`);
    expect(peticion.encabezados['x-request-id']).toBe('req-fotos');

    const { Item } = await prueba.dynamo.documentos.send(
      new GetCommand({
        TableName: prueba.dynamo.tablas.operacionProcesada,
        Key: { id_operacion: operacion.idOperacion },
        ConsistentRead: true,
      }),
    );
    expect(Item).toMatchObject({
      tipo: 'FOTO_AVANCE',
      servicio_destino: 'obras',
      estado: 'PROCESADO',
    });
  });

  it('con deteccion (301) la reenvía tal cual a Obras junto con la foto', async () => {
    const deteccion = {
      personas: 4,
      sinCasco: 1,
      sinChaleco: 2,
      versionModelo: 'epp-1.0.0',
    };
    prueba.obras.definir('POST', RUTA_FOTOS, (peticion) => ({
      status: 201,
      cuerpo: {
        ...FOTO_REGISTRADA((peticion.cuerpo as { id: string }).id),
        deteccion,
        avisos: [],
      },
    }));
    const operacion = fotoAvance();
    const respuesta = await enviar([
      { ...operacion, datos: { ...operacion.datos, deteccion } },
    ]);

    expect(respuesta.body.resultados[0]).toMatchObject({
      estado: 'PROCESADO',
      status: 201,
      respuesta: { deteccion, avisos: [] },
    });
    const [peticion] = prueba.obras.peticiones;
    expect(peticion.cuerpo).toEqual({
      id: operacion.idOperacion,
      partidaId: PARTIDA,
      claveArchivo: operacion.datos.claveArchivo,
      tomadaEn: '2026-11-15T15:20:00Z',
      deteccion,
    });
  });

  it('una deteccion que Obras descarta no se rechaza aquí: llega tal cual y queda PROCESADO con el aviso', async () => {
    // sinCasco > personas y un campo de más: Sincronización no valida la detección
    const deteccion = {
      personas: 1,
      sinCasco: 3,
      sinChaleco: 0,
      versionModelo: 'epp-1.0.0',
      extra: true,
    };
    prueba.obras.definir('POST', RUTA_FOTOS, (peticion) => ({
      status: 201,
      cuerpo: {
        ...FOTO_REGISTRADA((peticion.cuerpo as { id: string }).id),
        deteccion: null,
        avisos: ['DETECCION_DESCARTADA'],
      },
    }));
    const operacion = fotoAvance();
    const respuesta = await enviar([
      { ...operacion, datos: { ...operacion.datos, deteccion } },
    ]);

    expect(respuesta.body.resultados[0]).toMatchObject({
      estado: 'PROCESADO',
      respuesta: { deteccion: null, avisos: ['DETECCION_DESCARTADA'] },
    });
    expect(
      (prueba.obras.peticiones[0].cuerpo as { deteccion: unknown }).deteccion,
    ).toEqual(deteccion);
  });

  it('sin deteccion el cuerpo no la lleva; con deteccion null se reenvía null', async () => {
    aceptarFotos();
    const sinDeteccion = fotoAvance();
    const conNull = fotoAvance();
    await enviar([
      sinDeteccion,
      { ...conNull, datos: { ...conNull.datos, deteccion: null } },
    ]);

    const [primera, segunda] = prueba.obras.peticiones;
    expect(primera.cuerpo).not.toHaveProperty('deteccion');
    expect(segunda.cuerpo).toHaveProperty('deteccion', null);
  });

  it('repetida no llama dos veces a Obras', async () => {
    aceptarFotos();
    const operacion = fotoAvance();
    const primera = await enviar([operacion]);
    const segunda = await enviar([operacion]);
    expect(segunda.body.resultados[0]).toEqual({
      ...primera.body.resultados[0],
      repetida: true,
    });
    expect(prueba.obras.llamadas('POST', RUTA_FOTOS)).toBe(1);
  });

  it('un 422 de Obras (CLAVE_ARCHIVO_INVALIDA) queda ERROR', async () => {
    const problema = {
      title: 'x',
      status: 422,
      codigo: 'CLAVE_ARCHIVO_INVALIDA',
      errores: [{ campo: 'claveArchivo', mensaje: 'no corresponde' }],
    };
    prueba.obras.definir('POST', RUTA_FOTOS, { status: 422, cuerpo: problema });
    const respuesta = await enviar([fotoAvance()]);
    expect(respuesta.body.resultados[0]).toMatchObject({
      estado: 'ERROR',
      status: 422,
      respuesta: problema,
    });
  });

  it('sin datos.obraId → ERROR 400 OPERACION_INVALIDA sin llamar a Obras', async () => {
    const operacion = fotoAvance();
    const { obraId: _obraId, ...sinObra } = operacion.datos;
    const respuesta = await enviar([{ ...operacion, datos: sinObra }]);
    expect(respuesta.body.resultados[0]).toMatchObject({
      estado: 'ERROR',
      status: 400,
      respuesta: { codigo: 'OPERACION_INVALIDA' },
    });
    expect(prueba.obras.peticiones).toHaveLength(0);
  });

  it('en un mismo lote, el movimiento va a Materiales y la foto a Obras, en orden', async () => {
    aceptarFotos();
    prueba.materiales.definir('POST', '/movimientos', {
      status: 201,
      cuerpo: { periodo: '2026-11' },
    });
    const id = randomUUID();
    const movimiento = {
      idOperacion: id,
      tipo: 'MOVIMIENTO_MATERIAL',
      creadaEn: '2026-11-15T14:00:00Z',
      datos: { id, obraId: OBRA, tipo: 'INGRESO', cantidad: 1 },
    };
    const foto = fotoAvance();
    const respuesta = await enviar([movimiento, foto]);
    expect(
      respuesta.body.resultados.map((r: { estado: string }) => r.estado),
    ).toEqual(['PROCESADO', 'PROCESADO']);
    expect(prueba.materiales.llamadas('POST', '/movimientos')).toBe(1);
    expect(prueba.obras.llamadas('POST', RUTA_FOTOS)).toBe(1);
  });
});
