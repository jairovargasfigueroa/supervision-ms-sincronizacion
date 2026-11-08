import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { leerConfiguracion } from '../../../configuracion.js';
import { crearTablas, type NombresTablas } from './tablas.js';

/** Cliente de bajo nivel (crear tablas). */
export const CLIENTE_DYNAMODB = Symbol('CLIENTE_DYNAMODB');
/** Cliente de documentos (`lib-dynamodb`): convierte entre objetos de JS y atributos. */
export const DOCUMENTOS_DYNAMODB = Symbol('DOCUMENTOS_DYNAMODB');
/** Nombres de las tablas. */
export const TABLAS = Symbol('TABLAS');
const CREAR_TABLAS = Symbol('CREAR_TABLAS');

/**
 * Conexión a DynamoDB (AWS SDK v3). Con `DYNAMODB_ENDPOINT` usa DynamoDB Local; sin él, el
 * endpoint de AWS de `AWS_REGION`. Las credenciales salen de `AWS_ACCESS_KEY_ID` y
 * `AWS_SECRET_ACCESS_KEY` si están; si no, de la cadena por defecto del SDK (rol de la Lambda).
 * Con `DYNAMODB_CREAR_TABLAS=true` crea las tablas al iniciar.
 */
@Global()
@Module({
  providers: [
    {
      provide: CLIENTE_DYNAMODB,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const { dynamodb } = leerConfiguracion(config);
        return new DynamoDBClient({
          region: dynamodb.region,
          ...(dynamodb.endpoint ? { endpoint: dynamodb.endpoint } : {}),
          ...(dynamodb.credenciales
            ? { credentials: dynamodb.credenciales }
            : {}),
          // Un intento y dos reintentos: el lote tiene un presupuesto de 20 s.
          maxAttempts: 3,
        });
      },
    },
    {
      provide: DOCUMENTOS_DYNAMODB,
      inject: [CLIENTE_DYNAMODB],
      useFactory: (cliente: DynamoDBClient) =>
        DynamoDBDocumentClient.from(cliente, {
          marshallOptions: { removeUndefinedValues: true },
        }),
    },
    {
      provide: TABLAS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): NombresTablas =>
        leerConfiguracion(config).dynamodb.tablas,
    },
    {
      provide: CREAR_TABLAS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): boolean =>
        leerConfiguracion(config).dynamodb.crearTablas,
    },
  ],
  exports: [CLIENTE_DYNAMODB, DOCUMENTOS_DYNAMODB, TABLAS],
})
export class DynamoDBModule implements OnModuleInit, OnApplicationShutdown {
  private readonly registro = new Logger('DynamoDB');

  constructor(
    @Inject(CLIENTE_DYNAMODB) private readonly cliente: DynamoDBClient,
    @Inject(TABLAS) private readonly tablas: NombresTablas,
    @Inject(CREAR_TABLAS) private readonly debeCrearTablas: boolean,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.debeCrearTablas) return;
    const creadas = await crearTablas(this.cliente, this.tablas);
    if (creadas.length > 0) {
      this.registro.log(`Tablas creadas: ${creadas.join(', ')}`);
    }
  }

  onApplicationShutdown(): void {
    this.cliente.destroy();
  }
}
