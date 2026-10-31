import request from 'supertest';
import { PaqueteDatosModule } from '../src/paquete-datos/paquete-datos.module.js';
import {
  type AppPrueba,
  crearAppPrueba,
  DISPOSITIVO_PRUEBA,
} from './utilidades/app-prueba.js';
import { AZP } from './utilidades/tokens-prueba.js';

const OBRA_A = '9c9c9c9c-9999-4999-8999-999999999991';
const OBRA_B = '9c9c9c9c-9999-4999-8999-999999999992';

const entrada = (id: string, fecha: string, clima = 'SOLEADO') => ({
  id,
  obraId: OBRA_A,
  fecha,
  clima,
  texto: `Avance del ${fecha}.`,
  registradoPor: '11111111-1111-1111-1111-111111111111',
  registradoEn: `${fecha}T23:00:00.000000Z`,
});

function definirDuenios(prueba: AppPrueba) {
  prueba.obras.definir('GET', '/obras', {
    status: 200,
    cuerpo: [
      { id: OBRA_A, nombre: 'Obra A', ubicacion: 'A' },
      { id: OBRA_B, nombre: 'Obra B', ubicacion: 'B' },
    ],
  });
  for (const id of [OBRA_A, OBRA_B]) {
    prueba.obras.definir('GET', `/obras/${id}`, {
      status: 200,
      cuerpo: { id, partidas: [] },
    });
    prueba.materiales.definir('GET', `/obras/${id}/stock`, {
      status: 200,
      cuerpo: [],
    });
  }
  prueba.materiales.definir('GET', '/materiales', {
    status: 200,
    cuerpo: { items: [], total: 0, pagina: 1, tamano: 100 },
  });
  // De la más reciente a la más antigua, como responde Obras
  prueba.obras.definir('GET', `/obras/${OBRA_A}/diario`, {
    status: 200,
    cuerpo: [
      entrada('e2', '2026-11-15', 'LLUVIA_LEVE'),
      entrada('e1', '2026-11-14'),
    ],
  });
  // La obra B: Obras no deja ver el diario (por ejemplo, el maestro no está asignado)
  prueba.obras.definir('GET', `/obras/${OBRA_B}/diario`, {
    status: 404,
    cuerpo: { status: 404, codigo: 'OBRA_NO_ENCONTRADA' },
  });
}

// Necesita DynamoDB Local (infra: docker compose up -d dynamodb).
describe('GET /paquete-datos con el diario de obra (103, e2e)', () => {
  let prueba: AppPrueba;
  let maestro: string;

  beforeAll(async () => {
    prueba = await crearAppPrueba([PaqueteDatosModule]);
    maestro = await prueba.claves.firmarConRoles(['maestro'], AZP.appObra);
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

  const pedir = (token: string) =>
    request(prueba.app.getHttpServer())
      .get('/paquete-datos')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Dispositivo-Id', DISPOSITIVO_PRUEBA);

  it('el maestro recibe el diario de cada obra con id, fecha, clima y texto', async () => {
    const respuesta = await pedir(maestro).expect(200);
    const [obraA, obraB] = respuesta.body.obras;
    expect(obraA.diario).toEqual([
      {
        id: 'e1',
        fecha: '2026-11-14',
        clima: 'SOLEADO',
        texto: 'Avance del 2026-11-14.',
      },
      {
        id: 'e2',
        fecha: '2026-11-15',
        clima: 'LLUVIA_LEVE',
        texto: 'Avance del 2026-11-15.',
      },
    ]);
    // 404 de Obras para esa obra → diario vacío, sin fallar el paquete
    expect(obraB.diario).toEqual([]);
    const peticion = prueba.obras.peticiones.find(
      (p) => p.ruta === `/obras/${OBRA_A}/diario`,
    );
    expect(peticion?.encabezados.authorization).toBe(`Bearer ${maestro}`);
    // Sin desde ni hasta: Obras devuelve los últimos 30 días
    expect([...peticion!.consulta.keys()]).toEqual([]);
  });

  it('un 403 de Obras para el diario también va vacío', async () => {
    prueba.obras.definir('GET', `/obras/${OBRA_A}/diario`, {
      status: 403,
      cuerpo: { status: 403, codigo: 'SIN_PERMISO' },
    });
    const respuesta = await pedir(maestro).expect(200);
    expect(respuesta.body.obras[0].diario).toEqual([]);
  });

  it('el almacenero no recibe el campo diario y no se pide a Obras', async () => {
    const almacenero = await prueba.tokenAlmacenero();
    const respuesta = await pedir(almacenero).expect(200);
    for (const obra of respuesta.body.obras) {
      expect(obra).not.toHaveProperty('diario');
    }
    expect(
      prueba.obras.peticiones.filter((p) => p.ruta.endsWith('/diario')),
    ).toHaveLength(0);
  });

  it('con los roles maestro y almacenero sí lo recibe', async () => {
    const ambos = await prueba.claves.firmarConRoles(
      ['maestro', 'almacenero'],
      AZP.appObra,
    );
    const respuesta = await pedir(ambos).expect(200);
    expect(respuesta.body.obras[0].diario).toHaveLength(2);
  });

  it('una entrada nueva del diario cambia la versión', async () => {
    const primera = await pedir(maestro).expect(200);
    prueba.obras.definir('GET', `/obras/${OBRA_A}/diario`, {
      status: 200,
      cuerpo: [
        entrada('e3', '2026-11-16'),
        entrada('e2', '2026-11-15', 'LLUVIA_LEVE'),
        entrada('e1', '2026-11-14'),
      ],
    });
    const segunda = await pedir(maestro)
      .set('If-None-Match', primera.headers.etag)
      .expect(200);
    expect(segunda.body.versionDatos).not.toBe(primera.body.versionDatos);
  });

  it('si Obras falla con el diario (5xx) → 503 SERVICIO_NO_DISPONIBLE', async () => {
    prueba.obras.definir('GET', `/obras/${OBRA_A}/diario`, { status: 500 });
    const respuesta = await pedir(maestro).expect(503);
    expect(respuesta.body.codigo).toBe('SERVICIO_NO_DISPONIBLE');
  });
});
