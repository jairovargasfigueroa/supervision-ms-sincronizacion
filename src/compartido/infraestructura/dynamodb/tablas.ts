import {
  CreateTableCommand,
  type CreateTableCommandInput,
  DescribeTimeToLiveCommand,
  type DynamoDBClient,
  ResourceInUseException,
  UpdateTimeToLiveCommand,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb';

/** Nombres de las tablas (salen de la configuración: las pruebas usan las suyas). */
export interface NombresTablas {
  operacionProcesada: string;
  estadoDispositivo: string;
}

/** Atributo con el vencimiento (segundos *epoch*) de `operacion_procesada`: 30 días. */
export const ATRIBUTO_TTL = 'expira_en';

/** Definición de las tablas de `docs/datos.md`: modo *on demand* y una clave de partición. */
export function definicionesTablas(
  nombres: NombresTablas,
): CreateTableCommandInput[] {
  const tabla = (
    TableName: string,
    clave: string,
  ): CreateTableCommandInput => ({
    TableName,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [{ AttributeName: clave, AttributeType: 'S' }],
    KeySchema: [{ AttributeName: clave, KeyType: 'HASH' }],
  });
  return [
    tabla(nombres.operacionProcesada, 'id_operacion'),
    tabla(nombres.estadoDispositivo, 'id_dispositivo'),
  ];
}

/**
 * Crea las tablas que no existen y activa el TTL de `operacion_procesada` sobre `expira_en`.
 * Se puede llamar varias veces (al reiniciar el servicio no falla). Devuelve las que creó.
 * Solo con `DYNAMODB_CREAR_TABLAS=true` (desarrollo y pruebas); en AWS las crea la infraestructura.
 */
export async function crearTablas(
  cliente: DynamoDBClient,
  nombres: NombresTablas,
): Promise<string[]> {
  const creadas: string[] = [];
  for (const definicion of definicionesTablas(nombres)) {
    try {
      await cliente.send(new CreateTableCommand(definicion));
      creadas.push(definicion.TableName!);
    } catch (error) {
      if (!(error instanceof ResourceInUseException)) throw error;
    }
    await waitUntilTableExists(
      { client: cliente, maxWaitTime: 60 },
      { TableName: definicion.TableName },
    );
  }
  await activarTtl(cliente, nombres.operacionProcesada);
  return creadas;
}

async function activarTtl(
  cliente: DynamoDBClient,
  tabla: string,
): Promise<void> {
  const actual = await cliente.send(
    new DescribeTimeToLiveCommand({ TableName: tabla }),
  );
  const descripcion = actual.TimeToLiveDescription;
  if (
    descripcion?.AttributeName === ATRIBUTO_TTL &&
    (descripcion.TimeToLiveStatus === 'ENABLED' ||
      descripcion.TimeToLiveStatus === 'ENABLING')
  ) {
    return;
  }
  await cliente.send(
    new UpdateTimeToLiveCommand({
      TableName: tabla,
      TimeToLiveSpecification: { AttributeName: ATRIBUTO_TTL, Enabled: true },
    }),
  );
}
