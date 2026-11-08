import { traducirRespuestaUrlSubida } from './respuesta-url-subida.js';

const respuesta = (status: number, cuerpo: unknown = null) =>
  traducirRespuestaUrlSubida({ tipo: 'RESPUESTA', status, cuerpo });

describe('traducirRespuestaUrlSubida', () => {
  it('2xx → la respuesta de Obras tal cual', () => {
    const cuerpo = {
      url: 'https://s3/x',
      claveArchivo: 'fotos/o/f.jpg',
      expiraEn: '2026-11-15T15:30:00Z',
    };
    expect(respuesta(200, cuerpo)).toEqual({
      exito: true,
      status: 200,
      cuerpo,
    });
  });

  it.each([
    [400, 'DATOS_INVALIDOS'],
    [403, 'SIN_PERMISO'],
    [404, 'OBRA_NO_ENCONTRADA'],
    [422, 'OTRA_REGLA'],
  ])('%i → mismo status y codigo', (status, codigo) => {
    const cuerpo = { title: 't', status, codigo, detail: 'd' };
    expect(respuesta(status, cuerpo)).toEqual({
      exito: false,
      problema: cuerpo,
    });
  });

  it('un 4xx sin Problem Details → genérico de su estado', () => {
    expect(respuesta(403, 'Forbidden')).toEqual({
      exito: false,
      problema: { title: 'Sin permiso', status: 403, codigo: 'SIN_PERMISO' },
    });
  });

  it.each([500, 502, 503])('%i → 503 SERVICIO_NO_DISPONIBLE', (status) => {
    expect(respuesta(status, { codigo: 'ERROR_INTERNO' })).toMatchObject({
      exito: false,
      problema: { status: 503, codigo: 'SERVICIO_NO_DISPONIBLE' },
    });
  });

  it('error de red → 503 y tiempo agotado → 504', () => {
    expect(traducirRespuestaUrlSubida({ tipo: 'ERROR_RED' })).toMatchObject({
      problema: { status: 503, codigo: 'SERVICIO_NO_DISPONIBLE' },
    });
    expect(
      traducirRespuestaUrlSubida({ tipo: 'TIEMPO_AGOTADO' }),
    ).toMatchObject({ problema: { status: 504, codigo: 'TIEMPO_AGOTADO' } });
  });
});
