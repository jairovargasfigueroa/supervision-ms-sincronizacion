import type { ConfigService } from '@nestjs/config';

/** Variables de entorno del servicio, ya convertidas y con sus valores por defecto. */
export interface Configuracion {
  obrasUrl: string;
  materialesUrl: string;
  /** Tiempo máximo de cada llamada a Obras o Materiales (5 s). */
  tiempoMaximoLlamadaMs: number;
  /** Presupuesto de un lote: pasado este tiempo, las operaciones que faltan no se empiezan (20 s). */
  tiempoMaximoLoteMs: number;
  dynamodb: {
    /** Vacío en AWS; `http://localhost:8000` con DynamoDB Local. */
    endpoint?: string;
    region: string;
    credenciales?: { accessKeyId: string; secretAccessKey: string };
    /** Solo en desarrollo y pruebas: crea las tablas al iniciar si no existen. */
    crearTablas: boolean;
    tablas: { operacionProcesada: string; estadoDispositivo: string };
  };
}

/** Lee la configuración. Las URLs de los servicios dueños se piden recién al usarlas. */
export function leerConfiguracion(config: ConfigService): Configuracion {
  const texto = (nombre: string) => {
    const valor = config.get<string>(nombre);
    return typeof valor === 'string' && valor.trim() !== ''
      ? valor.trim()
      : undefined;
  };
  const numero = (nombre: string, porDefecto: number) => {
    const valor = Number(texto(nombre));
    return Number.isFinite(valor) && valor > 0 ? valor : porDefecto;
  };
  const accessKeyId = texto('AWS_ACCESS_KEY_ID');
  const secretAccessKey = texto('AWS_SECRET_ACCESS_KEY');
  return {
    obrasUrl: (texto('OBRAS_URL') ?? 'http://localhost:8081').replace(
      /\/+$/,
      '',
    ),
    materialesUrl: (texto('MATERIALES_URL') ?? 'http://localhost:8082').replace(
      /\/+$/,
      '',
    ),
    tiempoMaximoLlamadaMs: numero('TIEMPO_MAXIMO_LLAMADA_MS', 5000),
    tiempoMaximoLoteMs: numero('TIEMPO_MAXIMO_LOTE_MS', 20000),
    dynamodb: {
      endpoint: texto('DYNAMODB_ENDPOINT'),
      region: texto('AWS_REGION') ?? 'sa-east-1',
      credenciales:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
      crearTablas: texto('DYNAMODB_CREAR_TABLAS')?.toLowerCase() === 'true',
      tablas: {
        operacionProcesada:
          texto('TABLA_OPERACION_PROCESADA') ?? 'operacion_procesada',
        estadoDispositivo:
          texto('TABLA_ESTADO_DISPOSITIVO') ?? 'estado_dispositivo',
      },
    },
  };
}
