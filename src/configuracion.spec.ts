import { ConfigService } from '@nestjs/config';
import { leerConfiguracion } from './configuracion.js';

const leer = (valores: Record<string, string>) =>
  leerConfiguracion(new ConfigService(valores));

describe('leerConfiguracion', () => {
  it('usa los valores por defecto del diseño', () => {
    const config = leer({});
    expect(config.tiempoMaximoLlamadaMs).toBe(5000);
    expect(config.tiempoMaximoLoteMs).toBe(20000);
    expect(config.dynamodb).toEqual({
      endpoint: undefined,
      region: 'sa-east-1',
      credenciales: undefined,
      crearTablas: false,
      tablas: {
        operacionProcesada: 'operacion_procesada',
        estadoDispositivo: 'estado_dispositivo',
      },
    });
  });

  it('lee el endpoint, las credenciales y DYNAMODB_CREAR_TABLAS', () => {
    const config = leer({
      DYNAMODB_ENDPOINT: 'http://localhost:8000',
      AWS_ACCESS_KEY_ID: 'local',
      AWS_SECRET_ACCESS_KEY: 'local',
      DYNAMODB_CREAR_TABLAS: 'TRUE',
      TIEMPO_MAXIMO_LLAMADA_MS: '100',
    });
    expect(config.dynamodb.endpoint).toBe('http://localhost:8000');
    expect(config.dynamodb.credenciales).toEqual({
      accessKeyId: 'local',
      secretAccessKey: 'local',
    });
    expect(config.dynamodb.crearTablas).toBe(true);
    expect(config.tiempoMaximoLlamadaMs).toBe(100);
  });

  it('un DYNAMODB_ENDPOINT vacío usa AWS y un tiempo inválido vuelve al de defecto', () => {
    const config = leer({
      DYNAMODB_ENDPOINT: '  ',
      TIEMPO_MAXIMO_LOTE_MS: 'abc',
      OBRAS_URL: 'http://obras:8081/',
    });
    expect(config.dynamodb.endpoint).toBeUndefined();
    expect(config.tiempoMaximoLoteMs).toBe(20000);
    expect(config.obrasUrl).toBe('http://obras:8081');
  });
});
