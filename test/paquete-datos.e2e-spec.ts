import { GetCommand } from '@aws-sdk/lib-dynamodb';
import request from 'supertest';
import { PaqueteDatosModule } from '../src/paquete-datos/paquete-datos.module.js';
import {
  type AppPrueba,
  crearAppPrueba,
  DISPOSITIVO_PRUEBA,
  USUARIO_PRUEBA,
} from './utilidades/app-prueba.js';
import { AZP } from './utilidades/tokens-prueba.js';

const OBRA_A = '1a1a1a1a-1111-4111-8111-111111111111';
const OBRA_B = '2b2b2b2b-2222-4222-8222-222222222222';

/** Respuestas de Obras y Materiales con más campos de los que copia el paquete. */
function definirDuenios(prueba: AppPrueba, cantidadCemento = 120) {
  prueba.obras.definir('GET', '/obras', {
    status: 200,
    cuerpo: [
      {
        id: OBRA_B,
        nombre: 'Edificio Las Palmas',
        ubicacion: 'Av. Banzer 4to anillo',
        estado: 'EN_EJECUCION',
        avancePct: 32.5,
        ultimaPlanilla: null,
      },
      {
        id: OBRA_A,
        nombre: 'Condominio Las Lomas',
        ubicacion: 'Urubó',
        estado: 'EN_EJECUCION',
        avancePct: 10,
        ultimaPlanilla: null,
      },
    ],
  });
  for (const id of [OBRA_A, OBRA_B]) {
    prueba.obras.definir('GET', `/obras/${id}`, {
      status: 200,
      cuerpo: {
        id,
        nombre: 'x',
        contrato: { monto: 1250000 },
        partidas: [
          {
            id: `${id.slice(0, 8)}-p2`,
            codigo: 'P-02',
            nombre: 'Muro de ladrillo',
            unidad: 'm2',
            precioUnitario: 120,
            insumos: [],
          },
          {
            id: `${id.slice(0, 8)}-p1`,
            codigo: 'P-01',
            nombre: 'Losa de hormigón armado',
            unidad: 'm2',
            precioUnitario: 420.5,
            insumos: [],
          },
        ],
      },
    });
  }
  prueba.materiales.definir('GET', `/obras/${OBRA_B}/stock`, {
    status: 200,
    cuerpo: [
      {
        materialId: 'CEM-IP30',
        codigo: 'CEM-IP30',
        nombre: 'Cemento',
        unidad: 'bolsa',
        unidadPlural: 'bolsas',
        cantidad: cantidadCemento,
        minimo: 100,
        estado: 'JUSTO',
      },
    ],
  });
  // La obra A todavía no llegó a Materiales (ObraRegistrada pendiente).
  prueba.materiales.definir('GET', `/obras/${OBRA_A}/stock`, {
    status: 404,
    cuerpo: { status: 404, codigo: 'OBRA_NO_ENCONTRADA' },
  });
  prueba.materiales.definir('GET', '/materiales', {
    status: 200,
    cuerpo: {
      items: [
        {
          id: 'CEM-IP30',
          codigo: 'CEM-IP30',
          nombre: 'Cemento IP-30',
          tipo: 'CEMENTO',
          unidad: 'bolsa',
          unidadPlural: 'bolsas',
          precioReferencial: 62,
          activo: true,
          atributos: [],
        },
      ],
      total: 1,
      pagina: 1,
      tamano: 100,
    },
  });
}

