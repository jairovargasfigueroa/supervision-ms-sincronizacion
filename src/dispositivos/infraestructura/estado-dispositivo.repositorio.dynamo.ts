import {
  type DynamoDBDocumentClient,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { Inject, Injectable } from '@nestjs/common';
import {
  DOCUMENTOS_DYNAMODB,
  TABLAS,
} from '../../compartido/infraestructura/dynamodb/dynamodb.module.js';
import type { NombresTablas } from '../../compartido/infraestructura/dynamodb/tablas.js';
import type { EstadoDispositivoRepositorio } from '../aplicacion/puertos/estado-dispositivo.repositorio.js';

/** `estado_dispositivo` con `UpdateItem`: crea el elemento si no existe y no borra los demás atributos. */
@Injectable()
export class EstadoDispositivoRepositorioDynamo implements EstadoDispositivoRepositorio {
  private readonly tabla: string;

  constructor(
    @Inject(DOCUMENTOS_DYNAMODB)
    private readonly documentos: DynamoDBDocumentClient,
    @Inject(TABLAS) tablas: NombresTablas,
  ) {
    this.tabla = tablas.estadoDispositivo;
  }

  registrarLote(
    idDispositivo: string,
    usuarioId: string,
    ahora: string,
  ): Promise<void> {
    return this.actualizar(idDispositivo, {
      usuario_id: usuarioId,
      ultima_sincronizacion: ahora,
    });
  }

  registrarPaquete(
    idDispositivo: string,
    usuarioId: string,
    obraId: string | undefined,
    versionDatos: string,
    ahora: string,
  ): Promise<void> {
    return this.actualizar(idDispositivo, {
      usuario_id: usuarioId,
      ...(obraId ? { obra_id: obraId } : {}),
      version_datos: versionDatos,
      ultima_sincronizacion: ahora,
    });
  }

  private async actualizar(
    idDispositivo: string,
    atributos: Record<string, string>,
  ): Promise<void> {
    const nombres = Object.keys(atributos);
    await this.documentos.send(
      new UpdateCommand({
        TableName: this.tabla,
        Key: { id_dispositivo: idDispositivo },
        UpdateExpression: `SET ${nombres.map((nombre) => `${nombre} = :${nombre}`).join(', ')}`,
        ExpressionAttributeValues: Object.fromEntries(
          nombres.map((nombre) => [`:${nombre}`, atributos[nombre]]),
        ),
      }),
    );
  }
}
