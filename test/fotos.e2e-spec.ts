import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { FotosModule } from '../src/fotos/fotos.module.js';
import {
  type AppPrueba,
  crearAppPrueba,
  DISPOSITIVO_PRUEBA,
} from './utilidades/app-prueba.js';
import { AZP } from './utilidades/tokens-prueba.js';

const OBRA = '5e5e5e5e-5555-4555-8555-555555555555';

// Obras simulado; no usa DynamoDB, pero la app de prueba lo levanta (DynamoDB Local).
describe('POST /fotos/url-subida (e2e)', () => {
  let prueba: AppPrueba;
  let token: string;

  beforeAll(async () => {
    prueba = await crearAppPrueba([FotosModule], {
      TIEMPO_MAXIMO_LLAMADA_MS: '400',
    });
    token = await prueba.claves.firmarConRoles(['maestro'], AZP.appObra);
  });

  afterEach(() => {
    prueba.obras.limpiar();
  });

  afterAll(async () => {
    await prueba?.cerrar();
  });

  const pedir = (
    cuerpo: unknown = { obraId: OBRA, fotoId: randomUUID() },
    conToken = token,
  ) =>
    request(prueba.app.getHttpServer())
      .post('/fotos/url-subida')
      .set('Authorization', `Bearer ${conToken}`)
      .set('X-Dispositivo-Id', DISPOSITIVO_PRUEBA)
      .set('X-Request-Id', 'req-foto')
      .send(cuerpo as object);

  const RUTA = `/obras/${OBRA}/fotos/url-subida`;

  it('reenvía a Obras con el token y devuelve su respuesta tal cual', async () => {
    const fotoId = randomUUID();
    const url = {
      url: 'https://supervision-dev.s3.amazonaws.com/fotos/x?firma',
      claveArchivo: `fotos/${OBRA}/${fotoId}.jpg`,
      expiraEn: '2026-11-15T15:30:00Z',
    };
    prueba.obras.definir('POST', RUTA, { status: 200, cuerpo: url });

    const respuesta = await pedir({ obraId: OBRA, fotoId }).expect(200);

    expect(respuesta.body).toEqual(url);
    const [peticion] = prueba.obras.peticiones;
    expect(peticion.cuerpo).toEqual({ fotoId });
    expect(peticion.encabezados.authorization).toBe(`Bearer ${token}`);
    expect(peticion.encabezados['x-request-id']).toBe('req-foto');
  });

  it.each([
    [403, 'SIN_PERMISO'],
    [404, 'OBRA_NO_ENCONTRADA'],
    [422, 'REGLA_DE_PRUEBA'],
    [400, 'DATOS_INVALIDOS'],
  ])(
    '%i de Obras se devuelve con el mismo status y codigo',
    async (status, codigo) => {
      prueba.obras.definir('POST', RUTA, {
        status,
        cuerpo: { title: 'x', status, codigo, detail: 'Detalle de Obras.' },
      });
      const respuesta = await pedir().expect(status);
      expect(respuesta.headers['content-type']).toMatch(
        /^application\/problem\+json/,
      );
      expect(respuesta.body).toMatchObject({
        status,
        codigo,
        detail: 'Detalle de Obras.',
      });
    },
  );

  it.each([500, 503])(
    '%i de Obras → 503 SERVICIO_NO_DISPONIBLE',
    async (status) => {
      prueba.obras.definir('POST', RUTA, {
        status,
        cuerpo: { status, codigo: 'SERVICIO_NO_DISPONIBLE' },
      });
      const respuesta = await pedir().expect(503);
      expect(respuesta.body.codigo).toBe('SERVICIO_NO_DISPONIBLE');
    },
  );

  it('error de red → 503', async () => {
    prueba.obras.definir('POST', RUTA, { status: 200, cortar: true });
    const respuesta = await pedir().expect(503);
    expect(respuesta.body.codigo).toBe('SERVICIO_NO_DISPONIBLE');
  });

  it('tiempo agotado → 504 TIEMPO_AGOTADO', async () => {
    prueba.obras.definir('POST', RUTA, {
      status: 200,
      cuerpo: {},
      demoraMs: 1500,
    });
    const respuesta = await pedir().expect(504);
    expect(respuesta.body.codigo).toBe('TIEMPO_AGOTADO');
  });

  it.each([
    ['sin fotoId', { obraId: OBRA }],
    ['obraId que no es UUID', { obraId: 'abc', fotoId: randomUUID() }],
  ])('%s → 400 DATOS_INVALIDOS sin llamar a Obras', async (_caso, cuerpo) => {
    const respuesta = await pedir(cuerpo).expect(400);
    expect(respuesta.body.codigo).toBe('DATOS_INVALIDOS');
    expect(prueba.obras.peticiones).toHaveLength(0);
  });

  it('no guarda nada en DynamoDB', async () => {
    prueba.obras.definir('POST', RUTA, { status: 200, cuerpo: {} });
    await pedir().expect(200);
    const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
    for (const tabla of Object.values(prueba.dynamo.tablas)) {
      const { Count } = await prueba.dynamo.documentos.send(
        new ScanCommand({ TableName: tabla }),
      );
      expect(Count).toBe(0);
    }
  });

  describe('token, rol y dispositivo', () => {
    it('sin token → 401', async () => {
      await request(prueba.app.getHttpServer())
        .post('/fotos/url-subida')
        .set('X-Dispositivo-Id', DISPOSITIVO_PRUEBA)
        .send({ obraId: OBRA, fotoId: randomUUID() })
        .expect(401);
    });

    it.each([
      ['almacenero', AZP.appObra],
      ['cliente', AZP.portal],
    ])('con rol %s → 403 sin llamar a Obras', async (rol, azp) => {
      const otro = await prueba.claves.firmarConRoles([rol], azp);
      const respuesta = await pedir(undefined, otro).expect(403);
      expect(respuesta.body.codigo).toBe('SIN_PERMISO');
      expect(prueba.obras.peticiones).toHaveLength(0);
    });

    it('sin X-Dispositivo-Id → 400 DISPOSITIVO_REQUERIDO', async () => {
      const respuesta = await request(prueba.app.getHttpServer())
        .post('/fotos/url-subida')
        .set('Authorization', `Bearer ${token}`)
        .send({ obraId: OBRA, fotoId: randomUUID() })
        .expect(400);
      expect(respuesta.body.codigo).toBe('DISPOSITIVO_REQUERIDO');
    });
  });
});
