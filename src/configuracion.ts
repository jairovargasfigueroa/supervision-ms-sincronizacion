import type { ConfigService } from '@nestjs/config';

/**
 * Variables de entorno del servicio, ya convertidas y con sus valores por defecto. Las direcciones
 * de Obras y Materiales no tienen valor por defecto (601): se leen con `leerUrlServicio`.
 */
export interface Configuracion {
  /** Tiempo máximo de cada llamada a Obras o Materiales (5 s). */
  tiempoMaximoLlamadaMs: number;
  /** Presupuesto de un lote: pasado este tiempo, las operaciones que faltan no se empiezan (20 s). */
  tiempoMaximoLoteMs: number;
  dynamodb: {
    /** Vacío en AWS; el de DynamoDB Local en desarrollo (`DYNAMODB_ENDPOINT`). */
    endpoint?: string;
    region: string;
    credenciales?: { accessKeyId: string; secretAccessKey: string };
    /** Solo en desarrollo y pruebas: crea las tablas al iniciar si no existen. */
    crearTablas: boolean;
    tablas: { operacionProcesada: string; estadoDispositivo: string };
  };
}

/** Valor de una variable sin espacios a los costados; vacía o ausente → `undefined`. */
function leerTexto(config: ConfigService, nombre: string): string | undefined {
  const valor = config.get<string>(nombre);
  return typeof valor === 'string' && valor.trim() !== ''
    ? valor.trim()
    : undefined;
}

/**
 * Dirección de un servicio dueño (`OBRAS_URL` o `MATERIALES_URL`), sin la barra final. Sin valor
 * por defecto (601: ninguna dirección fija en el código; la de desarrollo está en `.env.example`):
 * si falta, el servicio no arranca.
 */
export function leerUrlServicio(
  config: ConfigService,
  nombre: 'OBRAS_URL' | 'MATERIALES_URL',
): string {
  const valor = leerTexto(config, nombre);
  if (!valor) {
    throw new Error(`Falta ${nombre}: la dirección del servicio dueño.`);
  }
  return valor.replace(/\/+$/, '');
}

/** Lee la configuración. Las URLs de los servicios dueños se piden recién al usarlas. */
export function leerConfiguracion(config: ConfigService): Configuracion {
  const texto = (nombre: string) => leerTexto(config, nombre);
  const numero = (nombre: string, porDefecto: number) => {
    const valor = Number(texto(nombre));
    return Number.isFinite(valor) && valor > 0 ? valor : porDefecto;
  };
  const accessKeyId = texto('AWS_ACCESS_KEY_ID');
  const secretAccessKey = texto('AWS_SECRET_ACCESS_KEY');
  return {
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
