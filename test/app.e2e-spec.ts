import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { CONJUNTO_CLAVES } from '../src/compartido/infraestructura/auth/validador-token.js';
import { configurarApp } from '../src/configurar-app.js';
import { DISPOSITIVO_PRUEBA } from './utilidades/app-prueba.js';
import {
  crearDynamoPrueba,
  type DynamoPrueba,
} from './utilidades/dynamodb-prueba.js';
import { ServidorSimulado } from './utilidades/servidor-simulado.js';
import {
  AZP,
  CONFIG_PRUEBA,
  crearClavesPrueba,
  type ClavesPrueba,
} from './utilidades/tokens-prueba.js';

const OBRA = '3c3c3c3c-3333-4333-8333-333333333333';
const PARTIDA = '4d4d4d4d-4444-4444-8444-444444444444';

// La app completa (AppModule, como en main.ts) con DynamoDB Local y Obras y Materiales simulados:
// el recorrido de la app de obra de la 101. Necesita DynamoDB Local.
describe('Servicio completo: paquete, lote y reenvío (e2e)', () => {
  let app: INestApplication;
  let claves: ClavesPrueba;
  let dynamo: DynamoPrueba;
  let obras: ServidorSimulado;
  let materiales: ServidorSimulado;
  const anteriores: Record<string, string | undefined> = {};

  beforeAll(async () => {
    claves = await crearClavesPrueba();
    dynamo = crearDynamoPrueba();
    obras = await ServidorSimulado.iniciar();
    materiales = await ServidorSimulado.iniciar();
    const entorno: Record<string, string> = {
      ...CONFIG_PRUEBA,
      ...dynamo.config,
      OBRAS_URL: obras.url,
      MATERIALES_URL: materiales.url,
    };
    for (const [clave, valor] of Object.entries(entorno)) {
      anteriores[clave] = process.env[clave];
      process.env[clave] = valor;
    }
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CONJUNTO_CLAVES)
      .useValue(claves.jwks)
      .compile();
    app = modulo.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    configurarApp(app as NestExpressApplication);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await obras?.cerrar();
    await materiales?.cerrar();
    await dynamo?.cerrar();
    for (const [clave, valor] of Object.entries(anteriores)) {
      if (valor === undefined) delete process.env[clave];
      else process.env[clave] = valor;
    }
  });

  it('GET /salud responde sin token', async () => {
    await request(app.getHttpServer()).get('/salud').expect(200, {
      estado: 'ok',
    });
  });

  it('descarga el paquete, envía un movimiento, lo reenvía sin duplicar y el paquete cambia', async () => {
    let cantidad = 120;
    obras.definir('GET', '/obras', {
      status: 200,
      cuerpo: [{ id: OBRA, nombre: 'Edificio', ubicacion: 'Centro' }],
    });
    obras.definir('GET', `/obras/${OBRA}`, {
      status: 200,
      cuerpo: {
        id: OBRA,
        partidas: [
          { id: PARTIDA, codigo: 'P-01', nombre: 'Losa', unidad: 'm2' },
        ],
      },
    });
    materiales.definir('GET', `/obras/${OBRA}/stock`, () => ({
      status: 200,
      cuerpo: [
        { materialId: 'CEM-IP30', cantidad, minimo: 100, estado: 'JUSTO' },
      ],
    }));
    materiales.definir('GET', '/materiales', {
      status: 200,
      cuerpo: {
        items: [
          {
            id: 'CEM-IP30',
            codigo: 'CEM-IP30',
            nombre: 'Cemento IP-30',
            unidad: 'bolsa',
            unidadPlural: 'bolsas',
          },
        ],
        total: 1,
        pagina: 1,
        tamano: 100,
      },
    });
    materiales.definir('POST', '/movimientos', (peticion) => {
      const datos = peticion.cuerpo as { id: string; cantidad: number };
      cantidad -= datos.cantidad;
      return {
        status: 201,
        cuerpo: {
          id: datos.id,
          periodo: '2026-11',
          superaStock: false,
          stock: { cantidad, minimo: 100, estado: 'JUSTO' },
        },
      };
    });

    const token = await claves.firmarConRoles(['almacenero'], AZP.appObra);
    const servidor = app.getHttpServer();
    const conEncabezados = (peticion: request.Test) =>
      peticion
        .set('Authorization', `Bearer ${token}`)
        .set('X-Dispositivo-Id', DISPOSITIVO_PRUEBA);

    // 1. Con señal: descarga el paquete.
    const paquete = await conEncabezados(
      request(servidor).get(`/paquete-datos?obraActivaId=${OBRA}`),
    ).expect(200);
    expect(paquete.body.obras[0].stock[0].cantidad).toBe(120);

    // 2. Sin cambios: 304.
    await conEncabezados(request(servidor).get('/paquete-datos'))
      .set('If-None-Match', paquete.headers.etag)
      .expect(304);

    // 3. Envía el movimiento registrado sin señal.
    const id = randomUUID();
    const operacion = {
      idOperacion: id,
      tipo: 'MOVIMIENTO_MATERIAL',
      creadaEn: '2026-11-15T14:00:00Z',
      datos: {
        id,
        obraId: OBRA,
        materialId: 'CEM-IP30',
        tipo: 'SALIDA',
        cantidad: 12.5,
        partidaId: PARTIDA,
        registradoEn: '2026-11-15T14:00:00Z',
      },
    };
    const primero = await conEncabezados(request(servidor).post('/lotes'))
      .send({ operaciones: [operacion] })
      .expect(200);
    expect(primero.body.resultados[0]).toMatchObject({
      estado: 'PROCESADO',
      repetida: false,
      status: 201,
      respuesta: { stock: { cantidad: 107.5 } },
    });

    // 4. La respuesta se perdió y la app lo reenvía: no se descuenta dos veces.
    const reenvio = await conEncabezados(request(servidor).post('/lotes'))
      .send({ operaciones: [operacion] })
      .expect(200);
    expect(reenvio.body.resultados[0]).toEqual({
      ...primero.body.resultados[0],
      repetida: true,
    });
    expect(materiales.llamadas('POST', '/movimientos')).toBe(1);

    // 5. El paquete cambió (stock 107,5): versión nueva.
    const nuevo = await conEncabezados(request(servidor).get('/paquete-datos'))
      .set('If-None-Match', paquete.headers.etag)
      .expect(200);
    expect(nuevo.body.versionDatos).not.toBe(paquete.body.versionDatos);
    expect(nuevo.body.obras[0].stock[0].cantidad).toBe(107.5);
  });
});
