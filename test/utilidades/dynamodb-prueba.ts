import { randomUUID } from 'node:crypto';
import {
  DeleteTableCommand,
  DynamoDBClient,
  ResourceNotFoundException,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/** DynamoDB Local del Docker Compose de infra (`docker compose up -d dynamodb`). */
export const ENDPOINT_PRUEBA =
  process.env.DYNAMODB_ENDPOINT ?? 'http://localhost:8000';

export interface DynamoPrueba {
  /** Variables para `ConfigModule` (endpoint, credenciales de prueba y tablas propias). */
  config: Record<string, string>;
  tablas: { operacionProcesada: string; estadoDispositivo: string };
  cliente: DynamoDBClient;
  documentos: DynamoDBDocumentClient;
  /** Borra las tablas de esta prueba y cierra el cliente. */
  cerrar(): Promise<void>;
}

/**
 * Tablas propias de cada archivo de pruebas (prefijo al azar) en DynamoDB Local, para que no
 * se mezclen con las de desarrollo ni entre pruebas. Las crea el servicio al iniciar
 * (`DYNAMODB_CREAR_TABLAS=true`).
 */
export function crearDynamoPrueba(): DynamoPrueba {
  const prefijo = `prueba_${randomUUID().slice(0, 8)}`;
  const tablas = {
    operacionProcesada: `${prefijo}_operacion_procesada`,
    estadoDispositivo: `${prefijo}_estado_dispositivo`,
  };
  const config = {
    DYNAMODB_ENDPOINT: ENDPOINT_PRUEBA,
    AWS_REGION: 'sa-east-1',
    // Valores de prueba: DynamoDB Local acepta cualquier clave
    AWS_ACCESS_KEY_ID: 'local',
    AWS_SECRET_ACCESS_KEY: 'local',
    DYNAMODB_CREAR_TABLAS: 'true',
    TABLA_OPERACION_PROCESADA: tablas.operacionProcesada,
    TABLA_ESTADO_DISPOSITIVO: tablas.estadoDispositivo,
  };
  const cliente = new DynamoDBClient({
    endpoint: ENDPOINT_PRUEBA,
    region: config.AWS_REGION,
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  });
  const documentos = DynamoDBDocumentClient.from(cliente);
  return {
    config,
    tablas,
    cliente,
    documentos,
    async cerrar() {
      for (const TableName of Object.values(tablas)) {
        try {
          await cliente.send(new DeleteTableCommand({ TableName }));
        } catch (error) {
          if (!(error instanceof ResourceNotFoundException)) throw error;
        }
      }
      cliente.destroy();
    },
  };
}
