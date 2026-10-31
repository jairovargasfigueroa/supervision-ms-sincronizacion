import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { LotesModule } from '../src/lotes/lotes.module.js';
import { PaqueteDatosModule } from '../src/paquete-datos/paquete-datos.module.js';
import {
  type AppPrueba,
  crearAppPrueba,
  DISPOSITIVO_PRUEBA,
} from './utilidades/app-prueba.js';

// Necesita DynamoDB Local (infra: docker compose up -d dynamodb).
describe('gzip y límite del cuerpo (e2e)', () => {
  let prueba: AppPrueba;
  let token: string;

  beforeAll(async () => {
    prueba = await crearAppPrueba([LotesModule, PaqueteDatosModule]);
    token = await prueba.tokenAlmacenero();
  });

  afterEach(() => {
    prueba.obras.limpiar();
    prueba.materiales.limpiar();
  });

  afterAll(async () => {
    await prueba?.cerrar();
  });

  const definirPaqueteGrande = () => {
    prueba.obras.definir('GET', '/obras', { status: 200, cuerpo: [] });
    prueba.materiales.definir('GET', '/materiales', {
      status: 200,
      cuerpo: {
        items: Array.from({ length: 50 }, (_, i) => ({
          id: `MAT-${i}`,
          codigo: `MAT-${i}`,
          nombre: `Material de construcción número ${i}`,
          unidad: 'bolsa',
          unidadPlural: 'bolsas',
        })),
        total: 50,
        pagina: 1,
        tamano: 100,
      },
    });
  };

  const pedirPaquete = (encoding?: string) => {
    const peticion = request(prueba.app.getHttpServer())
      .get('/paquete-datos')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Dispositivo-Id', DISPOSITIVO_PRUEBA);
    if (encoding) peticion.set('Accept-Encoding', encoding);
    return peticion;
  };

  it('con Accept-Encoding: gzip responde comprimido', async () => {
    definirPaqueteGrande();
    const respuesta = await pedirPaquete('gzip').expect(200);
    expect(respuesta.headers['content-encoding']).toBe('gzip');
    // supertest descomprime: el cuerpo llega ya leído
    const paquete = respuesta.body;
    expect(paquete.materiales).toHaveLength(50);
    expect(respuesta.headers.etag).toBe(`"${paquete.versionDatos}"`);
  });

  it('sin Accept-Encoding responde sin comprimir', async () => {
    definirPaqueteGrande();
    const respuesta = await pedirPaquete('identity').expect(200);
    expect(respuesta.headers['content-encoding']).toBeUndefined();
    expect(respuesta.body.materiales).toHaveLength(50);
  });

  const lote = (tamanoRelleno: number) => {
    const id = randomUUID();
    return {
      operaciones: [
        {
          idOperacion: id,
          tipo: 'MOVIMIENTO_MATERIAL',
          creadaEn: '2026-11-15T14:00:00Z',
          datos: { id, relleno: 'x'.repeat(tamanoRelleno) },
        },
      ],
    };
  };

  const enviarLote = (cuerpo: unknown) =>
    request(prueba.app.getHttpServer())
      .post('/lotes')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Dispositivo-Id', DISPOSITIVO_PRUEBA)
      .send(cuerpo as object);

  it('POST /lotes con más de 256 KB → 413 ARCHIVO_DEMASIADO_GRANDE sin llamar al dueño', async () => {
    const respuesta = await enviarLote(lote(256 * 1024)).expect(413);
    expect(respuesta.headers['content-type']).toMatch(
      /^application\/problem\+json/,
    );
    expect(respuesta.body).toMatchObject({
      status: 413,
      codigo: 'ARCHIVO_DEMASIADO_GRANDE',
    });
    expect(prueba.materiales.peticiones).toHaveLength(0);
  });

  it('POST /lotes cerca de los 256 KB se acepta', async () => {
    prueba.materiales.definir('POST', '/movimientos', {
      status: 201,
      cuerpo: { periodo: '2026-11' },
    });
    const respuesta = await enviarLote(lote(250 * 1024)).expect(200);
    expect(respuesta.body.resultados[0].estado).toBe('PROCESADO');
  });

  it('un JSON mal escrito → 400 con Problem Details', async () => {
    const respuesta = await request(prueba.app.getHttpServer())
      .post('/lotes')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Dispositivo-Id', DISPOSITIVO_PRUEBA)
      .set('Content-Type', 'application/json')
      .send('{"operaciones": [')
      .expect(400);
    expect(respuesta.headers['content-type']).toMatch(
      /^application\/problem\+json/,
    );
    expect(respuesta.body.status).toBe(400);
  });
});