// Necesita DynamoDB Local (infra: docker compose up -d dynamodb).
describe('GET /paquete-datos (e2e)', () => {
  let prueba: AppPrueba;
  let token: string;

  beforeAll(async () => {
    prueba = await crearAppPrueba([PaqueteDatosModule], {
      TIEMPO_MAXIMO_LLAMADA_MS: '400',
    });
    token = await prueba.tokenAlmacenero();
  });

  beforeEach(() => {
    definirDuenios(prueba);
  });

  afterEach(() => {
    prueba.obras.limpiar();
    prueba.materiales.limpiar();
  });

  afterAll(async () => {
    await prueba?.cerrar();
  });

  const pedir = (ruta = '/paquete-datos', conToken = token) =>
    request(prueba.app.getHttpServer())
      .get(ruta)
      .set('Authorization', `Bearer ${conToken}`)
      .set('X-Dispositivo-Id', DISPOSITIVO_PRUEBA)
      .set('X-Request-Id', 'req-paquete');

  it('arma el paquete con solo los campos livianos, ordenado por id, con ETag', async () => {
    const respuesta = await pedir().expect(200);

    expect(respuesta.headers.etag).toBe(`"${respuesta.body.versionDatos}"`);
    expect(respuesta.body.versionDatos).toMatch(/^[0-9a-f]{64}$/);
    expect(Date.parse(respuesta.body.generadoEn)).not.toBeNaN();
    expect(respuesta.body.obras).toEqual([
      {
        id: OBRA_A,
        nombre: 'Condominio Las Lomas',
        ubicacion: 'Urubó',
        partidas: [
          {
            id: '1a1a1a1a-p1',
            codigo: 'P-01',
            nombre: 'Losa de hormigón armado',
            unidad: 'm2',
          },
          {
            id: '1a1a1a1a-p2',
            codigo: 'P-02',
            nombre: 'Muro de ladrillo',
            unidad: 'm2',
          },
        ],
        // 404 de Materiales: obra recién registrada
        stock: [],
      },
      {
        id: OBRA_B,
        nombre: 'Edificio Las Palmas',
        ubicacion: 'Av. Banzer 4to anillo',
        partidas: [
          {
            id: '2b2b2b2b-p1',
            codigo: 'P-01',
            nombre: 'Losa de hormigón armado',
            unidad: 'm2',
          },
          {
            id: '2b2b2b2b-p2',
            codigo: 'P-02',
            nombre: 'Muro de ladrillo',
            unidad: 'm2',
          },
        ],
        stock: [
          {
            materialId: 'CEM-IP30',
            cantidad: 120,
            minimo: 100,
            estado: 'JUSTO',
          },
        ],
      },
    ]);
    expect(respuesta.body.materiales).toEqual([
      {
        id: 'CEM-IP30',
        codigo: 'CEM-IP30',
        nombre: 'Cemento IP-30',
        unidad: 'bolsa',
        unidadPlural: 'bolsas',
      },
    ]);
  });

  it('pide a Obras y Materiales con el token del usuario y el X-Request-Id', async () => {
    await pedir().expect(200);
    const [listaObras] = prueba.obras.peticiones;
    expect(listaObras.consulta.get('estado')).toBe('EN_EJECUCION');
    for (const peticion of [
      ...prueba.obras.peticiones,
      ...prueba.materiales.peticiones,
    ]) {
      expect(peticion.encabezados.authorization).toBe(`Bearer ${token}`);
      expect(peticion.encabezados['x-request-id']).toBe('req-paquete');
    }
    const materiales = prueba.materiales.peticiones.find(
      (p) => p.ruta === '/materiales',
    );
    expect(materiales?.consulta.get('soloActivos')).toBe('true');
  });

  it('con If-None-Match de la misma versión responde 304 sin cuerpo', async () => {
    const primera = await pedir().expect(200);
    const segunda = await pedir()
      .set('If-None-Match', primera.headers.etag)
      .expect(304);
    expect(segunda.text ?? '').toBe('');
    expect(segunda.headers.etag).toBe(primera.headers.etag);
  });

  it('con otra versión en If-None-Match responde 200', async () => {
    await pedir().set('If-None-Match', '"otra-version"').expect(200);
  });

  it('si cambia el stock la versión es distinta', async () => {
    const primera = await pedir().expect(200);
    prueba.materiales.limpiar();
    prueba.obras.limpiar();
    definirDuenios(prueba, 107.5);
    const segunda = await pedir()
      .set('If-None-Match', primera.headers.etag)
      .expect(200);
    expect(segunda.body.versionDatos).not.toBe(primera.body.versionDatos);
  });

  it('la versión no depende de generadoEn', async () => {
    const primera = await pedir().expect(200);
    await new Promise((resolver) => setTimeout(resolver, 5));
    const segunda = await pedir().expect(200);
    expect(segunda.body.versionDatos).toBe(primera.body.versionDatos);
  });

  it('pide todas las páginas de materiales activos', async () => {
    const material = (n: number) => ({
      id: `MAT-${String(n).padStart(3, '0')}`,
      codigo: `MAT-${n}`,
      nombre: `Material ${n}`,
      unidad: 'u',
      unidadPlural: 'u',
    });
    prueba.materiales.definir('GET', '/materiales', (peticion) => {
      const pagina = Number(peticion.consulta.get('pagina'));
      const desde = (pagina - 1) * 100;
      const items = Array.from(
        { length: Math.max(0, Math.min(100, 150 - desde)) },
        (_, i) => material(desde + i + 1),
      );
      return {
        status: 200,
        cuerpo: { items, total: 150, pagina, tamano: 100 },
      };
    });
    const respuesta = await pedir().expect(200);
    expect(respuesta.body.materiales).toHaveLength(150);
    expect(prueba.materiales.llamadas('GET', '/materiales')).toBe(2);
  });

  it.each([
    ['Obras falla al listar', 'obras', 'GET', '/obras', { status: 500 }],
    [
      'Obras falla con una obra',
      'obras',
      'GET',
      `/obras/${OBRA_B}`,
      { status: 503 },
    ],
    [
      'Materiales falla con el stock',
      'materiales',
      'GET',
      `/obras/${OBRA_B}/stock`,
      { status: 500 },
    ],
    [
      'Materiales falla con el catálogo',
      'materiales',
      'GET',
      '/materiales',
      { status: 502 },
    ],
    [
      'Materiales corta la conexión',
      'materiales',
      'GET',
      '/materiales',
      { status: 200, cortar: true },
    ],
    [
      'Obras responde otra forma',
      'obras',
      'GET',
      '/obras',
      { status: 200, cuerpo: { items: [] } },
    ],
  ] as const)(
    '%s → 503 SERVICIO_NO_DISPONIBLE',
    async (_caso, servicio, metodo, ruta, falla) => {
      prueba[servicio].definir(metodo, ruta, { ...falla });
      const respuesta = await pedir().expect(503);
      expect(respuesta.headers['content-type']).toMatch(
        /^application\/problem\+json/,
      );
      expect(respuesta.body).toMatchObject({
        status: 503,
        codigo: 'SERVICIO_NO_DISPONIBLE',
      });
      expect(respuesta.headers.etag).toBeUndefined();
    },
  );

  it('si Materiales tarda más que el tiempo máximo → 504 TIEMPO_AGOTADO', async () => {
    prueba.materiales.definir('GET', `/obras/${OBRA_B}/stock`, {
      status: 200,
      cuerpo: [],
      demoraMs: 1500,
    });
    const respuesta = await pedir().expect(504);
    expect(respuesta.body).toMatchObject({
      status: 504,
      codigo: 'TIEMPO_AGOTADO',
    });
  });

  it('actualiza estado_dispositivo con usuario, obra activa, versión y fecha', async () => {
    const respuesta = await pedir(
      `/paquete-datos?obraActivaId=${OBRA_B}`,
    ).expect(200);
    const { Item } = await prueba.dynamo.documentos.send(
      new GetCommand({
        TableName: prueba.dynamo.tablas.estadoDispositivo,
        Key: { id_dispositivo: DISPOSITIVO_PRUEBA },
        ConsistentRead: true,
      }),
    );
    expect(Item).toEqual({
      id_dispositivo: DISPOSITIVO_PRUEBA,
      usuario_id: USUARIO_PRUEBA,
      obra_id: OBRA_B,
      version_datos: respuesta.body.versionDatos,
      ultima_sincronizacion: respuesta.body.generadoEn,
    });

    // Sin obraActivaId conserva la obra guardada.
    await pedir().expect(200);
    const despues = await prueba.dynamo.documentos.send(
      new GetCommand({
        TableName: prueba.dynamo.tablas.estadoDispositivo,
        Key: { id_dispositivo: DISPOSITIVO_PRUEBA },
        ConsistentRead: true,
      }),
    );
    expect(despues.Item?.obra_id).toBe(OBRA_B);
  });

  it('obraActivaId que no es UUID → 400 DATOS_INVALIDOS', async () => {
    const respuesta = await pedir('/paquete-datos?obraActivaId=abc').expect(
      400,
    );
    expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
  });

  describe('token, rol y dispositivo', () => {
    it('sin token → 401', async () => {
      await request(prueba.app.getHttpServer())
        .get('/paquete-datos')
        .set('X-Dispositivo-Id', DISPOSITIVO_PRUEBA)
        .expect(401);
    });

    it.each([
      ['cliente', AZP.portal],
      ['residente', AZP.appObra],
    ])('con rol %s → 403', async (rol, azp) => {
      const otro = await prueba.claves.firmarConRoles([rol], azp);
      const respuesta = await pedir('/paquete-datos', otro).expect(403);
      expect(respuesta.body.codigo).toBe('SIN_PERMISO');
      expect(prueba.obras.peticiones).toHaveLength(0);
    });

    it('un maestro recibe su paquete', async () => {
      const maestro = await prueba.claves.firmarConRoles(
        ['maestro'],
        AZP.appObra,
      );
      await pedir('/paquete-datos', maestro).expect(200);
    });

    it('sin X-Dispositivo-Id → 400 DISPOSITIVO_REQUERIDO', async () => {
      const respuesta = await request(prueba.app.getHttpServer())
        .get('/paquete-datos')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
      expect(respuesta.body.codigo).toBe('DISPOSITIVO_REQUERIDO');
    });
  });
});
