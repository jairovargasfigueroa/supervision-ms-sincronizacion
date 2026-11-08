import { Controller, Get, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CompartidoModule } from '../src/compartido/compartido.module.js';
import { Roles } from '../src/compartido/infraestructura/auth/roles.decorator.js';
import { UsuarioActual } from '../src/compartido/infraestructura/auth/usuario-actual.decorator.js';
import type { UsuarioAutenticado } from '../src/compartido/infraestructura/auth/usuario-autenticado.js';
import { CONJUNTO_CLAVES } from '../src/compartido/infraestructura/auth/validador-token.js';
import { Dispositivo } from '../src/compartido/infraestructura/http/dispositivo.decorator.js';
import { RequestId } from '../src/compartido/infraestructura/http/request-id.decorator.js';
import { SaludModule } from '../src/salud/salud.module.js';
import {
  AZP,
  CONFIG_PRUEBA,
  crearClavesPrueba,
  type ClavesPrueba,
} from './utilidades/tokens-prueba.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DISPOSITIVO = '5b3f2c1e-8d4a-4f6b-9c2e-1a2b3c4d5e6f';

/** Ruta solo de la prueba, con los mismos roles que las rutas del negocio. */
@Controller('prueba')
class PruebaController {
  @Roles('maestro', 'almacenero')
  @Get()
  responder(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Dispositivo() idDispositivo: string,
    @RequestId() requestId: string,
  ) {
    return { usuarioId: usuario.id, idDispositivo, requestId };
  }
}

