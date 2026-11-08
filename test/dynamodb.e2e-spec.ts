import {
  DescribeTableCommand,
  DescribeTimeToLiveCommand,
  ResourceNotFoundException,
} from '@aws-sdk/client-dynamodb';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { DynamoDBModule } from '../src/compartido/infraestructura/dynamodb/dynamodb.module.js';
import {
  crearDynamoPrueba,
  type DynamoPrueba,
} from './utilidades/dynamodb-prueba.js';

async function iniciar(config: Record<string, string>): Promise<TestingModule> {
  const modulo = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [() => config],
      }),
      DynamoDBModule,
    ],
  }).compile();
  modulo.useLogger(false);
  await modulo.init();
  return modulo;
}

// Necesita DynamoDB Local (infra: docker compose up -d dynamodb).
describe('Cliente DynamoDB y creación de tablas (e2e)', () => {
  let dynamo: DynamoPrueba;

  beforeEach(() => {
    dynamo = crearDynamoPrueba();
  });

  afterEach(async () => {
    await dynamo.cerrar();
  });

  it('con DYNAMODB_CREAR_TABLAS=true crea las dos tablas on demand con su clave', async () => {
    const modulo = await iniciar(dynamo.config);
    await modulo.close();

    const operacion = await dynamo.cliente.send(
      new DescribeTableCommand({
        TableName: dynamo.tablas.operacionProcesada,
      }),
    );
    expect(operacion.Table?.KeySchema).toEqual([
      { AttributeName: 'id_operacion', KeyType: 'HASH' },
    ]);
    expect(operacion.Table?.BillingModeSummary?.BillingMode).toBe(
      'PAY_PER_REQUEST',
    );

    const dispositivo = await dynamo.cliente.send(
      new DescribeTableCommand({ TableName: dynamo.tablas.estadoDispositivo }),
    );
    expect(dispositivo.Table?.KeySchema).toEqual([
      { AttributeName: 'id_dispositivo', KeyType: 'HASH' },
    ]);
  });

  it('activa el TTL de operacion_procesada sobre expira_en', async () => {
    const modulo = await iniciar(dynamo.config);
    await modulo.close();

    const ttl = await dynamo.cliente.send(
      new DescribeTimeToLiveCommand({
        TableName: dynamo.tablas.operacionProcesada,
      }),
    );
    expect(ttl.TimeToLiveDescription?.AttributeName).toBe('expira_en');
    expect(['ENABLED', 'ENABLING']).toContain(
      ttl.TimeToLiveDescription?.TimeToLiveStatus,
    );
  });

  it('al reiniciar con las tablas ya creadas no falla', async () => {
    await (await iniciar(dynamo.config)).close();
    await expect(
      iniciar(dynamo.config).then((modulo) => modulo.close()),
    ).resolves.toBeUndefined();
  });

  it('sin DYNAMODB_CREAR_TABLAS no crea nada', async () => {
    const modulo = await iniciar({
      ...dynamo.config,
      DYNAMODB_CREAR_TABLAS: 'false',
    });
    await modulo.close();

    await expect(
      dynamo.cliente.send(
        new DescribeTableCommand({
          TableName: dynamo.tablas.operacionProcesada,
        }),
      ),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
  });
});
