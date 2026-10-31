import { randomUUID } from 'node:crypto';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import request from 'supertest';
import { LotesModule } from '../src/lotes/lotes.module.js';
import {
  type AppPrueba,
  crearAppPrueba,
  DISPOSITIVO_PRUEBA,
  USUARIO_PRUEBA,
} from './utilidades/app-prueba.js';
import { AZP } from './utilidades/tokens-prueba.js';

const OBRA = '2f1c9a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b';
const PARTIDA = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

/** Operación MOVIMIENTO_MATERIAL con `datos.id` igual a `idOperacion`. */
function movimiento(id = randomUUID()) {
  return {
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
}

const MOVIMIENTO_REGISTRADO = (id: string) => ({
  id,
  periodo: '2026-11',
  superaStock: false,
  stock: { cantidad: 107.5, minimo: 100, estado: 'JUSTO' },
});

const PERIODO_CERRADO = {
  type: 'about:blank',
  title: 'Conflicto',
  status: 409,
  detail: 'El periodo 2026-10 ya está cerrado.',
  codigo: 'PERIODO_CERRADO',
};

// Necesita DynamoDB Local (infra: docker compose up -d dynamodb).
describe('POST /lotes (e2e)', () => {
  let prueba: AppPrueba;
  let token: string;

  beforeAll(async () => {
    prueba = await crearAppPrueba([LotesModule], {
      TIEMPO_MAXIMO_LLAMADA_MS: '400',
    });
    token = await prueba.tokenAlmacenero();
  });

  afterEach(() => {
    prueba.materiales.limpiar();
  });

  afterAll(async () => {
    await prueba?.cerrar();
  });

  const enviar = (cuerpo: unknown, conToken = token) =>
    request(prueba.app.getHttpServer())
      .post('/lotes')
      .set('Authorization', `Bearer ${conToken}`)
      .set('X-Dispositivo-Id', DISPOSITIVO_PRUEBA)
      .set('X-Request-Id', 'req-lote')
      .send(cuerpo as object);

  const leer = async (idOperacion: string) =>
    (
      await prueba.dynamo.documentos.send(
        new GetCommand({
          TableName: prueba.dynamo.tablas.operacionProcesada,
          Key: { id_operacion: idOperacion },
          ConsistentRead: true,
        }),
      )
    ).Item;

  const aceptarMovimientos = (demoraMs = 0) =>
    prueba.materiales.definir('POST', '/movimientos', (peticion) => ({
      status: 201,
      cuerpo: MOVIMIENTO_REGISTRADO((peticion.cuerpo as { id: string }).id),
      demoraMs,
    }));

  describe('operación nueva', () => {
    it('llama a Materiales con datos, token y X-Request-Id y guarda PROCESADO', async () => {
      aceptarMovimientos();
      const operacion = movimiento();
      const antes = Math.floor(Date.now() / 1000);

      const respuesta = await enviar({ operaciones: [operacion] }).expect(200);

      expect(respuesta.body).toEqual({
        resultados: [
          {
            idOperacion: operacion.idOperacion,
            estado: 'PROCESADO',
            repetida: false,
            status: 201,
            respuesta: MOVIMIENTO_REGISTRADO(operacion.idOperacion),
          },
        ],
      });
      const [peticion] = prueba.materiales.peticiones;
      expect(peticion.cuerpo).toEqual(operacion.datos);
      expect(peticion.encabezados.authorization).toBe(`Bearer ${token}`);
      expect(peticion.encabezados['x-request-id']).toBe('req-lote');

      const elemento = await leer(operacion.idOperacion);
      expect(elemento).toMatchObject({
        id_operacion: operacion.idOperacion,
        id_dispositivo: DISPOSITIVO_PRUEBA,
        usuario_id: USUARIO_PRUEBA,
        tipo: 'MOVIMIENTO_MATERIAL',
        servicio_destino: 'materiales',
        estado: 'PROCESADO',
      });
      expect(JSON.parse(elemento!.respuesta as string)).toEqual({
        status: 201,
        cuerpo: MOVIMIENTO_REGISTRADO(operacion.idOperacion),
      });
      const recibida = Math.floor(
        Date.parse(elemento!.recibida_en as string) / 1000,
      );
      expect(recibida).toBeGreaterThanOrEqual(antes);
      expect(elemento!.expira_en).toBe(recibida + 30 * 24 * 3600);
    });

    it('procesa varias en orden y devuelve un resultado por operación', async () => {
      aceptarMovimientos();
      const operaciones = [movimiento(), movimiento(), movimiento()];
      const respuesta = await enviar({ operaciones }).expect(200);
      expect(
        respuesta.body.resultados.map(
          (r: { idOperacion: string }) => r.idOperacion,
        ),
      ).toEqual(operaciones.map((o) => o.idOperacion));
      expect(
        prueba.materiales.peticiones.map(
          (p) => (p.cuerpo as { id: string }).id,
        ),
      ).toEqual(operaciones.map((o) => o.idOperacion));
    });
  });

  describe('operación repetida', () => {
    it('en otro lote no vuelve a llamar al dueño y responde lo mismo con repetida: true', async () => {
      aceptarMovimientos();
      const operacion = movimiento();
      const primera = await enviar({ operaciones: [operacion] }).expect(200);
      const segunda = await enviar({ operaciones: [operacion] }).expect(200);

      expect(prueba.materiales.llamadas('POST', '/movimientos')).toBe(1);
      expect(segunda.body.resultados[0]).toEqual({
        ...primera.body.resultados[0],
        repetida: true,
      });
    });

    it('dos lotes a la vez con el mismo idOperacion: el dueño se llama una sola vez', async () => {
      aceptarMovimientos(300);
      const operacion = movimiento();
      const [a, b] = await Promise.all([
        enviar({ operaciones: [operacion] }),
        enviar({ operaciones: [operacion] }),
      ]);

      expect(prueba.materiales.llamadas('POST', '/movimientos')).toBe(1);
      const estados = [a.body.resultados[0], b.body.resultados[0]];
      expect(estados).toContainEqual(
        expect.objectContaining({ estado: 'PROCESADO', status: 201 }),
      );
      expect(estados).toContainEqual(
        expect.objectContaining({
          estado: 'REINTENTAR',
          status: 409,
          respuesta: expect.objectContaining({
            codigo: 'OPERACION_EN_PROCESO',
          }),
        }),
      );
    });
  });

  describe('rechazo del dueño', () => {
    it.each([
      [409, PERIODO_CERRADO],
      [
        422,
        {
          title: 'Regla',
          status: 422,
          codigo: 'MATERIAL_INACTIVO',
          detail: 'El material está inactivo.',
        },
      ],
    ])(
      '%i: guarda ERROR y al repetir lo devuelve sin llamar al dueño',
      async (status, cuerpo) => {
        prueba.materiales.definir('POST', '/movimientos', { status, cuerpo });
        const operacion = movimiento();

        const primera = await enviar({ operaciones: [operacion] }).expect(200);
        expect(primera.body.resultados[0]).toEqual({
          idOperacion: operacion.idOperacion,
          estado: 'ERROR',
          repetida: false,
          status,
          respuesta: cuerpo,
        });
        expect((await leer(operacion.idOperacion))?.estado).toBe('ERROR');

        const segunda = await enviar({ operaciones: [operacion] }).expect(200);
        expect(segunda.body.resultados[0]).toEqual({
          ...primera.body.resultados[0],
          repetida: true,
        });
        expect(prueba.materiales.llamadas('POST', '/movimientos')).toBe(1);
      },
    );
  });

  describe('falla que se reintenta', () => {
    it.each([
      [
        '503',
        { status: 503 },
        { status: 503, codigo: 'SERVICIO_NO_DISPONIBLE' },
      ],
      [
        'tiempo agotado',
        { status: 201, cuerpo: {}, demoraMs: 1500 },
        { status: 504, codigo: 'TIEMPO_AGOTADO' },
      ],
      [
        '401',
        { status: 401, cuerpo: { status: 401, codigo: 'NO_AUTENTICADO' } },
        { status: 401, codigo: 'TOKEN_VENCIDO' },
      ],
      [
        'error de red',
        { status: 201, cortar: true },
        { status: 503, codigo: 'SERVICIO_NO_DISPONIBLE' },
      ],
    ])(
      '%s: borra el elemento, responde REINTENTAR y el siguiente intento sí llama al dueño',
      async (_caso, falla, esperado) => {
        prueba.materiales.definir('POST', '/movimientos', falla);
        const operacion = movimiento();

        const primera = await enviar({ operaciones: [operacion] }).expect(200);
        expect(primera.body.resultados[0]).toMatchObject({
          idOperacion: operacion.idOperacion,
          estado: 'REINTENTAR',
          repetida: false,
          status: esperado.status,
          respuesta: { codigo: esperado.codigo },
        });
        expect(await leer(operacion.idOperacion)).toBeUndefined();

        aceptarMovimientos();
        const segunda = await enviar({ operaciones: [operacion] }).expect(200);
        expect(segunda.body.resultados[0]).toMatchObject({
          estado: 'PROCESADO',
          repetida: false,
          status: 201,
        });
        expect(prueba.materiales.llamadas('POST', '/movimientos')).toBe(2);
      },
    );
  });

  describe('PROCESANDO guardado de antes', () => {
    const guardarProcesando = async (
      idOperacion: string,
      actualizadaEn: Date,
      usuarioId = USUARIO_PRUEBA,
    ) => {
      await prueba.dynamo.documentos.send(
        new PutCommand({
          TableName: prueba.dynamo.tablas.operacionProcesada,
          Item: {
            id_operacion: idOperacion,
            id_dispositivo: DISPOSITIVO_PRUEBA,
            usuario_id: usuarioId,
            tipo: 'MOVIMIENTO_MATERIAL',
            servicio_destino: 'materiales',
            estado: 'PROCESANDO',
            recibida_en: actualizadaEn.toISOString(),
            actualizada_en: actualizadaEn.toISOString(),
            expira_en: Math.floor(actualizadaEn.getTime() / 1000) + 2592000,
          },
        }),
      );
    };

    it('de hace más de 60 s se retoma y se llama al dueño', async () => {
      aceptarMovimientos();
      const operacion = movimiento();
      await guardarProcesando(
        operacion.idOperacion,
        new Date(Date.now() - 61_000),
      );

      const respuesta = await enviar({ operaciones: [operacion] }).expect(200);

      expect(respuesta.body.resultados[0]).toMatchObject({
        estado: 'PROCESADO',
        repetida: false,
        status: 201,
      });
      expect(prueba.materiales.llamadas('POST', '/movimientos')).toBe(1);
      expect((await leer(operacion.idOperacion))?.estado).toBe('PROCESADO');
    });

    it('reciente no se retoma: REINTENTAR OPERACION_EN_PROCESO sin llamar al dueño', async () => {
      aceptarMovimientos();
      const operacion = movimiento();
      await guardarProcesando(
        operacion.idOperacion,
        new Date(Date.now() - 10_000),
      );

      const respuesta = await enviar({ operaciones: [operacion] }).expect(200);

      expect(respuesta.body.resultados[0]).toMatchObject({
        estado: 'REINTENTAR',
        status: 409,
        respuesta: { codigo: 'OPERACION_EN_PROCESO' },
      });
      expect(prueba.materiales.llamadas('POST', '/movimientos')).toBe(0);
      expect((await leer(operacion.idOperacion))?.estado).toBe('PROCESANDO');
    });
  });

  it('una operación de otro usuario → ERROR 403 OPERACION_AJENA sin la respuesta guardada', async () => {
    aceptarMovimientos();
    const operacion = movimiento();
    await enviar({ operaciones: [operacion] }).expect(200);

    const otro = await prueba.tokenAlmacenero(
      '22222222-2222-2222-2222-222222222222',
    );
    const respuesta = await enviar({ operaciones: [operacion] }, otro).expect(
      200,
    );

    expect(respuesta.body.resultados[0]).toEqual({
      idOperacion: operacion.idOperacion,
      estado: 'ERROR',
      repetida: false,
      status: 403,
      respuesta: expect.objectContaining({
        status: 403,
        codigo: 'OPERACION_AJENA',
      }),
    });
    expect(respuesta.body.resultados[0].respuesta).not.toHaveProperty(
      'periodo',
    );
    expect(prueba.materiales.llamadas('POST', '/movimientos')).toBe(1);
  });

  describe('lote inválido', () => {
    const esperarLoteInvalido = async (cuerpo: unknown) => {
      const respuesta = await enviar(cuerpo).expect(400);
      expect(respuesta.headers['content-type']).toMatch(
        /^application\/problem\+json/,
      );
      expect(respuesta.body).toMatchObject({
        status: 400,
        codigo: 'LOTE_INVALIDO',
      });
      expect(Array.isArray(respuesta.body.errores)).toBe(true);
      expect(prueba.materiales.peticiones).toHaveLength(0);
      return respuesta;
    };

    it('vacío', async () => {
      await esperarLoteInvalido({ operaciones: [] });
    });

    it('sin operaciones o con un cuerpo que no es objeto', async () => {
      await esperarLoteInvalido({});
      await esperarLoteInvalido([movimiento()]);
    });

    it('con más de 20 operaciones', async () => {
      await esperarLoteInvalido({
        operaciones: Array.from({ length: 21 }, () => movimiento()),
      });
    });

    it('con un idOperacion repetido dentro del lote', async () => {
      const operacion = movimiento();
      const respuesta = await esperarLoteInvalido({
        operaciones: [operacion, movimiento(), operacion],
      });
      expect(respuesta.body.errores).toContainEqual(
        expect.objectContaining({ campo: 'operaciones.2.idOperacion' }),
      );
    });

    it.each([
      ['idOperacion que no es UUID', { idOperacion: 'abc' }],
      ['creadaEn sin zona', { creadaEn: '2026-11-15T14:00:00' }],
      ['datos que no son objeto', { datos: [1, 2] }],
      ['sin tipo', { tipo: '' }],
    ])('con %s', async (_caso, cambio) => {
      await esperarLoteInvalido({
        operaciones: [{ ...movimiento(), ...cambio }],
      });
    });
  });

  it('un tipo desconocido → ERROR 400 TIPO_OPERACION_DESCONOCIDO, sin guardar ni llamar', async () => {
    aceptarMovimientos();
    const desconocida = { ...movimiento(), tipo: 'TIPO_INVENTADO' };
    const normal = movimiento();

    const respuesta = await enviar({
      operaciones: [desconocida, normal],
    }).expect(200);

    expect(respuesta.body.resultados[0]).toMatchObject({
      idOperacion: desconocida.idOperacion,
      estado: 'ERROR',
      repetida: false,
      status: 400,
      respuesta: { codigo: 'TIPO_OPERACION_DESCONOCIDO' },
    });
    expect(respuesta.body.resultados[1]).toMatchObject({
      estado: 'PROCESADO',
    });
    expect(await leer(desconocida.idOperacion)).toBeUndefined();
    expect(prueba.materiales.llamadas('POST', '/movimientos')).toBe(1);
  });

  it('idOperacion distinto de datos.id → ERROR 400 OPERACION_INVALIDA, sin guardar', async () => {
    const operacion = { ...movimiento(), idOperacion: randomUUID() };
    const respuesta = await enviar({ operaciones: [operacion] }).expect(200);
    expect(respuesta.body.resultados[0]).toMatchObject({
      estado: 'ERROR',
      status: 400,
      respuesta: { codigo: 'OPERACION_INVALIDA' },
    });
    expect(await leer(operacion.idOperacion)).toBeUndefined();
    expect(prueba.materiales.peticiones).toHaveLength(0);
  });

  it('actualiza estado_dispositivo con el usuario y la última sincronización', async () => {
    aceptarMovimientos();
    const antes = new Date().toISOString();
    await enviar({ operaciones: [movimiento()] }).expect(200);

    const { Item } = await prueba.dynamo.documentos.send(
      new GetCommand({
        TableName: prueba.dynamo.tablas.estadoDispositivo,
        Key: { id_dispositivo: DISPOSITIVO_PRUEBA },
        ConsistentRead: true,
      }),
    );
    expect(Item).toMatchObject({
      id_dispositivo: DISPOSITIVO_PRUEBA,
      usuario_id: USUARIO_PRUEBA,
    });
    expect(Item!.ultima_sincronizacion >= antes).toBe(true);
  });

  describe('token, rol y dispositivo', () => {
    it('sin token → 401', async () => {
      await request(prueba.app.getHttpServer())
        .post('/lotes')
        .set('X-Dispositivo-Id', DISPOSITIVO_PRUEBA)
        .send({ operaciones: [movimiento()] })
        .expect(401);
    });

    it.each([
      ['cliente', AZP.portal],
      ['residente', AZP.appObra],
    ])('con rol %s → 403', async (rol, azp) => {
      const otro = await prueba.claves.firmarConRoles([rol], azp);
      const respuesta = await enviar(
        { operaciones: [movimiento()] },
        otro,
      ).expect(403);
      expect(respuesta.body.codigo).toBe('SIN_PERMISO');
    });

    it('un maestro puede enviar lotes', async () => {
      aceptarMovimientos();
      const maestro = await prueba.claves.firmarConRoles(
        ['maestro'],
        AZP.appObra,
      );
      await enviar({ operaciones: [movimiento()] }, maestro).expect(200);
    });

    it('sin X-Dispositivo-Id → 400 DISPOSITIVO_REQUERIDO', async () => {
      const respuesta = await request(prueba.app.getHttpServer())
        .post('/lotes')
        .set('Authorization', `Bearer ${token}`)
        .send({ operaciones: [movimiento()] })
        .expect(400);
      expect(respuesta.body.codigo).toBe('DISPOSITIVO_REQUERIDO');
    });
  });
});

describe('POST /lotes con el presupuesto del lote agotado (e2e)', () => {
  let prueba: AppPrueba;

  beforeAll(async () => {
    prueba = await crearAppPrueba([LotesModule], {
      TIEMPO_MAXIMO_LOTE_MS: '500',
    });
  });

  afterAll(async () => {
    await prueba?.cerrar();
  });

  it('las operaciones que faltan vuelven REINTENTAR 504 sin llamar al dueño', async () => {
    prueba.materiales.definir('POST', '/movimientos', (peticion) => ({
      status: 201,
      cuerpo: MOVIMIENTO_REGISTRADO((peticion.cuerpo as { id: string }).id),
      demoraMs: 300,
    }));
    const operaciones = [
      movimiento(),
      movimiento(),
      movimiento(),
      movimiento(),
    ];

    const respuesta = await request(prueba.app.getHttpServer())
      .post('/lotes')
      .set('Authorization', `Bearer ${await prueba.tokenAlmacenero()}`)
      .set('X-Dispositivo-Id', DISPOSITIVO_PRUEBA)
      .send({ operaciones })
      .expect(200);

    // 0 ms: la 1.ª; 300 ms: la 2.ª; 600 ms (> 500): las demás no se empiezan.
    const estados = respuesta.body.resultados.map(
      (r: { estado: string; status: number }) => `${r.estado} ${r.status}`,
    );
    expect(estados).toEqual([
      'PROCESADO 201',
      'PROCESADO 201',
      'REINTENTAR 504',
      'REINTENTAR 504',
    ]);
    expect(respuesta.body.resultados[2].respuesta.codigo).toBe(
      'TIEMPO_AGOTADO',
    );
    expect(prueba.materiales.llamadas('POST', '/movimientos')).toBe(2);
  });
});