// Sin DynamoDB ni Keycloak: el JWKS se cambia por uno local con una clave generada en la prueba.
describe('Salud, token, rol y encabezados (e2e)', () => {
  let app: INestApplication;
  let claves: ClavesPrueba;

  beforeAll(async () => {
    claves = await crearClavesPrueba();
    const modulo = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => CONFIG_PRUEBA],
        }),
        CompartidoModule,
        SaludModule,
      ],
      controllers: [PruebaController],
    })
      .overrideProvider(CONJUNTO_CLAVES)
      .useValue(claves.jwks)
      .compile();
    app = modulo.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const pedir = (token?: string, dispositivo: string | null = DISPOSITIVO) => {
    const peticion = request(app.getHttpServer()).get('/prueba');
    if (token) peticion.set('Authorization', `Bearer ${token}`);
    if (dispositivo !== null) peticion.set('X-Dispositivo-Id', dispositivo);
    return peticion;
  };

  const esperarProblema = (
    respuesta: request.Response,
    status: number,
    codigo: string,
  ) => {
    expect(respuesta.status).toBe(status);
    expect(respuesta.headers['content-type']).toMatch(
      /^application\/problem\+json/,
    );
    expect(respuesta.body).toMatchObject({
      type: 'about:blank',
      status,
      codigo,
    });
    expect(typeof respuesta.body.title).toBe('string');
  };

  describe('GET /salud', () => {
    it('responde 200 sin token ni X-Dispositivo-Id', async () => {
      await request(app.getHttpServer())
        .get('/salud')
        .expect(200, { estado: 'ok' });
    });

    it('responde 200 aunque llegue un token inválido', async () => {
      await request(app.getHttpServer())
        .get('/salud')
        .set('Authorization', 'Bearer basura')
        .expect(200, { estado: 'ok' });
    });
  });

  describe('token', () => {
    it('sin token responde 401 NO_AUTENTICADO', async () => {
      esperarProblema(await pedir(), 401, 'NO_AUTENTICADO');
    });

    it('un token firmado con otra clave responde 401', async () => {
      const token = await claves.firmarConOtraClave();
      esperarProblema(await pedir(token), 401, 'NO_AUTENTICADO');
    });

    it('un token de otro emisor responde 401', async () => {
      const token = await claves.firmar({ emisor: 'http://otro/realms/x' });
      esperarProblema(await pedir(token), 401, 'NO_AUTENTICADO');
    });

    it('un token con otra audiencia responde 401', async () => {
      const token = await claves.firmar({ audiencia: 'otra-api' });
      esperarProblema(await pedir(token), 401, 'NO_AUTENTICADO');
    });

    it('un token vencido responde 401', async () => {
      const token = await claves.firmarConRoles(['maestro'], AZP.appObra, {
        venceEn: -60,
      });
      esperarProblema(await pedir(token), 401, 'NO_AUTENTICADO');
    });

    it('una ruta que no existe responde 401 sin token y 404 con token', async () => {
      const sinToken = await request(app.getHttpServer()).get('/no-existe');
      esperarProblema(sinToken, 401, 'NO_AUTENTICADO');
      const token = await claves.firmarConRoles(['maestro'], AZP.appObra);
      const conToken = await request(app.getHttpServer())
        .get('/no-existe')
        .set('Authorization', `Bearer ${token}`);
      esperarProblema(conToken, 404, 'RUTA_NO_ENCONTRADA');
    });
  });

  describe('rol', () => {
    it.each([
      ['maestro', AZP.appObra],
      ['almacenero', AZP.appObra],
    ])('%s desde la app responde 200', async (rol, azp) => {
      const token = await claves.firmarConRoles([rol], azp);
      const respuesta = await pedir(token).expect(200);
      expect(respuesta.body.usuarioId).toBe(
        '11111111-1111-1111-1111-111111111111',
      );
    });

    it.each([
      ['cliente', AZP.portal],
      ['residente', AZP.appObra],
      ['admin', AZP.erp],
    ])('%s responde 403 SIN_PERMISO', async (rol, azp) => {
      const token = await claves.firmarConRoles([rol], azp);
      esperarProblema(await pedir(token), 403, 'SIN_PERMISO');
    });

    it('un maestro que entra desde el portal no cuenta como maestro (403)', async () => {
      const token = await claves.firmarConRoles(
        ['maestro', 'cliente'],
        AZP.portal,
      );
      esperarProblema(await pedir(token), 403, 'SIN_PERMISO');
    });
  });

  describe('X-Dispositivo-Id', () => {
    it('sin el encabezado responde 400 DISPOSITIVO_REQUERIDO', async () => {
      const token = await claves.firmarConRoles(['almacenero'], AZP.appObra);
      esperarProblema(await pedir(token, null), 400, 'DISPOSITIVO_REQUERIDO');
    });

    it('con un valor que no es UUID responde 400 DISPOSITIVO_REQUERIDO', async () => {
      const token = await claves.firmarConRoles(['almacenero'], AZP.appObra);
      esperarProblema(
        await pedir(token, 'celular-1'),
        400,
        'DISPOSITIVO_REQUERIDO',
      );
    });

    it('se comprueba después del token y del rol', async () => {
      esperarProblema(await pedir(undefined, null), 401, 'NO_AUTENTICADO');
      const cliente = await claves.firmarConRoles(['cliente'], AZP.portal);
      esperarProblema(await pedir(cliente, null), 403, 'SIN_PERMISO');
    });

    it('llega al controlador en minúsculas', async () => {
      const token = await claves.firmarConRoles(['almacenero'], AZP.appObra);
      const respuesta = await pedir(token, DISPOSITIVO.toUpperCase()).expect(
        200,
      );
      expect(respuesta.body.idDispositivo).toBe(DISPOSITIVO);
    });
  });

  describe('X-Request-Id', () => {
    it('usa el que llega y lo devuelve', async () => {
      const token = await claves.firmarConRoles(['maestro'], AZP.appObra);
      const respuesta = await pedir(token)
        .set('X-Request-Id', 'abc-123')
        .expect(200);
      expect(respuesta.headers['x-request-id']).toBe('abc-123');
      expect(respuesta.body.requestId).toBe('abc-123');
    });

    it('si no llega genera un UUID', async () => {
      const token = await claves.firmarConRoles(['maestro'], AZP.appObra);
      const respuesta = await pedir(token).expect(200);
      expect(respuesta.headers['x-request-id']).toMatch(UUID);
      expect(respuesta.body.requestId).toBe(respuesta.headers['x-request-id']);
    });

    it('también vuelve en los errores', async () => {
      const respuesta = await pedir().set('X-Request-Id', 'req-9');
      expect(respuesta.headers['x-request-id']).toBe('req-9');
    });
  });
});
