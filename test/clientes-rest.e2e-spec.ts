import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ClienteRest } from '../src/compartido/infraestructura/servicios/cliente-rest.js';
import { MaterialesCliente } from '../src/compartido/infraestructura/servicios/materiales.cliente.js';
import { ObrasCliente } from '../src/compartido/infraestructura/servicios/obras.cliente.js';
import { ServiciosModule } from '../src/compartido/infraestructura/servicios/servicios.module.js';
import { ServidorSimulado } from './utilidades/servidor-simulado.js';

const CONTEXTO = { token: 'token-del-usuario', requestId: 'req-1' };
const OBRA = '2f1c9a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b';

describe('Clientes REST de Obras y Materiales (e2e)', () => {
  let obras: ServidorSimulado;
  let materiales: ServidorSimulado;
  let obrasCliente: ObrasCliente;
  let materialesCliente: MaterialesCliente;

  beforeAll(async () => {
    obras = await ServidorSimulado.iniciar();
    materiales = await ServidorSimulado.iniciar();
    const modulo = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              OBRAS_URL: obras.url,
              MATERIALES_URL: `${materiales.url}/`,
              TIEMPO_MAXIMO_LLAMADA_MS: '300',
            }),
          ],
        }),
        ServiciosModule,
      ],
    }).compile();
    modulo.useLogger(false);
    obrasCliente = modulo.get(ObrasCliente);
    materialesCliente = modulo.get(MaterialesCliente);
  });

  afterEach(() => {
    obras.limpiar();
    materiales.limpiar();
  });

  afterAll(async () => {
    await obras.cerrar();
    await materiales.cerrar();
  });

  it('reenvía el token del usuario y el X-Request-Id', async () => {
    obras.definir('GET', '/obras', { status: 200, cuerpo: [] });
    await obrasCliente.listarEnEjecucion(CONTEXTO);
    const [peticion] = obras.peticiones;
    expect(peticion.encabezados.authorization).toBe('Bearer token-del-usuario');
    expect(peticion.encabezados['x-request-id']).toBe('req-1');
  });

  it('GET /obras?estado=EN_EJECUCION devuelve el status y el cuerpo', async () => {
    obras.definir('GET', '/obras', {
      status: 200,
      cuerpo: [{ id: OBRA, nombre: 'Edificio' }],
    });
    const resultado = await obrasCliente.listarEnEjecucion(CONTEXTO);
    expect(resultado).toEqual({
      tipo: 'RESPUESTA',
      status: 200,
      cuerpo: [{ id: OBRA, nombre: 'Edificio' }],
    });
    expect(obras.peticiones[0].consulta.get('estado')).toBe('EN_EJECUCION');
  });

  it('GET /obras/{id} pide la obra', async () => {
    obras.definir('GET', `/obras/${OBRA}`, {
      status: 200,
      cuerpo: { id: OBRA, partidas: [] },
    });
    const resultado = await obrasCliente.obtener(OBRA, CONTEXTO);
    expect(resultado).toMatchObject({ tipo: 'RESPUESTA', status: 200 });
  });

  it('GET /materiales pide los activos de a 100 por página', async () => {
    materiales.definir('GET', '/materiales', {
      status: 200,
      cuerpo: { items: [], total: 0, pagina: 2, tamano: 100 },
    });
    await materialesCliente.listarActivos(2, CONTEXTO);
    const { consulta } = materiales.peticiones[0];
    expect(consulta.get('soloActivos')).toBe('true');
    expect(consulta.get('pagina')).toBe('2');
    expect(consulta.get('tamano')).toBe('100');
  });

  it('GET /obras/{id}/stock devuelve un 404 como respuesta, sin lanzar', async () => {
    const resultado = await materialesCliente.stockDeObra(OBRA, CONTEXTO);
    expect(resultado).toMatchObject({
      tipo: 'RESPUESTA',
      status: 404,
      cuerpo: { codigo: 'RUTA_NO_ENCONTRADA' },
    });
  });

  it('POST /movimientos envía los datos tal cual como JSON', async () => {
    const datos = { id: OBRA, tipo: 'SALIDA', cantidad: 12.5 };
    materiales.definir('POST', '/movimientos', {
      status: 409,
      cuerpo: { status: 409, codigo: 'PERIODO_CERRADO' },
    });
    const resultado = await materialesCliente.registrarMovimiento(
      datos,
      CONTEXTO,
    );
    expect(resultado).toEqual({
      tipo: 'RESPUESTA',
      status: 409,
      cuerpo: { status: 409, codigo: 'PERIODO_CERRADO' },
    });
    const [peticion] = materiales.peticiones;
    expect(peticion.cuerpo).toEqual(datos);
    expect(peticion.encabezados['content-type']).toBe('application/json');
  });

  it('una respuesta sin cuerpo llega con cuerpo null', async () => {
    materiales.definir('POST', '/movimientos', { status: 503 });
    await expect(
      materialesCliente.registrarMovimiento({}, CONTEXTO),
    ).resolves.toEqual({ tipo: 'RESPUESTA', status: 503, cuerpo: null });
  });

  it('pasado el tiempo máximo devuelve TIEMPO_AGOTADO', async () => {
    obras.definir('GET', '/obras', { status: 200, cuerpo: [], demoraMs: 1000 });
    const inicio = Date.now();
    await expect(obrasCliente.listarEnEjecucion(CONTEXTO)).resolves.toEqual({
      tipo: 'TIEMPO_AGOTADO',
    });
    expect(Date.now() - inicio).toBeLessThan(900);
  });

  it('si se corta la conexión devuelve ERROR_RED', async () => {
    obras.definir('GET', '/obras', { status: 200, cortar: true });
    await expect(obrasCliente.listarEnEjecucion(CONTEXTO)).resolves.toEqual({
      tipo: 'ERROR_RED',
    });
  });

  it('si el servicio no está levantado devuelve ERROR_RED', async () => {
    const cliente = new ClienteRest('Nadie', 'http://127.0.0.1:1', 300);
    await expect(cliente.llamar('GET', '/obras', CONTEXTO)).resolves.toEqual({
      tipo: 'ERROR_RED',
    });
  });
});
