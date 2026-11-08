import { clasificarRespuesta } from './clasificacion.js';

const respuesta = (status: number, cuerpo: unknown = null) =>
  clasificarRespuesta({ tipo: 'RESPUESTA', status, cuerpo });

describe('clasificarRespuesta', () => {
  it.each([200, 201, 204])(
    '%i → PROCESADO con la respuesta del dueño',
    (status) => {
      const cuerpo = { id: 'm1', periodo: '2026-11', superaStock: false };
      expect(respuesta(status, cuerpo)).toEqual({
        estado: 'PROCESADO',
        status,
        respuesta: cuerpo,
      });
    },
  );

  it.each([400, 403, 404, 409, 422])(
    '%i → ERROR con el Problem Details del dueño',
    (status) => {
      const cuerpo = {
        title: 'El periodo está cerrado',
        status,
        detail: 'El periodo 2026-10 ya está cerrado.',
        codigo: 'PERIODO_CERRADO',
      };
      expect(respuesta(status, cuerpo)).toEqual({
        estado: 'ERROR',
        status,
        respuesta: cuerpo,
      });
    },
  );

  it('un rechazo sin Problem Details guarda el genérico de su estado', () => {
    expect(respuesta(403, 'Forbidden')).toEqual({
      estado: 'ERROR',
      status: 403,
      respuesta: { title: 'Sin permiso', status: 403, codigo: 'SIN_PERMISO' },
    });
    expect(respuesta(422)).toMatchObject({
      estado: 'ERROR',
      respuesta: { status: 422, codigo: 'ERROR_INTERNO' },
    });
  });

  it('401 → REINTENTAR con TOKEN_VENCIDO', () => {
    expect(respuesta(401, { codigo: 'NO_AUTENTICADO' })).toMatchObject({
      estado: 'REINTENTAR',
      status: 401,
      respuesta: { status: 401, codigo: 'TOKEN_VENCIDO' },
    });
  });

  it.each([408, 429, 500, 502, 503, 504])(
    '%i → REINTENTAR con el estado recibido',
    (status) => {
      expect(respuesta(status)).toMatchObject({
        estado: 'REINTENTAR',
        status,
        respuesta: { status },
      });
    },
  );

  it('un 503 con Problem Details devuelve el del dueño', () => {
    const cuerpo = {
      title: 'Servicio no disponible',
      status: 503,
      codigo: 'SERVICIO_NO_DISPONIBLE',
    };
    expect(respuesta(503, cuerpo)).toEqual({
      estado: 'REINTENTAR',
      status: 503,
      respuesta: cuerpo,
    });
  });

  it('tiempo agotado → REINTENTAR 504 TIEMPO_AGOTADO', () => {
    expect(clasificarRespuesta({ tipo: 'TIEMPO_AGOTADO' })).toMatchObject({
      estado: 'REINTENTAR',
      status: 504,
      respuesta: {
        title: 'Tiempo agotado',
        status: 504,
        codigo: 'TIEMPO_AGOTADO',
      },
    });
  });

  it('error de red → REINTENTAR 503 SERVICIO_NO_DISPONIBLE', () => {
    expect(clasificarRespuesta({ tipo: 'ERROR_RED' })).toMatchObject({
      estado: 'REINTENTAR',
      status: 503,
      respuesta: {
        title: 'Servicio no disponible',
        status: 503,
        codigo: 'SERVICIO_NO_DISPONIBLE',
      },
    });
  });

  it('otro 4xx que el diseño no lista → ERROR', () => {
    expect(respuesta(405)).toMatchObject({ estado: 'ERROR', status: 405 });
    expect(respuesta(413)).toMatchObject({
      estado: 'ERROR',
      respuesta: { codigo: 'ARCHIVO_DEMASIADO_GRANDE' },
    });
  });

  it('un 3xx → REINTENTAR 503', () => {
    expect(respuesta(302)).toMatchObject({
      estado: 'REINTENTAR',
      status: 503,
      respuesta: { codigo: 'SERVICIO_NO_DISPONIBLE' },
    });
  });
});
